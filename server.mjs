import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { buildDraft, STANDARD_CATALOG } from './lib/drafts.mjs';
import { exportDocument } from './lib/exports.mjs';
import { createOllamaProvider, aiConfigFromEnv, AIUnavailableError } from './lib/ai/provider.mjs';
import { extractDocument, EXTRACTOR_VERSION } from './lib/ai/extract.mjs';
import { chunkPages, CHUNKER_VERSION, passageForEmbedding, queryForEmbedding, vectorToBlob } from './lib/ai/chunk.mjs';
import { searchPassages } from './lib/ai/search.mjs';
import { MEMO_GUIDE, DEFAULT_MEMO_HEADINGS, SECTION_STATUSES, COMPLETION_CHECKLIST, allSectionsReady, composeMemo, memoFromBody, normaliseMemo } from './lib/memo.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const deriveKey = promisify(scrypt);
const hash = value => createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();
const DESIGNATIONS = ['Intern', 'Associate', 'Senior Associate', 'Assistant Manager', 'Manager', 'Associate Director', 'Director'];
const safeUser = u => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  demo: Boolean(u.demo),
  employeeId: u.employee_id || '',
  designation: u.designation || '',
  profilePicture: u.profile_picture || '',
  profileComplete: Boolean(u.demo || u.profile_completed_at),
  usagePolicyAccepted: Boolean(u.demo || u.usage_policy_accepted_at)
});
const PROJECT_TYPES = ['Technical memo', 'GAAP transition', 'IPO advisory', 'Accounting advisory', 'Staff augmentation', 'Training'];
// Earlier workspace defaults; a workspace still on one is moved to the current default.
const LEGACY_MEMO_HEADINGS = [
  'Purpose and scope\nBackground and facts\nAccounting questions\nApplicable guidance\nAnalysis\nConclusion\nProject evidence\nReview checklist',
  [...DEFAULT_MEMO_HEADINGS, 'References and evidence'].join('\n')
];
// AI assistance stays off until the super user turns it on.
const DEFAULT_SETTINGS = { workspaceName: 'Advisory team', memoTemplateName: 'Technical accounting memorandum', memoHeadings: DEFAULT_MEMO_HEADINGS.join('\n'), aiEnabled: false };
const MEMO_GUIDE_PUBLIC = MEMO_GUIDE.map(({ heading, aliases, hint }) => ({ heading, aliases, hint }));
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
function requireValue(condition, message, status = 400) { if (!condition) throw new ApiError(status, message); }
function textField(value, label, max = 200, required = true) {
  requireValue(value == null || typeof value === 'string', `${label} must be text.`);
  const text = (value || '').trim();
  requireValue(!required || text.length > 0, `${label} is required.`);
  requireValue(text.length <= max, `${label} is too long.`);
  return text;
}
function memoField(raw, previous) {
  requireValue(raw && typeof raw === 'object' && !Array.isArray(raw), 'Provide the memo sections.');
  const record = (value, keys, label) => {
    requireValue(value == null || (typeof value === 'object' && !Array.isArray(value)), `${label} is invalid.`);
    return Object.fromEntries(keys.map(([key, name]) => [key, textField(value?.[key], name, 200, false)]));
  };
  const header = record(raw.header, [['to', 'To'], ['from', 'From'], ['cc', 'CC'], ['date', 'Date']], 'Memo header');
  const signoff = record(raw.signoff, [['preparer', 'Prepared by'], ['reviewer', 'Reviewed by'], ['approver', 'Approved by']], 'Sign-off');
  requireValue(Array.isArray(raw.sections) && raw.sections.length >= 1 && raw.sections.length <= 40, 'A memo needs 1–40 sections.');
  const ids = new Set();
  const sections = raw.sections.map(section => {
    requireValue(section && typeof section === 'object', 'A memo section is invalid.');
    requireValue(typeof section.id === 'string' && /^[\w-]{1,64}$/.test(section.id) && !ids.has(section.id), 'A memo section is invalid.');
    ids.add(section.id);
    requireValue(SECTION_STATUSES.includes(section.status), 'Choose a valid section status.');
    return { id: section.id, heading: textField(section.heading, 'Section heading', 160), body: textField(section.body, 'Section content', 30000, false), status: section.status };
  });
  const preface = textField(raw.preface, 'Preface', 8000, false);
  requireValue(raw.completion == null || (typeof raw.completion === 'object' && !Array.isArray(raw.completion)), 'Completion checklist is invalid.');
  const completion = Object.fromEntries(COMPLETION_CHECKLIST.map(({ id }) => {
    const done = raw.completion?.[id] ?? false;
    requireValue(typeof done === 'boolean', 'Completion checklist is invalid.');
    return [id, done];
  }));
  // The checklist opens once every Builder section is ready; items ticked earlier stay recorded if a section is reopened.
  const newlyDone = COMPLETION_CHECKLIST.some(({ id }) => completion[id] && !previous?.completion?.[id]);
  requireValue(!newlyDone || allSectionsReady(sections), 'Set every Builder section to Ready for review before completing the checklist.', 409);
  return { header, preface, signoff, sections, completion };
}
// Memo Base: framework, applicable standards, and engagement documents for a memo workstream.
function memoBaseField(raw, params, resourceExists) {
  requireValue(raw && typeof raw === 'object' && !Array.isArray(raw), 'Memo Base is invalid.');
  const gaap = textField(raw.gaap, 'Framework'); requireValue(Object.keys(STANDARD_CATALOG).includes(gaap), 'Choose a valid framework.');
  requireValue(Array.isArray(raw.standards) && raw.standards.length <= 40, 'Select up to 40 standards.');
  const standards = [...new Set(raw.standards.map(s => textField(s, 'Standard', 500)))];
  requireValue(Array.isArray(raw.resourceIds) && raw.resourceIds.length <= 50 && raw.resourceIds.every(x => typeof x === 'string'), 'Choose valid engagement documents.');
  const resourceIds = [...new Set(raw.resourceIds)];
  requireValue(resourceIds.every(resourceExists), 'A selected document is outside this project or unavailable.', 403);
  return { ...params, gaap, standards, resourceIds };
}
function emailField(value) {
  const email = textField(value, 'Email', 254).toLowerCase();
  requireValue(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email), 'Enter a valid email address.');
  return email;
}
function dateField(value) {
  const date = textField(value, 'Financial year end', 10);
  requireValue(/^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date, 'Enter a valid financial year end.');
  return date;
}
function profilePictureField(value) {
  if (value == null || value === '') return '';
  requireValue(typeof value === 'string', 'Profile picture must be an image.');
  const match = /^data:image\/(png|jpeg|jpg|webp);base64,([A-Za-z0-9+/]*={0,2})$/.exec(value);
  requireValue(match && match[2].length % 4 === 0, 'Upload a PNG, JPG, or WebP profile picture.');
  const bytes = Buffer.from(match[2], 'base64');
  requireValue(bytes.length > 0 && bytes.length <= 750 * 1024, 'Profile picture must be 750 KB or smaller.');
  const mime = match[1] === 'jpg' ? 'jpeg' : match[1];
  return `data:image/${mime};base64,${match[2]}`;
}
async function passwordHash(password) {
  requireValue(typeof password === 'string' && password.length >= 12 && password.length <= 128, 'Use a password of 12–128 characters.');
  const salt = randomBytes(16).toString('hex');
  return `${salt}:${Buffer.from(await deriveKey(password, salt, 64)).toString('hex')}`;
}
async function passwordMatches(password, stored) {
  if (typeof password !== 'string' || password.length > 128) return false;
  const [salt, key] = (stored || '00000000000000000000000000000000:' + '0'.repeat(128)).split(':');
  if (!key || key.length !== 128) return false;
  const actual = Buffer.from(await deriveKey(password, salt, 64));
  return timingSafeEqual(actual, Buffer.from(key, 'hex'));
}

