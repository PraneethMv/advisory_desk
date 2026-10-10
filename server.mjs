import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, randomUUID, createHash, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { buildDraft, STANDARD_CATALOG } from './lib/drafts.mjs';
import { exportDocument } from './lib/exports.mjs';

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
const DEFAULT_SETTINGS = { workspaceName: 'Advisory team', memoTemplateName: 'Technical accounting memorandum', memoHeadings: 'Purpose and scope\nBackground and facts\nAccounting questions\nApplicable guidance\nAnalysis\nConclusion\nProject evidence\nReview checklist' };
class ApiError extends Error { constructor(status, message) { super(message); this.status = status; } }
function requireValue(condition, message, status = 400) { if (!condition) throw new ApiError(status, message); }
function textField(value, label, max = 200, required = true) {
  requireValue(value == null || typeof value === 'string', `${label} must be text.`);
  const text = (value || '').trim();
  requireValue(!required || text.length > 0, `${label} is required.`);
  requireValue(text.length <= max, `${label} is too long.`);
  return text;
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
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE NOT NULL, password TEXT NOT NULL, role TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, demo INTEGER NOT NULL DEFAULT 0, employee_id TEXT NOT NULL DEFAULT '', designation TEXT NOT NULL DEFAULT '', profile_picture TEXT NOT NULL DEFAULT '', usage_policy_accepted_at TEXT, profile_completed_at TEXT, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id) ON DELETE CASCADE, csrf TEXT NOT NULL, expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS invitations (id TEXT PRIMARY KEY, email TEXT NOT NULL, token TEXT UNIQUE NOT NULL, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, name TEXT NOT NULL, client TEXT NOT NULL, fy TEXT NOT NULL, type TEXT NOT NULL, gaap TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Active', owner_id TEXT REFERENCES users(id), created TEXT NOT NULL, updated TEXT NOT NULL, project_type TEXT NOT NULL DEFAULT 'Live', client_id TEXT NOT NULL DEFAULT '', engagement_id TEXT NOT NULL DEFAULT '', estimated_completion TEXT NOT NULL DEFAULT '', sub_type TEXT NOT NULL DEFAULT '');
    CREATE TABLE IF NOT EXISTS memberships (project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, user_id TEXT REFERENCES users(id) ON DELETE CASCADE, role TEXT NOT NULL DEFAULT 'Team Member', PRIMARY KEY(project_id,user_id));
    CREATE TABLE IF NOT EXISTS resources (id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, name TEXT NOT NULL, kind TEXT NOT NULL, size INTEGER NOT NULL, content BLOB NOT NULL, text TEXT NOT NULL DEFAULT '', created_by TEXT REFERENCES users(id), created TEXT NOT NULL, workstream_id TEXT DEFAULT NULL);
    CREATE TABLE IF NOT EXISTS deliverables (id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, kind TEXT NOT NULL, title TEXT NOT NULL, params TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Draft', created_by TEXT REFERENCES users(id), created TEXT NOT NULL, updated TEXT NOT NULL, is_final INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS activity (id TEXT PRIMARY KEY, project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, user_id TEXT REFERENCES users(id), action TEXT NOT NULL, created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires);
    CREATE INDEX IF NOT EXISTS resources_project ON resources(project_id);
    CREATE INDEX IF NOT EXISTS resources_workstream ON resources(workstream_id);
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

  const resourceColumns = new Set(db.prepare('PRAGMA table_info(resources)').all().map(column => column.name));
  if (!resourceColumns.has('workstream_id')) {
    db.exec('ALTER TABLE resources ADD COLUMN workstream_id TEXT DEFAULT NULL');
  }

  db.prepare('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)').run('workspace', JSON.stringify(DEFAULT_SETTINGS));
  const getSettings = () => JSON.parse(db.prepare('SELECT value FROM settings WHERE key=?').get('workspace').value);
  const transaction = fn => {
    db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); db.exec('COMMIT'); return result; } catch (error) { db.exec('ROLLBACK'); throw error; }
  };
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
    respond(res, 200, { user: safeUser(user), csrf, workspace: getSettings(), standards: STANDARD_CATALOG }, {
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
    const key = req.socket.remoteAddress;
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
        const params = kind === 'memo' ? { gaap: f[3], standards: [STANDARD_CATALOG[f[3]][i === 0 ? 3 : 7]], problem: f[4] } : { deckType: 'Proposal', area: i === 1 ? 'GAAP transition' : 'IPO', problem: f[4], ipoTrack: i === 2 ? 'Readiness' : '', currentGaap: i === 1 ? 'Other' : '', targetGaap: 'Ind AS' };
        const draft = buildDraft({ kind, title: f[0], params, project, resources: [] });
        const isFinalVal = i === 2 ? 1 : 0;
        const workstreamId = randomUUID();
        const createdNow = now();
        db.prepare('INSERT INTO deliverables (id, project_id, kind, title, params, body, status, created_by, created, updated, is_final) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(workstreamId, project.id, kind, f[0], JSON.stringify(params), draft.body, isFinalVal ? 'Final' : (i === 0 ? 'In review' : 'Draft'), user.id, createdNow, createdNow, isFinalVal);
        const draftBuf = Buffer.from(draft.body, 'utf8');
        db.prepare('INSERT INTO resources (id, project_id, name, kind, size, content, text, created_by, created, workstream_id) VALUES (?,?,?,?,?,?,?,?,?,?)').run(randomUUID(), project.id, `${f[0]}.md`, 'draft', draftBuf.length, draftBuf, draft.body, user.id, createdNow, workstreamId);
        activity(project.id, user.id, `Created a ${kind === 'memo' ? 'technical memo' : 'slide deck'} outline`);
      }
    });
  }

  const server = http.createServer(async (req, res) => {
    try {
      const path = new URL(req.url, 'http://localhost').pathname;
      const method = req.method;
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
        respond(res, 200, { needsSetup: !db.prepare('SELECT id FROM users WHERE demo=0 LIMIT 1').get(), allowDemo: allowDemo && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) }); return;
      }
      if (path === '/api/auth/signup' && method === 'POST') {
        throttle(req); const input = await payload(req);
        const name = textField(input.name, 'Full name', 100); const email = emailField(input.email); const password = await passwordHash(input.password);
        const user = transaction(() => {
          requireValue(!db.prepare('SELECT id FROM users WHERE email=?').get(email), 'This email is already registered.', 409);
          const first = !db.prepare('SELECT id FROM users WHERE demo=0 LIMIT 1').get();
          if (first) requireValue(['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress) && /^(127\.0\.0\.1|localhost|\[::1\]):\d+$/.test(req.headers.host), 'Create the first super-user account from localhost before opening the workspace to the team.', 403);
          let invite;
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
      if (path === '/api/auth/demo' && method === 'POST') {
        throttle(req); requireValue(allowDemo && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress), 'Sample workspaces are only available on localhost.', 403);
        const user = { id: randomUUID(), name: 'Alex Morgan', email: `sample-${randomUUID()}@advisory.local`, role: 'member', demo: 1 };
        transaction(() => { db.prepare('INSERT INTO users (id,name,email,password,role,demo,created) VALUES (?,?,?,?,?,?,?)').run(user.id, user.name, user.email, '!demo', user.role, 1, now()); demoWorkspace(user); });
        signIn(res, user); return;
      }
      const user = session(req);
      if (!['GET', 'HEAD'].includes(method)) requireValue(req.headers['x-csrf-token'] === user.csrf, 'Your security token is invalid. Refresh and try again.', 403);
      if (path === '/api/me' && method === 'GET') { respond(res, 200, { user: safeUser(user), csrf: user.csrf, workspace: getSettings(), standards: STANDARD_CATALOG }); return; }
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
      requireValue(user.demo || user.profile_completed_at, 'Complete user settings and accept the usage policy to continue.', 403);
      if (path === '/api/projects' && method === 'GET') {
        const projects = db.prepare(`SELECT p.*, (SELECT COUNT(*) FROM resources r WHERE r.project_id=p.id) AS resource_count, (SELECT COUNT(*) FROM deliverables d WHERE d.project_id=p.id) AS deliverable_count, (SELECT COUNT(*) FROM memberships mm WHERE mm.project_id=p.id) AS member_count, u.name AS owner_name FROM projects p JOIN memberships m ON m.project_id=p.id JOIN users u ON u.id=p.owner_id WHERE m.user_id=? ORDER BY p.updated DESC`).all(user.id);
        respond(res, 200, { projects }); return;
      }
      if (path === '/api/projects' && method === 'POST') { const input = await payload(req); const project = transaction(() => createProject(user, input)); respond(res, 201, { project }); return; }
      if (path === '/api/deliverables' && method === 'GET') {
        respond(res, 200, { deliverables: db.prepare('SELECT d.id,d.project_id,d.kind,d.title,d.status,d.created,d.updated,d.created_by,d.is_final,p.name AS project_name,p.client FROM deliverables d JOIN projects p ON p.id=d.project_id JOIN memberships m ON m.project_id=p.id WHERE m.user_id=? ORDER BY d.updated DESC').all(user.id) }); return;
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
        const settings = { workspaceName: textField(input.workspaceName, 'Workspace name', 80), memoTemplateName: textField(input.memoTemplateName, 'Memo template name', 120), memoHeadings: textField(input.memoHeadings, 'Memo headings', 3000) };
        requireValue(settings.memoHeadings.split('\n').filter(x => x.trim()).length <= 20, 'Use up to 20 template headings.');
        db.prepare('UPDATE settings SET value=? WHERE key=?').run(JSON.stringify(settings), 'workspace'); respond(res, 200, { settings }); return;
      }
      if (path === '/api/invitations' && method === 'POST') {
        adminOnly(user); const input = await payload(req); const email = emailField(input.email);
        requireValue(!db.prepare('SELECT id FROM users WHERE email=?').get(email), 'This email is already registered.', 409);
        const code = randomBytes(18).toString('base64url'); const expires = Date.now() + 7 * 86400000;
        transaction(() => { db.prepare('UPDATE invitations SET used=1 WHERE email=? AND used=0').run(email); db.prepare('INSERT INTO invitations VALUES (?,?,?,?,?,?)').run(randomUUID(), email, hash(code), expires, 0, now()); });
        respond(res, 201, { code, email, expires }); return;
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
            resources: db.prepare('SELECT id,name,kind,size,created,created_by,workstream_id FROM resources WHERE project_id=? ORDER BY created DESC').all(project.id),
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
        if (suffix === 'resources' && method === 'POST') {
          const input = await payload(req); const name = textField(input.name, 'Filename', 180);
          requireValue(!/[\\/\x00-\x1f]/.test(name) && /\.(pdf|docx|pptx|xlsx|xls|csv|txt|md|png|jpg|jpeg|json)$/i.test(name), 'Supported files: PDF, Word, PowerPoint, Excel, CSV, text, Markdown, JSON, and images.');
          requireValue(['reference', 'template'].includes(input.kind), 'Choose a valid resource type.');
          requireValue(typeof input.content === 'string' && /^[A-Za-z0-9+/]*={0,2}$/.test(input.content) && input.content.length % 4 === 0, 'Invalid file content.');
          const content = Buffer.from(input.content, 'base64'); requireValue(content.length > 0 && content.length <= 10 * 1024 * 1024, 'Files must be between 1 byte and 10 MB.');
          const id = randomUUID(); const text = /\.(md|txt|csv|json)$/i.test(name) ? content.toString('utf8').slice(0, 100000) : '';
          transaction(() => { db.prepare('INSERT INTO resources (id, project_id, name, kind, size, content, text, created_by, created) VALUES (?,?,?,?,?,?,?,?,?)').run(id, project.id, name, input.kind, content.length, content, text, user.id, now()); db.prepare('UPDATE projects SET updated=? WHERE id=?').run(now(), project.id); activity(project.id, user.id, `Added resource: ${name}`); }); respond(res, 201, { id }); return;
        }
        const resourceMatch = /^resources\/([\w-]+)$/.exec(suffix);
        if (resourceMatch && ['GET', 'DELETE'].includes(method)) {
          const resource = db.prepare('SELECT * FROM resources WHERE id=? AND project_id=?').get(resourceMatch[1], project.id); requireValue(resource, 'Resource not found.', 404);
          if (method === 'GET') { res.writeHead(200, { ...headers, 'Content-Type': 'application/octet-stream', 'Content-Disposition': `attachment; filename="resource"; filename*=UTF-8''${encodeURIComponent(resource.name).replace(/'/g, '%27')}` }); res.end(Buffer.from(resource.content)); return; }
          requireValue(resource.created_by === user.id || project.owner_id === user.id, 'Only the uploader or project owner may remove a resource.', 403);
          transaction(() => { db.prepare('DELETE FROM resources WHERE id=? AND project_id=?').run(resource.id, project.id); activity(project.id, user.id, `Removed resource: ${resource.name}`); }); respond(res, 200, { ok: true }); return;
        }
        if (suffix === 'deliverables' && method === 'POST') {
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
          const draft = buildDraft({ kind: input.kind, title, params, project, resources, settings: getSettings() }); const id = randomUUID();
          const docId = randomUUID();
          const docName = `${title}.md`;
          const draftContent = Buffer.from(draft.body, 'utf8');
          const createdTime = now();
          transaction(() => {
            db.prepare('INSERT INTO deliverables (id, project_id, kind, title, params, body, status, created_by, created, updated, is_final) VALUES (?,?,?,?,?,?,?,?,?,?,?)').run(
              id, project.id, input.kind, title, JSON.stringify(params), draft.body, 'Draft', user.id, createdTime, createdTime, 0
            );
            db.prepare('INSERT INTO resources (id, project_id, name, kind, size, content, text, created_by, created, workstream_id) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
              docId, project.id, docName, 'draft', draftContent.length, draftContent, draft.body, user.id, createdTime, id
            );
            db.prepare('UPDATE projects SET updated=? WHERE id=?').run(createdTime, project.id);
            activity(project.id, user.id, `Created ${input.kind === 'memo' ? 'memo' : 'deck'} outline: ${title}`);
          });
          respond(res, 201, { id, resourceId: docId });
          return;
        }
        const finalizeMatch = /^deliverables\/([\w-]+)\/finalize$/.exec(suffix);
        if (finalizeMatch && method === 'POST') {
          const delivery = db.prepare('SELECT * FROM deliverables WHERE id=? AND project_id=?').get(finalizeMatch[1], project.id);
          requireValue(delivery, 'Deliverable not found.', 404);
          const updated = new Date(Math.max(Date.now(), Date.parse(delivery.updated) + 1)).toISOString();
          transaction(() => {
            db.prepare("UPDATE deliverables SET is_final=1, status='Final', updated=? WHERE id=? AND project_id=?").run(updated, delivery.id, project.id);
            db.prepare('UPDATE projects SET updated=? WHERE id=?').run(updated, project.id);
            activity(project.id, user.id, `Moved ${delivery.title} to Final Deliverables`);
          });
          respond(res, 200, { ok: true, is_final: 1, status: 'Final' });
          return;
        }
        const saveExportMatch = /^deliverables\/([\w-]+)\/save-to-documents$/.exec(suffix);
        if (saveExportMatch && method === 'POST') {
          const delivery = db.prepare('SELECT * FROM deliverables WHERE id=? AND project_id=?').get(saveExportMatch[1], project.id);
          requireValue(delivery, 'Deliverable not found.', 404);
          const input = await payload(req).catch(() => ({}));
          const format = input.format === 'docx' || input.format === 'pptx' ? input.format : (delivery.kind === 'memo' ? 'docx' : 'pptx');
          const exported = exportDocument(delivery, format);
          const docId = randomUUID();
          const docName = `${delivery.title.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 100) || 'deliverable'}.${format}`;
          transaction(() => {
            db.prepare('INSERT INTO resources (id, project_id, name, kind, size, content, text, created_by, created, workstream_id) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
              docId, project.id, docName, 'export', exported.bytes.length, exported.bytes, delivery.body, delivery.created_by, delivery.created, delivery.id
            );
            db.prepare('UPDATE projects SET updated=? WHERE id=?').run(now(), project.id);
            activity(project.id, user.id, `Added export to engagement documents: ${docName}`);
          });
          respond(res, 201, { ok: true, id: docId, name: docName });
          return;
        }
        const deliveryMatch = /^deliverables\/([\w-]+)(?:\/export\/(md|docx|pptx))?$/.exec(suffix);
        if (deliveryMatch) {
          const delivery = db.prepare('SELECT * FROM deliverables WHERE id=? AND project_id=?').get(deliveryMatch[1], project.id); requireValue(delivery, 'Deliverable not found.', 404);
          if (deliveryMatch[2] && method === 'GET') {
            const format = deliveryMatch[2]; requireValue(format === 'md' || (delivery.kind === 'memo' ? format === 'docx' : format === 'pptx'), 'This format is unavailable for this deliverable.');
            const exported = exportDocument(delivery, format);
            const filename = `${delivery.title.replace(/[^\p{L}\p{N} _-]/gu, '').slice(0, 100) || 'deliverable'}.${format}`;
            res.writeHead(200, { ...headers, 'Content-Type': exported.mime, 'Content-Disposition': `attachment; filename="deliverable.${format}"; filename*=UTF-8''${encodeURIComponent(filename).replace(/'/g, '%27')}` }); res.end(exported.bytes); return;
          }
          if (method === 'GET' && !deliveryMatch[2]) { respond(res, 200, { deliverable: { ...delivery, params: JSON.parse(delivery.params) } }); return; }
          if (method === 'PATCH' && !deliveryMatch[2]) {
            const input = await payload(req); const title = textField(input.title, 'Title', 160); const body = textField(input.body, 'Content', 200000);
            requireValue(['Draft', 'In review', 'Approved', 'Final'].includes(input.status), 'Choose a valid review status.');
            requireValue(input.updated === delivery.updated, 'This draft was updated by someone else. Reopen it before saving.', 409);
            const isFinalVal = input.is_final !== undefined ? (input.is_final ? 1 : 0) : (input.status === 'Final' ? 1 : delivery.is_final);
            const updated = new Date(Math.max(Date.now(), Date.parse(delivery.updated) + 1)).toISOString();
            transaction(() => {
              db.prepare('UPDATE deliverables SET title=?,body=?,status=?,updated=?,is_final=? WHERE id=? AND project_id=?').run(
                title, body, input.status, updated, isFinalVal, delivery.id, project.id
              );
              // Sync corresponding draft document in resources
              const draftDoc = db.prepare('SELECT id FROM resources WHERE workstream_id=? AND project_id=?').get(delivery.id, project.id);
              const draftBytes = Buffer.from(body, 'utf8');
              if (draftDoc) {
                db.prepare('UPDATE resources SET name=?, size=?, content=?, text=? WHERE id=?').run(
                  `${title}.md`, draftBytes.length, draftBytes, body, draftDoc.id
                );
              } else {
                db.prepare('INSERT INTO resources (id, project_id, name, kind, size, content, text, created_by, created, workstream_id) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
                  randomUUID(), project.id, `${title}.md`, 'draft', draftBytes.length, draftBytes, body, delivery.created_by, delivery.created, delivery.id
                );
              }
              db.prepare('UPDATE projects SET updated=? WHERE id=?').run(updated, project.id);
              activity(project.id, user.id, isFinalVal && !delivery.is_final ? `Moved ${title} to Final Deliverables` : `Updated ${title} · ${input.status}`);
            });
            respond(res, 200, { ok: true, is_final: isFinalVal });
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
  return { server, db, close: async () => { await new Promise(resolveClose => server.close(resolveClose)); db.close(); } };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = await createApp(); const host = process.env.HOST || '127.0.0.1'; const port = Number(process.env.PORT || 3000);
  app.server.listen(port, host, () => console.log(`Advisory Desk alpha: http://${host}:${port}\nData is stored locally. AI is deferred. First registered team account becomes the super user.`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
}
