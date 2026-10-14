import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../server.mjs';
import { buildDraft } from '../lib/drafts.mjs';
import { exportDocument } from '../lib/exports.mjs';
import { memoFromBody } from '../lib/memo.mjs';

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
    assert.equal(first.body.user.profileComplete, false);
    assert.match(first.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    assert.equal((await admin.request('/me/preferences', 'PATCH', { name: 'Workspace Owner', employeeId: 'AD-001', designation: 'Partner', acceptUsagePolicy: true })).status, 400);
    assert.equal((await admin.request('/me/preferences', 'PATCH', { name: 'Workspace Owner', employeeId: 'AD-001', designation: 'Director', acceptUsagePolicy: false })).status, 400);
    const preferences = await admin.request('/me/preferences', 'PATCH', { name: 'Workspace Owner', employeeId: 'AD-001', designation: 'Director', acceptUsagePolicy: true });
    assert.equal(preferences.status, 200);
    assert.equal(preferences.body.user.profileComplete, true);
    assert.equal(preferences.body.user.employeeId, 'AD-001');
    assert.equal(preferences.body.user.designation, 'Director');
    assert.equal((await member.request('/auth/signup', 'POST', { name: 'Team Member', email: 'member@example.test', password: 'member password long enough', invite: 'invented' })).status, 403);
    const invitation = await admin.request('/invitations', 'POST', { email: 'member@example.test' }); assert.equal(invitation.status, 201);
    assert.equal((await stranger.request('/auth/signup', 'POST', { name: 'Stranger', email: 'stranger@example.test', password: 'stranger password long enough', invite: invitation.body.code })).status, 403);
    const joined = await member.request('/auth/signup', 'POST', { name: 'Team Member', email: 'member@example.test', password: 'member password long enough', invite: invitation.body.code });
    assert.equal(joined.status, 200); assert.equal(joined.body.user.role, 'member');
    assert.equal((await member.request('/projects')).status, 403);
    assert.equal((await member.request('/me/preferences', 'PATCH', { name: 'Team Member', employeeId: 'AD-002', designation: 'Associate', acceptUsagePolicy: true })).status, 200);
    assert.equal((await member.request('/projects')).body.projects.length, 0);
    const openUser = client();
    const openSignup = await openUser.request('/auth/signup', 'POST', { name: 'Open User', email: 'open@example.test', password: 'open password long enough' });
    assert.equal(openSignup.status, 200);
    assert.equal(openSignup.body.user.role, 'member');
    assert.equal((await openUser.request('/projects')).status, 403);
    assert.equal((await openUser.request('/me/preferences', 'PATCH', { name: 'Open User', employeeId: 'AD-003', designation: 'Intern', acceptUsagePolicy: true })).status, 200);
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
    assert.match(draft.body, /IFRS 15/); assert.deepEqual(draft.params.resourceIds, [ownerResource]); assert.match(draft.body, /## Executive summary/);
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
    assert.equal((await member.request('/final-deliverables')).body.documents.length, 0);
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

test('topbar includes notifications button and dropdown with sample notification templates', async () => {
  const appJs = await readFile(resolve('public/app.js'), 'utf8');
  const stylesCss = await readFile(resolve('public/styles.css'), 'utf8');

  // Verify bell icon and dropdown function exist
  assert.match(appJs, /bell:\s*'<path d="M18 8A6 6 0/);
  assert.match(appJs, /function notificationMenuDropdown\(\)/);
  assert.match(appJs, /data-action="toggle-notifications"/);
  assert.match(appJs, /data-action="mark-all-notifications-read"/);
  assert.match(appJs, /data-action="open-notification"/);

  // Verify sample notification texts specified by user
  assert.match(appJs, /Your Engagement Manager \$\{mgr\} has invited you to an engagement\. Please open Advisory Desk to view/);
  assert.match(appJs, /Knowledge Base: New additions to the IPO Knowledge Base Resources/);

  // Verify notifications placed on right side of topbar structures (shell, workbench, splash)
  assert.match(appJs, /<header class="topbar">[\s\S]*?<div class="topbar-right">[\s\S]*?\$\{notificationMenuDropdown\(\)\}/);
  assert.match(appJs, /<header class="workbench-topbar">[\s\S]*?<div class="workbench-topbar-right">[\s\S]*?\$\{notificationMenuDropdown\(\)\}/);
  assert.match(appJs, /<header class="splash-topbar">[\s\S]*?<div class="splash-top-right">[\s\S]*?\$\{notificationMenuDropdown\(\)\}/);

  // Verify 'Notifications' label removed, leaving only bell icon and counter
  assert.equal(appJs.includes('<span class="notification-trigger-text">Notifications</span>'), false);
  // Verify 'Private workspace' badge removed from topbar
  assert.equal(appJs.includes('Private workspace'), false);

  // Verify CSS styles exist
  assert.match(stylesCss, /\.notification-menu-wrap/);
  assert.match(stylesCss, /\.notification-trigger/);
  assert.match(stylesCss, /\.notification-menu-dropdown/);
  assert.match(stylesCss, /\.topbar-right/);
});

test('workbench renders Create Engagement button in page-heading and out of the empty banner ribbon', async () => {
  const appJs = await readFile(resolve('public/app.js'), 'utf8');

  // Verify Create Engagement button is inside page-heading alongside the title
  assert.match(appJs, /<section class="page-heading">[\s\S]*?<h1>Workbench<span class="heading-dot">\./);
  assert.match(appJs, /<section class="page-heading">[\s\S]*?<div class="button-row">[\s\S]*?Create Engagement/);

  // Verify Create Engagement button is not inside workbench-empty-banner
  const bannerMatch = appJs.match(/<div class="workbench-empty-banner">([\s\S]*?)<\/div>\s*`\s*:\s*`/);
  assert.ok(bannerMatch);
  assert.equal(bannerMatch[1].includes('Create Engagement'), false);
});

test('configure new project dialog renders in landscape pop-up layout', async () => {
  const appJs = await readFile(resolve('public/app.js'), 'utf8');
  const stylesCss = await readFile(resolve('public/styles.css'), 'utf8');

  // Verify newProject passes landscape-modal to showModal
  assert.match(appJs, /function newProject\(\)\s*\{[\s\S]*?showModal\([\s\S]*?'landscape-modal'\s*\);/);
  assert.match(appJs, /<div class="landscape-modal-grid">/);

  // Verify landscape-modal CSS is defined with wide landscape dimensions
  assert.match(stylesCss, /dialog\.landscape-modal\s*\{[\s\S]*?max-width:\s*1040px;/);
  assert.match(stylesCss, /\.landscape-modal-grid\s*\{[\s\S]*?grid-template-columns:\s*1fr\s+1fr;/);
});

test('project sidebar is divided into Workspace and Toolkit with Return to Hub and private banner removed from sidebar', async () => {
  const appJs = await readFile(resolve('public/app.js'), 'utf8');
  const stylesCss = await readFile(resolve('public/styles.css'), 'utf8');

  // Verify dashboard icon path
  assert.match(appJs, /dashboard:\s*'<rect/);

  // Verify project-specific sidebar items in WORKSPACE section
  assert.match(appJs, /projectTabNav\('overview',\s*'Dashboard',\s*'dashboard'\)/);
  assert.match(appJs, /projectTabNav\('resources',\s*'Project Resources',\s*'folder'/);
  assert.match(appJs, /projectTabNav\('deliverables',\s*'Final Deliverables',\s*'slides'/);
  assert.match(appJs, /projectTabNav\('setup',\s*'Engagement Setup',\s*'hierarchy'/);

  // Verify TOOLKIT section items with renamed titles
  assert.match(appJs, /<span>Memo Builder<\/span>/);
  assert.match(appJs, /<span>Slide Decks<\/span>/);
  assert.match(appJs, /<span>FS Helper<\/span>/);

  // Verify Return to Hub, private banner, and profile are removed from shell sidebar
  const shellMatch = appJs.match(/function shell\(content, title = 'Projects', trail = ''\) \{([\s\S]*?)app\.innerHTML/);
  assert.ok(shellMatch);
  assert.equal(shellMatch[1].includes('return-hub-link'), false);
  assert.equal(shellMatch[1].includes('class="private-note"'), false);
  assert.equal(shellMatch[1].includes('class="profile"'), false);

  // Verify renderProject does not render back-link or horizontal project-tabs
  const renderProjectMatch = appJs.match(/function renderProject\(\)\s*\{([\s\S]*?)\n\}\s*\n\/\*/);
  assert.ok(renderProjectMatch);
  assert.equal(renderProjectMatch[1].includes('<a class="back-link"'), false);
  assert.equal(renderProjectMatch[1].includes('class="project-tabs"'), false);

  // Verify Knowledge Base link is placed above private note in project sidebar and opens in a new tab
  assert.match(appJs, /<a href="#knowledge-base" target="_blank" rel="noopener noreferrer" class="nav-link kb-external-link"[\s\S]*?Knowledge Base/);
  assert.match(stylesCss, /\.kb-external-link\s*\{/);
  assert.match(appJs, /window\.open\(location\.origin \+ location\.pathname \+ target\.getAttribute\('href'\),\s*'_blank'/);

  // Verify CSS styles for sidebar buttons and Return to Hub
  assert.match(stylesCss, /button\.nav-link\s*\{/);
  assert.match(stylesCss, /button\.toolkit-item\s*\{/);
  assert.match(stylesCss, /\.return-hub-link\s*\{/);
  assert.match(stylesCss, /\.project-workspace-switch\s*\{/);
});

test('new engagements display Please set up the Engagement before continuing banner that triggers setup modal', async () => {
  const appJs = await readFile(resolve('public/app.js'), 'utf8');
  const stylesCss = await readFile(resolve('public/styles.css'), 'utf8');

  // Verify banner text
  assert.match(appJs, /Please set up the Engagement before continuing/);
  assert.match(appJs, /class="engagement-setup-banner"/);
  assert.match(appJs, /'open-engagement-setup-modal'/);

  // Verify setup modal function and landscape modal presentation
  assert.match(appJs, /function openEngagementSetupModal\(\)\s*\{/);
  assert.match(appJs, /showModal\(\s*'Engagement Setup',[\s\S]*?'landscape-modal'\s*\)/);
  assert.match(appJs, /'complete-engagement-setup'/);

  // Verify banner placement below project-heading
  assert.match(appJs, /<section class="page-heading project-heading">[\s\S]*?<\/section>\s*\$\{setupBanner\}/);

  // Verify CSS styles for banner
  assert.match(stylesCss, /\.engagement-setup-banner\s*\{/);
  assert.match(stylesCss, /\.setup-banner-icon\s*\{/);
  assert.match(stylesCss, /\.setup-banner-btn\s*\{/);
});

test('engagement setup view and modal feature 3 tabs, cleaned up header, and full parameter & team governance', async () => {
  const appJs = await readFile(resolve('public/app.js'), 'utf8');
  const stylesCss = await readFile(resolve('public/styles.css'), 'utf8');

  // Verify the 3 tabs exist in renderEngagementSetup
  assert.match(appJs, /data-tab="general"[\s\S]*?Project General/);
  assert.match(appJs, /data-tab="parameters"[\s\S]*?Engagement Parameters/);
  assert.match(appJs, /data-tab="team"[\s\S]*?Team Setup/);

  // Verify the out-of-place Add Teammate button was removed from the top header
  const setupTabMatch = appJs.match(/activeTab === 'setup'\) \{([\s\S]*?)\} else \{/);
  assert.ok(setupTabMatch);
  assert.equal(setupTabMatch[1].includes('Add teammate'), false, 'Top header should not contain out-of-place Add Teammate button');

  // Verify Project General fields
  assert.match(appJs, /Project Name[\s\S]*?name="name"/);
  assert.match(appJs, /Client Name[\s\S]*?name="client"/);
  assert.match(appJs, /Project Type[\s\S]*?name="projectType"[\s\S]*?Live[\s\S]*?Test/);
  assert.match(appJs, /Created Date &amp; Time[\s\S]*?readonly-input/);
  assert.match(appJs, /Created By[\s\S]*?readonly-input/);

  // Verify Engagement Parameters fields
  assert.match(appJs, /Pulled from Project General/);
  assert.match(appJs, /Client ID[\s\S]*?name="clientId"[\s\S]*?Optional for now/);
  assert.match(appJs, /Engagement ID[\s\S]*?name="engagementId"[\s\S]*?Optional internal/);
  assert.match(appJs, /Year End Date[\s\S]*?name="fy"/);
  assert.match(appJs, /Estimated Completion Date[\s\S]*?name="estimatedCompletion"/);
  assert.match(appJs, /Accounting Advisory/);
  assert.match(appJs, /IPO Advisory/);
  assert.match(appJs, /Loan Staffing/);
  assert.match(appJs, /Training/);

  // Verify Sub-types mapping for all 4 engagement types
  assert.match(appJs, /'Accounting Advisory':\s*\['Technical Memo',\s*'Other General Advisory'\]/);
  assert.match(appJs, /'IPO Advisory':\s*\['Readiness',\s*'PMO'\]/);
  assert.match(appJs, /'Loan Staffing':\s*\['General'\]/);
  assert.match(appJs, /'Training':\s*\['General'\]/);

  // Verify Accounting Framework options: Ind AS, IFRS, IGAAP, USGAAP, Others
  assert.match(appJs, /setupFrameworks\s*=\s*\['Ind AS',\s*'IFRS',\s*'IGAAP',\s*'USGAAP',\s*'Others'\]/);

  // Verify Team Setup tab contains: Name, Email ID, Designation, Role, and Add teammate button
  assert.match(appJs, /<th>Name<\/th>\s*<th>Email ID<\/th>\s*<th>Designation<\/th>\s*<th>Role<\/th>/);
  assert.match(appJs, /Engagement Manager/);
  assert.match(appJs, /Add teammate[\s\S]*?add-member/);

  // Verify CSS styles
  assert.match(stylesCss, /\.setup-tabs\s*\{/);
  assert.match(stylesCss, /\.setup-tab-btn\s*\{/);
  assert.match(stylesCss, /\.team-table\s*\{/);
  assert.match(stylesCss, /\.member-role-select\s*\{/);
  assert.match(stylesCss, /\.readonly-input\s*\{/);
});

test('backend API supports engagement parameters, project general updates, and team roles', async () => {
  const usr = client();
  await usr.request('/auth/signup', 'POST', { name: 'Lead Partner', email: 'partner@example.test', password: 'secure password partner' });
  await usr.request('/me/preferences', 'PATCH', { name: 'Lead Partner', employeeId: 'LP-001', designation: 'Director', acceptUsagePolicy: true });

  const invitee = client();
  await invitee.request('/auth/signup', 'POST', { name: 'Engagement Senior', email: 'senior@example.test', password: 'secure password senior' });
  await invitee.request('/me/preferences', 'PATCH', { name: 'Engagement Senior', employeeId: 'ES-002', designation: 'Senior Associate', acceptUsagePolicy: true });

  // 1. Create project
  const createRes = await usr.request('/projects', 'POST', {
    name: 'Apollo FinTech Advisory',
    client: 'Apollo Global',
    fy: '2027-03-31',
    type: 'Accounting Advisory',
    gaap: 'Ind AS',
    projectType: 'Live',
    clientId: 'CLI-APOLLO',
    engagementId: 'ENG-2026-009',
    estimatedCompletion: '2027-05-15',
    subType: 'Technical Memo'
  });
  assert.equal(createRes.status, 201);
  const projId = createRes.body.project.id;

  // 2. Fetch project: verify owner_name, owner role is 'Engagement Manager'
  const getRes = await usr.request(`/projects/${projId}`);
  assert.equal(getRes.status, 200);
  assert.equal(getRes.body.project.owner_name, 'Lead Partner');
  assert.equal(getRes.body.project.project_type, 'Live');
  assert.equal(getRes.body.project.client_id, 'CLI-APOLLO');
  assert.equal(getRes.body.project.engagement_id, 'ENG-2026-009');
  assert.equal(getRes.body.members[0].role, 'Engagement Manager');
  assert.equal(getRes.body.members[0].designation, 'Director');

  // 3. Add team member with role 'Reviewer'
  const addMemberRes = await usr.request(`/projects/${projId}/members`, 'POST', {
    email: 'senior@example.test',
    role: 'Reviewer'
  });
  assert.equal(addMemberRes.status, 201);

  // 4. Verify member list has 2 members with proper roles and designations
  const getWithTeam = await usr.request(`/projects/${projId}`);
  assert.equal(getWithTeam.body.members.length, 2);
  const seniorMember = getWithTeam.body.members.find(m => m.email === 'senior@example.test');
  assert.ok(seniorMember);
  assert.equal(seniorMember.role, 'Reviewer');
  assert.equal(seniorMember.designation, 'Senior Associate');

  // 5. Update team member role to 'Team Member'
  const updateRoleRes = await usr.request(`/projects/${projId}/members/${seniorMember.id}`, 'PATCH', {
    role: 'Team Member'
  });
  assert.equal(updateRoleRes.status, 200);

  // 6. Update project general and engagement parameters via PATCH /projects/:id
  const updateProjectRes = await usr.request(`/projects/${projId}`, 'PATCH', {
    name: 'Apollo FinTech Global Advisory',
    client: 'Apollo Global Inc',
    projectType: 'Test',
    clientId: 'CLI-APOLLO-999',
    engagementId: 'ENG-2026-999',
    fy: '2028-03-31',
    estimatedCompletion: '2028-06-30',
    type: 'IPO Advisory',
    subType: 'Readiness',
    gaap: 'USGAAP'
  });
  assert.equal(updateProjectRes.status, 200);

  // 7. Verify updated project details
  const getUpdated = await usr.request(`/projects/${projId}`);
  assert.equal(getUpdated.body.project.name, 'Apollo FinTech Global Advisory');
  assert.equal(getUpdated.body.project.client, 'Apollo Global Inc');
  assert.equal(getUpdated.body.project.project_type, 'Test');
  assert.equal(getUpdated.body.project.client_id, 'CLI-APOLLO-999');
  assert.equal(getUpdated.body.project.engagement_id, 'ENG-2026-999');
  assert.equal(getUpdated.body.project.fy, '2028-03-31');
  assert.equal(getUpdated.body.project.estimated_completion, '2028-06-30');
  assert.equal(getUpdated.body.project.type, 'IPO Advisory');
  assert.equal(getUpdated.body.project.sub_type, 'Readiness');
  assert.equal(getUpdated.body.project.gaap, 'USGAAP');

  const seniorUpdated = getUpdated.body.members.find(m => m.email === 'senior@example.test');
  assert.equal(seniorUpdated.role, 'Team Member');
});

test('project dashboard features uncluttered 3-section layout and toolkit pop-up modal', async () => {
  const appJs = await readFile(resolve('public/app.js'), 'utf8');
  const stylesCss = await readFile(resolve('public/styles.css'), 'utf8');

  // Verify dashboard contains 3 standalone section headings
  assert.match(appJs, /<h2 id="workstreams-heading">Engagement Workstreams<\/h2>/);
  assert.match(appJs, /<h2 id="documents-heading">Engagement Documents<\/h2>/);
  assert.match(appJs, /<h2 id="brief-heading">Project Brief<\/h2>/);

  // Verify buttons on the same line as headings
  assert.match(appJs, /Engagement Workstreams[\s\S]*?'open-workstream-modal'[\s\S]*?New/);
  assert.match(appJs, /Engagement Documents[\s\S]*?'upload-resource'[\s\S]*?Upload/);

  // Verify empty banner texts
  assert.match(appJs, /No workstreams created\. Select <strong>New<\/strong> to start/);
  assert.match(appJs, /No documents added/);

  // Verify Project Brief has standalone heading and is not embedded inside the card
  const overviewMatch = appJs.match(/activeTab === 'overview'\) \{([\s\S]*?)\} else if \(activeTab === 'resources'/);
  assert.ok(overviewMatch);
  assert.equal(overviewMatch[1].includes('<div class="panel-heading">\n            <h2>Project Parameters & Brief'), false, 'Heading should not be embedded inside panel');
  assert.match(overviewMatch[1], /class="panel project-brief-panel"/);

  // Verify openWorkstreamModal function renders 3 toolkits in a pop-up dialog
  assert.match(appJs, /function openWorkstreamModal\(\)\s*\{/);
  assert.match(appJs, /'Engagement Toolkits'/);
  assert.match(appJs, /'toolkit-dialog'/);
  assert.match(appJs, /Memo Builder[\s\S]*?data-action="new-memo"/);
  assert.match(appJs, /Slide Decks[\s\S]*?data-action="new-deck"/);
  assert.match(appJs, /FS Helper[\s\S]*?Planned for Phase 2/);

  // Verify table headers with Created By and Created Time
  assert.match(appJs, /WORKSTREAM[\s\S]*?TYPE[\s\S]*?STATUS[\s\S]*?CREATED BY[\s\S]*?CREATED TIME/);
  assert.match(appJs, /DOCUMENT[\s\S]*?SIZE[\s\S]*?ADDED BY[\s\S]*?CREATED TIME/);
  assert.match(appJs, /class="section-heading standalone-section-heading with-action"/);

  // Verify CSS styles
  assert.match(stylesCss, /\.dashboard-sections\s*\{/);
  assert.match(stylesCss, /\.section-heading\.with-action\s*\{/);
  assert.match(stylesCss, /\.standalone-section-heading\s*\{/);
  assert.match(stylesCss, /\.empty-list-banner\s*\{/);
  assert.match(stylesCss, /\.workstream-list\s*\{/);
  assert.match(stylesCss, /\.workstream-row\s*\{/);
  assert.match(stylesCss, /\.workstream-col-author/);
  assert.match(stylesCss, /\.workstream-col-time/);
  assert.match(stylesCss, /\.document-col-time/);
  assert.match(stylesCss, /\.project-brief-panel\s*\{/);
  assert.match(stylesCss, /dialog\.modal\.toolkit-dialog\s*\{/);
  assert.match(stylesCss, /\.toolkit-modal-grid\s*\{/);
  assert.match(stylesCss, /\.toolkit-modal-card\s*\{/);
});

test('workstream draft file only gets added to engagement documents and inherits metadata; moved to final only on explicit action', async () => {
  const usr = client();
  const signInRes = await usr.request('/auth/login', 'POST', { email: 'owner@example.test', password: 'correct horse battery staple' });
  assert.equal(signInRes.status, 200);

  // Create engagement
  const projectRes = await usr.request('/projects', 'POST', {
    name: 'Technical Memo Project',
    client: 'Acme Corp',
    fy: '2027-03-31',
    type: 'Technical memo',
    gaap: 'US GAAP'
  });
  assert.equal(projectRes.status, 201);
  const projectId = projectRes.body.project.id;

  // Create memo workstream
  const memoRes = await usr.request(`/projects/${projectId}/deliverables`, 'POST', {
    kind: 'memo',
    title: 'ASC 606 Revenue Allocation Analysis',
    resourceIds: [],
    params: {
      problem: 'Analyze multi-element transaction price allocation under ASC 606.',
      gaap: 'US GAAP',
      standards: ['ASC 606 Revenue from Contracts with Customers']
    }
  });
  assert.equal(memoRes.status, 201);
  const deliverableId = memoRes.body.id;

  // Retrieve project: verify workstream is not final, but draft file is in resources
  const projectData = await usr.request(`/projects/${projectId}`);
  assert.equal(projectData.status, 200);
  const deliv = projectData.body.deliverables.find(d => d.id === deliverableId);
  assert.ok(deliv);
  assert.equal(deliv.is_final, 0, 'Draft workstream must not be final');
  assert.equal(deliv.status, 'Draft');

  // Verify draft file is added to resources with matching author and creation time
  const draftDoc = projectData.body.resources.find(r => r.workstream_id === deliverableId && r.kind === 'draft');
  assert.ok(draftDoc, 'Draft .md file must be present in engagement documents');
  assert.equal(draftDoc.name, 'ASC 606 Revenue Allocation Analysis.md');
  assert.equal(draftDoc.created_by, deliv.created_by);
  assert.equal(draftDoc.created, deliv.created);

  // Save export (.docx) to engagement documents
  const saveExportRes = await usr.request(`/projects/${projectId}/deliverables/${deliverableId}/save-to-documents`, 'POST', {
    format: 'docx'
  });
  assert.equal(saveExportRes.status, 201);
  assert.ok(saveExportRes.body.name.endsWith('.docx'));

  // The Word document is added to Engagement Documents, not to Final Deliverables
  const afterExportData = await usr.request(`/projects/${projectId}`);
  const exportDoc = afterExportData.body.resources.find(r => r.kind === 'export' && r.workstream_id === deliverableId);
  assert.ok(exportDoc, 'Export file must be added to engagement documents');
  assert.equal(exportDoc.id, saveExportRes.body.id);
  assert.equal(exportDoc.created_by, deliv.created_by);
  assert.equal(exportDoc.is_final, 0);
  assert.equal((await usr.request(`/projects/${projectId}/deliverables/${deliverableId}/finalize`, 'POST')).status, 404, 'Workstreams are no longer finalised');

  // Selected documents move to Final Deliverables and can be returned
  const finalPath = `/projects/${projectId}/documents/final`;
  assert.equal((await usr.request(finalPath, 'POST', { resourceIds: [], final: true })).status, 400);
  assert.equal((await usr.request(finalPath, 'POST', { resourceIds: ['not-a-document'], final: true })).status, 403);
  assert.equal((await usr.request(finalPath, 'POST', { resourceIds: [exportDoc.id, draftDoc.id], final: true })).status, 200);
  const finalProjectData = (await usr.request(`/projects/${projectId}`)).body;
  assert.deepEqual(finalProjectData.resources.filter(r => r.is_final).map(r => r.id).sort(), [exportDoc.id, draftDoc.id].sort());
  assert.ok((await usr.request('/final-deliverables')).body.documents.some(d => d.id === exportDoc.id && d.project_name === 'Technical Memo Project'));
  assert.ok(finalProjectData.activity.some(a => a.action.startsWith('Moved to Final Deliverables: ')));

  // A draft moved to Final Deliverables is a snapshot; the next save starts a new live draft
  const workstream = (await usr.request(`/projects/${projectId}/deliverables/${deliverableId}`)).body.deliverable;
  assert.equal((await usr.request(`/projects/${projectId}/deliverables/${deliverableId}`, 'PATCH', { title: workstream.title, status: 'Draft', body: workstream.body + '\nLater edit.', updated: workstream.updated })).status, 200);
  const afterEdit = (await usr.request(`/projects/${projectId}`)).body.resources;
  const drafts = afterEdit.filter(r => r.kind === 'draft' && r.workstream_id === deliverableId);
  assert.equal(drafts.length, 2);
  assert.match(Buffer.from((await usr.request(`/projects/${projectId}/resources/${draftDoc.id}`)).body).toString(), /^(?![\s\S]*Later edit)/);
  assert.match(Buffer.from((await usr.request(`/projects/${projectId}/resources/${drafts.find(r => !r.is_final).id}`)).body).toString(), /Later edit\.$/);

  assert.equal((await usr.request(finalPath, 'POST', { resourceIds: [exportDoc.id], final: false })).status, 200);
  assert.equal((await usr.request(`/projects/${projectId}`)).body.resources.find(r => r.id === exportDoc.id).is_final, 0);

  // Verify UI code behavior and bindings
  const appJs = await readFile(resolve('public/app.js'), 'utf8');
  const stylesCss = await readFile(resolve('public/styles.css'), 'utf8');

  // Sidebar counts final documents; the toolkit adds documents and the dashboard moves them
  assert.match(appJs, /finalDeliverablesCount = isProject \? \(projectData\.resources\?\.filter\(r => r\.is_final\)/);
  assert.match(appJs, /projectTabNav\('deliverables',\s*'Final Deliverables',\s*'slides',\s*finalDeliverablesCount\)/);
  assert.match(appJs, /data-action="add-to-documents"[\s\S]*?Add to Engagement Documents/);
  assert.match(appJs, /data-action="move-to-final"/);
  assert.doesNotMatch(appJs, /Drafts & exports stay in Engagement Documents/);
  assert.match(stylesCss, /\.document-select\s*\{/);
  assert.match(stylesCss, /\.draft-status\s*\{/);
});

test('workstream setup saves intake separately from toolkit generation', async t => {
  const owner = client();
  await owner.request('/auth/login', 'POST', { email: 'owner@example.test', password: 'correct horse battery staple' });
  const outsider = client();
  await outsider.request('/auth/demo', 'POST', {});

  for (const kind of ['memo', 'deck']) {
    await t.test(`${kind} setup creates no document; its toolkit generates once and preserves edits`, async () => {
      const projectId = (await owner.request('/projects', 'POST', projectInput(`${kind} workflow setup`))).body.project.id;
      const evidenceId = (await owner.request(`/projects/${projectId}/resources`, 'POST', resourceInput())).body.id;
      const params = kind === 'memo'
        ? { gaap: 'US GAAP', standards: ['ASC 606 · Revenue'], problem: 'Assess the transaction.' }
        : { deckType: 'Proposal', area: 'IPO', ipoTrack: 'Readiness', audience: 'Board', problem: 'Plan IPO readiness.' };
      const created = await owner.request(`/projects/${projectId}/workstreams`, 'POST', { kind, title: `${kind} saved setup`, params, resourceIds: [evidenceId] });
      assert.equal(created.status, 201);
      assert.equal(created.body.resourceId, null);
      const id = created.body.id;
      const workstreamPath = `/projects/${projectId}/deliverables/${id}`;
      const setup = (await owner.request(workstreamPath)).body.deliverable;
      assert.equal(setup.status, 'Setup');
      assert.equal(setup.body, '');
      assert.equal(setup.params.problem, params.problem);
      assert.deepEqual(setup.params.resourceIds, [evidenceId]);
      const projectBefore = (await owner.request(`/projects/${projectId}`)).body;
      assert.equal(projectBefore.deliverables.length, 1);
      assert.equal(projectBefore.resources.length, 1, 'Setup must not generate a draft document');
      assert.equal((await owner.request(workstreamPath + '/export/md')).status, 409);
      assert.equal((await owner.request(workstreamPath + '/save-to-documents', 'POST', {})).status, 409);
      assert.equal((await outsider.request(workstreamPath + '/generate', 'POST', { updated: setup.updated })).status, 404);
      assert.equal((await owner.request(workstreamPath + '/generate', 'POST', { updated: 'stale' })).status, 409);

      const generated = await owner.request(workstreamPath + '/generate', 'POST', { updated: setup.updated });
      assert.equal(generated.status, 200);
      const draft = (await owner.request(workstreamPath)).body.deliverable;
      assert.equal(draft.status, 'Draft');
      assert.notEqual(draft.updated, setup.updated);
      assert.match(draft.body, kind === 'memo' ? /## Authoritative guidance[\s\S]*ASC 606/ : /IPO/);
      // Memos keep their engagement documents in Memo Base; decks still list them in the outline.
      if (kind === 'memo') assert.deepEqual(draft.params.resourceIds, [evidenceId]);
      else assert.match(draft.body, /Secret brief.md/);
      const projectAfter = (await owner.request(`/projects/${projectId}`)).body;
      const document = projectAfter.resources.find(r => r.workstream_id === id);
      assert.equal(projectAfter.deliverables.length, 1, 'Generation must reuse the configured workstream');
      assert.equal(projectAfter.resources.length, 2);
      assert.equal(document.kind, 'draft');
      assert.equal(document.created_by, setup.created_by);
      assert.equal(document.created, setup.created);

      const editedBody = draft.body + '\n\nTeam analysis to retain.';
      assert.equal((await owner.request(workstreamPath, 'PATCH', { title: draft.title, body: editedBody, status: 'In review', updated: draft.updated })).status, 200);
      const edited = (await owner.request(workstreamPath)).body.deliverable;
      assert.equal((await owner.request(workstreamPath + '/generate', 'POST', { updated: edited.updated })).status, 409);
      assert.equal((await owner.request(workstreamPath)).body.deliverable.body, editedBody);
      assert.equal((await owner.request(workstreamPath + `/export/${kind === 'memo' ? 'docx' : 'pptx'}`)).status, 200);
      assert.equal((await owner.request(workstreamPath + '/save-to-documents', 'POST', {})).status, 201);
    });
  }

  await t.test('setup and generation keep selected evidence inside its engagement', async () => {
    const projectA = (await owner.request('/projects', 'POST', projectInput('Setup evidence A'))).body.project.id;
    const projectB = (await owner.request('/projects', 'POST', projectInput('Setup evidence B'))).body.project.id;
    const evidenceId = (await owner.request(`/projects/${projectA}/resources`, 'POST', resourceInput())).body.id;
    assert.equal((await owner.request(`/projects/${projectB}/workstreams`, 'POST', memoInput([evidenceId]))).status, 403);
    const id = (await owner.request(`/projects/${projectA}/workstreams`, 'POST', memoInput([evidenceId]))).body.id;
    const path = `/projects/${projectA}/deliverables/${id}`;
    const setup = (await owner.request(path)).body.deliverable;
    await owner.request(`/projects/${projectA}/resources/${evidenceId}`, 'DELETE');
    assert.equal((await owner.request(path + '/generate', 'POST', { updated: setup.updated })).status, 409);
    assert.equal((await owner.request(path)).body.deliverable.body, '');
    assert.equal((await owner.request(`/projects/${projectA}`)).body.resources.length, 0);
  });
});

test('workstream deletion enforces ownership and preserves evidence and saved exports', async t => {
  const owner = client();
  await owner.request('/auth/login', 'POST', { email: 'owner@example.test', password: 'correct horse battery staple' });
  const creator = client();
  const teammate = client();
  for (const [session, email, name] of [[creator, 'workflow-creator@example.test', 'Workstream Creator'], [teammate, 'workflow-teammate@example.test', 'Workstream Teammate']]) {
    assert.equal((await session.request('/auth/signup', 'POST', { email, name, password: 'workflow test password only' })).status, 200);
    assert.equal((await session.request('/me/preferences', 'PATCH', { name, employeeId: email, designation: 'Manager', acceptUsagePolicy: true })).status, 200);
  }
  const projectId = (await owner.request('/projects', 'POST', projectInput('Workstream deletion'))).body.project.id;
  const otherProjectId = (await owner.request('/projects', 'POST', projectInput('Other deletion project'))).body.project.id;
  for (const email of ['workflow-creator@example.test', 'workflow-teammate@example.test']) {
    assert.equal((await owner.request(`/projects/${projectId}/members`, 'POST', { email })).status, 201);
  }
  const evidenceId = (await owner.request(`/projects/${projectId}/resources`, 'POST', resourceInput())).body.id;
  const created = (await creator.request(`/projects/${projectId}/deliverables`, 'POST', memoInput([evidenceId]))).body;
  const path = `/projects/${projectId}/deliverables/${created.id}`;
  const exportId = (await creator.request(path + '/save-to-documents', 'POST', { format: 'docx' })).body.id;
  const exportBefore = (await owner.request(`/projects/${projectId}/resources/${exportId}`)).body;
  const unrelatedId = (await owner.request(`/projects/${projectId}/workstreams`, 'POST', memoInput([]))).body.id;

  await t.test('only the creator or engagement owner can delete, with session and CSRF protection', async () => {
    assert.equal((await client().request(path, 'DELETE')).status, 401);
    const outsider = client();
    await outsider.request('/auth/demo', 'POST', {});
    assert.equal((await outsider.request(path, 'DELETE')).status, 404);
    assert.equal((await teammate.request(path, 'DELETE')).status, 403);
    assert.equal((await owner.request(`/projects/${otherProjectId}/deliverables/${created.id}`, 'DELETE')).status, 404);
    assert.equal((await owner.request(path, 'DELETE', undefined, { 'X-CSRF-Token': '' })).status, 403);
    assert.equal((await owner.request(path + '/export/md', 'DELETE')).status, 404);
    assert.equal((await owner.request(path)).status, 200);
  });

  await t.test('creator deletion removes its draft, detaches exports, and records the action', async () => {
    assert.equal((await creator.request(path, 'DELETE')).status, 200);
    assert.equal((await owner.request(path)).status, 404);
    assert.equal((await owner.request(path + '/export/docx')).status, 404);
    assert.equal((await owner.request(`/projects/${projectId}/resources/${created.resourceId}`)).status, 404);
    assert.equal((await owner.request(path, 'DELETE')).status, 404);
    const project = (await owner.request(`/projects/${projectId}`)).body;
    assert.deepEqual(project.deliverables.map(d => d.id), [unrelatedId]);
    assert.equal(project.resources.length, 2);
    assert.ok(project.resources.some(r => r.id === evidenceId));
    assert.equal(project.resources.find(r => r.id === exportId).workstream_id, null);
    assert.deepEqual((await owner.request(`/projects/${projectId}/resources/${exportId}`)).body, exportBefore);
    assert.ok(project.activity.some(a => a.action === 'Deleted workstream: Revenue <review> & memo'));
  });

  await t.test('the owner can delete another creator’s workstream; final documents and setup deletion leave documents intact', async () => {
    const final = (await creator.request(`/projects/${projectId}/deliverables`, 'POST', memoInput([]))).body;
    const finalPath = `/projects/${projectId}/deliverables/${final.id}`;
    const finalDraft = (await owner.request(`/projects/${projectId}`)).body.resources.find(r => r.workstream_id === final.id && r.kind === 'draft');
    assert.equal((await creator.request(`/projects/${projectId}/documents/final`, 'POST', { resourceIds: [finalDraft.id], final: true })).status, 200);
    assert.equal((await owner.request(finalPath, 'DELETE')).status, 200);
    assert.equal((await owner.request(`/projects/${projectId}/resources/${finalDraft.id}`)).status, 200, 'A draft in Final Deliverables outlives its workstream');
    assert.equal((await owner.request(`/projects/${projectId}/documents/final`, 'POST', { resourceIds: [finalDraft.id], final: false })).status, 200);
    assert.equal((await owner.request(`/projects/${projectId}/resources/${finalDraft.id}`, 'DELETE')).status, 200);
    const setup = (await creator.request(`/projects/${projectId}/workstreams`, 'POST', memoInput([]))).body;
    assert.equal((await creator.request(`/projects/${projectId}/deliverables/${setup.id}`, 'DELETE')).status, 200);
    const project = (await owner.request(`/projects/${projectId}`)).body;
    assert.deepEqual(project.deliverables.map(d => d.id), [unrelatedId]);
    assert.equal(project.resources.length, 2);
  });
});

test('older databases upgrade before workstream indexes are created and preserve existing documents', async () => {
  const legacyDir = await mkdtemp(resolve('test-results', 'legacy-'));
  let legacyApp;
  try {
    const oldDb = new DatabaseSync(resolve(legacyDir, 'advisory.sqlite'));
    try {
      oldDb.exec(`
        CREATE TABLE resources (id TEXT PRIMARY KEY, project_id TEXT, name TEXT NOT NULL, kind TEXT NOT NULL, size INTEGER NOT NULL, content BLOB NOT NULL, text TEXT NOT NULL DEFAULT '', created_by TEXT, created TEXT NOT NULL);
        CREATE TABLE deliverables (id TEXT PRIMARY KEY, project_id TEXT, kind TEXT NOT NULL, title TEXT NOT NULL, params TEXT NOT NULL, body TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'Draft', created_by TEXT, created TEXT NOT NULL, updated TEXT NOT NULL);
      `);
      const bytes = Buffer.from('Existing engagement evidence');
      const timestamp = '2026-10-01T00:00:00.000Z';
      oldDb.prepare('INSERT INTO resources VALUES (?,?,?,?,?,?,?,?,?)').run('legacy-document', null, 'Existing evidence.md', 'reference', bytes.length, bytes, bytes.toString(), null, timestamp);
      oldDb.prepare('INSERT INTO deliverables VALUES (?,?,?,?,?,?,?,?,?,?)').run('legacy-memo', null, 'memo', 'Existing memo', '{}', '# Existing memo', 'Draft', null, timestamp, timestamp);
    } finally {
      oldDb.close();
    }
    legacyApp = await createApp({ dataDir: legacyDir });
    const document = legacyApp.db.prepare('SELECT * FROM resources WHERE id=?').get('legacy-document');
    assert.equal(Buffer.from(document.content).toString(), 'Existing engagement evidence');
    assert.equal(document.name, 'Existing evidence.md');
    assert.equal(document.workstream_id, null);
    const memo = legacyApp.db.prepare('SELECT * FROM deliverables WHERE id=?').get('legacy-memo');
    assert.equal(memo.body, '# Existing memo');
    assert.equal(memo.is_final, 0);
    assert.ok(legacyApp.db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name='resources_workstream'").get());
    await legacyApp.close();
    legacyApp = await createApp({ dataDir: legacyDir });
    assert.equal(legacyApp.db.prepare('SELECT COUNT(*) AS count FROM resources').get().count, 1, 'Migration should be safe to run again');
  } finally {
    if (legacyApp) await legacyApp.close();
    await rm(legacyDir, { recursive: true, force: true });
  }
});





test('workstreams finalised before Final Deliverables held documents become final documents once', async () => {
  const dir = await mkdtemp(resolve('test-results', 'final-migration-'));
  let migrated;
  try {
    const first = await createApp({ dataDir: dir });
    const timestamp = '2026-10-01T00:00:00.000Z';
    first.db.prepare('INSERT INTO projects (id, name, client, fy, type, gaap, created, updated) VALUES (?,?,?,?,?,?,?,?)').run('legacy-project', 'Legacy', 'Alias', '2027-03-31', 'Technical memo', 'IFRS', timestamp, timestamp);
    const insert = first.db.prepare('INSERT INTO deliverables (id, project_id, kind, title, params, body, status, created, updated, is_final) VALUES (?,?,?,?,?,?,?,?,?,?)');
    insert.run('final-memo', 'legacy-project', 'memo', 'Final memo', '{"gaap":"IFRS"}', '# Final memo\n\n## Conclusion\n\nAgreed.', 'Final', timestamp, timestamp, 1);
    insert.run('final-setup', 'legacy-project', 'deck', 'Empty setup', '{}', '', 'Final', timestamp, timestamp, 1);
    insert.run('open-memo', 'legacy-project', 'memo', 'Open memo', '{"gaap":"IFRS"}', '# Open memo', 'Draft', timestamp, timestamp, 0);
    // Recreate the earlier schema, where documents had no final flag.
    first.db.exec('ALTER TABLE resources DROP COLUMN is_final');
    await first.close();

    migrated = await createApp({ dataDir: dir });
    const finals = migrated.db.prepare('SELECT * FROM resources WHERE is_final=1').all();
    assert.deepEqual(finals.map(r => [r.name, r.kind, r.workstream_id, r.created]), [['Final memo.docx', 'export', 'final-memo', timestamp]]);
    assert.match(unzipStored(Buffer.from(finals[0].content)).get('word/document.xml'), /Agreed\./);
    assert.equal(migrated.db.prepare('SELECT COUNT(*) AS count FROM deliverables WHERE is_final=1').get().count, 0);
    await migrated.close();
    migrated = await createApp({ dataDir: dir });
    assert.equal(migrated.db.prepare('SELECT COUNT(*) AS count FROM resources').get().count, 1, 'Migration runs once');
  } finally {
    if (migrated) await migrated.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('invite-only signup and proxy-aware sign-in limits for public exposure', async () => {
  const dir = await mkdtemp(resolve('test-results', 'public-'));
  const publicApp = await createApp({ dataDir: dir, requireInvite: true, trustProxy: true });
  try {
    await new Promise(done => publicApp.server.listen(0, '127.0.0.1', done));
    const base = `http://127.0.0.1:${publicApp.server.address().port}/api`;
    const post = (path, value, extra = {}) => fetch(`${base}${path}`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...extra }, body: JSON.stringify(value) });
    assert.equal((await (await fetch(`${base}/auth/status`)).json()).requireInvite, true);
    assert.equal((await post('/auth/signup', { name: 'Owner', email: 'owner@example.test', password: 'correct horse battery staple' })).status, 200, 'First account needs no invite');
    assert.equal((await post('/auth/signup', { name: 'Walk-in', email: 'walkin@example.test', password: 'walk-in password long enough' })).status, 403);
    const login = forwardedFor => post('/auth/login', { email: 'owner@example.test', password: 'wrong password entirely' }, { 'X-Forwarded-For': forwardedFor });
    for (let i = 0; i < 30; i++) await login('203.0.113.7');
    assert.equal((await login('203.0.113.7')).status, 429);
    assert.equal((await login('198.51.100.9')).status, 401, 'Another visitor behind the same proxy is not locked out');
  } finally {
    await publicApp.close();
    await rm(dir, { recursive: true, force: true });
  }
});

test('memo builder stores ordered sections, composes the Markdown body, and exports a structured memo', async () => {
  const owner = client();
  await owner.request('/auth/login', 'POST', { email: 'owner@example.test', password: 'correct horse battery staple' });
  const projectId = (await owner.request('/projects', 'POST', projectInput('Memo sections'))).body.project.id;
  const evidenceId = (await owner.request(`/projects/${projectId}/resources`, 'POST', resourceInput())).body.id;
  const id = (await owner.request(`/projects/${projectId}/workstreams`, 'POST', memoInput([evidenceId]))).body.id;
  const path = `/projects/${projectId}/deliverables/${id}`;
  assert.equal((await owner.request(path)).body.deliverable.memo, null, 'Setup has no sections yet');
  await owner.request(path + '/generate', 'POST', { updated: (await owner.request(path)).body.deliverable.updated });

  const draft = (await owner.request(path)).body.deliverable;
  const headings = draft.memo.sections.map(s => s.heading);
  assert.deepEqual(headings.slice(0, 3), ['Executive summary', 'Purpose and scope', 'Background and key facts']);
  assert.ok(draft.memo.sections.every(s => s.status === 'Not started' && /^[\w-]+$/.test(s.id)));
  assert.equal(draft.memo.sections.find(s => s.heading === 'Purpose and scope').body, 'Document the question using this project only.');
  assert.ok(!headings.some(h => /evidence|checklist/i.test(h)), 'Evidence and the checklist live outside the Builder');
  assert.equal(draft.memo.signoff.preparer, 'Workspace Owner');
  assert.deepEqual(draft.memo.completion, { facts: false, guidance: false, judgments: false, approval: false });

  const [first, second, ...rest] = draft.memo.sections;
  const memo = {
    header: { to: 'Audit Committee', from: 'Technical team', cc: '', date: '2027-04-15' },
    preface: 'Prepared for the audit committee meeting.',
    signoff: { preparer: 'Workspace Owner', reviewer: 'Engagement Partner', approver: '' },
    sections: [{ ...second, body: 'Scope <confirmed> & agreed.', status: 'Ready for review' }, { ...first, status: 'Drafting', body: '### Issue 1\n- Point & detail' }, ...rest],
    completion: { facts: false, guidance: false, judgments: false, approval: false }
  };
  // The completion checklist stays closed until every section is ready for review.
  const early = { ...memo, completion: { ...memo.completion, facts: true } };
  assert.equal((await owner.request(path, 'PATCH', { title: draft.title, status: 'Draft', memo: early, updated: draft.updated })).status, 409);
  // Memo Base: standards and engagement documents are validated and kept on the workstream.
  const otherProject = (await owner.request('/projects', 'POST', projectInput('Memo base other'))).body.project.id;
  const outsideId = (await owner.request(`/projects/${otherProject}/resources`, 'POST', resourceInput())).body.id;
  const base = { gaap: 'IFRS', standards: ['IFRS 15 · Revenue from Contracts with Customers', 'IFRIC 23'], resourceIds: [evidenceId] };
  assert.equal((await owner.request(path, 'PATCH', { title: draft.title, status: 'Draft', memo, base: { ...base, resourceIds: [outsideId] }, updated: draft.updated })).status, 403);
  assert.equal((await owner.request(path, 'PATCH', { title: draft.title, status: 'Draft', memo, base: { ...base, gaap: 'K-GAAP' }, updated: draft.updated })).status, 400);
  const invalid = structuredClone(memo); invalid.sections[0].status = 'Done';
  assert.equal((await owner.request(path, 'PATCH', { title: draft.title, status: 'Draft', memo: invalid, updated: draft.updated })).status, 400);
  const duplicate = structuredClone(memo); duplicate.sections[1].id = duplicate.sections[0].id;
  assert.equal((await owner.request(path, 'PATCH', { title: draft.title, status: 'Draft', memo: duplicate, updated: draft.updated })).status, 400);
  assert.equal((await owner.request(path, 'PATCH', { title: draft.title, status: 'Draft', memo: { ...memo, sections: [] }, updated: draft.updated })).status, 400);
  assert.equal((await owner.request(path, 'PATCH', { title: draft.title, status: 'In review', memo, base, updated: draft.updated })).status, 200);

  const saved = (await owner.request(path)).body.deliverable;
  assert.deepEqual(saved.memo.sections.map(s => [s.id, s.status]), memo.sections.map(s => [s.id, s.status]));
  assert.deepEqual(saved.params.standards, base.standards);
  assert.deepEqual(saved.params.resourceIds, [evidenceId]);
  assert.equal(saved.memo.preface, memo.preface);
  assert.match(saved.body, /Framework: IFRS\n\nPrepared for the audit committee meeting\.\n\n## Purpose and scope/);

  const allReady = { ...memo, sections: memo.sections.map(s => ({ ...s, status: 'Ready for review' })), completion: { ...memo.completion, facts: true } };
  assert.equal((await owner.request(path, 'PATCH', { title: saved.title, status: 'In review', memo: allReady, updated: saved.updated })).status, 200);
  const completed = (await owner.request(path)).body.deliverable;
  assert.equal(completed.memo.completion.facts, true);
  // Reopening a section keeps what was already ticked.
  const reopened = { ...completed.memo, sections: completed.memo.sections.map((s, i) => i ? s : { ...s, status: 'Drafting' }) };
  assert.equal((await owner.request(path, 'PATCH', { title: saved.title, status: 'In review', memo: reopened, updated: completed.updated })).status, 200);
  const afterReopen = (await owner.request(path)).body.deliverable;
  assert.equal(afterReopen.memo.completion.facts, true);
  assert.equal((await owner.request(path, 'PATCH', { title: saved.title, status: 'In review', memo: { ...reopened, completion: { ...reopened.completion, guidance: true } }, updated: afterReopen.updated })).status, 409);
  const restored = { ...memo, sections: memo.sections.map(s => ({ ...s })) };
  assert.equal((await owner.request(path, 'PATCH', { title: saved.title, status: 'In review', memo: restored, updated: afterReopen.updated })).status, 200);
  const latest = (await owner.request(path)).body.deliverable;
  assert.ok(saved.body.indexOf('## Purpose and scope') < saved.body.indexOf('## Executive summary'), 'Body follows the saved section order');
  assert.match(saved.body, /To: Audit Committee/);
  assert.match(saved.body, /- Reviewed by: Engagement Partner/);
  const draftDoc = (await owner.request(`/projects/${projectId}`)).body.resources.find(r => r.workstream_id === id && r.kind === 'draft');
  assert.ok(draftDoc.size > 0);

  const docx = unzipStored((await owner.request(path + '/export/docx')).body).get('word/document.xml');
  assert.match(docx, /TECHNICAL ACCOUNTING MEMORANDUM/);
  assert.match(docx, /Audit Committee/);
  assert.match(docx, /1\. Purpose and scope/);
  assert.match(docx, /Scope &lt;confirmed&gt; &amp; agreed\./);
  assert.match(docx, /Engagement Partner/);
  assert.match(docx, /Review and sign-off/);
  assert.equal((docx.match(/<w:tbl>/g) || []).length, 2, 'Cover block and sign-off are tables');
  const pdfResponse = await owner.request(path + '/export/pdf');
  assert.equal(pdfResponse.status, 200);
  assert.equal(Buffer.from(pdfResponse.body).subarray(0, 5).toString(), '%PDF-');

  // A plain Markdown save stays canonical and the sections are recovered from it.
  const markdownBody = latest.body.replace('Scope <confirmed> & agreed.', 'Scope revised in Markdown.');
  assert.equal((await owner.request(path, 'PATCH', { title: latest.title, status: 'In review', body: markdownBody, updated: latest.updated })).status, 200);
  const recovered = (await owner.request(path)).body.deliverable;
  assert.equal(recovered.body, markdownBody);
  assert.equal(recovered.memo.sections[0].body, 'Scope revised in Markdown.');
  assert.equal(recovered.memo.header.to, 'Audit Committee');
  assert.equal(recovered.memo.preface, 'Prepared for the audit committee meeting.');
  assert.equal(recovered.memo.signoff.reviewer, 'Engagement Partner');
  assert.ok(!recovered.memo.sections.some(s => s.heading === 'Review and sign-off'));
  assert.equal(recovered.memo.sections.find(s => s.heading === 'Analysis').status, 'Not started');
});

test('legacy memos drop generated evidence and checklist sections but keep written content', () => {
  const body = [
    '# Legacy', '', 'To: CFO', '',
    '## Purpose and scope', '', 'Why.', '',
    '## Project evidence', '', '- [1] Contract.pdf', '',
    '## Review checklist', '', '- Facts are complete.', '',
    '## References and evidence', '', 'See the board minutes discussed on 3 March.', '',
    '## Review and sign-off', '', '- Prepared by: Analyst'
  ].join('\n');
  const memo = memoFromBody(body);
  assert.deepEqual(memo.sections.map(s => s.heading), ['Purpose and scope', 'References and evidence']);
  assert.equal(memo.header.to, 'CFO');
  assert.equal(memo.signoff.preparer, 'Analyst');
  assert.deepEqual(Object.values(memo.completion), [false, false, false, false]);
});

test('PDF export is a well-formed multi-page document with WinAnsi text', () => {
  const lines = Array.from({ length: 120 }, (_, i) => `- Point ${i + 1} — détail · “quoted” text that is long enough to need wrapping across the printable width of an A4 page.`);
  const { mime, bytes } = exportDocument({ title: 'Lease memo', body: ['# Lease memo', '', '## Analysis', ...lines, '### Sub-point', 'Closing paragraph 漢字.'].join('\n') }, 'pdf');
  assert.equal(mime, 'application/pdf');
  const text = bytes.toString('latin1');
  assert.ok(text.startsWith('%PDF-1.4\n') && text.endsWith('%%EOF\n'));
  const count = Number(/\/Count (\d+)/.exec(text)[1]);
  assert.ok(count >= 3, 'Long content flows onto further pages');
  assert.match(text, new RegExp(`Page ${count} of ${count}`.split('').map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('')));
  // Every cross-reference offset must point at the start of its object.
  const xrefAt = Number(/startxref\n(\d+)/.exec(text)[1]);
  const entries = text.slice(xrefAt).split('\n').filter(line => / 00000 n $/.test(line));
  entries.forEach((entry, i) => assert.ok(text.startsWith(`${i + 1} 0 obj`, Number(entry.slice(0, 10)))));
  assert.ok(text.includes('<506f696e74203120972064e974'), 'Em dash and accents map to WinAnsi bytes ("Point 1 — dé")');
});