export async function createApp(options = {}) {
  const dataDir = resolve(options.dataDir || process.env.ADVISORY_DATA_DIR || resolve(ROOT, 'data'));
  await mkdir(dataDir, { recursive: true });
  const db = new DatabaseSync(resolve(dataDir, 'advisory.sqlite'));
  // Local model runtime; tests pass a stand-in. Creation fails fast on a non-local URL.
  const ai = options.aiProvider || createOllamaProvider(aiConfigFromEnv());
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, demo INTEGER NOT NULL DEFAULT 0, employee_id TEXT NOT NULL DEFAULT '', designation TEXT NOT NULL DEFAULT '', profile_picture TEXT NOT NULL DEFAULT '', usage_policy_accepted_at TEXT, profile_completed_at TEXT, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS invitations (id TEXT PRIMARY KEY, email TEXT NOT NULL, token TEXT UNIQUE NOT NULL, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS password_resets (id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, token TEXT UNIQUE NOT NULL, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0, issued_by TEXT, created TEXT NOT NULL, used_at TEXT);
    CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, client TEXT NOT NULL, fy TEXT NOT NULL, type TEXT NOT NULL, gaap TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Active', owner_id TEXT REFERENCES users(id), created TEXT NOT NULL, updated TEXT NOT NULL, project_type TEXT NOT NULL DEFAULT 'Live', client_id TEXT NOT NULL DEFAULT '', engagement_id TEXT NOT NULL DEFAULT '', estimated_completion TEXT NOT NULL DEFAULT '', sub_type TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS memberships (project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, user_id TEXT REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL DEFAULT 'Team Member', PRIMARY KEY(project_id,user_id));
    CREATE TABLE IF NOT EXISTS resources (id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, name TEXT NOT NULL, kind TEXT NOT NULL, size INTEGER NOT NULL, content BLOB NOT NULL, text TEXT NOT NULL DEFAULT '', created_by TEXT REFERENCES users(id), created TEXT NOT NULL, workstream_id TEXT DEFAULT NULL);
    CREATE TABLE IF NOT EXISTS deliverables (id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, kind TEXT NOT NULL, title TEXT NOT NULL, params TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Draft', created_by TEXT REFERENCES users(id), created TEXT NOT NULL, updated TEXT NOT NULL, is_final INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS activity (id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, user_id TEXT REFERENCES users(id), action TEXT NOT NULL, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);
    CREATE INDEX IF NOT EXISTS resources_project ON resources(project_id);
    CREATE INDEX IF NOT EXISTS deliverables_project ON deliverables(project_id);
    CREATE INDEX IF NOT EXISTS activity_project ON activity(project_id);
  `);
  const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map(column => column.name));
  const addedProfileColumns = [];
  const ensureUserColumn = (name, definition) => {
    if (!userColumns.has(name)) {
      db.exec(`ALTER TABLE users ADD COLUMN ${name} ${definition}`);
      userColumns.add(name);
      addedProfileColumns.push(name);
    }
  };
  ensureUserColumn('employee_id', "TEXT NOT NULL DEFAULT ''");
  ensureUserColumn('designation', "TEXT NOT NULL DEFAULT ''");
  ensureUserColumn('profile_picture', "TEXT NOT NULL DEFAULT ''");
  ensureUserColumn('usage_policy_accepted_at', 'TEXT');
  ensureUserColumn('profile_completed_at', 'TEXT');
  if (addedProfileColumns.length) {
    db.prepare('UPDATE users SET usage_policy_accepted_at=COALESCE(usage_policy_accepted_at, created), profile_completed_at=COALESCE(profile_completed_at, created) WHERE demo=0').run();
  }

  const projectColumns = new Set(db.prepare('PRAGMA table_info(projects)').all().map(column => column.name));
  const ensureProjectColumn = (name, definition) => {
    if (!projectColumns.has(name)) {
      db.exec(`ALTER TABLE projects ADD COLUMN ${name} ${definition}`);
      projectColumns.add(name);
    }
  };
  ensureProjectColumn('project_type', "TEXT NOT NULL DEFAULT 'Live'");
  ensureProjectColumn('client_id', "TEXT NOT NULL DEFAULT ''");
  ensureProjectColumn('engagement_id', "TEXT NOT NULL DEFAULT ''");
  ensureProjectColumn('estimated_completion', "TEXT NOT NULL DEFAULT ''");
  ensureProjectColumn('sub_type', "TEXT NOT NULL DEFAULT ''");

  const membershipColumns = new Set(db.prepare('PRAGMA table_info(memberships)').all().map(column => column.name));
  const ensureMembershipColumn = (name, definition) => {
    if (!membershipColumns.has(name)) {
      db.exec(`ALTER TABLE memberships ADD COLUMN ${name} ${definition}`);
      membershipColumns.add(name);
    }
  };
  ensureMembershipColumn('role', "TEXT NOT NULL DEFAULT 'Team Member'");
  db.prepare("UPDATE memberships SET role='Engagement Manager' WHERE user_id IN (SELECT owner_id FROM projects WHERE id=memberships.project_id) AND (role='Team Member' OR role IS NULL OR role='')").run();

  const deliverableColumns = new Set(db.prepare('PRAGMA table_info(deliverables)').all().map(column => column.name));
  if (!deliverableColumns.has('is_final')) {
    db.exec('ALTER TABLE deliverables ADD COLUMN is_final INTEGER NOT NULL DEFAULT 0');
  }
  // Structured memo sections (JSON). Empty means the Markdown body is canonical.
  if (!deliverableColumns.has('memo')) {
    db.exec("ALTER TABLE deliverables ADD COLUMN memo TEXT NOT NULL DEFAULT ''");
  }

  const resourceColumns = new Set(db.prepare('PRAGMA table_info(resources)').all().map(column => column.name));
  if (!resourceColumns.has('workstream_id')) {
    db.exec('ALTER TABLE resources ADD COLUMN workstream_id TEXT DEFAULT NULL');
  }
  db.exec('CREATE INDEX IF NOT EXISTS resources_workstream ON resources(workstream_id)');
  // Extracted document text, page by page. Existing documents start as 'pending' and are read on startup.
  if (!resourceColumns.has('extract_status')) {
    db.exec("ALTER TABLE resources ADD COLUMN extract_status TEXT NOT NULL DEFAULT 'pending'");
    db.exec("ALTER TABLE resources ADD COLUMN extract_note TEXT NOT NULL DEFAULT ''");
  }
  db.exec(`
    CREATE TABLE IF NOT EXISTS document_pages (resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE, seq INTEGER NOT NULL, page INTEGER, text TEXT NOT NULL, PRIMARY KEY (resource_id, seq));
    CREATE INDEX IF NOT EXISTS resources_extract ON resources(extract_status);
    -- Searchable passages cut from document_pages. The FTS5 table indexes their words;
    -- embedding holds a unit-length float32 vector from the embedding model named in embed_model.
    CREATE TABLE IF NOT EXISTS passages (id INTEGER PRIMARY KEY, resource_id TEXT NOT NULL REFERENCES resources(id) ON DELETE CASCADE, project_id TEXT NOT NULL, seq INTEGER NOT NULL, page INTEGER, heading TEXT NOT NULL DEFAULT '', text TEXT NOT NULL, embedding BLOB, embed_model TEXT);
    CREATE INDEX IF NOT EXISTS passages_resource ON passages(resource_id);
    CREATE INDEX IF NOT EXISTS passages_project ON passages(project_id);
    CREATE VIRTUAL TABLE IF NOT EXISTS passages_fts USING fts5(heading, text, content='passages', content_rowid='id', tokenize='porter unicode61');
    CREATE TRIGGER IF NOT EXISTS passages_fts_insert AFTER INSERT ON passages BEGIN
      INSERT INTO passages_fts(rowid, heading, text) VALUES (new.id, new.heading, new.text);
    END;
    CREATE TRIGGER IF NOT EXISTS passages_fts_delete AFTER DELETE ON passages BEGIN
      INSERT INTO passages_fts(passages_fts, rowid, heading, text) VALUES ('delete', old.id, old.heading, old.text);
    END;
    CREATE TRIGGER IF NOT EXISTS passages_fts_update AFTER UPDATE OF heading, text ON passages BEGIN
      INSERT INTO passages_fts(passages_fts, rowid, heading, text) VALUES ('delete', old.id, old.heading, old.text);
      INSERT INTO passages_fts(rowid, heading, text) VALUES (new.id, new.heading, new.text);
    END;
  `);
  // Final Deliverables are documents moved out of Engagement Documents. Workstreams
  // finalised under the earlier model are carried over as exported documents below.
  const migrateFinalWorkstreams = !resourceColumns.has('is_final');
  if (migrateFinalWorkstreams) db.exec('ALTER TABLE resources ADD COLUMN is_final INTEGER NOT NULL DEFAULT 0');

  db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)').run('workspace', JSON.stringify(DEFAULT_SETTINGS));
  const getSettings = () => JSON.parse(db.prepare('SELECT value FROM settings WHERE key=?').get('workspace').value);
  const storedSettings = getSettings();
  if (LEGACY_MEMO_HEADINGS.includes(storedSettings.memoHeadings)) {
    db.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify({ ...storedSettings, memoHeadings: DEFAULT_SETTINGS.memoHeadings }), 'workspace');
  }
  const memoOf = delivery => delivery.kind !== 'memo' ? null : delivery.memo ? normaliseMemo(JSON.parse(delivery.memo)) : delivery.body.trim() ? memoFromBody(delivery.body) : null;
  const exportContext = (delivery, project) => {
    const memo = memoOf(delivery);
    return memo ? { memo, project, gaap: JSON.parse(delivery.params).gaap } : {};
  };
  const transaction = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; }
  };
  // A new extractor reads every document again; each one's passages are rebuilt once it is read.
  if (db.prepare("SELECT value FROM settings WHERE key='extractor'").get()?.value !== String(EXTRACTOR_VERSION)) {
    db.prepare("UPDATE resources SET extract_status='pending' WHERE extract_status<>'unsupported'").run();
    db.prepare("INSERT INTO settings (key,value) VALUES ('extractor',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(EXTRACTOR_VERSION));
  }
  // Documents are read one at a time in a background worker. Anything marked 'pending' (new
  // uploads, edited drafts, documents saved before extraction existed) is picked up in upload order.
  let extracting = null; let stopping = false;
  const kickExtraction = () => {
    extracting ??= (async () => {
      try {
        for (let row; !stopping && (row = db.prepare("SELECT id,name,content FROM resources WHERE extract_status='pending' ORDER BY created LIMIT 1").get());) {
          const result = await extractDocument(row.name, Buffer.from(row.content));
          if (stopping) break;
          transaction(() => {
            const current = db.prepare('SELECT content FROM resources WHERE id=?').get(row.id);
            // A draft edited while it was being read stays pending and is read again.
            if (!current || Buffer.compare(Buffer.from(current.content), Buffer.from(row.content)) !== 0) return;
            db.prepare('DELETE FROM document_pages WHERE resource_id=?').run(row.id);
            const insert = db.prepare('INSERT INTO document_pages (resource_id, seq, page, text) VALUES (?,?,?,?)');
            result.pages.forEach((page, seq) => insert.run(row.id, seq, page.page, page.text));
            db.prepare('UPDATE resources SET extract_status=?, extract_note=? WHERE id=?').run(result.status, result.note, row.id);
            rebuildPassages(row.id);
          });
        }
      } catch (error) {
        if (!stopping) console.error('Document extraction stopped:', error.message);
      }
      kickIndexing();
    })().finally(() => { extracting = null; });
    return extracting;
  };

  // Passages are cut from a document's pages whenever its text changes. Runs inside a transaction.
  const rebuildPassages = resourceId => {
    db.prepare('DELETE FROM passages WHERE resource_id=?').run(resourceId);
    const resource = db.prepare('SELECT project_id, extract_status FROM resources WHERE id=?').get(resourceId);
    if (resource?.extract_status !== 'ready') return;
    const pages = db.prepare('SELECT page, text FROM document_pages WHERE resource_id=? ORDER BY seq').all(resourceId);
    const insert = db.prepare('INSERT INTO passages (resource_id, project_id, seq, page, heading, text) VALUES (?,?,?,?,?,?)');
    chunkPages(pages).forEach((passage, seq) => insert.run(resourceId, resource.project_id, seq, passage.page, passage.heading, passage.text));
  };
  // A new splitting rule rebuilds every document's passages; documents read before passages existed get theirs.
  const storedChunker = db.prepare("SELECT value FROM settings WHERE key='chunker'").get()?.value;
  const unsplit = storedChunker === String(CHUNKER_VERSION)
    ? db.prepare("SELECT id FROM resources WHERE extract_status='ready' AND NOT EXISTS (SELECT 1 FROM passages p WHERE p.resource_id=resources.id)").all()
    : db.prepare("SELECT id FROM resources WHERE extract_status='ready'").all();
  if (unsplit.length || storedChunker !== String(CHUNKER_VERSION)) {
    transaction(() => {
      for (const { id } of unsplit) rebuildPassages(id);
      db.prepare("INSERT INTO settings (key,value) VALUES ('chunker',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(String(CHUNKER_VERSION));
    });
  }

  // Embeddings are made in batches by the local embedding model while AI assistance is on. If the
  // runtime is unreachable, indexing pauses and tries again a minute later.
  const embedModel = ai.embedModel || 'embeddinggemma';
  let indexing = null; let indexRetry = null; let indexError = '';
  const kickIndexing = () => {
    if (stopping || !getSettings().aiEnabled) return Promise.resolve();
    indexing ??= (async () => {
      try {
        while (!stopping && getSettings().aiEnabled) {
          const batch = db.prepare('SELECT p.id, p.heading, p.text, r.name FROM passages p JOIN resources r ON r.id=p.resource_id WHERE p.embed_model IS NULL OR p.embed_model<>? ORDER BY p.id LIMIT 16').all(embedModel);
          if (!batch.length) break;
          const vectors = await ai.embed(batch.map(p => passageForEmbedding(p.name, p)));
          if (stopping) break;
          if (!Array.isArray(vectors) || vectors.length !== batch.length) throw new Error('The embedding model returned an unexpected result.');
          transaction(() => {
            // The text check skips a passage that was rebuilt (and its id reused) while this batch ran.
            const update = db.prepare('UPDATE passages SET embedding=?, embed_model=? WHERE id=? AND text=?');
            batch.forEach((p, i) => update.run(vectorToBlob(vectors[i]), embedModel, p.id, p.text));
          });
          indexError = '';
        }
      } catch (error) {
        indexError = error.message || 'Indexing failed.';
        if (!stopping) { clearTimeout(indexRetry); indexRetry = setTimeout(kickIndexing, 60000); indexRetry.unref?.(); }
      }
    })().finally(() => { indexing = null; });
    return indexing;
  };
  // How far a document has got: read, then split into passages, then embedded for search.
  const searchStatus = r => {
    if (r.extract_status !== 'ready') return { search_status: r.extract_status, search_note: r.extract_note };
    if (!r.unindexed) return { search_status: 'searchable', search_note: r.extract_note || `${r.passage_count} passages indexed for search.` };
    if (!getSettings().aiEnabled) return { search_status: 'ai_off', search_note: 'Text is ready. Turn on AI assistance in Settings to finish indexing it for search.' };
    return { search_status: 'indexing', search_note: indexError ? `Waiting for the local AI runtime: ${indexError}` : `Indexing ${r.unindexed} of ${r.passage_count} passages…` };
  };
  const resourcesWithStatus = projectId => db.prepare('SELECT r.id,r.name,r.kind,r.size,r.created,r.created_by,r.workstream_id,r.is_final,r.extract_status,r.extract_note,(SELECT COUNT(*) FROM passages p WHERE p.resource_id=r.id) AS passage_count,(SELECT COUNT(*) FROM passages p WHERE p.resource_id=r.id AND (p.embed_model IS NULL OR p.embed_model<>?)) AS unindexed FROM resources r WHERE r.project_id=? ORDER BY r.created DESC').all(embedModel, projectId).map(r => ({ ...r, ...searchStatus(r) }));
  kickExtraction();
  kickIndexing();
  // One-time password reset codes. The super user (or the reset-password server command) hands
  // the code over directly; the app sends no email. A new code cancels any earlier one.
  const issueResetCode = (userId, issuedBy = null) => {
    const code = randomBytes(18).toString('base64url'); const expires = Date.now() + 24 * 60 * 60 * 1000;
    transaction(() => {
      db.prepare('UPDATE password_resets SET used=1 WHERE user_id=? AND used=0').run(userId);
      db.prepare('INSERT INTO password_resets (id,user_id,token,expires,issued_by,created) VALUES (?,?,?,?,?,?)').run(randomUUID(), userId, hash(code), expires, issuedBy, now());
    });
    return { code, expires };
  };
  const exportName = (title, format) => `${title.replace(/[^\p{L}\p{N} _-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 100) || 'deliverable'}.${format}`;
  // Adds the workstream's Word (memo) or PowerPoint (deck) export to Engagement Documents.
  const addExportDocument = (delivery, project, userId, { isFinal = 0, created = now() } = {}) => {
    const format = delivery.kind === 'memo' ? 'docx' : 'pptx';
    const exported = exportDocument(delivery, format, exportContext(delivery, project));
    const id = randomUUID();
    const name = exportName(delivery.title, format);
    db.prepare('INSERT INTO resources (id, project_id, name, kind, size, content, text, created_by, created, workstream_id, is_final) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
      id, project.id, name, 'export', exported.bytes.length, exported.bytes, delivery.body, userId, created, delivery.id, isFinal
    );
    return { id, name };
  };
  if (migrateFinalWorkstreams) {
    transaction(() => {
      for (const delivery of db.prepare("SELECT * FROM deliverables WHERE is_final=1 AND body<>''").all()) {
        const project = db.prepare('SELECT * FROM projects WHERE id=?').get(delivery.project_id);
        if (project) addExportDocument(delivery, project, delivery.created_by, { isFinal: 1, created: delivery.updated });
      }
      db.exec('UPDATE deliverables SET is_final=0');
    });
  }
  const activity = (project, user, action) => db.prepare('INSERT INTO activity VALUES (?,?,?,?,?)').run(randomUUID(), project, user, action, now());
  const getProject = (id, user) => {
    const project = db.prepare('SELECT p.*, u.name AS owner_name FROM projects p JOIN memberships m ON m.project_id=p.id LEFT JOIN users u ON u.id=p.owner_id WHERE p.id=? AND m.user_id=?').get(id, user.id);
    requireValue(project, 'Project not found or access unavailable.', 404);
    return project;
  };
  const ownerOnly = (project, user) => requireValue(project.owner_id === user.id, 'Only the project owner can change project settings or membership.', 403);
  const adminOnly = user => requireValue(user.role === 'super_user' && !user.demo, 'Super-user access required.', 403);
  const limiters = new Map();
  const secureCookie = options.secureCookie ?? process.env.ADVISORY_SECURE_COOKIE === '1';
  const allowDemo = options.allowDemo ?? process.env.ADVISORY_ALLOW_DEMO !== '0';
  const requireInvite = options.requireInvite ?? process.env.ADVISORY_REQUIRE_INVITE === '1';
  // Behind a local reverse proxy (e.g. Tailscale Funnel) every request arrives from loopback,
  // so rate limits key on the client address the proxy appends to X-Forwarded-For.
  const trustProxy = options.trustProxy ?? process.env.ADVISORY_TRUST_PROXY === '1';
  const expectedOrigin = options.origin || process.env.ADVISORY_ORIGIN || '';
  const headers = {
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
    'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Cache-Control': 'no-store'
  };
  function respond(res, status, value, extra = {}) {
    res.writeHead(status, { ...headers, 'Content-Type': 'application/json; charset=utf-8', ...extra });
    res.end(JSON.stringify(value));
  }
  function signIn(res, user) {
    const token = randomBytes(32).toString('hex'); const csrf = randomBytes(24).toString('hex');
    db.prepare('DELETE FROM sessions WHERE expires < ?').run(Date.now());
    db.prepare('INSERT INTO sessions VALUES (?,?,?,?)').run(hash(token), user.id, csrf, Date.now() + 8 * 60 * 60 * 1000);
    respond(res, 200, { user: safeUser(user), csrf, workspace: getSettings(), standards: STANDARD_CATALOG, memoGuide: MEMO_GUIDE_PUBLIC, sectionStatuses: SECTION_STATUSES, completionChecklist: COMPLETION_CHECKLIST }, {
      'Set-Cookie': `advisory_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secureCookie ? '; Secure' : ''}`
    });
  }
  function session(req) {
    const token = /(?:^|;\s*)advisory_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie || '')?.[1];
    requireValue(token, 'Please sign in to continue.', 401);
    const result = db.prepare('SELECT u.*, s.csrf FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>? AND u.active=1').get(hash(token), Date.now());
    requireValue(result, 'Your session has expired. Please sign in.', 401);
    return result;
  }
  async function payload(req) {
    requireValue((req.headers['content-type'] || '').startsWith('application/json'), 'Use a JSON request.', 415);
    const parts = []; let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      requireValue(size <= 14_500_000, 'Upload exceeds the 10 MB file limit.', 413);
      parts.push(chunk);
    }
    try { const value = JSON.parse(Buffer.concat(parts).toString()); requireValue(value && typeof value === 'object' && !Array.isArray(value), 'Invalid JSON object.'); return value; }
    catch (error) { if (error instanceof ApiError) throw error; throw new ApiError(400, 'Invalid JSON.'); }
  }
  function throttle(req) {
    const forwarded = trustProxy ? String(req.headers['x-forwarded-for'] || '').split(',').pop().trim() : '';
    const key = forwarded || req.socket.remoteAddress;
    if (limiters.size > 5000) { for (const [k, v] of limiters) if (v.until < Date.now()) limiters.delete(k); }
    const entry = limiters.get(key) || { count: 0, until: Date.now() + 600000 };
    if (entry.until < Date.now()) { entry.count = 0; entry.until = Date.now() + 600000; }
    entry.count++; limiters.set(key, entry);
    requireValue(entry.count <= 30, 'Too many sign-in attempts. Try again in 10 minutes.', 429);
  }
  function createProject(user, values) {
    const project = { id: randomUUID(), name: textField(values.name, 'Project name', 120), client: textField(values.client, 'Client name or alias', 120), fy: dateField(values.fy), type: textField(values.type, 'Project type'), gaap: textField(values.gaap, 'Accounting framework'), description: textField(values.description, 'Description', 4000, false), owner_id: user.id, created: now() };
    const projectType = values.projectType && ['Live', 'Test'].includes(values.projectType) ? values.projectType : 'Live';
    const clientId = textField(values.clientId, 'Client ID', 50, false);
    const engagementId = textField(values.engagementId, 'Engagement ID', 50, false);
    const estimatedCompletion = values.estimatedCompletion ? textField(values.estimatedCompletion, 'Estimated completion', 20, false) : '';
    const subType = textField(values.subType, 'Sub-type', 100, false);
    const allowedTypes = [...PROJECT_TYPES, 'Accounting Advisory', 'IPO Advisory', 'Loan Staffing', 'Training'];
    requireValue(allowedTypes.includes(project.type), 'Choose a valid project type.');
    const allowedFrameworks = [...Object.keys(STANDARD_CATALOG), 'Ind AS', 'IFRS', 'IGAAP', 'USGAAP', 'Others', 'US GAAP', 'Other'];
    requireValue(allowedFrameworks.includes(project.gaap), 'Choose a valid accounting framework.');
    db.prepare('INSERT INTO projects (id,name,client,fy,type,gaap,description,owner_id,created,updated,project_type,client_id,engagement_id,estimated_completion,sub_type) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(project.id, project.name, project.client, project.fy, project.type, project.gaap, project.description, user.id, project.created, project.created, projectType, clientId, engagementId, estimatedCompletion, subType);
    db.prepare('INSERT INTO memberships (project_id, user_id, role) VALUES (?,?,?)').run(project.id, user.id, 'Engagement Manager');
    activity(project.id, user.id, 'Created the project');
    return project;
  }
  function demoWorkspace(user) {
    const fixtures = [
      ['Revenue recognition assessment', 'Northstar Technologies', 'Technical memo', 'IFRS', 'Understand the accounting treatment for a new multi-element customer arrangement.'],
      ['A new reporting foundation', 'Meridian Consumer Co.', 'GAAP transition', 'Ind AS', 'Plan the transition from local accounting policies to Ind AS reporting.'],
      ['IPO readiness & roadmap', 'Project Horizon', 'IPO advisory', 'IFRS', 'Assess reporting readiness and coordinate the path to listing.'],
      ['Lease portfolio review', 'Cedar Logistics', 'Technical memo', 'US GAAP', 'Document the lease accounting questions for a new warehouse portfolio.'],
      ['Finance team learning series', 'Willow Industries', 'Training', 'Ind AS', 'Develop a practical training series for the finance team.'],
      ['Quarter-end advisory support', 'Atlas Healthcare', 'Accounting advisory', 'IFRS', 'Support the finance team with quarter-end reporting questions.']
    ];
    fixtures.forEach((f, i) => {
      const project = createProject(user, { name: f[0], client: f[1], type: f[2], gaap: f[3], description: f[4], fy: '2027-03-31' });
      if (i === 5) db.prepare('UPDATE projects SET status=? WHERE id=?').run('Completed', project.id);
      const contents = Buffer.from(`# ${f[1]} — sample engagement brief\n\nFictional demonstration data.\n\n${f[4]}\n\nScope and assumptions to be agreed with the engagement team.`);
      db.prepare('INSERT INTO resources (id, project_id, name, kind, size, content, text, created_by, created) VALUES (?,?,?,?,?,?,?,?,?)').run(randomUUID(), project.id, 'Engagement brief.md', 'reference', contents.length, contents, contents.toString(), user.id, now());
      if (i < 4) {
        const kind = i === 1 || i === 2 ? 'deck' : 'memo';
        const params = kind === 'memo' ? { gaap: f[3], standards: [STANDARD_CATALOG[f[3]].find(s => s.startsWith(i === 0 ? 'IFRS 15 ' : 'ASC 842 '))], problem: f[4] } : { deckType: 'Proposal', area: i === 1 ? 'GAAP transition' : 'IPO', problem: f[4], ipoTrack: i === 2 ? 'Readiness' : '', currentGaap: i === 1 ? 'Other' : '', targetGaap: 'Ind AS' };
        const draft = buildDraft({ kind, title: f[0], params, project, resources: [], author: user.name });
        const workstreamId = randomUUID();
        const createdNow = now();
        db.prepare('INSERT INTO deliverables (id, project_id, kind, title, params, body, status, created_by, created, updated, is_final, memo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(workstreamId, project.id, kind, f[0], JSON.stringify(params), draft.body, i === 2 ? 'Approved' : (i === 0 ? 'In review' : 'Draft'), user.id, createdNow, createdNow, 0, draft.memo ? JSON.stringify(draft.memo) : '');
        const draftBuf = Buffer.from(draft.body, 'utf8');
        db.prepare('INSERT INTO resources (id, project_id, name, kind, size, content, text, created_by, created, workstream_id) VALUES (?,?,?,?,?,?,?,?,?,?)').run(randomUUID(), project.id, `${f[0]}.md`, 'draft', draftBuf.length, draftBuf, draft.body, user.id, createdNow, workstreamId);
        activity(project.id, user.id, `Created a ${kind === 'memo' ? 'technical memo' : 'slide deck'} outline`);
        if (i === 2) addExportDocument(db.prepare('SELECT * FROM deliverables WHERE id=?').get(workstreamId), project, user.id, { isFinal: 1 });
      }
    });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      const method = req.method;
      // Any change may have added or edited a document; reading it starts once the response is sent.
      if (method !== 'GET' && method !== 'HEAD') res.once('finish', () => { kickExtraction(); kickIndexing(); });
      const boundAddress = server.address();
      const boundPort = boundAddress && typeof boundAddress === 'object' ? boundAddress.port : 3000;
      const hostName = options.host || process.env.HOST || '127.0.0.1';
      const allowedHosts = new Set([`127.0.0.1:${boundPort}`, `localhost:${boundPort}`, `[::1]:${boundPort}`, `${hostName}:${boundPort}`]);
      if (expectedOrigin) allowedHosts.add(new URL(expectedOrigin).host);
      requireValue(allowedHosts.has(req.headers.host), 'Host is not allowed.', 403);
      if (!['GET', 'HEAD'].includes(method)) {
        const requestOrigin = req.headers.origin;
        const allowedOrigin = expectedOrigin || `http://${req.headers.host}`;
        requireValue(!requestOrigin || requestOrigin === allowedOrigin, 'Request origin is not allowed.', 403);
        requireValue(!req.headers['sec-fetch-site'] || ['same-origin', 'none'].includes(req.headers['sec-fetch-site']), 'Cross-site request blocked.', 403);
      }
      if (!path.startsWith('/api/')) {
        requireValue(['GET', 'HEAD'].includes(method), 'Method not allowed.', 405);
        const files = { '/': ['index.html', 'text/html'], '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'] };
        const file = files[path]; requireValue(file, 'Not found.', 404);
        const bytes = await readFile(resolve(ROOT, 'public', file[0]));
        res.writeHead(200, { ...headers, 'Content-Type': `${file[1]}; charset=utf-8` }); res.end(method === 'HEAD' ? undefined : bytes); return;
      }
      if (path === '/api/auth/status' && method === 'GET') {
        respond(res, 200, { needsSetup: !db.prepare('SELECT id FROM users WHERE demo=0 LIMIT 1').get(), requireInvite, allowDemo: allowDemo && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) }); return;
      }
      if (path === '/api/auth/signup' && method === 'POST') {
        throttle(req); const input = await payload(req);
        const name = textField(input.name, 'Full name', 100); const email = emailField(input.email); const password = await passwordHash(input.password);
        const user = transaction(() => {
          requireValue(!db.prepare('SELECT id FROM users WHERE email=?').get(email), 'This email is already registered.', 409);
          const first = !db.prepare('SELECT id FROM users WHERE demo=0 LIMIT 1').get();
          if (first) requireValue(['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(req.headers.host), 'Create the first super-user account from localhost before opening the workspace to the team.', 403);
          let invite;
          requireValue(first || input.invite || !requireInvite, 'A team invitation code is required to create an account.', 403);
          if (!first && input.invite) {
            invite = db.prepare('SELECT * FROM invitations WHERE token=? AND email=? AND used=0 AND expires>?').get(hash(textField(input.invite, 'Team invitation code')), email, Date.now());
            requireValue(invite, 'A valid invitation for this email is required.', 403);
          }
          const record = { id: randomUUID(), name, email, role: first ? 'super_user' : 'member', demo: 0 };
          db.prepare('INSERT INTO users (id,name,email,password,role,created) VALUES (?,?,?,?,?,?)').run(record.id, name, email, password, record.role, now());
          if (invite) db.prepare('UPDATE invitations SET used=1 WHERE id=?').run(invite.id);
          return record;
        });
        signIn(res, user); return;
      }
      if (path === '/api/auth/login' && method === 'POST') {
        throttle(req); const input = await payload(req); const email = emailField(input.email);
        const user = db.prepare('SELECT * FROM users WHERE email=? AND demo=0').get(email);
        const correct = await passwordMatches(input.password, user?.password);
        requireValue(user && correct && user.active, 'Email or password is incorrect, or this account is inactive.', 401);
        signIn(res, user); return;
      }
      if (path === '/api/auth/reset' && method === 'POST') {
        throttle(req); const input = await payload(req); const email = emailField(input.email);
        const code = textField(input.code, 'Reset code', 100); const password = await passwordHash(input.password);
        const user = transaction(() => {
          const reset = db.prepare('SELECT r.id AS reset_id, u.* FROM password_resets r JOIN users u ON u.id=r.user_id WHERE r.token=? AND u.email=? AND r.used=0 AND r.expires>? AND u.active=1 AND u.demo=0').get(hash(code), email, Date.now());
          requireValue(reset, 'This reset code is invalid, already used, or expired. Ask your workspace administrator for a new one.');
          db.prepare('UPDATE users SET password=? WHERE id=?').run(password, reset.id);
          db.prepare('UPDATE password_resets SET used=1, used_at=? WHERE id=?').run(now(), reset.reset_id);
          // Anyone who was signed in to this account is signed out.
          db.prepare('DELETE FROM sessions WHERE user_id=?').run(reset.id);
          return reset;
        });
        signIn(res, user); return;
      }
      if (path === '/api/auth/demo' && method === 'POST') {
        throttle(req); requireValue(allowDemo && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress), 'Sample workspaces are only available on localhost.', 403);
        const user = { id: randomUUID(), name: 'Alex Morgan', email: `sample-${randomUUID()}@advisory.local`, role: 'member', demo: 1 };
        transaction(() => { db.prepare('INSERT INTO users (id,name,email,password,role,demo,created) VALUES (?,?,?,?,?,?,?)').run(user.id, user.name, user.email, '!demo', user.role, 1, now()); demoWorkspace(user); });
        signIn(res, user); return;
      }
      const user = session(req);
      if (!['GET', 'HEAD'].includes(method)) requireValue(req.headers['x-csrf-token'] === user.csrf, 'Your security token is invalid. Refresh and try again.', 403);
      if (path === '/api/me' && method === 'GET') { respond(res, 200, { user: safeUser(user), csrf: user.csrf, workspace: getSettings(), standards: STANDARD_CATALOG, memoGuide: MEMO_GUIDE_PUBLIC, sectionStatuses: SECTION_STATUSES, completionChecklist: COMPLETION_CHECKLIST }); return; }
      if (path === '/api/me/preferences' && method === 'PATCH') {
        requireValue(!user.demo, 'Sample users do not need onboarding preferences.', 403);
        const input = await payload(req);
        const name = textField(input.name, 'Full name', 100);
        const employeeId = textField(input.employeeId, 'Employee ID', 40);
        const designation = textField(input.designation, 'Designation', 40);
        requireValue(DESIGNATIONS.includes(designation), 'Choose a valid designation.');
        requireValue(input.acceptUsagePolicy === true, 'Read and accept the usage policy to continue.');
        const picture = profilePictureField(input.profilePicture);
        const accepted = now();
        db.prepare(`
          UPDATE users
          SET name=?, employee_id=?, designation=?, profile_picture=COALESCE(NULLIF(?, ''), profile_picture), usage_policy_accepted_at=COALESCE(usage_policy_accepted_at, ?), profile_completed_at=?
          WHERE id=?
        `).run(name, employeeId, designation, picture, accepted, accepted, user.id);
        const updated = db.prepare('SELECT * FROM users WHERE id=?').get(user.id);
        respond(res, 200, { user: safeUser(updated) }); return;
      }
      if (path === '/api/auth/logout' && method === 'POST') {
        db.prepare('DELETE FROM sessions WHERE csrf=? AND user_id=?').run(user.csrf, user.id);
        respond(res, 200, { ok: true }, { 'Set-Cookie': `advisory_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0${secureCookie ? '; Secure' : ''}` }); return;
      }
      if (path === '/api/me/password' && method === 'POST') {
        requireValue(!user.demo, 'Sample users do not have a password.', 403);
        throttle(req); const input = await payload(req);
        requireValue(await passwordMatches(input.currentPassword, user.password), 'Your current password is incorrect.');
        requireValue(input.newPassword !== input.currentPassword, 'Choose a password different from your current one.');
        const password = await passwordHash(input.newPassword);
        transaction(() => {
          db.prepare('UPDATE users SET password=? WHERE id=?').run(password, user.id);
          db.prepare('UPDATE password_resets SET used=1 WHERE user_id=? AND used=0').run(user.id);
          // Other signed-in sessions end; this one stays.
          db.prepare('DELETE FROM sessions WHERE user_id=? AND csrf<>?').run(user.id, user.csrf);
        });
        respond(res, 200, { ok: true }); return;
      }
      requireValue(user.demo || user.profile_completed_at, 'Complete user settings and accept the usage policy to continue.', 403);
      if (path === '/api/projects' && method === 'GET') {
        const projects = db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM resources r WHERE r.project_id=p.id) AS resource_count, (SELECT COUNT(*) FROM deliverables d WHERE d.project_id=p.id) AS deliverable_count, (SELECT COUNT(*) FROM memberships mm WHERE mm.project_id=p.id) AS member_count, u.name AS owner_name FROM projects p JOIN memberships m ON m.project_id=p.id JOIN users u ON u.id=p.owner_id WHERE m.user_id=? ORDER BY p.updated DESC`).all(user.id);
        respond(res, 200, { projects }); return;
      }
      if (path === '/api/projects' && method === 'POST') { const input = await payload(req); const project = transaction(() => createProject(user, input)); respond(res, 201, { project }); return; }
      if (path === '/api/final-deliverables' && method === 'GET') {
        respond(res, 200, { documents: db.prepare('SELECT r.id,r.project_id,r.name,r.kind,r.size,r.created,r.created_by,p.name AS project_name,p.client FROM resources r JOIN projects p ON p.id=r.project_id JOIN memberships m ON m.project_id=p.id WHERE m.user_id=? AND r.is_final=1 ORDER BY r.created DESC').all(user.id) }); return;
      }
      if (path === '/api/activity' && method === 'GET') {
        respond(res, 200, { activity: db.prepare('SELECT a.*,u.name AS user_name,p.name AS project_name FROM activity a JOIN users u ON u.id=a.user_id JOIN projects p ON p.id=a.project_id JOIN memberships m ON m.project_id=p.id WHERE m.user_id=? ORDER BY a.created DESC LIMIT 100').all(user.id) }); return;
      }
      if (path === '/api/settings' && method === 'GET') {
        adminOnly(user);
        respond(res, 200, { settings: getSettings(), users: db.prepare('SELECT id,name,email,role,active,created FROM users WHERE demo=0 ORDER BY created').all(), invitations: db.prepare('SELECT id,email,expires,used,created FROM invitations ORDER BY created DESC LIMIT 50').all() }); return;
      }
      if (path === '/api/settings' && method === 'PATCH') {
        adminOnly(user); const input = await payload(req);
        const settings = { workspaceName: textField(input.workspaceName, 'Workspace name', 80), memoTemplateName: textField(input.memoTemplateName, 'Memo template name', 120), memoHeadings: textField(input.memoHeadings, 'Memo headings', 3000), aiEnabled: Boolean(getSettings().aiEnabled) };
        requireValue(settings.memoHeadings.split('\n').filter(x => x.trim()).length <= 20, 'Use up to 20 template headings.');
        db.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify(settings), 'workspace'); respond(res, 200, { settings }); return;
      }
      if (path === '/api/settings/ai' && method === 'PATCH') {
        adminOnly(user); const input = await payload(req);
        requireValue(typeof input.enabled === 'boolean', 'Choose whether AI assistance is on.');
        const settings = { ...getSettings(), aiEnabled: input.enabled };
        db.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify(settings), 'workspace'); respond(res, 200, { settings }); return;
      }
      if (path === '/api/ai/health' && method === 'GET') {
        // Everyone learns whether AI is usable; only the super user sees runtime and model details.
        if (!getSettings().aiEnabled) { respond(res, 200, { enabled: false, status: 'disabled' }); return; }
        const health = await ai.health();
        const status = !health.reachable ? 'unavailable' : health.missing.length ? 'models_missing' : 'ready';
        const details = user.role === 'super_user' && !user.demo
          ? { runtime: ai.name, version: health.version, chatModel: health.chatModel, embedModel: health.embedModel, missing: health.missing, error: health.error || '' }
          : {};
        respond(res, 200, { enabled: true, status, ...details }); return;
      }
      if (path === '/api/invitations' && method === 'POST') {
        adminOnly(user); const input = await payload(req); const email = emailField(input.email);
        requireValue(!db.prepare('SELECT id FROM users WHERE email=?').get(email), 'This email is already registered.', 409);
        const code = randomBytes(18).toString('base64url'); const expires = Date.now() + 7 * 86400000;
        transaction(() => { db.prepare('UPDATE invitations SET used=1 WHERE email=? AND used=0').run(email); db.prepare('INSERT INTO invitations VALUES (?,?,?,?,?,?)').run(randomUUID(), email, hash(code), expires, 0, now()); });
        respond(res, 201, { code, email, expires }); return;
      }
      const resetMatch = /^\/api\/team\/([\w-]+)\/password-reset$/.exec(path);
      if (resetMatch && method === 'POST') {
        adminOnly(user);
        requireValue(resetMatch[1] !== user.id, 'Use Change password in your account menu for your own account.');
        const target = db.prepare('SELECT * FROM users WHERE id=? AND demo=0').get(resetMatch[1]); requireValue(target, 'Team member not found.', 404);
        requireValue(target.active, 'Reactivate this account before issuing a reset code.');
        respond(res, 201, { ...issueResetCode(target.id, user.id), email: target.email, name: target.name }); return;
      }
      const teamMatch = /^\/api\/team\/([\w-]+)$/.exec(path);
      if (teamMatch && method === 'PATCH') {
        adminOnly(user); const input = await payload(req);
        requireValue(teamMatch[1] !== user.id, 'You cannot change your own role or deactivate your own account.');
        const target = db.prepare('SELECT * FROM users WHERE id=? AND demo=0').get(teamMatch[1]); requireValue(target, 'Team member not found.', 404);
        requireValue(['member', 'super_user'].includes(input.role) && typeof input.active === 'boolean', 'Choose a valid role and account state.');
        transaction(() => {
          db.prepare('UPDATE users SET role=?,active=? WHERE id=?').run(input.role, Number(input.active), target.id);
          db.prepare('DELETE FROM sessions WHERE user_id=?').run(target.id);
        }); respond(res, 200, { ok: true }); return;
      }
      const match = /^\/api\/projects\/([\w-]+)(?:\/(.*))?$/.exec(path);
      if (match) {
        const project = getProject(match[1], user); const suffix = match[2] || '';
        if (!suffix && method === 'GET') {
          respond(res, 200, {
            project,
            resources: resourcesWithStatus(project.id),
            deliverables: db.prepare('SELECT id,kind,title,status,created,updated,created_by,is_final FROM deliverables WHERE project_id=? ORDER BY updated DESC').all(project.id),
            members: db.prepare("SELECT u.id,u.name,u.email,u.designation,m.role FROM memberships m JOIN users u ON u.id=m.user_id WHERE m.project_id=? ORDER BY CASE WHEN m.role='Engagement Manager' THEN 1 WHEN m.role='Reviewer' THEN 2 ELSE 3 END, u.name ASC").all(project.id),
            activity: db.prepare('SELECT a.*,u.name AS user_name FROM activity a JOIN users u ON u.id=a.user_id WHERE project_id=? ORDER BY created DESC LIMIT 40').all(project.id)
          });
          return;
        }
        if (!suffix && method === 'PATCH') {
          ownerOnly(project, user);
          const input = await payload(req);
          const updates = [];
          const params = [];
          let logMsg = '';

          if (input.status !== undefined) {
            requireValue(['Active', 'On hold', 'Completed'].includes(input.status), 'Choose a valid project status.');
            updates.push('status = ?');
            params.push(input.status);
            logMsg = `Changed project status to ${input.status}`;
          }
          if (input.name !== undefined) {
            const name = textField(input.name, 'Project name', 120);
            updates.push('name = ?');
            params.push(name);
          }
          if (input.client !== undefined) {
            const client = textField(input.client, 'Client name', 120);
            updates.push('client = ?');
            params.push(client);
          }
          if (input.projectType !== undefined) {
            requireValue(['Live', 'Test'].includes(input.projectType), 'Choose a valid project type.');
            updates.push('project_type = ?');
            params.push(input.projectType);
          }
          if (input.clientId !== undefined) {
            const clientId = textField(input.clientId, 'Client ID', 50, false);
            updates.push('client_id = ?');
            params.push(clientId);
          }
          if (input.engagementId !== undefined) {
            const engagementId = textField(input.engagementId, 'Engagement ID', 50, false);
            updates.push('engagement_id = ?');
            params.push(engagementId);
          }
          if (input.fy !== undefined) {
            const fy = dateField(input.fy);
            updates.push('fy = ?');
            params.push(fy);
          }
          if (input.estimatedCompletion !== undefined) {
            const est = textField(input.estimatedCompletion, 'Estimated completion date', 20, false);
            if (est) {
              requireValue(/^\d{4}-\d{2}-\d{2}$/.test(est) && !Number.isNaN(Date.parse(est)), 'Enter a valid estimated completion date.');
            }
            updates.push('estimated_completion = ?');
            params.push(est);
          }
          if (input.type !== undefined) {
            const type = textField(input.type, 'Engagement type', 100);
            updates.push('type = ?');
            params.push(type);
          }
          if (input.subType !== undefined) {
            const subType = textField(input.subType, 'Engagement sub-type', 100, false);
            updates.push('sub_type = ?');
            params.push(subType);
          }
          if (input.gaap !== undefined) {
            const gaap = textField(input.gaap, 'Accounting framework', 100);
            updates.push('gaap = ?');
            params.push(gaap);
          }
          if (input.description !== undefined) {
            const description = textField(input.description, 'Description', 4000, false);
            updates.push('description = ?');
            params.push(description);
          }

          requireValue(updates.length > 0, 'No updates provided.');
          updates.push('updated = ?');
          params.push(now());
          params.push(project.id);

          transaction(() => {
            db.prepare(`UPDATE projects SET ${updates.join(', ')} WHERE id = ?`).run(...params);
            activity(project.id, user.id, logMsg || 'Updated engagement setup & parameters');
          });
          respond(res, 200, { ok: true });
          return;
        }
        if (suffix === 'members' && method === 'POST') {
          ownerOnly(project, user);
          const input = await payload(req);
          const email = emailField(input.email);
          const role = input.role && ['Engagement Manager', 'Reviewer', 'Team Member'].includes(input.role) ? input.role : 'Team Member';
          requireValue(!user.demo, 'Use a registered team account to add project members.', 403);
          const member = db.prepare('SELECT * FROM users WHERE email=? AND active=1 AND demo=0').get(email);
          requireValue(member, 'This person must join the team before being added to a project.', 404);
          requireValue(!db.prepare('SELECT user_id FROM memberships WHERE project_id=? AND user_id=?').get(project.id, member.id), 'This person already belongs to the project.', 409);
          transaction(() => {
            db.prepare('INSERT INTO memberships (project_id, user_id, role) VALUES (?,?,?)').run(project.id, member.id, role);
            activity(project.id, user.id, `Added ${member.name} (${role}) to the project`);
          });
          respond(res, 201, { ok: true });
          return;
        }
        const memberMatch = /^members\/([\w-]+)$/.exec(suffix);
        if (memberMatch && method === 'PATCH') {
          ownerOnly(project, user);
          const input = await payload(req);
          requireValue(['Engagement Manager', 'Reviewer', 'Team Member'].includes(input.role), 'Choose a valid member role.');
          const member = db.prepare('SELECT u.* FROM memberships m JOIN users u ON u.id=m.user_id WHERE project_id=? AND user_id=?').get(project.id, memberMatch[1]);
          requireValue(member, 'Member not found.', 404);
          transaction(() => {
            db.prepare('UPDATE memberships SET role=? WHERE project_id=? AND user_id=?').run(input.role, project.id, member.id);
            activity(project.id, user.id, `Updated ${member.name}'s role to ${input.role}`);
          });
          respond(res, 200, { ok: true });
          return;
        }
        if (memberMatch && method === 'DELETE') {
          ownerOnly(project, user); requireValue(memberMatch[1] !== project.owner_id, 'The project owner cannot be removed.');
          const member = db.prepare('SELECT u.* FROM memberships m JOIN users u ON u.id=m.user_id WHERE project_id=? AND user_id=?').get(project.id, memberMatch[1]); requireValue(member, 'Member not found.', 404);
          transaction(() => { db.prepare('DELETE FROM memberships WHERE project_id=? AND user_id=?').run(project.id, member.id); activity(project.id, user.id, `Removed ${member.name} from the project`); }); respond(res, 200, { ok: true }); return;
        }
        // Sources search for the Memo Builder: only the documents chosen in Memo Base, all checked to be in this project.
        if (suffix === 'search' && method === 'POST') {
          requireValue(getSettings().aiEnabled, 'Turn on AI assistance in Settings to search engagement documents.', 409);
          const input = await payload(req);
          const query = textField(input.query, 'Search', 1000);
          requireValue(Array.isArray(input.resourceIds) && input.resourceIds.length <= 50 && input.resourceIds.every(x => typeof x === 'string'), 'Choose valid engagement documents.');
          const resourceIds = [...new Set(input.resourceIds)];
          requireValue(resourceIds.length, 'Choose engagement documents in Memo Base to search them.');
          const statuses = new Map(resourcesWithStatus(project.id).map(r => [r.id, r]));
          requireValue(resourceIds.every(id => statuses.has(id)), 'A selected document is outside this project or unavailable.', 403);
          let vector = null; let note = '';
          try {
            [vector] = await ai.embed([queryForEmbedding(query)], { timeoutMs: 30000 });
          } catch (error) {
            if (!(error instanceof AIUnavailableError)) throw error;
            note = 'The local AI runtime is not reachable, so only keyword matches are shown.';
          }
          const results = searchPassages(db, { query, projectId: project.id, resourceIds, vector, embedModel, limit: 8 });
          const documents = resourceIds.map(id => statuses.get(id)).map(r => ({ id: r.id, name: r.name, status: r.search_status, note: r.search_note }));
          respond(res, 200, { query, mode: vector ? 'hybrid' : 'keyword', note, results, documents }); return;
        }
        if (suffix === 'resources' && method === 'POST') {
          const input = await payload(req); const name = textField(input.name, 'Filename', 180);
          requireValue(!/[\\/\x00-\x1f]/.test(name) && /\.(pdf|docx|pptx|xlsx|xls|csv|txt|md|png|jpg|jpeg|json)$/i.test(name), 'Supported files: PDF, Word, PowerPoint, Excel, CSV, text, Markdown, JSON, and images.');
          requireValue(['reference', 'template'].includes(input.kind), 'Choose a valid resource type.');
          requireValue(typeof input.content === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(input.content) && input.content.length % 4 === 0, 'Invalid file content.');
          const content = Buffer.from(input.content, 'base64'); requireValue(content.length > 0 && content.length <= 10 * 1024 * 1024, 'Files must be between 1 byte and 10 MB.');
          const id = randomUUID(); const text = /\.(md|txt|csv|json)$/i.test(name) ? content.toString('utf8').slice(0, 100000) : '';
          transaction(() => { db.prepare('INSERT INTO resources (id, project_id, name, kind, size, content, text, created_by, created) VALUES (?,?,?,?,?,?,?,?,?)').run(id, project.id, name, input.kind, content.length, content, text, user.id, now()); db.prepare('UPDATE projects SET updated=? WHERE id=?').run(now(), project.id); activity(project.id, user.id, `Added resource: ${name}`); }); respond(res, 201, { id }); return;
        }
        if (suffix === 'documents/final' && method === 'POST') {
          const input = await payload(req);
          requireValue(typeof input.final === 'boolean', 'Choose where the documents should go.');
          requireValue(Array.isArray(input.resourceIds) && input.resourceIds.length >= 1 && input.resourceIds.length <= 100 && input.resourceIds.every(x => typeof x === 'string'), 'Select at least one document.');
          const documents = [...new Set(input.resourceIds)].map(id => {
            const document = db.prepare('SELECT id,name FROM resources WHERE id=? AND project_id=?').get(id, project.id);
            requireValue(document, 'A selected document is outside this project or unavailable.', 403);
            return document;
          });
          transaction(() => {
            for (const document of documents) db.prepare('UPDATE resources SET is_final=? WHERE id=?').run(input.final ? 1 : 0, document.id);
            db.prepare('UPDATE projects SET updated=? WHERE id=?').run(now(), project.id);
            const names = documents.map(d => d.name).join(', ');
            activity(project.id, user.id, input.final ? `Moved to Final Deliverables: ${names}` : `Returned to Engagement Documents: ${names}`);
          });
          respond(res, 200, { ok: true, moved: documents.length });
          return;
        }
        const textMatch = /^resources\/([\w-]+)\/text$/.exec(suffix);
        if (textMatch && method === 'GET') {
          const resource = db.prepare('SELECT id,name,extract_status,extract_note FROM resources WHERE id=? AND project_id=?').get(textMatch[1], project.id); requireValue(resource, 'Resource not found.', 404);
          respond(res, 200, { name: resource.name, status: resource.extract_status, note: resource.extract_note, pages: db.prepare('SELECT page,text FROM document_pages WHERE resource_id=? ORDER BY seq').all(resource.id) }); return;
        }
        const resourceMatch = /^resources\/([\w-]+)$/.exec(suffix);
        if (resourceMatch && ['GET', 'DELETE'].includes(method)) {
          const resource = db.prepare('SELECT * FROM resources WHERE id=? AND project_id=?').get(resourceMatch[1], project.id); requireValue(resource, 'Resource not found.', 404);
          if (method === 'GET') { res.writeHead(200, { ...headers, 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="resource"; filename*=UTF-8''${encodeURIComponent(resource.name).replace(/'/g, '%27')}` }); res.end(Buffer.from(resource.content)); return; }
          requireValue(resource.created_by === user.id || project.owner_id === user.id, 'Only the uploader or project owner may remove a resource.', 403);
          transaction(() => { db.prepare('DELETE FROM resources WHERE id=? AND project_id=?').run(resource.id, project.id); activity(project.id, user.id, `Removed resource: ${resource.name}`); }); respond(res, 200, { ok: true }); return;
        }
        if (['workstreams', 'deliverables'].includes(suffix) && method === 'POST') {
          const setupOnly = suffix === 'workstreams';
          const input = await payload(req); requireValue(['memo', 'deck'].includes(input.kind), 'Choose a valid deliverable type.');
          const title = textField(input.title, 'Title', 160); const raw = input.params; requireValue(raw && typeof raw === 'object' && !Array.isArray(raw), 'Provide a brief.');
          const params = { problem: textField(raw.problem, 'Problem statement or brief', 8000) };
          if (input.kind === 'memo') {
            params.gaap = textField(raw.gaap, 'Framework'); requireValue(Object.keys(STANDARD_CATALOG).includes(params.gaap), 'Choose a valid framework.');
            requireValue(Array.isArray(raw.standards) && raw.standards.length <= 20, 'Select up to 20 standards.');
            params.standards = raw.standards.map(s => textField(s, 'Standard', 160));
            params.customStandard = textField(raw.customStandard, 'Additional standard', 500, false);
            if (params.customStandard) params.standards.push(params.customStandard);
          } else {
            params.deckType = textField(raw.deckType, 'Deck type'); requireValue(['Proposal', 'Training', 'Technical guidance'].includes(params.deckType), 'Choose a valid deck type.');
            params.audience = textField(raw.audience, 'Audience', 200, false);
            if (params.deckType === 'Proposal') {
              params.area = textField(raw.area, 'Proposal area'); requireValue(['IPO', 'GAAP transition', 'Accounting advisory', 'Staff augmentation'].includes(params.area), 'Choose a valid proposal area.');
              if (params.area === 'IPO') { params.ipoTrack = textField(raw.ipoTrack, 'IPO focus'); requireValue(['Readiness', 'PMO'].includes(params.ipoTrack), 'Choose a valid IPO focus.'); }
              if (params.area === 'GAAP transition') {
                params.currentGaap = textField(raw.currentGaap, 'Current GAAP'); params.targetGaap = textField(raw.targetGaap, 'Target GAAP');
                requireValue(Object.keys(STANDARD_CATALOG).includes(params.currentGaap) && Object.keys(STANDARD_CATALOG).includes(params.targetGaap), 'Choose valid frameworks.');
                params.methodologies = textField(raw.methodologies, 'Current accounting methodologies', 4000, false);
              }
            }
          }
          requireValue(Array.isArray(input.resourceIds) && input.resourceIds.length <= 50 && input.resourceIds.every(x => typeof x === 'string'), 'Choose valid project resources.');
          const resourceIds = [...new Set(input.resourceIds)];
          const resources = resourceIds.map(id => { const r = db.prepare('SELECT id,name,kind,text FROM resources WHERE id=? AND project_id=?').get(id, project.id); requireValue(r, 'A selected resource is outside this project or unavailable.', 403); return r; });
          params.resourceIds = resourceIds;
          const draft = setupOnly ? null : buildDraft({ kind: input.kind, title, params, project, resources, settings: getSettings(), author: user.name });
          const body = draft?.body || '';
          const id = randomUUID();
          const docId = setupOnly ? null : randomUUID();
          const docName = `${title}.md`;
          const draftContent = Buffer.from(body, 'utf8');
          const createdTime = now();
          transaction(() => {
            db.prepare('INSERT INTO deliverables (id, project_id, kind, title, params, body, status, created_by, created, updated, is_final, memo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').run(
              id, project.id, input.kind, title, JSON.stringify(params), body, setupOnly ? 'Setup' : 'Draft', user.id, createdTime, createdTime, 0, draft?.memo ? JSON.stringify(draft.memo) : ''
            );
            if (!setupOnly) {
              db.prepare('INSERT INTO resources (id, project_id, name, kind, size, content, text, created_by, created, workstream_id) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
                docId, project.id, docName, 'draft', draftContent.length, draftContent, body, user.id, createdTime, id
              );
            }
            db.prepare('UPDATE projects SET updated=? WHERE id=?').run(createdTime, project.id);
            activity(project.id, user.id, setupOnly ? `Set up ${input.kind === 'memo' ? 'Memo Builder' : 'Slide Decks'} workstream: ${title}` : `Created ${input.kind === 'memo' ? 'memo' : 'deck'} outline: ${title}`);
          });
          respond(res, 201, { id, resourceId: docId });
          return;
        }
        const generateMatch = /^deliverables\/([\w-]+)\/generate$/.exec(suffix);
        if (generateMatch && method === 'POST') {
          const input = await payload(req);
          const delivery = db.prepare('SELECT * FROM deliverables WHERE id=? AND project_id=?').get(generateMatch[1], project.id);
          requireValue(delivery, 'Workstream not found.', 404);
          requireValue(!delivery.body.trim(), 'This workstream already has an outline. Open the toolkit to edit it.', 409);
          requireValue(input.updated === delivery.updated, 'This workstream was updated by someone else. Reopen it before continuing.', 409);
          const params = JSON.parse(delivery.params);
          const resources = (params.resourceIds || []).map(id => {
            const resource = db.prepare('SELECT id,name,kind,text FROM resources WHERE id=? AND project_id=?').get(id, project.id);
            requireValue(resource, 'A selected resource is outside this project or unavailable. Restore it before creating the outline.', 409);
            return resource;
          });
          const draft = buildDraft({ kind: delivery.kind, title: delivery.title, params, project, resources, settings: getSettings(), author: user.name });
          const bytes = Buffer.from(draft.body, 'utf8');
          const updated = new Date(Math.max(Date.now(), Date.parse(delivery.updated) + 1)).toISOString();
          const resourceId = randomUUID();
          transaction(() => {
            db.prepare("UPDATE deliverables SET body=?,memo=?,status='Draft',updated=? WHERE id=? AND project_id=?").run(draft.body, draft.memo ? JSON.stringify(draft.memo) : '', updated, delivery.id, project.id);
            db.prepare('INSERT INTO resources (id, project_id, name, kind, size, content, text, created_by, created, workstream_id) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
              resourceId, project.id, `${delivery.title}.md`, 'draft', bytes.length, bytes, draft.body, delivery.created_by, delivery.created, delivery.id
            );
            db.prepare('UPDATE projects SET updated=? WHERE id=?').run(updated, project.id);
            activity(project.id, user.id, `Created ${delivery.kind === 'memo' ? 'memo' : 'deck'} outline: ${delivery.title}`);
          });
          respond(res, 200, { ok: true, resourceId });
          return;
        }
        const saveExportMatch = /^deliverables\/([\w-]+)\/save-to-documents$/.exec(suffix);
        if (saveExportMatch && method === 'POST') {
          const delivery = db.prepare('SELECT * FROM deliverables WHERE id=? AND project_id=?').get(saveExportMatch[1], project.id);
          requireValue(delivery, 'Deliverable not found.', 404);
          requireValue(delivery.body.trim(), 'Open the workstream toolkit and create an outline before exporting.', 409);
          const added = transaction(() => {
            const document = addExportDocument(delivery, project, user.id);
            db.prepare('UPDATE projects SET updated=? WHERE id=?').run(now(), project.id);
            activity(project.id, user.id, `Added to Engagement Documents: ${document.name}`);
            return document;
          });
          respond(res, 201, { ok: true, ...added });
          return;
        }
        const deliveryMatch = /^deliverables\/([\w-]+)(?:\/export\/(md|pdf|docx|pptx))?$/.exec(suffix);
        if (deliveryMatch) {
          const delivery = db.prepare('SELECT * FROM deliverables WHERE id=? AND project_id=?').get(deliveryMatch[1], project.id); requireValue(delivery, 'Deliverable not found.', 404);
          if (deliveryMatch[2] && method === 'GET') {
            requireValue(delivery.body.trim(), 'Open the workstream toolkit and create an outline before exporting.', 409);
            const format = deliveryMatch[2]; requireValue(format === 'md' || format === 'pdf' || (delivery.kind === 'memo' ? format === 'docx' : format === 'pptx'), 'This format is unavailable for this deliverable.');
            const exported = exportDocument(delivery, format, exportContext(delivery, project));
            const filename = exportName(delivery.title, format);
            res.writeHead(200, { ...headers, 'Content-Type': exported.mime, 'Content-Disposition': `attachment; filename="deliverable.${format}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/'/g, '%27')}` }); res.end(exported.bytes); return;
          }
          if (method === 'GET' && !deliveryMatch[2]) { respond(res, 200, { deliverable: { ...delivery, params: JSON.parse(delivery.params), memo: memoOf(delivery) } }); return; }
          if (method === 'DELETE' && !deliveryMatch[2]) {
            requireValue(delivery.created_by === user.id || project.owner_id === user.id, 'Only the workstream creator or project owner may delete a workstream.', 403);
            transaction(() => {
              db.prepare("DELETE FROM resources WHERE project_id=? AND workstream_id=? AND kind='draft' AND is_final=0").run(project.id, delivery.id);
              db.prepare('UPDATE resources SET workstream_id=NULL WHERE project_id=? AND workstream_id=?').run(project.id, delivery.id);
              db.prepare('DELETE FROM deliverables WHERE id=? AND project_id=?').run(delivery.id, project.id);
              db.prepare('UPDATE projects SET updated=? WHERE id=?').run(now(), project.id);
              activity(project.id, user.id, `Deleted workstream: ${delivery.title}`);
            });
            respond(res, 200, { ok: true });
            return;
          }
          if (method === 'PATCH' && !deliveryMatch[2]) {
            const input = await payload(req); const title = textField(input.title, 'Title', 160);
            // Memos save as sections and compose their Markdown body; a plain Markdown save clears the sections so they are re-derived from it.
            const memo = delivery.kind === 'memo' && input.memo !== undefined ? memoField(input.memo, memoOf(delivery)) : null;
            const resourceExists = id => Boolean(db.prepare('SELECT 1 FROM resources WHERE id=? AND project_id=?').get(id, project.id));
            const params = memo && input.base !== undefined ? memoBaseField(input.base, JSON.parse(delivery.params), resourceExists) : JSON.parse(delivery.params);
            const body = memo ? composeMemo({ title, memo, project, gaap: params.gaap }) : textField(input.body, 'Content', 200000);
            requireValue(body.length <= 200000, 'Content is too long.');
            requireValue(['Draft', 'In review', 'Approved', 'Final'].includes(input.status), 'Choose a valid review status.');
            requireValue(input.updated === delivery.updated, 'This draft was updated by someone else. Reopen it before saving.', 409);
            const updated = new Date(Math.max(Date.now(), Date.parse(delivery.updated) + 1)).toISOString();
            transaction(() => {
              db.prepare('UPDATE deliverables SET title=?,params=?,body=?,memo=?,status=?,updated=? WHERE id=? AND project_id=?').run(
                title, JSON.stringify(params), body, memo ? JSON.stringify(memo) : '', input.status, updated, delivery.id, project.id
              );
              // Keep the live Markdown draft current; a draft moved to Final Deliverables stays as it was, and a new live draft takes its place.
              const draftDoc = db.prepare("SELECT id FROM resources WHERE workstream_id=? AND project_id=? AND kind='draft' AND is_final=0").get(delivery.id, project.id);
              const draftBytes = Buffer.from(body, 'utf8');
              if (draftDoc) {
                db.prepare("UPDATE resources SET name=?, size=?, content=?, text=?, extract_status='pending' WHERE id=?").run(
                  `${title}.md`, draftBytes.length, draftBytes, body, draftDoc.id
                );
              } else {
                db.prepare('INSERT INTO resources (id, project_id, name, kind, size, content, text, created_by, created, workstream_id) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
                  randomUUID(), project.id, `${title}.md`, 'draft', draftBytes.length, draftBytes, body, delivery.created_by, delivery.created, delivery.id
                );
              }
              db.prepare('UPDATE projects SET updated=? WHERE id=?').run(updated, project.id);
              if (input.status !== delivery.status || title !== delivery.title) activity(project.id, user.id, `Updated ${title} · ${input.status}`);
            });
            respond(res, 200, { ok: true, updated });
            return;
          }
        }
      }
      throw new ApiError(404, 'Not found.');
    } catch (error) {
      if (!res.headersSent) respond(res, error.status || 500, { error: error.status ? error.message : 'Something went wrong. Please try again.' });
      if (!error.status) console.error('Server error:', error.message);
    }
  });
  server.requestTimeout = 120000;
  server.headersTimeout = 20000;
  return {
    server, db, issueResetCode,
    extractionIdle: async () => { while (extracting || indexing) await (extracting || indexing); },
    close: async () => { stopping = true; clearTimeout(indexRetry); await new Promise(resolveClose => server.close(resolveClose)); await extracting; await indexing; db.close(); }
  };
}

