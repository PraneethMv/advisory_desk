const app = document.querySelector('#app');
const modalRoot = document.querySelector('#modal-root');
const state = {
  user: null,
  csrf: '',
  workspace: {},
  standards: {},
  projects: [],
  deliverables: [],
  page: 'hub',
  project: null,
  projectTab: 'overview',
  query: '',
  type: 'All types',
  status: 'All statuses',
  gaap: 'All frameworks',
  view: 'table',
  settingsTab: 'workspace',
  authTab: 'login',
  authStatus: {},
  busy: false
};

const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = name => String(name || '').split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const types = ['Technical memo', 'GAAP transition', 'IPO advisory', 'Accounting advisory', 'Staff augmentation', 'Training'];
const frameworks = ['IFRS', 'Ind AS', 'US GAAP', 'Other'];
const date = value => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
const size = bytes => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  folder: '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  slides: '<rect x="3" y="3" width="18" height="14" rx="2"/><path d="M12 17v4m-4 0h8M7 8h10M7 12h6"/>',
  chart: '<path d="M3 3v18h18M7 16v-5m5 5V7m5 9V4"/>',
  arrow: '<path d="M5 12h14m-5-5 5 5-5 5"/>',
  arrowRight: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 5 7 7-7 7"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  search: '<circle cx="10.5" cy="10.5" r="7.5"/><path d="m16 16 5 5"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12M3 6h.01M3 12h.01M3 18h.01"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6l8-3Z"/><path d="m8 12 3 3 5-6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V6a4 4 0 0 1 8 0v4m-4 5v2"/>',
  settings: '<path d="m9 3-.7 2.2-2 .9L4 5.6 2.5 8l1.8 1.7-.2 2.2L2 13l1.2 2.6 2.4-.3 1.6 1.5-.2 2.4L9.7 21l1.4-2 2.1-.1 1.6 1.9 2.5-1.5-.5-2.4 1.3-1.7 2.4-.1.8-2.7-2.2-1.1-.4-2.1 1.6-1.9-1.7-2.2-2.2.8-1.9-.8L15.5 3Z"/><circle cx="12" cy="12" r="3"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6m2 4a5 5 0 0 1 3 4v2"/>',
  upload: '<path d="M12 16V3m-5 5 5-5 5 5M3 16v4a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-4"/>',
  download: '<path d="M12 3v13m-5-5 5 5 5-5M3 16v4a1 1 0 0 0 1 1h16a1 1 0 0 0 1-1v-4"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  logout: '<path d="M9 4H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h4m6-12 4 4-4 4m-7-4h11"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  book: '<path d="M2 4h6a4 4 0 0 1 4 4v12a3 3 0 0 0-3-3H2z"/><path d="M22 4h-6a4 4 0 0 0-4 4v12a3 3 0 0 1 3-3h7z"/>',
  briefcase: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 7V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v2M3 12h18M10 12v2a2 2 0 0 0 4 0v-2"/>',
  hierarchy: '<rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10h.01"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  spark: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 6 9 7 9-7"/>',
  hub: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  sun: '<circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/>',
  moon: '<path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"/>',
  chevronDown: '<path d="m6 9 6 6 6-6"/>'
};

const icon = (name, cls = '') => `<svg class="icon ${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.file}</svg>`;
const button = (text, action, cls = 'btn primary', more = '') => `<button type="button" class="${cls}" data-action="${action}" ${more}>${text}</button>`;
const options = (items, selected) => items.map(v => `<option value="${e(v)}" ${v === selected ? 'selected' : ''}>${e(v)}</option>`).join('');
const badge = status => `<span class="badge ${status === 'Active' || status === 'Approved' ? 'status-active' : status === 'In review' || status === 'On hold' ? 'status-review' : status === 'Completed' ? 'status-neutral' : 'status-draft'}"><span class="badge-dot"></span>${e(status)}</span>`;
const typeIcon = type => type === 'Technical memo' ? 'file' : type === 'Training' ? 'book' : type === 'IPO advisory' ? 'chart' : type === 'GAAP transition' ? 'arrow' : type === 'Staff augmentation' ? 'users' : 'folder';
const typeColor = type => type === 'Technical memo' ? 'tone-blue' : type === 'IPO advisory' ? 'tone-red' : type === 'Training' ? 'tone-blue' : type === 'GAAP transition' ? 'tone-blue' : 'tone-neutral';
const empty = (title, text, action = '') => `<div class="empty-state" style="text-align:center;padding:48px 20px;"><span class="empty-icon" style="display:inline-grid;place-items:center;width:48px;height:48px;border-radius:12px;background:var(--brand-blue-container);color:var(--brand-blue);margin-bottom:14px;">${icon('folder')}</span><h3 style="font-size:18px;margin-bottom:6px;color:var(--text-primary);">${e(title)}</h3><p style="color:var(--text-muted);max-width:440px;margin:0 auto 20px;font-size:13.5px;">${e(text)}</p>${action}</div>`;

function getStoredTheme() {
  return localStorage.getItem('advisory_theme') || (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('advisory_theme', theme);
  state.theme = theme;
  document.querySelectorAll('.theme-toggle-label').forEach(el => {
    el.textContent = theme === 'dark' ? 'Switch to Light mode' : 'Switch to Dark mode';
  });
  document.querySelectorAll('.theme-icon-indicator').forEach(el => {
    el.innerHTML = theme === 'dark' ? icon('sun') : icon('moon');
  });
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || getStoredTheme();
  const next = (current === 'dark') ? 'light' : 'dark';
  applyTheme(next);
  toast(`Switched to ${next === 'dark' ? 'Dark' : 'Light'} mode.`);
}

function userMenuDropdown() {
  if (!state.user) return '';
  const isDark = (state.theme === 'dark');
  return `
    <div class="user-menu-wrap">
      <button type="button" class="user-menu-trigger" data-action="toggle-user-menu" aria-haspopup="true" aria-expanded="false" title="Account & Preferences">
        <span class="avatar small">${e(initials(state.user.name))}</span>
        <span class="user-menu-name">${e(state.user.name)}</span>
        <span class="user-menu-caret">${icon('chevronDown')}</span>
      </button>

      <div class="user-menu-dropdown hidden" id="user-menu-dropdown">
        <div class="user-menu-header">
          <strong class="user-menu-title">${e(state.user.name)}</strong>
          <span class="user-menu-subtitle">${e(state.user.email)}</span>
          <span class="user-menu-role">${state.user.demo ? 'Demo user' : state.user.role === 'super_user' ? 'Super user' : 'Team member'}</span>
        </div>
        <div class="user-menu-divider"></div>
        <button type="button" class="user-menu-item" data-action="toggle-theme">
          <span class="theme-icon-indicator">${isDark ? icon('sun') : icon('moon')}</span>
          <span class="theme-toggle-label">${isDark ? 'Switch to Light mode' : 'Switch to Dark mode'}</span>
        </button>
        <div class="user-menu-divider"></div>
        <button type="button" class="user-menu-item user-menu-danger" data-action="logout">
          ${icon('logout')}
          <span>Sign out</span>
        </button>
      </div>
    </div>
  `;
}

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...(state.csrf ? { 'X-CSRF-Token': state.csrf } : {}),
      ...options.headers
    }
  });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'Request failed.');
    error.status = response.status;
    throw error;
  }
  return data;
}

const send = (path, body, method = 'POST') => api(path, { method, body: JSON.stringify(body) });

let toastTimer;
function toast(message, error = false) {
  const node = document.querySelector('#toast');
  if (!node) return;
  node.textContent = message;
  node.className = `visible ${error ? 'error' : ''}`;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { node.className = ''; }, 4000);
}

function report(error) {
  if (error.status === 401 && state.user) {
    state.user = null;
    state.csrf = '';
    closeModal();
    renderAuth();
  }
  toast(error.message, true);
}

async function refreshWorkspace() {
  if (!state.user) return;
  const [projects, deliverables] = await Promise.all([api('/projects'), api('/deliverables')]);
  state.projects = projects.projects;
  state.deliverables = deliverables.deliverables;
}

function setSession(data) {
  state.user = data.user;
  state.csrf = data.csrf;
  state.workspace = data.workspace;
  state.standards = data.standards;
}

async function boot() {
  applyTheme(getStoredTheme());
  try {
    state.authStatus = await api('/auth/status');
    state.authTab = state.authStatus.needsSetup ? 'signup' : 'login';
    try {
      setSession(await api('/me'));
      await refreshWorkspace();
    } catch (error) {
      if (error.status !== 401) throw error;
      state.user = null;
    }
    await route();
  } catch (error) {
    app.innerHTML = empty('Workspace unavailable', 'Start the local server, then refresh this page.');
    report(error);
  }
}

/* ==========================================================================
   PAGE 1 (UNAUTHENTICATED): SIGN-IN & SIGN-UP
   Open sign-up allowed; project access is managed by Engagement Managers.
   ========================================================================== */

