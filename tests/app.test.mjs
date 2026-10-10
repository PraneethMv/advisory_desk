import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createApp } from '../server.mjs';
import { buildDraft } from '../lib/drafts.mjs';
import { exportDocument } from '../lib/exports.mjs';

let app, origin, dataDir;
before(async () => {
  await mkdir(resolve('test-results'), { recursive: true });
  dataDir = await mkdtemp(resolve('test-results', 'workspace-'));
  app = await createApp({ dataDir, allowDemo: true });
  await new Promise(done => app.server.listen(0, '127.0.0.1', done));
  origin = `http://127.0.0.1:${app.server.address().port}`;
});
after(async () => { await app.close(); await rm(dataDir, { recursive: true, force: true }); });

function client() {
  const session = { cookie: '', csrf: '' };
  session.request = async (path, method = 'GET', value, extra = {}) => {
    const response = await fetch(`${origin}/api${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(session.cookie ? { Cookie: session.cookie } : {}), ...(session.csrf ? { 'X-CSRF-Token': session.csrf } : {}), ...extra },
      body: value === undefined ? undefined : JSON.stringify(value)
    });
    const cookie = response.headers.get('set-cookie'); if (cookie) session.cookie = cookie.split(';')[0];
    const type = response.headers.get('content-type');
    const body = type?.startsWith('application/json') ? await response.json() : Buffer.from(await response.arrayBuffer());
    if (body.csrf) session.csrf = body.csrf;
    return { status: response.status, body, headers: response.headers };
  };
  return session;
}
const projectInput = (name = 'Restricted client project') => ({ name, client: 'Confidential alias', fy: '2027-03-31', type: 'Technical memo', gaap: 'IFRS', description: 'Private project context.' });
const resourceInput = (name = 'Secret brief.md', body = '# Project-specific information\n\nConfidential facts') => ({ name, kind: 'reference', content: Buffer.from(body).toString('base64') });
const memoInput = resourceIds => ({ kind: 'memo', title: 'Revenue <review> & memo', params: { gaap: 'IFRS', standards: ['IFRS 15 · Revenue'], problem: 'Document the question using this project only.' }, resourceIds });
function unzipStored(bytes) {
  const files = new Map(); let offset = 0;
  while (bytes.readUInt32LE(offset) === 0x04034b50) {
    const length = bytes.readUInt32LE(offset + 18); const nameLength = bytes.readUInt16LE(offset + 26); const extra = bytes.readUInt16LE(offset + 28);
    const filename = bytes.subarray(offset + 30, offset + 30 + nameLength).toString();
    const start = offset + 30 + nameLength + extra;
    files.set(filename, bytes.subarray(start, start + length).toString()); offset = start + length;
  }
  assert.equal(bytes.readUInt32LE(offset), 0x02014b50);
  return files;
}

test('authentication, invitations, isolation, collaboration, and review workflow', async t => {
  const admin = client(); const member = client(); const stranger = client();
  let ownerProject, memberProject, ownerResource, memberResource, draftId;
  await t.test('private endpoints require authentication', async () => {
    assert.equal((await stranger.request('/projects')).status, 401);
    assert.equal((await stranger.request('/settings')).status, 401);
    assert.equal((await stranger.request('/auth/status')).body.needsSetup, true);
  });
  await t.test('first registered account becomes super user; later signup needs an email-bound invite', async () => {
    const first = await admin.request('/auth/signup', 'POST', { name: 'Workspace Owner', email: 'owner@example.test', password: 'correct horse battery staple' });
    assert.equal(first.status, 200); assert.equal(first.body.user.role, 'super_user');
    assert.match(first.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    assert.equal((await member.request('/auth/signup', 'POST', { name: 'Team Member', email: 'member@example.test', password: 'member password long enough', invite: 'invented' })).status, 403);
    const invitation = await admin.request('/invitations', 'POST', { email: 'member@example.test' }); assert.equal(invitation.status, 201);
    assert.equal((await stranger.request('/auth/signup', 'POST', { name: 'Stranger', email: 'stranger@example.test', password: 'stranger password long enough', invite: invitation.body.code })).status, 403);
    const joined = await member.request('/auth/signup', 'POST', { name: 'Team Member', email: 'member@example.test', password: 'member password long enough', invite: invitation.body.code });
    assert.equal(joined.status, 200); assert.equal(joined.body.user.role, 'member');
    assert.equal((await member.request('/projects')).body.projects.length, 0);
    const openUser = client();
    const openSignup = await openUser.request('/auth/signup', 'POST', { name: 'Open User', email: 'open@example.test', password: 'open password long enough' });
    assert.equal(openSignup.status, 200);
    assert.equal(openSignup.body.user.role, 'member');
    assert.equal((await openUser.request('/projects')).body.projects.length, 0);
    const settings = await admin.request('/settings'); assert.equal(settings.body.invitations[0].used, 1);
    assert.equal(JSON.stringify(settings.body).includes(invitation.body.code), false);
  });
  await t.test('super-user settings enforce role authorization, CSRF, and request origin', async () => {
    assert.equal((await member.request('/settings')).status, 403);
    const settings = (await admin.request('/settings')).body.settings;
    assert.equal((await admin.request('/settings', 'PATCH', settings, { 'X-CSRF-Token': 'wrong' })).status, 403);
    assert.equal((await admin.request('/settings', 'PATCH', settings, { Origin: 'https://attacker.example' })).status, 403);
    assert.equal((await admin.request('/settings', 'PATCH', { ...settings, workspaceName: 'Test advisory team' })).status, 200);
    assert.equal((await member.request('/me')).body.workspace.workspaceName, 'Test advisory team');
  });
  await t.test('project creation and upload persist; unassigned users and super users cannot cross project boundaries', async () => {
    ownerProject = (await admin.request('/projects', 'POST', projectInput())).body.project.id;
    memberProject = (await member.request('/projects', 'POST', projectInput('Member-only project'))).body.project.id;
    ownerResource = (await admin.request(`/projects/${ownerProject}/resources`, 'POST', resourceInput())).body.id;
    memberResource = (await member.request(`/projects/${memberProject}/resources`, 'POST', resourceInput('Another project.md'))).body.id;
    assert.equal((await member.request(`/projects/${ownerProject}`)).status, 404);
    assert.equal((await admin.request(`/projects/${memberProject}`)).status, 404);
    assert.equal((await member.request(`/projects/${ownerProject}/resources/${ownerResource}`)).status, 404);
    assert.equal((await member.request(`/projects/${memberProject}/resources/${ownerResource}`)).status, 404);
    assert.equal((await admin.request('/projects')).body.projects.length, 1);
    assert.equal((await member.request('/projects')).body.projects.length, 1);
    const resource = await admin.request(`/projects/${ownerProject}/resources/${ownerResource}`);
    assert.equal(resource.status, 200); assert.match(resource.body.toString(), /Confidential facts/);
    assert.match(resource.headers.get('content-disposition'), /attachment/);
  });
  await t.test('input validation rejects invalid dates, file paths, executable uploads, and empty files', async () => {
    assert.equal((await admin.request('/projects', 'POST', { ...projectInput(), fy: '2027-02-30' })).status, 400);
    assert.equal((await admin.request(`/projects/${ownerProject}/resources`, 'POST', resourceInput('../secret.md'))).status, 400);
    assert.equal((await admin.request(`/projects/${ownerProject}/resources`, 'POST', resourceInput('bad.exe'))).status, 400);
    assert.equal((await admin.request(`/projects/${ownerProject}/resources`, 'POST', resourceInput('empty.md', ''))).status, 400);
  });
  await t.test('project owner can add a teammate; membership grants access only to that project', async () => {
    const result = await admin.request(`/projects/${ownerProject}/members`, 'POST', { email: 'member@example.test' }); assert.equal(result.status, 201);
    assert.equal((await member.request(`/projects/${ownerProject}`)).status, 200);
    assert.equal((await member.request(`/projects/${ownerProject}/resources/${ownerResource}`)).status, 200);
    assert.equal((await member.request('/projects')).body.projects.length, 2);
    assert.equal((await member.request(`/projects/${ownerProject}`, 'PATCH', { status: 'Completed' })).status, 403);
    assert.equal((await admin.request(`/projects/${memberProject}`)).status, 404);
  });
  await t.test('a brief cannot select resources from another project, even if its author belongs to both', async () => {
    const invalid = await member.request(`/projects/${ownerProject}/deliverables`, 'POST', memoInput([memberResource])); assert.equal(invalid.status, 403);
    const valid = await member.request(`/projects/${ownerProject}/deliverables`, 'POST', memoInput([ownerResource])); assert.equal(valid.status, 201); draftId = valid.body.id;
    const draft = (await admin.request(`/projects/${ownerProject}/deliverables/${draftId}`)).body.deliverable;
    assert.match(draft.body, /IFRS 15/); assert.match(draft.body, /Secret brief.md/); assert.match(draft.body, /WORKING OUTLINE/);
    assert.equal((await member.request(`/projects/${memberProject}/deliverables/${draftId}`)).status, 404);
    assert.equal((await member.request(`/projects/${memberProject}/deliverables/${draftId}/export/docx`)).status, 404);
  });
  await t.test('draft editing preserves edits, updates review status, and rejects stale versions', async () => {
    const original = (await admin.request(`/projects/${ownerProject}/deliverables/${draftId}`)).body.deliverable;
    const update = { title: original.title, body: original.body + '\n\nReviewed by the engagement team.', status: 'In review', updated: original.updated };
    assert.equal((await admin.request(`/projects/${ownerProject}/deliverables/${draftId}`, 'PATCH', update)).status, 200);
    assert.equal((await member.request(`/projects/${ownerProject}/deliverables/${draftId}`, 'PATCH', update)).status, 409);
    const saved = (await member.request(`/projects/${ownerProject}/deliverables/${draftId}`)).body.deliverable;
    assert.equal(saved.status, 'In review'); assert.match(saved.body, /Reviewed by the engagement team/);
    const exported = await member.request(`/projects/${ownerProject}/deliverables/${draftId}/export/docx`); assert.equal(exported.status, 200);
    const files = unzipStored(exported.body); assert.match(files.get('word/document.xml'), /Revenue &lt;review&gt; &amp; memo/);
    assert.match(files.get('word/document.xml'), /Reviewed by the engagement team/);
    assert.equal((await member.request(`/projects/${ownerProject}/deliverables/${draftId}/export/pptx`)).status, 400);
  });
  await t.test('proposal brief requires conditional IPO and GAAP-transition fields', async () => {
    const brief = { kind: 'deck', title: 'Transition proposal', resourceIds: [], params: { deckType: 'Proposal', area: 'GAAP transition', problem: 'Prepare a transition approach.' } };
    assert.equal((await admin.request(`/projects/${ownerProject}/deliverables`, 'POST', brief)).status, 400);
    brief.params.currentGaap = 'US GAAP'; brief.params.targetGaap = 'IFRS'; brief.params.methodologies = 'Current policies to be assessed.';
    const created = await admin.request(`/projects/${ownerProject}/deliverables`, 'POST', brief); assert.equal(created.status, 201);
    const exported = await admin.request(`/projects/${ownerProject}/deliverables/${created.body.id}/export/pptx`); assert.equal(exported.status, 200);
    const files = unzipStored(exported.body); assert.ok(files.has('ppt/presentation.xml')); assert.ok(files.has('ppt/slideMasters/slideMaster1.xml'));
    assert.match([...files.values()].join('\n'), /Current policies to be assessed/);
  });
  await t.test('revoking project membership immediately removes resources, drafts, exports, and activity', async () => {
    const memberId = (await member.request('/me')).body.user.id;
    assert.equal((await admin.request(`/projects/${ownerProject}/members/${memberId}`, 'DELETE')).status, 200);
    for (const suffix of ['', `/resources/${ownerResource}`, `/deliverables/${draftId}`, `/deliverables/${draftId}/export/md`]) assert.equal((await member.request(`/projects/${ownerProject}${suffix}`)).status, 404);
    assert.equal((await member.request('/projects')).body.projects.length, 1);
    assert.equal((await member.request('/deliverables')).body.deliverables.length, 0);
    assert.ok((await member.request('/activity')).body.activity.every(a => a.project_id === memberProject));
  });
  await t.test('disabled accounts lose existing sessions and cannot sign in', async () => {
    const memberId = (await member.request('/me')).body.user.id;
    assert.equal((await admin.request(`/team/${memberId}`, 'PATCH', { role: 'member', active: false })).status, 200);
    assert.equal((await member.request('/me')).status, 401);
    assert.equal((await member.request('/auth/login', 'POST', { email: 'member@example.test', password: 'member password long enough' })).status, 401);
    assert.equal((await admin.request(`/team/${memberId}`, 'PATCH', { role: 'member', active: true })).status, 200);
  });
  await t.test('logout invalidates sessions; login restores persisted project data', async () => {
    assert.equal((await admin.request('/auth/logout', 'POST', {})).status, 200);
    assert.equal((await admin.request('/me')).status, 401);
    assert.equal((await admin.request('/auth/login', 'POST', { email: 'owner@example.test', password: 'correct horse battery staple' })).status, 200);
    assert.equal((await admin.request('/projects')).body.projects[0].id, ownerProject);
    assert.equal((await admin.request('/auth/status')).body.needsSetup, false);
  });
});

test('sample workspaces use separate accounts, fictional projects, and no administrative access', async () => {
  const one = client(); const two = client();
  assert.equal((await one.request('/auth/demo', 'POST', {})).status, 200);
  assert.equal((await two.request('/auth/demo', 'POST', {})).status, 200);
  const projectsOne = (await one.request('/projects')).body.projects;
  const projectsTwo = (await two.request('/projects')).body.projects;
  assert.equal(projectsOne.length, 6); assert.equal(projectsTwo.length, 6);
  assert.ok(!projectsOne.some(a => projectsTwo.some(b => a.id === b.id)));
  assert.equal((await one.request(`/projects/${projectsTwo[0].id}`)).status, 404);
  assert.equal((await one.request('/settings')).status, 403);
});

test('project Markdown templates determine outline headings and keep evidence references scoped', () => {
  const draft = buildDraft({ kind: 'memo', title: 'Test memo', params: { gaap: 'IFRS', standards: [], problem: 'Test issue' }, project: { client: 'Alias', fy: '2027-03-31' }, resources: [{ name: 'Team template.md', kind: 'template', text: '# Executive assessment\n## Facts\n## Team conclusion' }] });
  assert.match(draft.body, /## Executive assessment/); assert.match(draft.body, /## Team conclusion/); assert.match(draft.body, /Test issue/);
  assert.equal(draft.mode, 'outline');
});

test('office exports contain their relationships, editable content, and valid ZIP directories', () => {
  const delivery = { title: 'A & B', body: '# A & B\n\n## Slide <one>\n- Alpha\n- Beta\n\n## Next steps\n- Review' };
  for (const format of ['docx', 'pptx']) {
    const result = exportDocument(delivery, format); const files = unzipStored(result.bytes);
    assert.ok(files.has('[Content_Types].xml')); assert.ok(files.has('_rels/.rels'));
    const root = format === 'docx' ? 'word/document.xml' : 'ppt/slides/slide1.xml';
    assert.match(files.get(root), /&lt;one&gt;/);
    assert.match(files.get(root), /Alpha/);
    assert.ok(result.bytes.subarray(-22).readUInt32LE(0) === 0x06054b50);
  }
  assert.equal(exportDocument(delivery, 'md').bytes.toString(), delivery.body);
});

test('static application assets are served locally with restrictive browser headers', async () => {
  for (const path of ['/', '/app.js', '/styles.css', '/favicon.svg']) {
    const response = await fetch(origin + path); assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /connect-src 'self'/);
    assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  }
  const source = await readFile(resolve('public/index.html'), 'utf8');
  assert.equal(/(?:src|href)="https?:\/\//.test(source), false);
  assert.equal((await fetch(origin + '/server.mjs')).status, 404);
});