// Recovery when nobody can sign in to issue a code, e.g. the only super user forgot their password.
// It runs on the server computer only: `node server.mjs reset-password you@firm.com`.
async function resetPasswordCommand(email) {
  const app = await createApp();
  try {
    const target = email && app.db.prepare('SELECT id, name, active FROM users WHERE email=? AND demo=0').get(email.trim().toLowerCase());
    if (!target) { console.error(email ? `No account is registered with ${email}.` : 'Usage: node server.mjs reset-password <email>'); process.exitCode = 1; return; }
    if (!target.active) { console.error(`${target.name}'s account is inactive. A super user must reactivate it first.`); process.exitCode = 1; return; }
    const { code, expires } = app.issueResetCode(target.id);
    console.log(`Password reset code for ${target.name}:\n\n  ${code}\n\nOn the sign-in page, choose "Forgot password?" and enter this code with a new password.\nIt works once and expires ${new Date(expires).toLocaleString()}.`);
  } finally { await app.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url) && process.argv[2] === 'reset-password') {
  await resetPasswordCommand(process.argv[3]);
} else if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await createApp(); const host = process.env.HOST || '127.0.0.1'; const port = Number(process.env.PORT || 3000);
  app.server.listen(port, host, () => console.log(`Advisory Desk alpha: http://${host}:${port}\nData is stored locally. AI assistance uses a local model and is off until enabled in Settings. First registered team account becomes the super user.`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
}