function renderAuth() {
  const signup = state.authTab === 'signup';
  const first = state.authStatus.needsSetup;

  app.innerHTML = `
    <main class="auth-page" style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:var(--bg-canvas);padding:32px 20px;">
      <div class="auth-form-wrap" style="width:100%;max-width:440px;background:#ffffff;border:1px solid var(--outline);border-radius:var(--radius-xl);padding:36px 32px;box-shadow:var(--shadow-md);">
        
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;">
          <a class="brand" href="#auth">
            <span class="brand-mark">a<span>↗</span></span>
            <div>
              <span>advisory desk</span>
              <span class="alpha">ALPHA</span>
            </div>
          </a>
          <span class="net-indicator"><i></i> 127.0.0.1</span>
        </div>

        <h2 style="font-size:22px;font-weight:800;color:var(--text-primary);margin-bottom:6px;letter-spacing:-0.4px;">
          ${signup ? (first ? 'Initialize Workspace Super User.' : 'Create your account.') : 'Welcome back to Advisory Desk.'}
        </h2>
        <p class="muted" style="font-size:13px;color:var(--text-muted);margin-bottom:22px;">
          ${signup ? 'Anyone can create an account for open Knowledge Base access. Engagement Managers grant project access.' : 'Sign in to access your assigned client projects and deliverables.'}
        </p>

        <div class="auth-tabs" style="display:flex;gap:6px;background:var(--bg-surface-variant);padding:4px;border-radius:var(--radius-md);margin-bottom:22px;">
          <button type="button" data-action="auth-tab" data-tab="login" class="${!signup ? 'active' : ''}" style="flex:1;padding:8px;border-radius:var(--radius-sm);font-size:13px;font-weight:600;color:${!signup ? 'var(--brand-blue)' : 'var(--text-muted)'};background:${!signup ? '#ffffff' : 'transparent'};box-shadow:${!signup ? 'var(--shadow-sm)' : 'none'};">Sign in</button>
          <button type="button" data-action="auth-tab" data-tab="signup" class="${signup ? 'active' : ''}" style="flex:1;padding:8px;border-radius:var(--radius-sm);font-size:13px;font-weight:600;color:${signup ? 'var(--brand-blue)' : 'var(--text-muted)'};background:${signup ? '#ffffff' : 'transparent'};box-shadow:${signup ? 'var(--shadow-sm)' : 'none'};">Create account</button>
        </div>

        <form id="auth-form" class="form-stack">
          ${signup ? `
            <label>Full name
              <input name="name" autocomplete="name" placeholder="Your name (e.g. Alex Morgan)" maxlength="100" required autofocus>
            </label>
          ` : ''}
          <label>Work email
            <input type="email" name="email" autocomplete="email" placeholder="you@yourfirm.com" required maxlength="254" ${!signup ? 'autofocus' : ''}>
          </label>
          <label>Password
            <div class="password-field" style="position:relative;display:flex;align-items:center;">
              <input type="password" name="password" autocomplete="${signup ? 'new-password' : 'current-password'}" placeholder="${signup ? 'At least 12 characters' : 'Enter your password'}" ${signup ? 'minlength="12"' : ''} maxlength="128" required style="width:100%;padding-right:42px;">
              <button type="button" class="icon-btn" data-action="toggle-password" aria-label="Show password" style="position:absolute;right:6px;border:none;background:transparent;">${icon('eye')}</button>
            </div>
          </label>
          
          ${signup && !first ? `
            <label>Team invitation code <span class="optional">Optional</span>
              <input name="invite" autocomplete="off" placeholder="Leave blank for standard access">
            </label>
          ` : ''}

          ${signup && first ? `
            <div class="inline-note">
              ${icon('shield')}
              <span>Your account will be established as the workspace Super User.</span>
            </div>
          ` : ''}

          ${signup && !first ? `
            <div class="inline-note">
              ${icon('shield')}
              <span>Open account creation enabled. Project workstreams are assigned by Engagement Managers.</span>
            </div>
          ` : ''}

          <div class="form-error" role="alert"></div>
          <button class="btn primary auth-submit" type="submit" style="width:100%;margin-top:8px;">
            ${signup ? (first ? 'Initialize Workspace' : 'Create Account') : 'Sign In'} ${icon('arrow')}
          </button>
        </form>

        ${state.authStatus.allowDemo ? `
          <div class="auth-divider" style="display:flex;align-items:center;gap:14px;margin:22px 0 16px;font-size:12px;color:var(--text-dim);">
            <div style="flex:1;height:1px;background:var(--outline);"></div>
            <span>or explore instant demo</span>
            <div style="flex:1;height:1px;background:var(--outline);"></div>
          </div>
          ${button('Explore sample workspace ' + icon('arrow'), 'demo', 'btn secondary auth-submit', 'style="width:100%;"')}
          <p class="demo-note" style="font-size:11.5px;color:var(--text-muted);text-align:center;margin-top:8px;">Pre-seeded with 6 accounting advisory engagements.</p>
        ` : ''}

        <footer style="margin-top:24px;padding-top:16px;border-top:1px solid var(--outline);display:flex;justify-content:space-between;font-size:11px;color:var(--text-dim);">
          <span>Local-first · Zero egress</span>
          <span>Advisory Desk v0.1 Alpha</span>
        </footer>
      </div>
    </main>
  `;
}

/* ==========================================================================
   PAGE 2 (AUTHENTICATED): LANDING / GATEWAY (THE HUB)
   Exact match to the 3-button layout in user's reference image
   Buttons:
   1. Advisory Desk
   2. Knowledge Base (with Coming soon badge)
   3. Engagement Manager (with master list of projects & parameters)
   ========================================================================== */

function renderHub() {
  app.innerHTML = `
    <div class="splash-container">
      <header class="splash-topbar">
        <a class="brand" href="#hub">
          <span class="brand-mark">a<span>↗</span></span>
          <div>
            <span>advisory desk</span>
            <span class="alpha">ALPHA</span>
          </div>
        </a>

        <div class="splash-top-right">
          <span class="net-indicator"><i></i> 127.0.0.1 Connected</span>
          ${state.user ? `
            <a href="#desk" class="btn secondary small-btn">
              <span class="avatar tiny">${e(initials(state.user.name))}</span>
              <span>${e(state.user.name)}</span>
            </a>
            ${button(icon('logout'), 'logout', 'icon-btn', 'aria-label="Sign out" title="Sign out"')}
          ` : ''}
        </div>
      </header>

      <section class="splash-hero">
        <h1 class="splash-title">Welcome Back, ${e(state.user?.name || 'Teammate')}<span class="heading-dot">.</span></h1>
        <p class="splash-subtitle">What do you want to do today?</p>
      </section>

      <!-- The 3 Minimal Cards Grid (matches user reference image exactly) -->
      <section class="splash-grid" aria-label="Advisory Desk Launchpad">
        
        <!-- Button 1: Advisory Desk -->
        <article class="portal-card" data-action="nav-desk">
          <div class="portal-top">
            <div class="portal-icon-box">
              ${icon('briefcase')}
            </div>
            <span class="portal-num">01</span>
          </div>
          <div class="portal-bottom">
            <div class="portal-title-block">
              <h2 class="portal-title">Advisory Desk</h2>
            </div>
            <span class="portal-arrow">${icon('arrowRight')}</span>
          </div>
        </article>

        <!-- Button 2: Knowledge Base (with Coming Soon badge) -->
        <article class="portal-card" data-action="nav-knowledge">
          <div class="portal-top">
            <div class="portal-icon-box">
              ${icon('book')}
            </div>
            <span class="portal-num">02</span>
          </div>
          <div class="portal-bottom">
            <div class="portal-title-block">
              <div><span class="coming-soon-badge">Coming soon</span></div>
              <h2 class="portal-title">Knowledge Base</h2>
            </div>
            <span class="portal-arrow">${icon('arrowRight')}</span>
          </div>
        </article>

        <!-- Button 3: Engagement Manager (Project Setup & Parameters) -->
        <article class="portal-card" data-action="nav-setup">
          <div class="portal-top">
            <div class="portal-icon-box">
              ${icon('hierarchy')}
            </div>
            <span class="portal-num">03</span>
          </div>
          <div class="portal-bottom">
            <div class="portal-title-block">
              <h2 class="portal-title">Engagement<br>Manager</h2>
            </div>
            <span class="portal-arrow">${icon('arrowRight')}</span>
          </div>
        </article>

      </section>

      <footer class="splash-footer">
        <span>Advisory Desk · Local-first architecture</span>
        <span>Version 0.1 · Zero external egress</span>
      </footer>
    </div>
  `;
}

/* ==========================================================================
   APP SHELL WRAPPER (SIDEBAR & TOPBAR)
   ========================================================================== */

function shell(content, title = 'Projects', trail = '') {
  const nav = (page, text, symbol, extra = '') => {
    const isActive = (state.page === page) || (page === 'project-setup' && (state.page === 'projects' || state.page === 'project-setup'));
    return `<a href="#${page}" class="nav-link ${isActive ? 'active' : ''}">${icon(symbol)}<span>${text}</span>${extra}</a>`;
  };

  app.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <a class="brand" href="#hub">
          <span class="brand-mark">a<span>↗</span></span>
          <div>
            <span>advisory desk</span>
            <span class="alpha">ALPHA</span>
          </div>
        </a>

        <div class="workspace-switch">
          <span class="workspace-avatar">${e(initials(state.workspace.workspaceName || 'Advisory Team'))}</span>
          <div>
            <strong>${e(state.workspace.workspaceName || 'Advisory Team')}</strong>
            <span>${state.user.demo ? 'Sample workspace' : 'Team workspace'}</span>
          </div>
          ${icon('lock')}
        </div>

        <div class="nav-label">WORKSPACE</div>
        <nav aria-label="Main navigation">
          ${nav('hub', 'Hub (Home)', 'hub')}
          ${nav('desk', 'Advisory Desk', 'briefcase')}
          ${nav('project-setup', 'Engagement Manager', 'hierarchy', `<span class="nav-count">${state.projects.length}</span>`)}
          <a href="#knowledge-base" class="nav-link ${state.page === 'knowledge-base' ? 'active' : ''}">
            ${icon('book')}
            <span>Knowledge Base</span>
            <span class="coming-soon-badge" style="margin-left:auto;font-size:8.5px;padding:2px 6px;">SOON</span>
          </a>
          ${nav('deliverables', 'Deliverables', 'slides')}
          ${nav('activity', 'Activity', 'clock')}
        </nav>

        <div class="nav-label tools-label">TOOLKIT</div>
        <div class="toolkit-item">
          ${icon('file')}<span>Technical memos</span><span class="toolkit-dot tone-blue"></span>
        </div>
        <div class="toolkit-item">
          ${icon('slides')}<span>Slide decks</span><span class="toolkit-dot tone-red"></span>
        </div>
        <div class="toolkit-item muted">
          ${icon('chart')}<span>FS sanity checks</span><span class="coming-soon-badge" style="margin-left:auto;font-size:8px;padding:2px 4px;">SOON</span>
        </div>

        <div class="sidebar-bottom">
          <div class="private-note">
            ${icon('shield')}
            <div>
              <strong>Private & Scoped</strong>
              <span>Resources belong to their project.</span>
            </div>
          </div>

          ${state.user.role === 'super_user' && !state.user.demo ? nav('settings', 'Settings', 'settings') : ''}

          <div class="profile">
            <span class="avatar">${e(initials(state.user.name))}</span>
            <div>
              <strong>${e(state.user.name)}</strong>
              <span>${state.user.demo ? 'Demo user' : state.user.role === 'super_user' ? 'Super user' : 'Team member'}</span>
            </div>
            ${button(icon('logout'), 'logout', 'icon-btn', 'aria-label="Sign out" title="Sign out"')}
          </div>
        </div>
      </aside>

      <div class="main-wrap">
        <header class="topbar">
          ${button(icon('menu'), 'mobile-menu', 'icon-btn mobile-menu', 'aria-label="Toggle navigation"')}
          <div class="breadcrumb">
            <a href="#hub">Hub</a>
            ${icon('chevron')}
            <a href="#${state.page}">${e(title)}</a>
            ${trail ? icon('chevron') + `<span class="breadcrumb-current">${e(trail)}</span>` : ''}
          </div>
          <div class="topbar-right">
            <a href="#hub" class="btn secondary small-btn">${icon('hub')} Hub</a>
            <span class="private-indicator"><i></i> ${state.user.demo ? 'Sample workspace' : 'Private workspace'}</span>
            <span class="topbar-divider"></span>
            ${userMenuDropdown()}
          </div>
        </header>

        <main class="main-content">
          ${state.user.demo ? '<div class="sample-banner"><span>SAMPLE WORKSPACE</span> All clients and data are fictional. <button type="button" data-action="leave-demo">Set up your team ' + icon('arrow') + '</button></div>' : ''}
          ${content}
          <footer class="workspace-footer">
            <span>Advisory Desk · Minimal Material Workspace</span>
            <span>Alpha 0.1 <span class="footer-dot">·</span> Safe, private advisory execution</span>
          </footer>
        </main>
      </div>
    </div>
  `;
}

/* ==========================================================================
   VIEW 1: ADVISORY DESK WORKBENCH (#desk)
   No sidebar! Standalone topbar with Logo, Hub button, Advisory Desk label,
   and Username with Dark/Light toggle and Sign out.
   Shows assigned engagements or empty banner.
   ========================================================================== */

function renderDesk() {
  app.innerHTML = `
    <div class="workbench-page">
      <header class="workbench-topbar">
        <div class="workbench-topbar-left">
          <a class="brand" href="#hub">
            <span class="brand-mark">a<span>↗</span></span>
            <div>
              <span>advisory desk</span>
              <span class="alpha">ALPHA</span>
            </div>
          </a>
          <span class="topbar-divider"></span>
          <a href="#hub" class="btn secondary small-btn">
            ${icon('hub')} Hub
          </a>
          <span class="topbar-divider"></span>
          <div class="workbench-crumb-group">
            <span class="breadcrumb-current">Advisory Desk</span>
            <span class="middot">·</span>
            <span class="breadcrumb-sub">Workbench</span>
          </div>
        </div>

        <div class="workbench-topbar-right">
          ${userMenuDropdown()}
        </div>
      </header>

      <main class="workbench-container">
        <section class="page-heading">
          <div>
            <h1>Workbench<span class="heading-dot">.</span></h1>
            <p>Active advisory engagements you are assigned to. Select an engagement to enter its workstation.</p>
          </div>
          ${state.projects.length ? `
            <div class="button-row">
              <button type="button" class="btn primary" data-action="new-project">
                ${icon('plus')} Create Engagement
              </button>
            </div>
          ` : ''}
        </section>

        ${state.projects.length === 0 ? `
          <div class="workbench-empty-banner">
            <div class="empty-banner-left">
              <div class="empty-banner-icon">${icon('briefcase')}</div>
              <div class="empty-banner-content">
                <h3>No Active Engagements</h3>
                <p>You have no active engagements. Please create one or ask the Engagement Manager to invite you to an active engagement</p>
              </div>
            </div>
            <button type="button" class="btn primary" data-action="new-project">
              ${icon('plus')} Create Engagement
            </button>
          </div>
        ` : `
          <div class="project-grid">
            ${state.projects.map(p => `
              <article class="project-card">
                <div class="card-top">
                  <span class="project-icon ${typeColor(p.type)}">${icon(typeIcon(p.type))}</span>
                  ${badge(p.status)}
                </div>
                <h3><a href="#project/${p.id}">${e(p.name)}</a></h3>
                <p class="card-client">${e(p.client)}</p>
                <div class="card-tags">
                  <span>${e(p.type)}</span>
                  <span class="gaap-badge">${e(p.gaap)}</span>
                  <span class="fy-badge">FY ${date(p.fy)}</span>
                </div>
                <div class="card-metrics">
                  <span>${icon('file')} ${p.deliverable_count} deliverables</span>
                  <span>${icon('folder')} ${p.resource_count} resources</span>
                </div>
                <div class="card-footer">
                  <div class="member-stack">
                    <span class="avatar tiny" title="${e(p.owner_name)}">${e(initials(p.owner_name))}</span>
                    ${p.member_count > 1 ? `<span class="avatar tiny pale" title="${p.member_count} team members">+${p.member_count - 1}</span>` : ''}
                  </div>
                  <a href="#project/${p.id}" class="btn secondary small-btn">
                    Open Engagement ${icon('arrow')}
                  </a>
                </div>
              </article>
            `).join('')}
            <button type="button" class="new-project-card" data-action="new-project">
              <span>${icon('plus')}</span>
              <strong>Create Engagement</strong>
              <small>Set up an advisory engagement</small>
            </button>
          </div>
        `}
      </main>

      <footer class="workspace-footer" style="margin-top:auto;padding:24px 40px;border-top:1px solid var(--outline);display:flex;justify-content:space-between;font-size:12px;color:var(--text-dim);">
        <span>Advisory Desk · Minimal Material Workspace</span>
        <span>Alpha 0.1 · Safe, private advisory execution</span>
      </footer>
    </div>
  `;
}

/* ==========================================================================
   VIEW 2: ENGAGEMENT MANAGER (MASTER PROJECTS LIST & PARAMETERS)
   ========================================================================== */

function renderProjectSetup() {
  const activeCount = state.projects.filter(p => p.status === 'Active').length;
  const ifrsCount = state.projects.filter(p => p.gaap === 'IFRS').length;
  const indasCount = state.projects.filter(p => p.gaap === 'Ind AS').length;
  const usgaapCount = state.projects.filter(p => p.gaap === 'US GAAP').length;

  const content = `
    <section class="master-setup-header">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:16px;">
        <div>
          <h1 style="font-size:28px;font-weight:800;color:var(--text-primary);letter-spacing:-0.5px;">Engagement Manager<span class="heading-dot">.</span></h1>
          <p style="color:var(--text-secondary);font-size:14px;max-width:720px;margin-top:4px;">
            Master directory containing all engagement parameters: client entities, financial year ends, reporting frameworks, review states, and governance access.
          </p>
        </div>
        ${button(icon('plus') + ' New project', 'new-project', 'btn primary')}
      </div>

      <!-- Parameter Matrix Stats -->
      <div class="master-meta-tags">
        <span class="matrix-parameter-pill">Total Projects: <strong>${state.projects.length}</strong></span>
        <span class="matrix-parameter-pill">Active: <strong>${activeCount}</strong></span>
        <span class="matrix-parameter-pill">IFRS: <strong>${ifrsCount}</strong></span>
        <span class="matrix-parameter-pill">Ind AS: <strong>${indasCount}</strong></span>
        <span class="matrix-parameter-pill">US GAAP: <strong>${usgaapCount}</strong></span>
      </div>
    </section>

    <!-- Filters & Search Toolbar -->
    <div class="project-toolbar">
      <label class="search-field">
        ${icon('search')}
        <input id="project-search" type="search" placeholder="Search projects, clients, or parameters…" value="${e(state.query)}" aria-label="Search projects">
      </label>

      <div class="filter-controls">
        <select id="project-gaap" aria-label="Filter by framework">
          ${options(['All frameworks', ...frameworks], state.gaap)}
        </select>
        <select id="project-type" aria-label="Filter by type">
          ${options(['All types', ...types], state.type)}
        </select>
        <select id="project-status" aria-label="Filter by status">
          ${options(['All statuses', 'Active', 'On hold', 'Completed'], state.status)}
        </select>
        <select id="project-sort" aria-label="Sort projects">
          <option value="recent">Last updated</option>
          <option value="name">Project name</option>
          <option value="client">Client name</option>
          <option value="fy">Financial Year End</option>
        </select>

        <div class="view-toggle" aria-label="Project view">
          ${button(icon('list'), 'view-table', `icon-btn ${state.view === 'table' ? 'selected' : ''}`, 'aria-label="Master table view" title="Matrix Table"')}
          ${button(icon('grid'), 'view-grid', `icon-btn ${state.view === 'grid' ? 'selected' : ''}`, 'aria-label="Cards view" title="Cards Grid"')}
        </div>
      </div>
    </div>

    <div id="project-results"></div>
  `;

  shell(content, 'Engagement Manager');
  renderProjectResults();
}

function renderProjectResults() {
  const container = document.querySelector('#project-results');
  if (!container) return;

  const projects = state.projects.filter(p => {
    const textMatch = !state.query || `${p.name} ${p.client} ${p.description} ${p.gaap} ${p.type}`.toLowerCase().includes(state.query.toLowerCase());
    const typeMatch = state.type === 'All types' || p.type === state.type;
    const statusMatch = state.status === 'All statuses' || p.status === state.status;
    const gaapMatch = state.gaap === 'All frameworks' || p.gaap === state.gaap;
    return textMatch && typeMatch && statusMatch && gaapMatch;
  });

  const sort = document.querySelector('#project-sort')?.value || 'recent';
  if (sort === 'fy') {
    projects.sort((a, b) => a.fy.localeCompare(b.fy));
  } else if (sort !== 'recent') {
    projects.sort((a, b) => a[sort].localeCompare(b[sort]));
  }

  if (!projects.length) {
    container.innerHTML = empty(
      state.projects.length ? 'No engagements match parameters.' : 'Your master registry is ready for its first project.',
      state.projects.length ? 'Adjust your search query or reset parameter filters.' : 'Set up your first project with client, FY end, and accounting framework.',
      button(state.projects.length ? 'Reset filters' : icon('plus') + ' Set up new project', state.projects.length ? 'reset-filters' : 'new-project')
    );
    return;
  }

  if (state.view === 'table') {
    // Master Matrix Table View
    container.innerHTML = `
      <div class="table-wrap">
        <table class="projects-table">
          <thead>
            <tr>
              <th>Client / Alias</th>
              <th>Project Name & Code</th>
              <th>Financial Year End</th>
              <th>Engagement Type</th>
              <th>Framework</th>
              <th>Status</th>
              <th>Team</th>
              <th>Artifacts</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            ${projects.map(p => `
              <tr>
                <td>
                  <strong style="display:block;color:var(--text-primary);">${e(p.client)}</strong>
                  <small style="font-size:11px;color:var(--text-muted);">Client entity</small>
                </td>
                <td>
                  <a class="table-project" href="#project/${p.id}">
                    <span class="project-icon ${typeColor(p.type)}">${icon(typeIcon(p.type))}</span>
                    <span>
                      <strong>${e(p.name)}</strong>
                      <small style="font-family:var(--font-mono);font-size:11px;color:var(--text-dim);">${p.id.slice(0, 8)}</small>
                    </span>
                  </a>
                </td>
                <td>
                  <span class="fy-badge">${date(p.fy)}</span>
                </td>
                <td>
                  <span style="font-size:12.5px;color:var(--text-secondary);">${e(p.type)}</span>
                </td>
                <td>
                  <span class="gaap-badge">${e(p.gaap)}</span>
                </td>
                <td>
                  ${badge(p.status)}
                </td>
                <td>
                  <div class="member-stack">
                    <span class="avatar tiny" title="Owner: ${e(p.owner_name)}">${e(initials(p.owner_name))}</span>
                    ${p.member_count > 1 ? `<span class="avatar tiny pale" title="${p.member_count} team members">+${p.member_count - 1}</span>` : ''}
                  </div>
                </td>
                <td>
                  <div style="font-size:11.5px;color:var(--text-muted);display:flex;gap:10px;">
                    <span title="Deliverables">${icon('file')} ${p.deliverable_count}</span>
                    <span title="Resources">${icon('folder')} ${p.resource_count}</span>
                  </div>
                </td>
                <td>
                  <a href="#project/${p.id}" class="btn secondary small-btn" style="padding:4px 10px;font-size:11.5px;">
                    Open ${icon('arrow')}
                  </a>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } else {
    // Card Grid View
    container.innerHTML = `
      <div class="project-grid">
        ${projects.map(p => `
          <article class="project-card">
            <div class="card-top">
              <span class="project-icon ${typeColor(p.type)}">${icon(typeIcon(p.type))}</span>
              ${badge(p.status)}
            </div>
            <h3><a href="#project/${p.id}">${e(p.name)}</a></h3>
            <p class="card-client">${e(p.client)}</p>
            <div class="card-tags">
              <span>${e(p.type)}</span>
              <span class="gaap-badge">${e(p.gaap)}</span>
              <span class="fy-badge">FY ${date(p.fy)}</span>
            </div>
            <div class="card-metrics">
              <span>${icon('file')} ${p.deliverable_count} deliverables</span>
              <span>${icon('folder')} ${p.resource_count} resources</span>
            </div>
            <div class="card-footer">
              <div class="member-stack">
                <span class="avatar tiny" title="${e(p.owner_name)}">${e(initials(p.owner_name))}</span>
                ${p.member_count > 1 ? `<span class="avatar tiny pale">+${p.member_count - 1}</span>` : ''}
                <span class="updated-date">${date(p.updated).replace(/ \d{4}$/, '')}</span>
              </div>
              <a class="card-arrow" href="#project/${p.id}" aria-label="Open ${e(p.name)}">${icon('arrow')}</a>
            </div>
          </article>
        `).join('')}
        <button class="new-project-card" data-action="new-project">
          <span>${icon('plus')}</span>
          <strong>Configure new engagement</strong>
          <small>Add project to master registry</small>
        </button>
      </div>
    `;
  }

  document.querySelectorAll('.view-toggle button').forEach(b => {
    b.classList.toggle('selected', b.dataset.action === `view-${state.view}`);
  });
}

/* ==========================================================================
   VIEW 3: KNOWLEDGE BASE MODAL (WITH COMING SOON BADGE)
   ========================================================================== */

function openKnowledgeBase() {
  const content = `
    <div style="text-align:center;padding:10px 0 20px;">
      <div style="display:inline-flex;align-items:center;gap:6px;margin-bottom:14px;">
        <span class="coming-soon-badge">Coming soon · Phase 2</span>
      </div>
      <h2 style="font-size:24px;font-weight:800;color:var(--text-primary);margin-bottom:6px;">Advisory Knowledge Base</h2>
      <p style="font-size:13.5px;color:var(--text-secondary);max-width:500px;margin:0 auto 22px;">
        Authoritative accounting codifications, firm precedent memorandums, and sovereign guidance library.
      </p>

      <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(210px, 1fr));gap:12px;text-align:left;margin-bottom:24px;">
        <div style="background:var(--bg-canvas);border:1px solid var(--outline);border-radius:var(--radius-md);padding:14px;">
          <strong style="display:block;font-size:13.5px;color:var(--text-primary);margin-bottom:3px;">Authoritative Standards</strong>
          <p style="font-size:12px;color:var(--text-muted);line-height:1.45;">Indexed paragraphs for IFRS, Ind AS, and US GAAP (ASC topics).</p>
        </div>
        <div style="background:var(--bg-canvas);border:1px solid var(--outline);border-radius:var(--radius-md);padding:14px;">
          <strong style="display:block;font-size:13.5px;color:var(--text-primary);margin-bottom:3px;">Technical Precedents</strong>
          <p style="font-size:12px;color:var(--text-muted);line-height:1.45;">Firm position papers, approved memos, and transaction structures.</p>
        </div>
        <div style="background:var(--bg-canvas);border:1px solid var(--outline);border-radius:var(--radius-md);padding:14px;">
          <strong style="display:block;font-size:13.5px;color:var(--text-primary);margin-bottom:3px;">Sovereign Local Search</strong>
          <p style="font-size:12px;color:var(--text-muted);line-height:1.45;">Network-contained offline embeddings across guidance without cloud egress.</p>
        </div>
      </div>

      <div style="background:var(--brand-blue-tint);border:1px solid var(--brand-blue-container);border-radius:var(--radius-md);padding:14px;text-align:left;margin-bottom:20px;">
        <strong style="display:block;font-size:12.5px;color:var(--brand-blue);margin-bottom:6px;">Currently Active Standards in Technical Memo Intake:</strong>
        <div style="display:flex;flex-wrap:wrap;gap:6px;">
          <span class="gaap-badge">IFRS 15 · Revenue</span>
          <span class="gaap-badge">IFRS 16 · Leases</span>
          <span class="gaap-badge">Ind AS 115 · Revenue</span>
          <span class="gaap-badge">ASC 606 · Revenue</span>
          <span class="gaap-badge">ASC 842 · Leases</span>
          <span class="gaap-badge">+ 20 More Standards</span>
        </div>
      </div>

      <div class="modal-actions" style="justify-content:center;">
        ${button('Close', 'close-modal', 'btn secondary')}
        ${state.projects.length ? button('Start memo with standards ' + icon('arrow'), 'quick-memo', 'btn primary') : ''}
      </div>
    </div>
  `;

  showModal('Knowledge Base', 'Authoritative Standards & Research', content, 'wide-modal');
}

/* ==========================================================================
   DELIVERABLES, ACTIVITY, AND PROJECT VIEWS
   ========================================================================== */

function deliveryRows(deliverables, projectId = '') {
  if (!deliverables.length) return empty('Room for your first deliverable.', 'Start a memo or deck brief from your project overview.');
  return `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Deliverable</th>
            ${!projectId ? '<th>Project</th>' : ''}
            <th>Status</th>
            <th>Updated</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${deliverables.map(d => `
            <tr>
              <td>
                <button class="table-project" data-action="edit-delivery" data-project="${projectId || d.project_id}" data-id="${d.id}">
                  <span class="project-icon ${d.kind === 'memo' ? 'tone-blue' : 'tone-red'}">${icon(d.kind === 'memo' ? 'file' : 'slides')}</span>
                  <span>
                    <strong>${e(d.title)}</strong>
                    <small>${d.kind === 'memo' ? 'Technical memo' : 'Slide deck'}</small>
                  </span>
                </button>
              </td>
              ${!projectId ? `<td><a class="table-link" href="#project/${d.project_id}" style="color:var(--brand-blue);font-weight:600;">${e(d.project_name)}</a></td>` : ''}
              <td>${badge(d.status)}</td>
              <td class="table-date" style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);">${date(d.updated)}</td>
              <td>
                ${button(icon('arrow'), 'edit-delivery', 'icon-btn', `data-project="${projectId || d.project_id}" data-id="${d.id}" aria-label="Open deliverable"`)}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

function renderDeliverables() {
  shell(`
    <section class="page-heading">
      <div>
        <h1>Deliverables<span class="heading-dot">.</span></h1>
        <p>The working technical memos and presentation decks across your projects.</p>
      </div>
      <span class="matrix-parameter-pill">${icon('file')} ${state.deliverables.length} working draft${state.deliverables.length === 1 ? '' : 's'}</span>
    </section>
    <div class="inline-note" style="margin-bottom:20px;">
      ${icon('info')}
      <span>Outlines give your team a deterministic starting point. Complete the content, review it, and export to Word (.docx) or PowerPoint (.pptx).</span>
    </div>
    ${deliveryRows(state.deliverables)}
  `, 'Deliverables');
}

function activityList(items, global = false) {
  return items.length ? `
    <div class="activity-list">
      ${items.map(a => `
        <div class="activity-item">
          <span class="avatar small pale">${e(initials(a.user_name))}</span>
          <div>
            <p><strong>${e(a.user_name)}</strong> <span>${e(a.action)}</span></p>
            ${global ? `<a href="#project/${a.project_id}">${e(a.project_name)}</a>` : ''}
            <small>${date(a.created)} · ${new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(new Date(a.created))}</small>
          </div>
        </div>
      `).join('')}
    </div>
  ` : empty('A fresh page.', 'Project activity will appear here as your team gets to work.');
}

async function renderActivity() {
  const data = await api('/activity');
  shell(`
    <section class="page-heading">
      <div>
        <h1>Activity Stream<span class="heading-dot">.</span></h1>
        <p>Audit trail and recent updates across your assigned advisory projects.</p>
      </div>
    </section>
    <section class="panel">
      ${activityList(data.activity, true)}
    </section>
  `, 'Activity');
}

async function openProject(id, keepTab = false) {
  state.project = await api(`/projects/${id}`);
  if (!keepTab) state.projectTab = 'overview';
  renderProject();
}

function resourceRows(resources, compact = false) {
  const p = state.project.project;
  if (!resources.length) return empty('Give your project some context.', 'Upload engagement briefs, source documents, or a memo template.', button(icon('upload') + ' Add resources', 'upload-resource', 'btn secondary'));
  return `
    <div class="resource-list">
      ${resources.slice(0, compact ? 4 : undefined).map(r => `
        <div class="resource-row">
          <span class="resource-icon">${icon(r.kind === 'template' ? 'book' : 'file')}</span>
          <div class="resource-name">
            <strong>${e(r.name)}</strong>
            <small>${r.kind === 'template' ? 'Company template' : 'Reference'} <span>·</span> ${size(r.size)} <span>·</span> ${date(r.created)}</small>
          </div>
          <a class="icon-btn" href="/api/projects/${p.id}/resources/${r.id}" aria-label="Download ${e(r.name)}" title="Download">${icon('download')}</a>
          ${!compact && (r.created_by === state.user.id || p.owner_id === state.user.id) ? button(icon('trash'), 'delete-resource', 'icon-btn subtle-danger', `data-id="${r.id}" data-name="${e(r.name)}" aria-label="Remove ${e(r.name)}"`) : ''}
        </div>
      `).join('')}
    </div>
  `;
}

function renderProject() {
  const data = state.project;
  const p = data.project;
  const owner = p.owner_id === state.user.id;
  const tabs = [
    ['overview', 'Overview'],
    ['resources', 'Resources', data.resources.length],
    ['deliverables', 'Deliverables', data.deliverables.length],
    ['team', 'Team', data.members.length],
    ['activity', 'Activity']
  ];

  let content = '';
  if (state.projectTab === 'overview') {
    content = `
      <div class="section-heading" style="margin-bottom:14px;">
        <div>
          <h2 style="font-size:18px;color:var(--text-primary);">Engagement Workstreams</h2>
          <p style="font-size:12.5px;color:var(--text-muted);">Select a deliverable to develop.</p>
        </div>
      </div>

      <div class="module-grid">
        <article class="module-card">
          <span class="module-icon tone-blue">${icon('file')}</span>
          <h3>Technical Memo</h3>
          <p>Frame the question, select applicable accounting standards, cite project evidence, and build a working outline.</p>
          ${button('Start a memo ' + icon('arrow'), 'new-memo', 'text-link')}
        </article>

        <article class="module-card">
          <span class="module-icon tone-red">${icon('slides')}</span>
          <h3>Slide Deck</h3>
          <p>Bring structure to a proposal, training session, or technical discussion with native PowerPoint export.</p>
          ${button('Start a deck ' + icon('arrow'), 'new-deck', 'text-link')}
        </article>

        <article class="module-card future-module">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;">
            <span class="module-icon tone-muted" style="margin-bottom:0;">${icon('chart')}</span>
            <span class="coming-soon-badge">Soon</span>
          </div>
          <h3>FS Sanity Checks</h3>
          <p>Casting, cross-referencing, and tracing. Future chapter for the advisory workspace.</p>
          <span class="soon-pill">Planned for Phase 2</span>
        </article>
      </div>

      <div class="project-overview-grid">
        <section class="panel">
          <div class="panel-heading">
            <h2>Project Parameters & Brief</h2>
            ${icon('folder')}
          </div>
          <p class="project-description">${e(p.description || 'No brief added yet. Use memo and deck briefs to capture engagement context.')}</p>
          <div class="project-facts">
            <div><span>Client / Alias</span><strong>${e(p.client)}</strong></div>
            <div><span>Financial Year End</span><strong style="font-family:var(--font-mono);">${date(p.fy)}</strong></div>
            <div><span>Engagement Type</span><strong>${e(p.type)}</strong></div>
            <div><span>Accounting Framework</span><strong class="gaap-badge">${e(p.gaap)}</strong></div>
          </div>
        </section>

        <section class="panel context-panel">
          <div class="panel-heading">
            <h2>Team & Access Boundaries</h2>
            ${icon('shield')}
          </div>
          <p style="font-size:12.5px;color:var(--text-muted);line-height:1.5;">
            Resources and drafts are strictly scoped to this project's members. Super users cannot access this project without explicit membership.
          </p>
          <div class="context-members">
            ${data.members.slice(0, 5).map(m => `<span class="avatar" title="${e(m.name)}">${e(initials(m.name))}</span>`).join('')}
            <span>${data.members.length} assigned member${data.members.length === 1 ? '' : 's'}</span>
          </div>
          ${button('Manage Project Team ' + icon('arrow'), 'project-tab', 'text-link', 'data-tab="team"')}
        </section>
      </div>

      <section class="panel">
        <div class="panel-heading">
          <h2>Project Evidence & Templates <span class="count-bubble">${data.resources.length}</span></h2>
          ${button(icon('plus') + ' Add resource', 'upload-resource', 'btn secondary small-btn')}
        </div>
        ${resourceRows(data.resources, true)}
      </section>
    `;
  } else if (state.projectTab === 'resources') {
    content = `
      <div class="section-heading" style="margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <h2 style="font-size:18px;color:var(--text-primary);">Project Evidence & Resources</h2>
          <p style="font-size:12.5px;color:var(--text-muted);">Confidential source documents and memo templates scoped to this project.</p>
        </div>
        ${button(icon('upload') + ' Upload resource', 'upload-resource', 'btn primary small-btn')}
      </div>
      <section class="panel resource-panel">${resourceRows(data.resources)}</section>
      <p class="privacy-footnote" style="font-size:11.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;margin-top:14px;">
        ${icon('lock')} Files are stored in the local SQLite database and strictly scoped to this project. Maximum 10 MB per file.
      </p>
    `;
  } else if (state.projectTab === 'deliverables') {
    content = `
      <div class="section-heading" style="margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <h2 style="font-size:18px;color:var(--text-primary);">Engagement Deliverables</h2>
          <p style="font-size:12.5px;color:var(--text-muted);">Working outlines, reviews, and exported client deliverables.</p>
        </div>
        <div class="button-row">
          ${button(icon('plus') + ' Memo', 'new-memo', 'btn secondary small-btn')}
          ${button(icon('plus') + ' Deck', 'new-deck', 'btn primary small-btn')}
        </div>
      </div>
      ${deliveryRows(data.deliverables, p.id)}
    `;
  } else if (state.projectTab === 'team') {
    content = `
      <div class="section-heading" style="margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;">
        <div>
          <h2 style="font-size:18px;color:var(--text-primary);">Assigned Engagement Team</h2>
          <p style="font-size:12.5px;color:var(--text-muted);">Only these teammates can access this project's resources and deliverables.</p>
        </div>
        ${owner ? button(icon('plus') + ' Add teammate', 'add-member', 'btn primary small-btn') : ''}
      </div>
      <section class="panel">
        <div class="team-list">
          ${data.members.map(m => `
            <div class="team-row">
              <span class="avatar">${e(initials(m.name))}</span>
              <div style="flex:1;">
                <strong>${e(m.name)} ${m.id === state.user.id ? '<span style="color:var(--brand-blue);font-size:11px;">(you)</span>' : ''}</strong>
                <small>${e(m.email)}</small>
              </div>
              <span class="role-tag">${m.id === p.owner_id ? 'Project Owner' : 'Project Member'}</span>
              ${owner && m.id !== p.owner_id ? button(icon('close'), 'remove-member', 'icon-btn subtle-danger', `data-id="${m.id}" data-name="${e(m.name)}" aria-label="Remove ${e(m.name)}"`) : ''}
            </div>
          `).join('')}
        </div>
      </section>
    `;
  } else {
    content = `<section class="panel">${activityList(data.activity)}</section>`;
  }

  shell(`
    <a class="back-link" href="#project-setup">${icon('arrow')} Engagement Manager</a>
    <section class="page-heading project-heading">
      <div>
        <h1>${e(p.name)}</h1>
        <p>${e(p.client)} <span class="middot">·</span> FY end ${date(p.fy)} <span class="middot">·</span> <span class="gaap-badge">${e(p.gaap)}</span></p>
      </div>
      <div class="project-heading-status">
        ${owner ? `
          <label style="font-size:12px;display:flex;align-items:center;gap:8px;">
            Status:
            <select id="project-status-edit">
              ${options(['Active', 'On hold', 'Completed'], p.status)}
            </select>
          </label>
        ` : badge(p.status)}
      </div>
    </section>

    <div class="project-tabs" role="tablist" aria-label="Project sections">
      ${tabs.map(([key, label, count]) => `
        <button class="${state.projectTab === key ? 'active' : ''}" role="tab" aria-selected="${state.projectTab === key}" data-action="project-tab" data-tab="${key}">
          ${label}${count !== undefined ? `<span>${count}</span>` : ''}
        </button>
      `).join('')}
    </div>

    <div class="project-tab-content">${content}</div>
  `, 'Engagement Manager', p.client);
}

/* ==========================================================================
   SETTINGS VIEW (SUPER USER)
   ========================================================================== */

async function renderSettings() {
  if (state.user.role !== 'super_user' || state.user.demo) {
    location.hash = '#desk';
    toast('Settings are available only to the workspace super user.', true);
    return;
  }
  state.settingsData = await api('/settings');
  const { settings: s, users, invitations } = state.settingsData;

  let content;
  if (state.settingsTab === 'workspace') {
    content = `
      <section class="panel settings-panel">
        <div class="panel-heading">
          <div>
            <h2>Workspace Configuration</h2>
            <p style="font-size:12px;color:var(--text-muted);margin-top:2px;">Name your workspace and manage global settings.</p>
          </div>
          <span class="module-icon tone-blue">${icon('settings')}</span>
        </div>
        <form id="settings-form" class="form-stack">
          <label>Workspace name
            <input name="workspaceName" value="${e(s.workspaceName)}" required maxlength="80">
            <small style="color:var(--text-muted);font-size:11px;">Appears in the sidebar for all teammates.</small>
          </label>
          <input name="memoTemplateName" type="hidden" value="${e(s.memoTemplateName)}">
          <input name="memoHeadings" type="hidden" value="${e(s.memoHeadings)}">
          <div class="form-error" role="alert"></div>
          <div class="form-actions">
            <button type="submit" class="btn primary">Save changes ${icon('check')}</button>
          </div>
        </form>
      </section>
    `;
  } else if (state.settingsTab === 'templates') {
    content = `
      <section class="panel settings-panel">
        <div class="panel-heading">
          <div>
            <h2>Global Technical Memo Outline Structure</h2>
            <p style="font-size:12px;color:var(--text-muted);margin-top:2px;">Default outline headings applied when creating new technical memos.</p>
          </div>
          <span class="module-icon tone-blue">${icon('book')}</span>
        </div>
        <form id="settings-form" class="form-stack">
          <input name="workspaceName" type="hidden" value="${e(s.workspaceName)}">
          <label>Template name
            <input name="memoTemplateName" value="${e(s.memoTemplateName)}" required maxlength="120">
          </label>
          <label>Section Headings (one per line, up to 20)
            <textarea name="memoHeadings" rows="10" maxlength="3000" required>${e(s.memoHeadings)}</textarea>
          </label>
          <div class="inline-note">
            ${icon('info')}
            <span>A project Markdown template uploaded directly to a project will override these defaults.</span>
          </div>
          <div class="form-error" role="alert"></div>
          <div class="form-actions">
            <button type="submit" class="btn primary">Save memo template ${icon('check')}</button>
          </div>
        </form>
      </section>
    `;
  } else {
    content = `
      <section class="panel invite-panel">
        <div style="margin-bottom:16px;">
          <h2>Invite Teammates</h2>
          <p style="font-size:12.5px;color:var(--text-muted);margin-top:2px;">Generate an email-bound invitation code. Codes expire in 7 days.</p>
        </div>
        <form id="invite-form" style="display:flex;gap:12px;flex-wrap:wrap;">
          <input type="email" name="email" id="invite-email" placeholder="teammate@yourfirm.com" required style="flex:1;min-width:240px;">
          <button type="submit" class="btn primary">${icon('plus')} Create invitation</button>
          <div class="form-error" role="alert" style="width:100%;"></div>
        </form>
        <div id="invite-result" style="margin-top:16px;"></div>
      </section>

      <section class="panel">
        <div class="panel-heading">
          <h2>Registered Team Members <span class="count-bubble">${users.length}</span></h2>
        </div>
        <div class="admin-team-list" style="display:flex;flex-direction:column;gap:12px;">
          ${users.map(u => `
            <form class="admin-team-row" data-form="team-update" data-id="${u.id}" style="display:flex;align-items:center;gap:14px;padding:12px 16px;background:var(--bg-surface-variant);border:1px solid var(--outline);border-radius:var(--radius-md);flex-wrap:wrap;">
              <span class="avatar">${e(initials(u.name))}</span>
              <div style="flex:1;min-width:180px;">
                <strong>${e(u.name)} ${u.id === state.user.id ? '<span style="color:var(--brand-blue);font-size:11px;">(you)</span>' : ''}</strong>
                <small style="display:block;color:var(--text-muted);">${e(u.email)}</small>
              </div>
              <select name="role" id="role-${u.id}" ${u.id === state.user.id ? 'disabled' : ''}>
                ${options(['member', 'super_user'], u.role)}
              </select>
              <label style="display:flex;flex-direction:row;align-items:center;gap:6px;font-size:12px;">
                <input type="checkbox" name="active" ${u.active ? 'checked' : ''} ${u.id === state.user.id ? 'disabled' : ''}> Active
              </label>
              ${u.id !== state.user.id ? '<button type="submit" class="btn secondary small-btn">Save</button>' : '<span class="role-tag">Super user</span>'}
              <div class="form-error" role="alert" style="width:100%;"></div>
            </form>
          `).join('')}
        </div>
      </section>
    `;
  }

  shell(`
    <section class="page-heading">
      <div>
        <h1>Workspace Governance<span class="heading-dot">.</span></h1>
        <p>Manage workspace identity, team access, invitations, and accounting templates.</p>
      </div>
      <span class="matrix-parameter-pill">${icon('shield')} Super user</span>
    </section>

    <div class="project-tabs" role="tablist" aria-label="Settings sections">
      ${[['workspace', 'Workspace'], ['team', 'Team & access'], ['templates', 'Memo template']].map(([key, label]) => `
        <button class="${state.settingsTab === key ? 'active' : ''}" role="tab" aria-selected="${state.settingsTab === key}" data-action="settings-tab" data-tab="${key}">${label}</button>
      `).join('')}
    </div>

    <div class="settings-content">${content}</div>
  `, 'Settings');
}

/* ==========================================================================
   MODALS AND WORKFLOWS
   ========================================================================== */

let previousFocus;
function showModal(title, subtitle, content, cls = '') {
  previousFocus = document.activeElement;
  modalRoot.innerHTML = `
    <dialog class="modal ${cls}" aria-labelledby="modal-title">
      <div class="modal-heading">
        <div>
          <h2 id="modal-title">${e(title)}</h2>
          <p>${e(subtitle)}</p>
        </div>
        ${button(icon('close'), 'close-modal', 'icon-btn', 'aria-label="Close dialog"')}
      </div>
      ${content}
    </dialog>
  `;
  const dialog = modalRoot.querySelector('dialog');
  dialog.showModal();
  dialog.addEventListener('click', event => {
    if (event.target === dialog && !state.busy) closeModal();
  });
  dialog.addEventListener('cancel', event => {
    event.preventDefault();
    if (!state.busy) closeModal();
  });
}

function closeModal() {
  if (state.busy) return;
  modalRoot.querySelector('dialog')?.close();
  modalRoot.innerHTML = '';
  previousFocus?.focus();
}

const modalActions = label => `
  <div class="form-error" role="alert"></div>
  <div class="modal-actions">
    ${button('Cancel', 'close-modal', 'btn secondary')}
    <button type="submit" class="btn primary">${label} ${icon('arrow')}</button>
  </div>
`;

function newProject() {
  showModal(
    'Configure New Project',
    'Set up client parameters, framework, and financial reporting year end.',
    `
      <form id="new-project-form">
        <div class="form-stack">
          <label>Project name
            <input name="name" placeholder="e.g. Revenue Recognition Assessment" required maxlength="120" autofocus>
          </label>
          <div class="form-grid">
            <label>Client name or confidential alias
              <input name="client" placeholder="e.g. Project Horizon / Acme Corp" required maxlength="120">
            </label>
            <label>Financial year end
              <input type="date" name="fy" value="2027-03-31" required>
            </label>
            <label>Engagement type
              <select name="type">${options(types, 'Technical memo')}</select>
            </label>
            <label>Accounting framework
              <select name="gaap">${options(frameworks, 'IFRS')}</select>
            </label>
          </div>
          <label>Scope & context <span class="optional">Optional</span>
            <textarea name="description" rows="3" placeholder="Transaction background, accounting question, key stakeholder expectations…" maxlength="4000"></textarea>
          </label>
          <div class="inline-note">
            ${icon('lock')}
            <span>You will be designated as Project Owner. You can invite teammates from the project's Team tab.</span>
          </div>
        </div>
        ${modalActions('Create project setup')}
      </form>
    `
  );
}

function uploadResource() {
  showModal(
    'Add Project Evidence',
    'Upload supporting client documents, contracts, or firm memo templates.',
    `
      <form id="upload-resource-form">
        <div class="form-stack">
          <label class="upload-zone">
            ${icon('upload')}
            <strong>Choose evidence file for this project</strong>
            <span>PDF, Word (.docx), PowerPoint, Excel, CSV, text, or Markdown · up to 10 MB</span>
            <input type="file" name="file" accept=".pdf,.docx,.pptx,.xlsx,.xls,.csv,.txt,.md,.json,.png,.jpg,.jpeg" required>
          </label>
          <label>Resource type
            <select name="kind">
              <option value="reference">Reference / Supporting Document</option>
              <option value="template">Company Memo Template (.md with # headings)</option>
            </select>
          </label>
          <div class="inline-note">
            ${icon('book')}
            <span>Markdown templates with headings (# or ##) will customize the generated memo outline structure.</span>
          </div>
        </div>
        ${modalActions('Upload evidence')}
      </form>
    `
  );
}

function resourcePicker() {
  if (!state.project?.resources?.length) {
    return `<fieldset class="resource-picker"><legend>Underlying evidence <span class="optional">Optional</span></legend><p class="small-text" style="color:var(--text-muted);">No resources uploaded yet. You can attach resources from the Resources tab.</p></fieldset>`;
  }
  return `
    <fieldset class="resource-picker">
      <legend>Underlying evidence <span class="optional">Select resources to cite</span></legend>
      ${state.project.resources.map(r => `
        <label class="checkbox-row">
          <input type="checkbox" name="resourceIds" value="${r.id}">
          <span>${icon(r.kind === 'template' ? 'book' : 'file')}</span>
          <span>${e(r.name)}${r.kind === 'template' ? ' <small style="color:var(--brand-blue);">(template)</small>' : ''}</span>
        </label>
      `).join('')}
    </fieldset>
  `;
}

function standardsCheckboxes(gaap) {
  const catalog = state.standards[gaap] || [];
  return catalog.length ? catalog.map(s => `
    <label class="checkbox-row">
      <input type="checkbox" name="standards" value="${e(s)}">
      <span>${e(s)}</span>
    </label>
  `).join('') : '<p class="small-text" style="color:var(--text-muted);">Enter standard or guidance manually below.</p>';
}

function newMemo() {
  const p = state.project.project;
  showModal(
    'Draft Technical Accounting Memo',
    'Capture problem statement, select accounting standards, and generate outline.',
    `
      <form id="new-memo-form">
        <div class="form-stack">
          <label>Memo title
            <input name="title" placeholder="e.g. Accounting for Multi-Element Software Arrangement" required maxlength="160" autofocus>
          </label>
          <label>Accounting framework
            <select name="gaap" id="memo-gaap">${options(frameworks, p.gaap)}</select>
          </label>
          <fieldset class="standards-picker">
            <legend>Relevant standards <span class="optional">Select applicable guidance</span></legend>
            <div id="standards-options">${standardsCheckboxes(p.gaap)}</div>
          </fieldset>
          <label>Additional standard or topic <span class="optional">Optional</span>
            <input name="customStandard" placeholder="e.g. ASC 606-10-25-14 or specific IFRIC agenda decision" maxlength="500">
          </label>
          <label>Problem statement / transaction brief
            <textarea name="problem" rows="4" placeholder="Detail facts, contracts, terms, accounting question, and required assessment…" required maxlength="8000"></textarea>
          </label>
          ${resourcePicker()}
          <div class="inline-note">
            ${icon('book')}
            <span>Generates an editable Markdown outline based on team templates and selected standards.</span>
          </div>
        </div>
        ${modalActions('Create memo outline')}
      </form>
    `,
    'wide-modal'
  );
}

function deckFields(deckType, area = 'IPO') {
  if (deckType !== 'Proposal') {
    return `<label>Target audience <span class="optional">Optional</span><input name="audience" placeholder="e.g. Audit Committee, Finance Leadership" maxlength="200"></label>`;
  }
  return `
    <label>Proposal area
      <select name="area" id="deck-area">${options(['IPO', 'GAAP transition', 'Accounting advisory', 'Staff augmentation'], area)}</select>
    </label>
    <div id="proposal-fields">${proposalFields(area)}</div>
    <label>Target audience <span class="optional">Optional</span>
      <input name="audience" placeholder="e.g. CFO, Board of Directors" maxlength="200"></label>
  `;
}

function proposalFields(area) {
  if (area === 'IPO') {
    return `
      <label>IPO focus track
        <select name="ipoTrack"><option>Readiness</option><option>PMO</option></select>
      </label>
    `;
  }
  if (area === 'GAAP transition') {
    return `
      <div class="form-grid">
        <label>Current reporting framework<select name="currentGaap">${options(frameworks, 'Other')}</select></label>
        <label>Target reporting framework<select name="targetGaap">${options(frameworks, state.project?.project?.gaap || 'IFRS')}</select></label>
      </div>
      <label>Current accounting methodologies <span class="optional">Optional</span>
        <textarea name="methodologies" rows="2" placeholder="Key accounting policies, revenue recognition timing, lease models…" maxlength="4000"></textarea>
      </label>
    `;
  }
  return '';
}

function newDeck() {
  const p = state.project.project;
  const area = p.type === 'GAAP transition' ? 'GAAP transition' : 'IPO';
  showModal(
    'Draft Executive Slide Deck',
    'Structure an executive presentation outline with native 16:9 PowerPoint export.',
    `
      <form id="new-deck-form">
        <div class="form-stack">
          <label>Deck title
            <input name="title" placeholder="e.g. IPO Accounting Readiness & Roadmap" required maxlength="160" autofocus>
          </label>
          <label>Deck type
            <select name="deckType" id="deck-type">${options(['Proposal', 'Training', 'Technical guidance'], 'Proposal')}</select>
          </label>
          <div id="deck-fields" class="form-stack">${deckFields('Proposal', area)}</div>
          <label>Presentation objectives & brief
            <textarea name="problem" rows="4" placeholder="What key decisions, timelines, or training modules will this deck address?" required maxlength="8000"></textarea>
          </label>
          ${resourcePicker()}
          <div class="inline-note">
            ${icon('slides')}
            <span>Generates an editable slide structure. You can edit each slide in Markdown and download as .pptx.</span>
          </div>
        </div>
        ${modalActions('Create deck outline')}
      </form>
    `,
    'wide-modal'
  );
}

function markdown(body) {
  return body.split('\n').map(line => {
    if (line.startsWith('### ')) return `<h4>${e(line.slice(4))}</h4>`;
    if (line.startsWith('## ')) return `<h3>${e(line.slice(3))}</h3>`;
    if (line.startsWith('# ')) return `<h2>${e(line.slice(2))}</h2>`;
    if (line.startsWith('- ')) return `<p class="preview-bullet">${e(line.slice(2))}</p>`;
    return line.trim() ? `<p>${e(line)}</p>` : '';
  }).join('');
}

function slidePreview(body) {
  const sections = body.split(/^## /m).slice(1);
  return sections.map((section, i) => {
    const [title, ...lines] = section.trim().split('\n');
    return `
      <article class="slide-preview ${i === 0 ? 'title-slide' : ''}">
        <small>ADVISORY DESK · WORKING OUTLINE</small>
        <h3>${e(title)}</h3>
        <div>
          ${lines.filter(x => x.trim()).map(x => `<p>${e(x.replace(/^- /, ''))}</p>`).join('')}
        </div>
        <span class="slide-number">${i + 1} / ${sections.length}</span>
      </article>
    `;
  }).join('') || markdown(body);
}

async function editDelivery(project, id) {
  const data = await api(`/projects/${project}/deliverables/${id}`);
  state.editing = data.deliverable;
  state.editingProject = project;
  const d = state.editing;

  showModal(
    d.kind === 'memo' ? 'Technical Memo Editor' : 'Slide Deck Editor',
    'Edit the working markdown, adjust review status, and export document.',
    `
      <form id="edit-delivery-form">
        <div class="editor-meta">
          <label>Title
            <input name="title" value="${e(d.title)}" required maxlength="160">
          </label>
          <label>Review status
            <select name="status">${options(['Draft', 'In review', 'Approved'], d.status)}</select>
          </label>
        </div>

        <div class="editor-toolbar">
          <span>${icon(d.kind === 'memo' ? 'file' : 'slides')} ${d.kind === 'memo' ? 'Technical Memorandum' : 'Executive Presentation'} · Live Markdown Preview</span>
          <div class="button-row">
            <a class="btn secondary small-btn" href="/api/projects/${project}/deliverables/${id}/export/md">${icon('download')} Markdown (.md)</a>
            <a class="btn primary small-btn" href="/api/projects/${project}/deliverables/${id}/export/${d.kind === 'memo' ? 'docx' : 'pptx'}">
              ${icon('download')} Export ${d.kind === 'memo' ? 'Word (.docx)' : 'PowerPoint (.pptx)'}
            </a>
          </div>
        </div>

        <div class="editor-grid">
          <label class="editor-input-label">
            <span class="sr-only">Deliverable content</span>
            <textarea id="draft-body" name="body" spellcheck="true" required maxlength="200000">${e(d.body)}</textarea>
          </label>
          <div class="draft-preview ${d.kind === 'deck' ? 'deck-preview' : ''}" id="draft-preview">
            ${d.kind === 'deck' ? slidePreview(d.body) : markdown(d.body)}
          </div>
        </div>

        <div class="form-error" role="alert"></div>
        <div class="modal-actions">
          <span style="font-size:11.5px;color:var(--text-muted);margin-right:auto;">Exports always reflect the last saved version.</span>
          ${button('Close', 'close-modal', 'btn secondary')}
          <button type="submit" class="btn primary">Save draft ${icon('check')}</button>
        </div>
      </form>
    `,
    'editor-modal'
  );
}

function addMember() {
  showModal(
    'Add Team Member',
    'Assign a registered teammate to this project.',
    `
      <form id="add-member-form">
        <div class="form-stack">
          <label>Teammate work email
            <input name="email" type="email" placeholder="teammate@yourfirm.com" required autofocus>
          </label>
          <div class="inline-note">
            ${icon('shield')}
            <span>Teammates can sign up freely on the signup page. Entering their registered email grants access to this project.</span>
          </div>
        </div>
        ${modalActions('Grant project access')}
      </form>
    `
  );
}

function confirmAction(title, subtitle, form, data) {
  showModal(
    title,
    subtitle,
    `
      <form id="${form}" ${data}>
        <div class="form-error" role="alert"></div>
        <div class="modal-actions">
          ${button('Cancel', 'close-modal', 'btn secondary')}
          <button type="submit" class="btn danger">Confirm removal ${icon('trash')}</button>
        </div>
      </form>
    `
  );
}

/* ==========================================================================
   ROUTER & NAVIGATION CONTROLLER
   Flow: Signin Page -> Landing/Gateway -> Then Respective Modules
   ========================================================================== */

async function route() {
  // If not signed in: always show the Sign-in / Sign-up page first!
  if (!state.user) {
    location.hash = '';
    renderAuth();
    return;
  }

  const rawHash = location.hash.slice(1);
  const hash = rawHash || 'hub';

  const projectMatch = /^project\/([\w-]+)$/.exec(hash);

  try {
    if (projectMatch) {
      state.page = 'project';
      await openProject(projectMatch[1]);
    } else if (hash === 'desk') {
      state.page = 'desk';
      await refreshWorkspace();
      renderDesk();
    } else if (hash === 'project-setup' || hash === 'projects') {
      state.page = 'project-setup';
      await refreshWorkspace();
      renderProjectSetup();
    } else if (hash === 'knowledge-base') {
      state.page = 'desk';
      renderDesk();
      openKnowledgeBase();
    } else if (hash === 'deliverables') {
      state.page = 'deliverables';
      await refreshWorkspace();
      renderDeliverables();
    } else if (hash === 'activity') {
      state.page = 'activity';
      await renderActivity();
    } else if (hash === 'settings') {
      state.page = 'settings';
      await renderSettings();
    } else {
      // Default when logged in: Landing / Gateway (Hub) with 3 minimal cards
      state.page = 'hub';
      renderHub();
    }
  } catch (error) {
    report(error);
    if (error.status === 404) location.hash = '#hub';
  }
}

async function reloadCurrent() {
  await refreshWorkspace();
  if (state.page === 'project') await openProject(state.project.project.id, true);
  else if (state.page === 'desk') renderDesk();
  else if (state.page === 'project-setup') renderProjectSetup();
  else if (state.page === 'deliverables') renderDeliverables();
  else if (state.page === 'settings') await renderSettings();
  else renderHub();
}

/* ==========================================================================
   EVENT DISPATCHERS & HANDLERS
   ========================================================================== */

document.addEventListener('click', async event => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;

  if (target.tagName === 'A' && target.getAttribute('href')?.startsWith('#')) {
    event.preventDefault();
    location.hash = target.getAttribute('href');
    return;
  }

  if (state.busy && !['toggle-password', 'close-modal'].includes(action)) return;

  try {
    if (action === 'nav-desk') {
      location.hash = '#desk';
    } else if (action === 'nav-knowledge') {
      openKnowledgeBase();
    } else if (action === 'nav-setup') {
      location.hash = '#project-setup';
    } else if (action === 'toggle-user-menu') {
      const dropdown = target.closest('.user-menu-wrap')?.querySelector('.user-menu-dropdown');
      if (dropdown) {
        const isHidden = dropdown.classList.contains('hidden');
        document.querySelectorAll('.user-menu-dropdown').forEach(d => d.classList.add('hidden'));
        document.querySelectorAll('.user-menu-trigger').forEach(b => b.setAttribute('aria-expanded', 'false'));
        if (isHidden) {
          dropdown.classList.remove('hidden');
          target.closest('.user-menu-trigger')?.setAttribute('aria-expanded', 'true');
        }
      }
    } else if (action === 'toggle-theme') {
      toggleTheme();
    } else if (action === 'auth-tab') {
      state.authTab = target.dataset.tab;
      renderAuth();
    } else if (action === 'toggle-password') {
      const input = target.parentElement.querySelector('input');
      input.type = input.type === 'password' ? 'text' : 'password';
      target.setAttribute('aria-label', input.type === 'password' ? 'Show password' : 'Hide password');
    } else if (action === 'demo') {
      target.disabled = true;
      target.textContent = 'Opening sample workspace…';
      setSession(await send('/auth/demo', {}));
      await refreshWorkspace();
      location.hash = '#hub';
      renderHub();
      toast('Sample workspace initialized with 6 engagements.');
    } else if (action === 'logout' || action === 'leave-demo') {
      await send('/auth/logout', {});
      state.user = null;
      state.csrf = '';
      state.query = '';
      state.type = 'All types';
      state.status = 'All statuses';
      state.gaap = 'All frameworks';
      state.authStatus = await api('/auth/status');
      closeModal();
      location.hash = '';
      renderAuth();
      toast('Signed out cleanly.');
    } else if (action === 'mobile-menu') {
      document.querySelector('.sidebar').classList.toggle('mobile-open');
    } else if (action === 'new-project') {
      newProject();
    } else if (action === 'close-modal') {
      closeModal();
    } else if (action === 'view-grid' || action === 'view-table') {
      state.view = action.slice(5);
      renderProjectResults();
    } else if (action === 'reset-filters') {
      state.query = '';
      state.type = 'All types';
      state.status = 'All statuses';
      state.gaap = 'All frameworks';
      renderProjectSetup();
    } else if (action === 'project-tab') {
      state.projectTab = target.dataset.tab;
      renderProject();
    } else if (action === 'settings-tab') {
      state.settingsTab = target.dataset.tab;
      await renderSettings();
    } else if (action === 'upload-resource') {
      uploadResource();
    } else if (action === 'new-memo') {
      newMemo();
    } else if (action === 'new-deck') {
      newDeck();
    } else if (action === 'quick-memo') {
      closeModal();
      if (!state.projects.length) {
        newProject();
      } else {
        state.project = await api(`/projects/${state.projects[0].id}`);
        newMemo();
      }
    } else if (action === 'quick-deck') {
      closeModal();
      if (!state.projects.length) {
        newProject();
      } else {
        state.project = await api(`/projects/${state.projects[0].id}`);
        newDeck();
      }
    } else if (action === 'edit-delivery') {
      await editDelivery(target.dataset.project, target.dataset.id);
    } else if (action === 'add-member') {
      addMember();
    } else if (action === 'delete-resource') {
      confirmAction(
        'Remove this evidence file?',
        `${target.dataset.name} will be removed from this project. Existing deliverable outlines will retain citations.`,
        'delete-resource-form',
        `data-id="${target.dataset.id}"`
      );
    } else if (action === 'remove-member') {
      confirmAction(
        'Remove project access?',
        `${target.dataset.name} will immediately lose access to this project's resources and deliverables.`,
        'remove-member-form',
        `data-id="${target.dataset.id}"`
      );
    } else if (action === 'copy-invite') {
      const input = document.querySelector('#invitation-code');
      try {
        await navigator.clipboard.writeText(input.value);
        toast('Invitation code copied to clipboard.');
      } catch {
        input.focus();
        input.select();
        toast('Copy the code from the field.');
      }
    }
  } catch (error) {
    if (action === 'demo') {
      target.disabled = false;
      target.textContent = 'Explore a sample workspace';
    }
    report(error);
  }
});

document.addEventListener('input', event => {
  if (event.target.id === 'project-search') {
    state.query = event.target.value;
    renderProjectResults();
  }
  if (event.target.id === 'draft-body') {
    const preview = document.querySelector('#draft-preview');
    if (preview && state.editing) {
      preview.innerHTML = state.editing.kind === 'deck' ? slidePreview(event.target.value) : markdown(event.target.value);
    }
  }
});

document.addEventListener('change', async event => {
  const target = event.target;
  try {
    if (target.id === 'project-type') {
      state.type = target.value;
      renderProjectResults();
    } else if (target.id === 'project-status') {
      state.status = target.value;
      renderProjectResults();
    } else if (target.id === 'project-gaap') {
      state.gaap = target.value;
      renderProjectResults();
    } else if (target.id === 'project-sort') {
      renderProjectResults();
    } else if (target.id === 'memo-gaap') {
      document.querySelector('#standards-options').innerHTML = standardsCheckboxes(target.value);
    } else if (target.id === 'deck-type') {
      document.querySelector('#deck-fields').innerHTML = deckFields(target.value);
    } else if (target.id === 'deck-area') {
      document.querySelector('#proposal-fields').innerHTML = proposalFields(target.value);
    } else if (target.id === 'project-status-edit') {
      await send(`/projects/${state.project.project.id}`, { status: target.value }, 'PATCH');
      await reloadCurrent();
      toast('Project lifecycle status updated.');
    }
  } catch (error) {
    report(error);
  }
});

async function fileBase64(file) {
  return new Promise((resolveFile, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolveFile(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Cannot read file data.'));
    reader.readAsDataURL(file);
  });
}

document.addEventListener('submit', async event => {
  event.preventDefault();
  const form = event.target;
  if (state.busy) return;

  const data = new FormData(form);
  const values = Object.fromEntries(data);
  const errorNode = form.querySelector('.form-error');
  if (errorNode) errorNode.textContent = '';

  const submit = form.querySelector('[type="submit"]');
  const original = submit?.innerHTML;
  state.busy = true;
  if (submit) {
    submit.disabled = true;
    submit.textContent = 'Processing…';
  }

  const finishModal = () => {
    state.busy = false;
    closeModal();
  };

  try {
    if (form.id === 'auth-form') {
      setSession(await send(`/auth/${state.authTab}`, values));
      state.busy = false;
      await refreshWorkspace();
      location.hash = '#hub';
      renderHub();
      toast('Signed in successfully.');
    } else if (form.id === 'new-project-form') {
      const result = await send('/projects', values);
      finishModal();
      await refreshWorkspace();
      location.hash = `#project/${result.project.id}`;
      toast('New engagement initialized and added to Master Registry.');
    } else if (form.id === 'upload-resource-form') {
      const file = data.get('file');
      if (!file?.size || file.size > 10 * 1024 * 1024) throw new Error('Choose a file between 1 byte and 10 MB.');
      await send(`/projects/${state.project.project.id}/resources`, {
        name: file.name,
        kind: values.kind,
        content: await fileBase64(file)
      });
      finishModal();
      await reloadCurrent();
      toast('Evidence added to project repository.');
    } else if (form.id === 'new-memo-form' || form.id === 'new-deck-form') {
      const kind = form.id === 'new-memo-form' ? 'memo' : 'deck';
      const result = await send(`/projects/${state.project.project.id}/deliverables`, {
        kind,
        title: values.title,
        resourceIds: data.getAll('resourceIds'),
        params: { ...values, standards: data.getAll('standards') }
      });
      const projectId = state.project.project.id;
      finishModal();
      await reloadCurrent();
      await editDelivery(projectId, result.id);
      toast('Working outline created.');
    } else if (form.id === 'edit-delivery-form') {
      await send(`/projects/${state.editingProject}/deliverables/${state.editing.id}`, {
        ...values,
        updated: state.editing.updated
      }, 'PATCH');
      const updated = await api(`/projects/${state.editingProject}/deliverables/${state.editing.id}`);
      state.editing = updated.deliverable;
      state.busy = false;
      await reloadCurrent();
      toast('Draft saved. Export files updated.');
    } else if (form.id === 'add-member-form') {
      await send(`/projects/${state.project.project.id}/members`, values);
      finishModal();
      await reloadCurrent();
      toast('Teammate granted access to project.');
    } else if (form.id === 'delete-resource-form') {
      await api(`/projects/${state.project.project.id}/resources/${form.dataset.id}`, { method: 'DELETE' });
      finishModal();
      await reloadCurrent();
      toast('Resource removed.');
    } else if (form.id === 'remove-member-form') {
      await api(`/projects/${state.project.project.id}/members/${form.dataset.id}`, { method: 'DELETE' });
      finishModal();
      await reloadCurrent();
      toast('Project access revoked.');
    } else if (form.id === 'settings-form') {
      const result = await send('/settings', values, 'PATCH');
      state.workspace = result.settings;
      state.busy = false;
      await renderSettings();
      toast('Workspace governance settings saved.');
    } else if (form.id === 'invite-form') {
      const result = await send('/invitations', values);
      document.querySelector('#invite-result').innerHTML = `
        <div style="background:var(--brand-blue-tint);border:1px solid var(--brand-blue-container);border-radius:var(--radius-md);padding:18px;">
          <strong style="color:var(--brand-blue);display:block;margin-bottom:6px;">Invitation ready for ${e(result.email)}</strong>
          <p style="font-size:12px;color:var(--text-secondary);margin-bottom:12px;">Share this code securely with your teammate. It will expire in 7 days.</p>
          <div style="display:flex;gap:10px;align-items:center;">
            <input id="invitation-code" value="${e(result.code)}" readonly style="font-family:var(--font-mono);font-size:13px;flex:1;">
            ${button('Copy code', 'copy-invite', 'btn secondary small-btn')}
          </div>
          <small style="color:var(--text-muted);font-size:11px;display:block;margin-top:8px;">This code is displayed only once.</small>
        </div>
      `;
      toast('Invitation code generated.');
    } else if (form.dataset.form === 'team-update') {
      await send(`/team/${form.dataset.id}`, { role: values.role, active: data.has('active') }, 'PATCH');
      state.busy = false;
      await renderSettings();
      toast('Team access permissions updated.');
    }
  } catch (error) {
    if (errorNode?.isConnected) errorNode.textContent = error.message;
    else report(error);
  } finally {
    state.busy = false;
    if (submit?.isConnected) {
      submit.disabled = false;
      submit.innerHTML = original;
    }
  }
});

document.addEventListener('click', event => {
  if (!event.target.closest('.user-menu-wrap')) {
    document.querySelectorAll('.user-menu-dropdown').forEach(d => d.classList.add('hidden'));
    document.querySelectorAll('.user-menu-trigger').forEach(b => b.setAttribute('aria-expanded', 'false'));
  }
});

window.addEventListener('hashchange', () => {
  if (modalRoot.querySelector('dialog')) closeModal();
  route();
});

boot();
