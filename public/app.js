const app = document.querySelector('#app');
const modalRoot = document.querySelector('#modal-root');
const state = {
  user: null,
  csrf: '',
  workspace: {},
  standards: {},
  projects: [],
  deliverables: [],
  notifications: null,
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
  setupTab: 'general',
  busy: false
};

const e = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const initials = name => String(name || '').split(/\s+/).slice(0, 2).map(x => x[0]).join('').toUpperCase();
const types = ['Technical memo', 'GAAP transition', 'IPO advisory', 'Accounting advisory', 'Staff augmentation', 'Training'];
const frameworks = ['IFRS', 'Ind AS', 'US GAAP', 'Other'];
const designations = ['Intern', 'Associate', 'Senior Associate', 'Assistant Manager', 'Manager', 'Associate Director', 'Director'];

const engagementTypes = [
  'Accounting Advisory',
  'IPO Advisory',
  'Loan Staffing',
  'Training'
];

const engagementSubTypes = {
  'Accounting Advisory': ['Technical Memo', 'Other General Advisory'],
  'IPO Advisory': ['Readiness', 'PMO'],
  'Loan Staffing': ['General'],
  'Training': ['General']
};

const setupFrameworks = ['Ind AS', 'IFRS', 'IGAAP', 'USGAAP', 'Others'];

function normalizeEngagementType(t) {
  if (!t) return 'Accounting Advisory';
  if (t === 'Technical memo' || t === 'GAAP transition' || t === 'Accounting advisory') return 'Accounting Advisory';
  if (t === 'Staff augmentation') return 'Loan Staffing';
  if (engagementTypes.includes(t)) return t;
  return 'Accounting Advisory';
}

function normalizeFramework(f) {
  if (!f) return 'Ind AS';
  if (f === 'US GAAP') return 'USGAAP';
  if (f === 'Other') return 'Others';
  if (setupFrameworks.includes(f)) return f;
  return f;
}

const date = value => new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(value));
const formatDateTime = value => {
  if (!value) return '—';
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return String(value);
    return new Intl.DateTimeFormat('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    }).format(d);
  } catch {
    return String(value);
  }
};
const size = bytes => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

const paths = {
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  network: '<rect x="16" y="16" width="6" height="6" rx="1"/><rect x="2" y="16" width="6" height="6" rx="1"/><rect x="9" y="2" width="6" height="6" rx="1"/><path d="M5 16v-3a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v3M12 12V8"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>',
  dashboard: '<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>',
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
  chevronDown: '<path d="m6 9 6 6 6-6"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>'
};

const icon = (name, cls = '') => `<svg class="icon ${cls}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.file}</svg>`;
const button = (text, action, cls = 'btn primary', more = '') => `<button type="button" class="${cls}" data-action="${action}" ${more}>${text}</button>`;
const options = (items, selected) => items.map(v => `<option value="${e(v)}" ${v === selected ? 'selected' : ''}>${e(v)}</option>`).join('');
const badge = status => `<span class="badge ${status === 'Active' || status === 'Approved' || status === 'Final' ? 'status-active' : status === 'In review' || status === 'On hold' ? 'status-review' : status === 'Completed' ? 'status-neutral' : 'status-draft'}"><span class="badge-dot"></span>${e(status)}</span>`;
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
  document.querySelectorAll('.auth-theme-toggle').forEach(el => {
    const label = theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
    el.setAttribute('aria-label', label);
    el.setAttribute('title', label);
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

function getEngagementManagerName() {
  if (state.projects && state.projects.length > 0) {
    const p = state.projects.find(proj => proj.owner_name && proj.owner_name !== state.user?.name);
    if (p && p.owner_name) return p.owner_name;
    if (state.projects[0].owner_name) return state.projects[0].owner_name;
  }
  return 'Sarah Jenkins';
}

function getDefaultNotifications() {
  const mgr = getEngagementManagerName();
  return [
    {
      id: 'notif-advisory-invite',
      category: 'Advisory Desk',
      tone: 'tone-blue',
      icon: 'briefcase',
      title: 'Engagement Invitation',
      message: `Advisory Desk: Your Engagement Manager ${mgr} has invited you to an engagement. Please open Advisory Desk to view`,
      time: '12m ago',
      read: false,
      targetAction: 'nav-desk',
      targetHash: '#desk'
    },
    {
      id: 'notif-kb-ipo',
      category: 'Knowledge Base',
      tone: 'tone-red',
      icon: 'book',
      title: 'Resource Update',
      message: 'Knowledge Base: New additions to the IPO Knowledge Base Resources',
      time: '1h ago',
      read: false,
      targetAction: 'nav-knowledge',
      targetHash: '#knowledge-base'
    }
  ];
}

function getNotifications() {
  if (!state.notifications) {
    const key = `advisory_notifications_${state.user?.email || 'guest'}`;
    const saved = localStorage.getItem(key);
    if (saved) {
      try {
        state.notifications = JSON.parse(saved);
      } catch {
        state.notifications = null;
      }
    }
    if (!state.notifications || !Array.isArray(state.notifications) || state.notifications.length === 0) {
      state.notifications = getDefaultNotifications();
      saveNotifications();
    }
  }
  return state.notifications;
}

function saveNotifications() {
  const key = `advisory_notifications_${state.user?.email || 'guest'}`;
  try {
    localStorage.setItem(key, JSON.stringify(state.notifications || []));
  } catch {}
}

function getUnreadNotificationCount() {
  return getNotifications().filter(n => !n.read).length;
}

function markAllNotificationsAsRead() {
  const notifs = getNotifications();
  let changed = false;
  notifs.forEach(n => {
    if (!n.read) {
      n.read = true;
      changed = true;
    }
  });
  if (changed) {
    saveNotifications();
    updateNotificationsUI();
    toast('All notifications marked as read.');
  }
}

function markNotificationAsRead(id) {
  const notifs = getNotifications();
  const item = notifs.find(n => n.id === id);
  if (item && !item.read) {
    item.read = true;
    saveNotifications();
    updateNotificationsUI();
    toast('Notification marked as read.');
  }
}

function openNotification(id) {
  const notifs = getNotifications();
  const item = notifs.find(n => n.id === id);
  if (!item) return;

  if (!item.read) {
    item.read = true;
    saveNotifications();
    updateNotificationsUI();
  }

  document.querySelectorAll('.notification-menu-dropdown').forEach(d => d.classList.add('hidden'));
  document.querySelectorAll('.notification-trigger').forEach(b => b.setAttribute('aria-expanded', 'false'));

  if (item.targetAction === 'nav-desk' || item.targetHash === '#desk') {
    if (location.hash === '#desk') {
      renderDesk();
    } else {
      location.hash = '#desk';
    }
    toast('Opened Advisory Desk Workbench.');
  } else if (item.targetAction === 'nav-knowledge' || item.targetHash === '#knowledge-base') {
    openKnowledgeBase();
    toast('Opened Knowledge Base resources.');
  }
}

function resetNotifications() {
  state.notifications = getDefaultNotifications();
  saveNotifications();
  updateNotificationsUI();
  toast('Sample notifications restored.');
}

function updateNotificationsUI() {
  const wraps = Array.from(document.querySelectorAll('.notification-menu-wrap'));
  wraps.forEach(wrap => {
    const wasOpen = !wrap.querySelector('.notification-menu-dropdown')?.classList.contains('hidden');
    const temp = document.createElement('div');
    temp.innerHTML = notificationMenuDropdown();
    const newWrap = temp.firstElementChild;
    if (wasOpen && newWrap) {
      newWrap.querySelector('.notification-menu-dropdown')?.classList.remove('hidden');
      newWrap.querySelector('.notification-trigger')?.setAttribute('aria-expanded', 'true');
    }
    wrap.replaceWith(newWrap);
  });
}

function notificationMenuDropdown() {
  if (!state.user) return '';
  const notifs = getNotifications();
  const unreadCount = notifs.filter(n => !n.read).length;

  return `
    <div class="notification-menu-wrap">
      <button type="button" class="notification-trigger ${unreadCount > 0 ? 'has-unread' : 'is-empty'}" data-action="toggle-notifications" aria-haspopup="true" aria-expanded="false" title="Notifications (${unreadCount} unread)">
        <span class="notification-icon-box">
          ${icon('bell')}
        </span>
        ${unreadCount > 0 ? `<span class="notification-badge-pill">${unreadCount}</span>` : ''}
      </button>

      <div class="notification-menu-dropdown hidden" id="notification-menu-dropdown" role="dialog" aria-label="Notifications panel">
        <div class="notification-header">
          <div class="notification-header-row">
            <div class="notification-header-title-box">
              <strong class="notification-title">Notifications</strong>
              ${unreadCount > 0 
                ? `<span class="notification-pill-tag tone-red">${unreadCount} New</span>` 
                : `<span class="notification-pill-tag tone-neutral">All read</span>`}
            </div>
            ${unreadCount > 0 ? `
              <button type="button" class="notification-action-link-btn" data-action="mark-all-notifications-read" title="Mark all notifications as read">
                ${icon('check')} Mark all read
              </button>
            ` : ''}
          </div>
        </div>

        <div class="notification-list" role="region" aria-label="Notifications list">
          ${notifs.length === 0 ? `
            <div class="notification-empty">
              <span class="notification-empty-icon">${icon('bell')}</span>
              <p><strong>No notifications</strong></p>
              <span>You are all caught up on engagements and resources.</span>
            </div>
          ` : notifs.map(n => `
            <div class="notification-item ${n.read ? 'read' : 'unread'}" data-action="open-notification" data-notif-id="${e(n.id)}" role="button" tabindex="0">
              <div class="notification-item-icon-box ${n.tone || 'tone-blue'}">
                ${icon(n.icon || 'bell')}
              </div>
              <div class="notification-item-content">
                <div class="notification-item-meta">
                  <span class="notification-cat-tag ${n.tone || 'tone-blue'}">${e(n.category)}</span>
                  <span class="notification-time">${e(n.time)}</span>
                  ${!n.read ? `
                    <button type="button" class="notification-item-check-btn" data-action="mark-notification-read" data-notif-id="${e(n.id)}" title="Mark as read">
                      ${icon('check')}
                    </button>
                  ` : ''}
                </div>
                <div class="notification-item-message">${e(n.message)}</div>
                ${n.targetHash ? `
                  <div class="notification-item-footer">
                    <span class="notification-target-hint">
                      ${n.targetHash === '#desk' ? 'Open Advisory Desk' : 'Open Knowledge Base'} ${icon('arrowRight')}
                    </span>
                  </div>
                ` : ''}
              </div>
            </div>
          `).join('')}
        </div>

        <div class="notification-footer">
          <span class="notification-footer-label">Advisory Desk · Notifications</span>
          <button type="button" class="notification-reset-btn" data-action="reset-notifications" title="Restore sample notifications">Reset</button>
        </div>
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
  const isDark = state.theme === 'dark';

  app.innerHTML = `
    <main class="auth-page">
      <section class="auth-card" aria-label="${signup ? 'Create account' : 'Sign in'}">
        <header class="auth-header">
          <a class="brand" href="#auth">
            <span class="brand-mark">a<span>↗</span></span>
            <div>
              <span>advisory desk</span>
              <span class="alpha">ALPHA</span>
            </div>
          </a>
          <button type="button" class="icon-btn auth-theme-toggle" data-action="toggle-theme" aria-label="${isDark ? 'Switch to light mode' : 'Switch to dark mode'}" title="${isDark ? 'Switch to light mode' : 'Switch to dark mode'}">
            <span class="theme-icon-indicator">${isDark ? icon('sun') : icon('moon')}</span>
          </button>
        </header>

        <div class="auth-title-block">
          <span class="auth-kicker">${first ? 'Workspace setup' : 'Private advisory workspace'}</span>
          <h1>${signup ? (first ? 'Initialize workspace' : 'Create account') : 'Welcome back'}</h1>
          <p>
          ${signup ? 'Create your account using existing firm credentials or select SSO (Coming Soon).' : 'Sign in to access your assigned client projects and deliverables.'}
          </p>
        </div>

        <div class="auth-tabs" role="tablist" aria-label="Authentication mode">
          <button type="button" role="tab" aria-selected="${!signup}" data-action="auth-tab" data-tab="login" class="${!signup ? 'active' : ''}">Sign in</button>
          <button type="button" role="tab" aria-selected="${signup}" data-action="auth-tab" data-tab="signup" class="${signup ? 'active' : ''}">Create account</button>
        </div>

        <form id="auth-form" class="form-stack">
          ${signup ? `
            <label class="auth-field">Full name
              <input name="name" autocomplete="name" placeholder="Your name (e.g. Alex Morgan)" maxlength="100" required autofocus>
            </label>
          ` : ''}
          <label class="auth-field">Work email
            <input type="email" name="email" autocomplete="email" placeholder="you@yourfirm.com" required maxlength="254" ${!signup ? 'autofocus' : ''}>
          </label>
          <label class="auth-field">Password
            <div class="password-field">
              <input type="password" name="password" autocomplete="${signup ? 'new-password' : 'current-password'}" placeholder="${signup ? 'At least 12 characters' : 'Enter your password'}" ${signup ? 'minlength="12"' : ''} maxlength="128" required>
              <button type="button" class="icon-btn" data-action="toggle-password" aria-label="Show password">${icon('eye')}</button>
            </div>
          </label>
          
          ${signup && !first ? `
            <label class="auth-field">Team invitation code <span class="optional">Optional</span>
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
          <button class="btn primary auth-submit" type="submit">
            ${signup ? (first ? 'Initialize workspace' : 'Create account') : 'Sign in'} ${icon('arrow')}
          </button>
        </form>

        ${state.authStatus.allowDemo ? `
          <div class="auth-divider">
            <span>or explore instant demo</span>
          </div>
          ${button('Explore sample workspace ' + icon('arrow'), 'demo', 'btn secondary auth-submit')}
          <p class="demo-note">Pre-seeded with 6 accounting advisory engagements.</p>
        ` : ''}

        <footer class="auth-footer">
          <span>Local-first · Zero egress</span>
          <span>Advisory Desk v0.1 Alpha</span>
        </footer>
      </section>
    </main>
  `;
}

/* ==========================================================================
   REQUIRED USER PREFERENCES / ONBOARDING
   ========================================================================== */

function renderPreferences() {
  const u = state.user;
  const hasPicture = Boolean(u.profilePicture);

  app.innerHTML = `
    <main class="preferences-page">
      <section class="preferences-card">
        <header class="preferences-header">
          <a class="brand" href="#preferences">
            <span class="brand-mark">a<span>↗</span></span>
            <div>
              <span>advisory desk</span>
              <span class="alpha">ALPHA</span>
            </div>
          </a>
          ${button(icon('logout'), 'logout', 'icon-btn', 'aria-label="Sign out" title="Sign out"')}
        </header>

        <div class="preferences-title">
          <span class="auth-kicker">${u.profileComplete ? 'User settings' : 'Complete setup'}</span>
          <h1>User settings and preferences</h1>
          <p>Confirm your firm profile before opening the workspace.</p>
        </div>

        <form id="preferences-form" class="preferences-form form-stack">
          <div class="preferences-grid">
            <label>Name
              <input name="name" value="${e(u.name)}" autocomplete="name" required maxlength="100">
            </label>
            <label>Email ID
              <input name="email" value="${e(u.email)}" autocomplete="email" readonly>
            </label>
            <label>Password
              <input value="Configured during account setup" readonly>
            </label>
            <label>Employee ID
              <input name="employeeId" value="${e(u.employeeId)}" autocomplete="off" required maxlength="40" placeholder="Firm employee ID">
            </label>
            <label>Designation
              <select name="designation" required>
                <option value="">Select designation</option>
                ${options(designations, u.designation)}
              </select>
            </label>
            <label>Profile picture <span class="optional">Optional</span>
              <input name="profilePicture" type="file" accept="image/png,image/jpeg,image/webp">
            </label>
          </div>

          <div class="profile-picture-preview">
            <span class="avatar large">${hasPicture ? `<img src="${e(u.profilePicture)}" alt="">` : e(initials(u.name))}</span>
            <div>
              <strong>${hasPicture ? 'Profile picture added' : 'No profile picture selected'}</strong>
              <span>PNG, JPG, or WebP. Maximum 750 KB.</span>
            </div>
          </div>

          <section class="usage-policy-box">
            <div>
              <h2>Usage policy</h2>
              <p>Use Advisory Desk only for assigned firm workstreams. Keep client material within approved projects, do not upload unrelated personal data, and follow your firm's confidentiality and review standards.</p>
            </div>
            <label class="checkbox-row">
              <input type="checkbox" name="usagePolicy" value="accepted" ${u.usagePolicyAccepted ? 'checked' : ''} required>
              <span>I have read and accept the usage policy.</span>
            </label>
          </section>

          <div class="form-error" role="alert"></div>
          <div class="preferences-actions">
            <button type="submit" class="btn primary" data-preferences-submit disabled>
              ${u.profileComplete ? 'Save preferences' : 'Read and accept usage policy'} ${icon('check')}
            </button>
          </div>
        </form>
      </section>
    </main>
  `;

  syncPreferencesSubmit(document.querySelector('#preferences-form'));
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
        <div class="splash-topbar-left">
          <a class="brand" href="#hub">
            <span class="brand-mark">a<span>↗</span></span>
            <div>
              <span>advisory desk</span>
              <span class="alpha">ALPHA</span>
            </div>
          </a>
        </div>

        <div class="splash-top-right">
          <span class="net-indicator"><i></i> 127.0.0.1 Connected</span>
          ${state.user ? `
            <span class="topbar-divider"></span>
            ${notificationMenuDropdown()}
            <span class="topbar-divider"></span>
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
  const isProject = Boolean(state.page === 'project' && state.project && state.project.project);
  const projectData = isProject ? state.project : null;
  const p = projectData?.project;

  const nav = (page, text, symbol, extra = '') => {
    const isActive = (state.page === page) || (page === 'project-setup' && (state.page === 'projects' || state.page === 'project-setup'));
    return `<a href="#${page}" class="nav-link ${isActive ? 'active' : ''}">${icon(symbol)}<span>${text}</span>${extra}</a>`;
  };

  const projectTabNav = (tab, text, symbol, count) => {
    const isTabActive = (tab === 'setup')
      ? (state.projectTab === 'setup' || state.projectTab === 'team')
      : (state.projectTab === tab);
    return `
      <button type="button" class="nav-link ${isTabActive ? 'active' : ''}" data-action="project-tab" data-tab="${tab}">
        ${icon(symbol)}
        <span>${text}</span>
        ${count !== undefined && count > 0 ? `<span class="nav-count">${count}</span>` : ''}
      </button>
    `;
  };

  const sidebarSwitch = isProject ? `
    <div class="workspace-switch project-workspace-switch" title="${e(p.name)}">
      <span class="workspace-avatar">${e(initials(p.name || p.client))}</span>
      <div style="min-width:0;overflow:hidden;">
        <strong style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;">${e(p.name)}</strong>
        <span style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:block;">${e(p.client)}</span>
      </div>
      ${icon('lock')}
    </div>
  ` : `
    <div class="workspace-switch">
      <span class="workspace-avatar">${e(initials(state.workspace.workspaceName || 'Advisory Team'))}</span>
      <div>
        <strong>${e(state.workspace.workspaceName || 'Advisory Team')}</strong>
        <span>${state.user.demo ? 'Sample workspace' : 'Team workspace'}</span>
      </div>
      ${icon('lock')}
    </div>
  `;

  const finalDeliverablesCount = isProject ? (projectData.deliverables?.filter(d => Boolean(d.is_final))?.length || 0) : 0;
  const sidebarNav = isProject ? `
    <div class="nav-label">WORKSPACE</div>
    <nav aria-label="Project navigation">
      ${projectTabNav('overview', 'Dashboard', 'dashboard')}
      ${projectTabNav('resources', 'Project Resources', 'folder', projectData.resources?.length)}
      ${projectTabNav('deliverables', 'Final Deliverables', 'slides', finalDeliverablesCount)}
      ${projectTabNav('setup', 'Engagement Setup', 'hierarchy', projectData.members?.length)}
    </nav>
  ` : `
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
  `;

  const sidebarToolkit = isProject ? `
    <div class="nav-label tools-label">TOOLKIT</div>
    <button type="button" class="toolkit-item toolkit-btn" data-action="new-memo" title="Create technical memo">
      ${icon('file')}<span>Memo Builder</span><span class="toolkit-dot tone-blue"></span>
    </button>
    <button type="button" class="toolkit-item toolkit-btn" data-action="new-deck" title="Create slide deck">
      ${icon('slides')}<span>Slide Decks</span><span class="toolkit-dot tone-red"></span>
    </button>
    <div class="toolkit-item muted" title="Financial Statement sanity checks (Coming soon)">
      ${icon('chart')}<span>FS Helper</span><span class="coming-soon-badge" style="margin-left:auto;font-size:8px;padding:2px 4px;">SOON</span>
    </div>
  ` : `
    <div class="nav-label tools-label">TOOLKIT</div>
    <button type="button" class="toolkit-item toolkit-btn" data-action="quick-memo" title="Create technical memo">
      ${icon('file')}<span>Memo Builder</span><span class="toolkit-dot tone-blue"></span>
    </button>
    <button type="button" class="toolkit-item toolkit-btn" data-action="quick-deck" title="Create slide deck">
      ${icon('slides')}<span>Slide Decks</span><span class="toolkit-dot tone-red"></span>
    </button>
    <div class="toolkit-item muted" title="Financial Statement sanity checks (Coming soon)">
      ${icon('chart')}<span>FS Helper</span><span class="coming-soon-badge" style="margin-left:auto;font-size:8px;padding:2px 4px;">SOON</span>
    </div>
  `;

  const kbExternalLink = `
    <a href="#knowledge-base" target="_blank" rel="noopener noreferrer" class="nav-link kb-external-link" data-action="open-knowledge-tab" title="Open Knowledge Base in a new tab">
      ${icon('book')}
      <span>Knowledge Base</span>
      <span class="kb-tab-pill" style="margin-left:auto;display:inline-flex;align-items:center;gap:4px;">
        <span class="coming-soon-badge" style="font-size:8px;padding:2px 5px;">SOON</span>
        <span style="font-size:12px;opacity:0.7;font-weight:600;">↗</span>
      </span>
    </a>
  `;

  const sidebarBottom = `
    <div class="sidebar-bottom">
      ${isProject ? kbExternalLink : ''}
      ${state.user.role === 'super_user' && !state.user.demo && !isProject ? nav('settings', 'Settings', 'settings') : ''}
    </div>
  `;

  const breadcrumbTarget = isProject ? 'project-setup' : state.page;

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

        ${sidebarSwitch}
        ${sidebarNav}
        ${sidebarToolkit}
        ${sidebarBottom}
      </aside>

      <div class="main-wrap">
        <header class="topbar">
          <div class="topbar-left">
            ${button(icon('menu'), 'mobile-menu', 'icon-btn mobile-menu', 'aria-label="Toggle navigation"')}
            <div class="breadcrumb">
              <a href="#hub">Hub</a>
              ${icon('chevron')}
              <a href="#${breadcrumbTarget}">${e(title)}</a>
              ${trail ? icon('chevron') + `<span class="breadcrumb-current">${e(trail)}</span>` : ''}
            </div>
          </div>
          <div class="topbar-right">
            <a href="#hub" class="btn secondary small-btn">${icon('hub')} Hub</a>
            <span class="topbar-divider"></span>
            ${notificationMenuDropdown()}
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
          ${notificationMenuDropdown()}
          <span class="topbar-divider"></span>
          ${userMenuDropdown()}
        </div>
      </header>

      <main class="workbench-container">
        <section class="page-heading">
          <div>
            <h1>Workbench<span class="heading-dot">.</span></h1>
            <p>Active advisory engagements you are assigned to. Select an engagement to enter its workstation.</p>
          </div>
          <div class="button-row">
            <button type="button" class="btn primary" data-action="new-project">
              ${icon('plus')} Create Engagement
            </button>
          </div>
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
  const finalDeliverables = (state.deliverables || []).filter(d => Boolean(d.is_final));
  shell(`
    <section class="page-heading">
      <div>
        <h1>Final Deliverables<span class="heading-dot">.</span></h1>
        <p>The finalized technical memos and presentation decks across your projects.</p>
      </div>
      <span class="matrix-parameter-pill">${icon('file')} ${finalDeliverables.length} final deliverable${finalDeliverables.length === 1 ? '' : 's'}</span>
    </section>
    <div class="inline-note" style="margin-bottom:20px;">
      ${icon('info')}
      <span>Deliverables are added here when explicitly moved to Final Deliverables from their engagement workstream.</span>
    </div>
    ${finalDeliverables.length ? deliveryRows(finalDeliverables) : empty('No final deliverables yet.', 'Working outlines and drafts remain in their project workstreams until explicitly moved to Final Deliverables.')}
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
          <span class="resource-icon">${icon(r.kind === 'template' ? 'book' : (r.kind === 'export' ? 'download' : 'file'))}</span>
          <div class="resource-name">
            <strong>${e(r.name)}</strong>
            <small>${r.kind === 'template' ? 'Company template' : (r.kind === 'draft' ? 'Workstream draft' : (r.kind === 'export' ? 'Workstream export' : 'Reference'))} <span>·</span> ${size(r.size)} <span>·</span> ${date(r.created)}</small>
          </div>
          <a class="icon-btn" href="/api/projects/${p.id}/resources/${r.id}" aria-label="Download ${e(r.name)}" title="Download">${icon('download')}</a>
          ${!compact && (r.created_by === state.user.id || p.owner_id === state.user.id) ? button(icon('trash'), 'delete-resource', 'icon-btn subtle-danger', `data-id="${r.id}" data-name="${e(r.name)}" aria-label="Remove ${e(r.name)}"`) : ''}
        </div>
      `).join('')}
    </div>
  `;
}

function renderEngagementSetup(isModal = false) {
  const data = state.project;
  const p = data.project;
  const owner = p.owner_id === state.user.id;
  const currentTab = state.setupTab || 'general';

  const currentType = normalizeEngagementType(p.type);
  const subTypeList = engagementSubTypes[currentType] || ['General'];
  const currentSubType = (p.sub_type && subTypeList.includes(p.sub_type)) ? p.sub_type : subTypeList[0];
  const currentGaap = normalizeFramework(p.gaap);

  let tabBody = '';

  if (currentTab === 'general') {
    tabBody = `
      <section class="panel setup-panel">
        <div class="panel-heading" style="margin-bottom:20px;">
          <div>
            <h3 style="font-size:16px;color:var(--text-primary);margin:0;">Project General</h3>
            <p style="font-size:12.5px;color:var(--text-muted);margin:3px 0 0;">Basic engagement identity, client details, and administrative metadata.</p>
          </div>
        </div>

        <form id="project-general-form" class="setup-form">
          <div class="form-grid">
            <label>
              <span>Project Name <strong style="color:var(--brand-red);">*</strong></span>
              <input type="text" name="name" value="${e(p.name)}" maxlength="120" required ${!owner ? 'disabled' : ''}>
              <small class="field-hint">Official engagement title.</small>
            </label>

            <label>
              <span>Client Name <strong style="color:var(--brand-red);">*</strong></span>
              <input type="text" name="client" value="${e(p.client)}" maxlength="120" required ${!owner ? 'disabled' : ''}>
              <small class="field-hint">Client legal entity or confidential alias.</small>
            </label>

            <label>
              <span>Project Type <strong style="color:var(--brand-red);">*</strong></span>
              <select name="projectType" ${!owner ? 'disabled' : ''}>
                <option value="Live" ${(p.project_type || 'Live') === 'Live' ? 'selected' : ''}>Live</option>
                <option value="Test" ${p.project_type === 'Test' ? 'selected' : ''}>Test</option>
              </select>
              <small class="field-hint">Live client engagement or test scenario.</small>
            </label>

            <label>
              <span>Created Date &amp; Time</span>
              <input type="text" value="${e(formatDateTime(p.created))}" readonly class="readonly-input">
              <small class="field-hint">Engagement creation timestamp (Read-only).</small>
            </label>

            <label>
              <span>Created By</span>
              <input type="text" value="${e(p.owner_name || state.user?.name || 'Project Owner')}" readonly class="readonly-input">
              <small class="field-hint">Engagement creator and manager (Read-only).</small>
            </label>
          </div>

          ${owner ? `
            <div class="setup-form-actions">
              <button type="submit" class="btn primary small-btn">Save Changes</button>
            </div>
          ` : ''}
        </form>
      </section>
    `;
  } else if (currentTab === 'parameters') {
    tabBody = `
      <section class="panel setup-panel">
        <div class="panel-heading" style="margin-bottom:20px;">
          <div>
            <h3 style="font-size:16px;color:var(--text-primary);margin:0;">Engagement Parameters</h3>
            <p style="font-size:12.5px;color:var(--text-muted);margin:3px 0 0;">Technical parameters, accounting framework, and reporting deadlines.</p>
          </div>
        </div>

        <form id="engagement-params-form" class="setup-form">
          <div class="form-grid">
            <label>
              <span>Client Name</span>
              <input type="text" value="${e(p.client)}" readonly class="readonly-input" title="Pulled from Project General">
              <small class="field-hint">Pulled from Project General (Read-only).</small>
            </label>

            <label>
              <span>Client ID</span>
              <input type="text" name="clientId" value="${e(p.client_id || '')}" placeholder="e.g. CLI-84920 (Optional)" maxlength="50" ${!owner ? 'disabled' : ''}>
              <small class="field-hint">Optional for now (will become mandatory with CRM integration).</small>
            </label>

            <label>
              <span>Engagement ID</span>
              <input type="text" name="engagementId" value="${e(p.engagement_id || '')}" placeholder="e.g. ENG-2026-001 (Optional)" maxlength="50" ${!owner ? 'disabled' : ''}>
              <small class="field-hint">Optional internal billing or engagement tracking code.</small>
            </label>

            <label>
              <span>Year End Date <strong style="color:var(--brand-red);">*</strong></span>
              <input type="date" name="fy" value="${e(p.fy ? p.fy.slice(0, 10) : '')}" required ${!owner ? 'disabled' : ''}>
              <small class="field-hint">Reporting financial year end date.</small>
            </label>

            <label>
              <span>Estimated Completion Date</span>
              <input type="date" name="estimatedCompletion" value="${e(p.estimated_completion ? p.estimated_completion.slice(0, 10) : '')}" ${!owner ? 'disabled' : ''}>
              <small class="field-hint">Target sign-off or deliverable completion date.</small>
            </label>

            <label>
              <span>Engagement Type <strong style="color:var(--brand-red);">*</strong></span>
              <select name="type" id="engagement-type-select" ${!owner ? 'disabled' : ''}>
                ${engagementTypes.map(t => `<option value="${e(t)}" ${t === currentType ? 'selected' : ''}>${e(t)}</option>`).join('')}
              </select>
              <small class="field-hint">Core advisory engagement service line.</small>
            </label>

            <label>
              <span>Engagement Sub-Type <strong style="color:var(--brand-red);">*</strong></span>
              <select name="subType" id="engagement-sub-type-select" ${!owner ? 'disabled' : ''}>
                ${subTypeList.map(st => `<option value="${e(st)}" ${st === currentSubType ? 'selected' : ''}>${e(st)}</option>`).join('')}
              </select>
              <small class="field-hint">Specialized focus area for this engagement.</small>
            </label>

            <label>
              <span>Accounting Framework <strong style="color:var(--brand-red);">*</strong></span>
              <select name="gaap" ${!owner ? 'disabled' : ''}>
                ${setupFrameworks.map(f => `<option value="${e(f)}" ${f === currentGaap ? 'selected' : ''}>${e(f)}</option>`).join('')}
              </select>
              <small class="field-hint">Primary reporting standard used for technical analysis.</small>
            </label>
          </div>

          ${owner ? `
            <div class="setup-form-actions">
              <button type="submit" class="btn primary small-btn">Save Parameters</button>
            </div>
          ` : ''}
        </form>
      </section>
    `;
  } else if (currentTab === 'team') {
    tabBody = `
      <section class="panel setup-panel">
        <div class="panel-heading" style="margin-bottom:20px;display:flex;justify-content:space-between;align-items:center;">
          <div>
            <h3 style="font-size:16px;color:var(--text-primary);margin:0;">Assigned Engagement Team <span class="count-bubble">${data.members.length}</span></h3>
            <p style="font-size:12.5px;color:var(--text-muted);margin:3px 0 0;">Manage engagement teammates, designations, and governance roles.</p>
          </div>
          ${owner ? button(icon('plus') + ' Add teammate', 'add-member', 'btn primary small-btn') : ''}
        </div>

        <div class="team-table-wrap">
          <table class="team-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email ID</th>
                <th>Designation</th>
                <th>Role</th>
                ${owner ? '<th style="text-align:right;">Actions</th>' : ''}
              </tr>
            </thead>
            <tbody>
              ${data.members.map(m => {
                const isSelf = m.id === state.user.id;
                const isOwner = m.id === p.owner_id;
                const currentRole = m.role || (isOwner ? 'Engagement Manager' : 'Team Member');
                const memberDesignation = m.designation || (isOwner ? 'Manager' : 'Senior Associate');
                return `
                  <tr>
                    <td class="team-member-name-cell">
                      <div style="display:flex;align-items:center;gap:10px;">
                        <span class="avatar small">${e(initials(m.name))}</span>
                        <div>
                          <strong style="display:block;font-size:13.5px;color:var(--text-primary);">${e(m.name)} ${isSelf ? '<span class="you-pill">(you)</span>' : ''}</strong>
                        </div>
                      </div>
                    </td>
                    <td class="team-member-email-cell" style="font-family:var(--font-mono);font-size:12.5px;color:var(--text-muted);">${e(m.email)}</td>
                    <td class="team-member-designation-cell">
                      <span class="designation-pill">${e(memberDesignation)}</span>
                    </td>
                    <td class="team-member-role-cell">
                      ${owner ? `
                        <select class="member-role-select" data-member-id="${m.id}" data-action="change-member-role" aria-label="Role for ${e(m.name)}" ${isOwner ? 'disabled title="Project Owner is Engagement Manager"' : ''}>
                          <option value="Engagement Manager" ${currentRole === 'Engagement Manager' ? 'selected' : ''}>Engagement Manager</option>
                          <option value="Reviewer" ${currentRole === 'Reviewer' ? 'selected' : ''}>Reviewer</option>
                          <option value="Team Member" ${currentRole === 'Team Member' ? 'selected' : ''}>Team Member</option>
                        </select>
                      ` : `
                        <span class="role-pill role-${currentRole.toLowerCase().replace(/\s+/g, '-')}">${e(currentRole)}</span>
                      `}
                    </td>
                    ${owner ? `
                      <td style="text-align:right;">
                        ${!isOwner ? button(icon('trash'), 'remove-member', 'icon-btn subtle-danger', `data-id="${m.id}" data-name="${e(m.name)}" aria-label="Remove ${e(m.name)}" title="Remove teammate"`) : '<span style="font-size:11.5px;color:var(--text-muted);">Owner</span>'}
                      </td>
                    ` : ''}
                  </tr>
                `;
              }).join('')}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  return `
    <div class="engagement-setup-container">
      <div class="setup-tabs" role="tablist" aria-label="Engagement setup sections">
        <button type="button" class="setup-tab-btn ${currentTab === 'general' ? 'active' : ''}" role="tab" aria-selected="${currentTab === 'general'}" data-action="setup-tab" data-tab="general">
          ${icon('folder')}
          <span>Project General</span>
        </button>
        <button type="button" class="setup-tab-btn ${currentTab === 'parameters' ? 'active' : ''}" role="tab" aria-selected="${currentTab === 'parameters'}" data-action="setup-tab" data-tab="parameters">
          ${icon('chart')}
          <span>Engagement Parameters</span>
        </button>
        <button type="button" class="setup-tab-btn ${currentTab === 'team' ? 'active' : ''}" role="tab" aria-selected="${currentTab === 'team'}" data-action="setup-tab" data-tab="team">
          ${icon('users')}
          <span>Team Setup</span>
          <span class="tab-count-badge">${data.members.length}</span>
        </button>
      </div>

      <div class="setup-tab-body">
        ${tabBody}
      </div>

      ${isModal ? `
        <div class="modal-actions" style="margin-top:24px;display:flex;justify-content:flex-end;gap:10px;">
          ${button('Done', 'complete-engagement-setup', 'btn primary')}
        </div>
      ` : ''}
    </div>
  `;
}

function openEngagementSetupModal() {
  const content = renderEngagementSetup(true);
  showModal(
    'Engagement Setup',
    'Configure project parameters, accounting framework, and engagement team access.',
    content,
    'landscape-modal'
  );
}

function renderProject() {
  const data = state.project;
  const p = data.project;
  const owner = p.owner_id === state.user.id;
  const activeTab = (state.projectTab === 'team') ? 'setup' : (state.projectTab || 'overview');
  const tabs = [
    ['overview', 'Dashboard'],
    ['resources', 'Project Resources', data.resources.length],
    ['deliverables', 'Final Deliverables', data.deliverables.length],
    ['setup', 'Engagement Setup', data.members.length],
    ['activity', 'Activity']
  ];

  const isSetupPending = (
    !state.user.demo &&
    localStorage.getItem(`advisory_setup_completed_${p.id}`) !== 'true' &&
    (
      localStorage.getItem(`advisory_setup_pending_${p.id}`) === 'true' ||
      (data.resources.length === 0 && data.deliverables.length === 0 && !p.description)
    )
  );

  const setupBanner = (isSetupPending && activeTab === 'overview') ? `
    <div class="engagement-setup-banner" role="region" aria-label="Engagement setup notice">
      <div class="setup-banner-left">
        <span class="setup-banner-icon">${icon('shield')}</span>
        <div class="setup-banner-content">
          <strong>Please set up the Engagement before continuing</strong>
          <span>Configure engagement team access, accounting parameters, and project brief.</span>
        </div>
      </div>
      <div class="setup-banner-actions">
        ${button('Set up Engagement ' + icon('arrow'), 'open-engagement-setup-modal', 'btn primary small-btn setup-banner-btn')}
      </div>
    </div>
  ` : '';

  let content = '';
  if (activeTab === 'overview') {
    const workstreamsTableBody = (!data.deliverables || data.deliverables.length === 0)
      ? `
        <div class="empty-list-banner quiet-empty-row" data-action="open-workstream-modal" role="button" tabindex="0">
          <span class="empty-list-banner-icon quiet-empty-icon-tile">${icon('hierarchy')}</span>
          <span class="empty-list-banner-text">No workstreams created. Select <strong>New</strong> to start</span>
        </div>
      `
      : `
        <div class="workstream-list">
          ${data.deliverables.map(d => {
            const creator = data.members?.find(m => m.id === d.created_by)?.name || (d.created_by === state.user.id ? state.user.name : 'Team member');
            const isFinal = Boolean(d.is_final);
            return `
              <div class="workstream-row quiet-data-row workstream-cols" data-action="edit-delivery" data-project="${p.id}" data-id="${d.id}" role="button" tabindex="0">
                <div class="workstream-col-name">
                  <span class="quiet-type-icon ${d.kind === 'memo' ? 'tone-blue' : 'tone-red'}">${icon(d.kind === 'memo' ? 'file' : 'slides')}</span>
                  <div class="quiet-name-group">
                    <strong class="workstream-title">${e(d.title)}</strong>
                    <small class="workstream-meta">${d.kind === 'memo' ? 'Technical memo' : 'Slide deck'}</small>
                  </div>
                </div>
                <div class="workstream-col-type">
                  <span>${d.kind === 'memo' ? 'Technical memo' : 'Slide deck'}</span>
                </div>
                <div class="workstream-col-status">
                  ${isFinal ? badge('Final') : badge(d.status)}
                </div>
                <div class="workstream-col-author">
                  <span>${e(creator)}</span>
                </div>
                <div class="workstream-col-time">
                  <span class="font-mono text-muted">${formatDateTime(d.created)}</span>
                </div>
                <div class="workstream-col-action">
                  ${!isFinal ? `
                    <button type="button" class="btn outline small-btn move-final-action-btn" data-action="promote-to-final" data-project="${p.id}" data-id="${d.id}" title="Move to Final Deliverables">
                      ${icon('check')} Move to Final
                    </button>
                  ` : `
                    <span class="final-chip">${icon('check')} Final</span>
                  `}
                  <button type="button" class="quiet-ghost-action" data-action="edit-delivery" data-project="${p.id}" data-id="${d.id}" aria-label="Open ${e(d.title)}">
                    ${icon('arrow')}
                  </button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;

    const workstreamsHtml = `
      <div class="quiet-table-wrap">
        <div class="quiet-table-header workstream-cols">
          <span>WORKSTREAM</span>
          <span>TYPE</span>
          <span>STATUS</span>
          <span>CREATED BY</span>
          <span>CREATED TIME</span>
          <span></span>
        </div>
        ${workstreamsTableBody}
      </div>
    `;

    const documentsTableBody = (!data.resources || data.resources.length === 0)
      ? `
        <div class="empty-list-banner quiet-empty-row">
          <span class="empty-list-banner-icon quiet-empty-icon-tile">${icon('file')}</span>
          <span class="empty-list-banner-text">No documents added</span>
          <button type="button" class="btn outline small-btn quiet-upload-btn" data-action="upload-resource">
            ${icon('upload')} Upload
          </button>
        </div>
      `
      : `
        <div class="resource-list">
          ${data.resources.map(r => {
            const creator = data.members?.find(m => m.id === r.created_by)?.name || (r.created_by === state.user.id ? state.user.name : 'Team member');
            return `
              <div class="resource-row quiet-data-row document-cols">
                <div class="document-col-name">
                  <span class="quiet-type-icon tone-blue">${icon(r.kind === 'template' ? 'book' : (r.kind === 'export' ? 'download' : 'file'))}</span>
                  <div class="quiet-name-group">
                    <strong class="resource-title">${e(r.name)}</strong>
                    <small class="resource-meta">${r.kind === 'template' ? 'Company template' : (r.kind === 'draft' ? 'Workstream draft' : (r.kind === 'export' ? 'Workstream export' : 'Reference'))}</small>
                  </div>
                </div>
                <div class="document-col-size">
                  <code>${size(r.size)}</code>
                </div>
                <div class="document-col-author">
                  <span>${e(creator)}</span>
                </div>
                <div class="document-col-time">
                  <span class="font-mono text-muted">${formatDateTime(r.created)}</span>
                </div>
                <div class="document-col-action">
                  <a class="quiet-ghost-action" href="/api/projects/${p.id}/resources/${r.id}" aria-label="Download ${e(r.name)}" title="Download">${icon('download')}</a>
                  ${(r.created_by === state.user.id || p.owner_id === state.user.id) ? button(icon('trash'), 'delete-resource', 'quiet-ghost-action subtle-danger', `data-id="${r.id}" data-name="${e(r.name)}" aria-label="Remove ${e(r.name)}" title="Remove document"`) : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;

    const documentsHtml = `
      <div class="quiet-table-wrap">
        <div class="quiet-table-header document-cols">
          <span>DOCUMENT</span>
          <span>SIZE</span>
          <span>ADDED BY</span>
          <span>CREATED TIME</span>
          <span></span>
        </div>
        ${documentsTableBody}
      </div>
    `;

    content = `
      <div class="dashboard-sections">
        <!-- 1 — Engagement Workstreams -->
        <section class="dashboard-section" aria-labelledby="workstreams-heading">
          <div class="section-heading standalone-section-heading with-action">
            <div class="quiet-card-title-group">
              <span class="quiet-section-icon tone-blue">${icon('hierarchy')}</span>
              <h2 id="workstreams-heading">Engagement Workstreams</h2>
              <span class="quiet-count-chip count-bubble">${data.deliverables.length}</span>
            </div>
            ${button(icon('plus') + ' New', 'open-workstream-modal', 'btn primary small-btn quiet-header-btn')}
          </div>
          <div class="quiet-section-card table-container-card">
            ${workstreamsHtml}
          </div>
        </section>

        <!-- 2 — Engagement Documents -->
        <section class="dashboard-section" aria-labelledby="documents-heading">
          <div class="section-heading standalone-section-heading with-action">
            <div class="quiet-card-title-group">
              <span class="quiet-section-icon tone-blue">${icon('folder')}</span>
              <h2 id="documents-heading">Engagement Documents</h2>
              <span class="quiet-count-chip count-bubble">${data.resources.length}</span>
            </div>
            <button type="button" class="btn outline small-btn quiet-header-btn" data-action="upload-resource">
              ${icon('upload')} Upload
            </button>
          </div>
          <div class="quiet-section-card table-container-card">
            ${documentsHtml}
          </div>
        </section>

        <!-- 3 — Project Brief -->
        <section class="dashboard-section" aria-labelledby="brief-heading">
          <div class="section-heading standalone-section-heading with-action">
            <div class="quiet-card-title-group">
              <span class="quiet-section-icon tone-blue">${icon('file')}</span>
              <h2 id="brief-heading">Project Brief</h2>
            </div>
            ${owner ? button(icon('edit') + ' ' + (p.description ? 'Edit brief' : 'Add brief'), 'open-engagement-setup-modal', 'quiet-ghost-btn', 'title="Edit project brief and parameters"') : ''}
          </div>
          <div class="panel project-brief-panel">
            <div class="quiet-card-body">
              <p class="project-description">${e(p.description || 'No brief added yet. Use memo and deck briefs to capture engagement context.')}</p>
              <div class="quiet-detail-divider"></div>
              <div class="project-facts quiet-detail-grid">
                <div>
                  <span class="quiet-grid-label">CLIENT / ALIAS</span>
                  <strong class="quiet-grid-value">${e(p.client)}</strong>
                </div>
                <div>
                  <span class="quiet-grid-label">FINANCIAL YEAR END</span>
                  <strong class="quiet-grid-value font-mono">${date(p.fy)}</strong>
                </div>
                <div>
                  <span class="quiet-grid-label">ENGAGEMENT TYPE</span>
                  <strong class="quiet-grid-value">${e(p.type)}</strong>
                </div>
                <div>
                  <span class="quiet-grid-label">ACCOUNTING FRAMEWORK</span>
                  <div style="margin-top:3px;"><span class="gaap-badge quiet-gaap-chip">${e(p.gaap)}</span></div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Quiet Ledger Footer (Page 5) -->
        <footer class="quiet-ledger-footer">
          <span class="quiet-footer-privacy">${icon('lock')} This engagement is private; access is limited to added team.</span>
          <span class="quiet-footer-brand">Advisory Desk</span>
        </footer>
      </div>
    `;
  } else if (activeTab === 'resources') {
    content = `
      <div class="section-heading">
        <div>
          <h2>Project Resources & Evidence</h2>
          <p>Confidential source documents and memo templates scoped to this project.</p>
        </div>
        ${button(icon('upload') + ' Upload resource', 'upload-resource', 'btn primary small-btn')}
      </div>
      <section class="panel resource-panel">${resourceRows(data.resources)}</section>
      <p class="privacy-footnote" style="font-size:11.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;margin-top:14px;">
        ${icon('lock')} Files are stored in the local SQLite database and strictly scoped to this project. Maximum 10 MB per file.
      </p>
    `;
  } else if (activeTab === 'deliverables') {
    const finalDeliverables = (data.deliverables || []).filter(d => Boolean(d.is_final));
    content = `
      <div class="section-heading">
        <div>
          <h2>Final Deliverables</h2>
          <p>Approved client deliverables and finalized memorandum/presentation documents.</p>
        </div>
      </div>
      ${finalDeliverables.length ? deliveryRows(finalDeliverables, p.id) : empty('No final deliverables yet.', 'Workstreams in draft or review stay in Engagement Workstreams & Documents. Select "Move to Final Deliverables" on a completed workstream to publish it here.')}
    `;
  } else if (activeTab === 'setup') {
    content = `
      <div class="section-heading">
        <div>
          <h2>Engagement Setup & Governance</h2>
          <p>Configure project parameters, accounting framework, and engagement team access.</p>
        </div>
      </div>
      ${renderEngagementSetup(false)}
    `;
  } else {
    content = `
      <div class="section-heading">
        <div>
          <h2>Project Activity & Audit Trail</h2>
          <p>Recent project actions and update history.</p>
        </div>
      </div>
      <section class="panel">${activityList(data.activity)}</section>
    `;
  }

  shell(`
    <section class="page-heading project-heading">
      <div class="project-heading-main">
        <div class="quiet-eyebrow">ENGAGEMENT OVERVIEW</div>
        <h1 class="project-heading-title">${e(p.name)}</h1>
        <p class="project-heading-meta">${e(p.client)} <span class="middot">·</span> FY end ${date(p.fy)} <span class="middot">·</span> <span class="gaap-badge quiet-gaap-chip">${e(p.gaap)}</span></p>
      </div>
      <div class="project-heading-status">
        <span class="status-control-label">Status</span>
        <div class="status-select-wrap ${p.status === 'Active' ? 'status-active' : ''}">
          <span class="status-life-dot"></span>
          ${owner ? `
            <select id="project-status-edit" aria-label="Status">
              ${options(['Active', 'On hold', 'Completed'], p.status)}
            </select>
          ` : `<span class="status-static-value">${e(p.status)}</span>`}
        </div>
      </div>
    </section>

    ${setupBanner}

    <div class="project-tab-content">${content}</div>
  `, 'Engagement Manager', p.name);
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
        <div class="landscape-modal-grid">
          <div class="form-stack">
            <label>Project name
              <input name="name" placeholder="e.g. Revenue Recognition Assessment" required maxlength="120" autofocus>
            </label>
            <label>Client name or confidential alias
              <input name="client" placeholder="e.g. Project Horizon / Acme Corp" required maxlength="120">
            </label>
            <div class="form-grid">
              <label>Engagement type
                <select name="type">${options(types, 'Technical memo')}</select>
              </label>
              <label>Accounting framework
                <select name="gaap">${options(frameworks, 'IFRS')}</select>
              </label>
            </div>
            <label>Financial year end
              <input type="date" name="fy" value="2027-03-31" required>
            </label>
          </div>

          <div class="form-stack">
            <label style="display:flex;flex-direction:column;flex:1;">Scope & context <span class="optional">Optional</span>
              <textarea name="description" placeholder="Transaction background, accounting question, key stakeholder expectations…" maxlength="4000" style="min-height:162px;flex:1;resize:vertical;"></textarea>
            </label>
            <div class="inline-note">
              ${icon('lock')}
              <span>You will be designated as Project Owner. You can invite teammates from the project's Team tab.</span>
            </div>
          </div>
        </div>
        ${modalActions('Create project setup')}
      </form>
    `,
    'landscape-modal'
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

function openWorkstreamModal() {
  showModal(
    'Engagement Toolkits',
    'Select a deliverable toolkit to develop for this engagement.',
    `
      <div class="toolkit-modal-grid">
        <article class="toolkit-modal-card" data-action="new-memo" role="button" tabindex="0">
          <div class="toolkit-card-top">
            <span class="quiet-modal-tile module-icon tone-blue">${icon('file')}</span>
          </div>
          <h3>Memo Builder</h3>
          <p>Frame the question, select applicable accounting standards, cite project evidence, and build a working outline.</p>
          <div class="toolkit-card-action">
            <span class="text-link">Start a memo ${icon('arrow')}</span>
          </div>
        </article>

        <article class="toolkit-modal-card" data-action="new-deck" role="button" tabindex="0">
          <div class="toolkit-card-top">
            <span class="quiet-modal-tile module-icon tone-red">${icon('slides')}</span>
          </div>
          <h3>Slide Decks</h3>
          <p>Bring structure to a proposal, training session, or technical discussion with native PowerPoint export.</p>
          <div class="toolkit-card-action">
            <span class="text-link">Start a deck ${icon('arrow')}</span>
          </div>
        </article>

        <article class="toolkit-modal-card future-module">
          <div class="toolkit-card-top" style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0;">
            <span class="quiet-modal-tile module-icon tone-muted" style="margin-bottom:0;">${icon('chart')}</span>
            <span class="coming-soon-badge">Soon</span>
          </div>
          <h3>FS Helper</h3>
          <p>Casting, cross-referencing, and tracing. Future chapter for the advisory workspace.</p>
          <div class="toolkit-card-action">
            <span class="soon-pill">Planned for Phase 2</span>
          </div>
        </article>
      </div>
    `,
    'toolkit-dialog'
  );
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
            <button type="button" class="btn secondary small-btn" data-action="save-export-to-documents" data-project="${project}" data-id="${id}" title="Save ${d.kind === 'memo' ? '.docx' : '.pptx'} export directly to Engagement Documents">
              ${icon('upload')} Save ${d.kind === 'memo' ? 'Word (.docx)' : 'Deck (.pptx)'} to Documents
            </button>
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
          <span style="font-size:11.5px;color:var(--text-muted);margin-right:auto;">Drafts & exports stay in Engagement Documents until moved to Final Deliverables.</span>
          ${button('Close', 'close-modal', 'btn secondary')}
          <button type="submit" class="btn secondary">Save draft ${icon('check')}</button>
          ${!d.is_final ? `
            <button type="button" class="btn primary move-to-final-btn" data-action="promote-to-final" data-project="${project}" data-id="${id}">
              ${icon('check')} Move to Final Deliverables
            </button>
          ` : `
            <span class="final-chip" style="margin-left:8px;">${icon('check')} In Final Deliverables</span>
          `}
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
          <label>Role in Engagement
            <select name="role">
              <option value="Team Member" selected>Team Member</option>
              <option value="Reviewer">Reviewer</option>
              <option value="Engagement Manager">Engagement Manager</option>
            </select>
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

  if (!state.user.demo && !state.user.profileComplete && hash !== 'preferences') {
    location.hash = '#preferences';
    renderPreferences();
    return;
  }

  const projectMatch = /^project\/([\w-]+)$/.exec(hash);

  try {
    if (hash === 'preferences') {
      state.page = 'preferences';
      renderPreferences();
    } else if (projectMatch) {
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
  else if (state.page === 'preferences') renderPreferences();
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
    if (target.getAttribute('target') === '_blank') {
      event.preventDefault();
      window.open(location.origin + location.pathname + target.getAttribute('href'), '_blank', 'noopener,noreferrer');
      return;
    }
    event.preventDefault();
    location.hash = target.getAttribute('href');
    return;
  }

  if (state.busy && !['toggle-password', 'close-modal'].includes(action)) return;

  try {
    if (action === 'open-knowledge-tab') {
      window.open(location.origin + location.pathname + '#knowledge-base', '_blank', 'noopener,noreferrer');
      return;
    } else if (action === 'nav-desk') {
      location.hash = '#desk';
    } else if (action === 'nav-knowledge') {
      openKnowledgeBase();
    } else if (action === 'nav-setup') {
      location.hash = '#project-setup';
    } else if (action === 'toggle-user-menu') {
      const dropdown = target.closest('.user-menu-wrap')?.querySelector('.user-menu-dropdown');
      if (dropdown) {
        const isHidden = dropdown.classList.contains('hidden');
        document.querySelectorAll('.user-menu-dropdown, .notification-menu-dropdown').forEach(d => d.classList.add('hidden'));
        document.querySelectorAll('.user-menu-trigger, .notification-trigger').forEach(b => b.setAttribute('aria-expanded', 'false'));
        if (isHidden) {
          dropdown.classList.remove('hidden');
          target.closest('.user-menu-trigger')?.setAttribute('aria-expanded', 'true');
        }
      }
    } else if (action === 'toggle-notifications') {
      const dropdown = target.closest('.notification-menu-wrap')?.querySelector('.notification-menu-dropdown');
      if (dropdown) {
        const isHidden = dropdown.classList.contains('hidden');
        document.querySelectorAll('.user-menu-dropdown, .notification-menu-dropdown').forEach(d => d.classList.add('hidden'));
        document.querySelectorAll('.user-menu-trigger, .notification-trigger').forEach(b => b.setAttribute('aria-expanded', 'false'));
        if (isHidden) {
          dropdown.classList.remove('hidden');
          target.closest('.notification-trigger')?.setAttribute('aria-expanded', 'true');
        }
      }
    } else if (action === 'mark-all-notifications-read') {
      markAllNotificationsAsRead();
    } else if (action === 'mark-notification-read') {
      markNotificationAsRead(target.dataset.notifId);
    } else if (action === 'open-notification') {
      openNotification(target.dataset.notifId);
    } else if (action === 'reset-notifications') {
      resetNotifications();
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
      state.notifications = null;
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
    } else if (action === 'open-workstream-modal') {
      openWorkstreamModal();
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
    } else if (action === 'setup-tab') {
      state.setupTab = target.dataset.tab;
      const modalDialog = modalRoot.querySelector('dialog');
      if (modalDialog && modalDialog.open) {
        const container = modalDialog.querySelector('.engagement-setup-container');
        if (container) {
          container.outerHTML = renderEngagementSetup(true);
        } else {
          openEngagementSetupModal();
        }
      } else {
        renderProject();
      }
    } else if (action === 'open-engagement-setup-modal') {
      openEngagementSetupModal();
    } else if (action === 'complete-engagement-setup') {
      if (state.project?.project?.id) {
        try {
          localStorage.removeItem(`advisory_setup_pending_${state.project.project.id}`);
          localStorage.setItem(`advisory_setup_completed_${state.project.project.id}`, 'true');
        } catch {}
      }
      closeModal();
      renderProject();
      toast('Engagement setup saved.');
    } else if (action === 'edit-delivery') {
      await editDelivery(target.dataset.project, target.dataset.id);
    } else if (action === 'promote-to-final') {
      event.stopPropagation();
      const projectId = target.dataset.project || state.editingProject || state.project?.project?.id;
      const deliverableId = target.dataset.id || state.editing?.id;
      if (!projectId || !deliverableId) return;

      const form = document.querySelector('#edit-delivery-form');
      if (form) {
        const formData = new FormData(form);
        const formValues = Object.fromEntries(formData);
        await send(`/projects/${projectId}/deliverables/${deliverableId}`, {
          ...formValues,
          updated: state.editing?.updated
        }, 'PATCH');
      }

      await send(`/projects/${projectId}/deliverables/${deliverableId}/finalize`, {});
      closeModal();
      await reloadCurrent();
      toast('Moved to Final Deliverables.');
    } else if (action === 'save-export-to-documents') {
      event.stopPropagation();
      const projectId = target.dataset.project || state.editingProject || state.project?.project?.id;
      const deliverableId = target.dataset.id || state.editing?.id;
      if (!projectId || !deliverableId) return;

      const form = document.querySelector('#edit-delivery-form');
      if (form) {
        const formData = new FormData(form);
        const formValues = Object.fromEntries(formData);
        await send(`/projects/${projectId}/deliverables/${deliverableId}`, {
          ...formValues,
          updated: state.editing?.updated
        }, 'PATCH');
        const updated = await api(`/projects/${projectId}/deliverables/${deliverableId}`);
        state.editing = updated.deliverable;
      }

      const res = await send(`/projects/${projectId}/deliverables/${deliverableId}/save-to-documents`, {});
      await reloadCurrent();
      toast(`Export saved to Engagement Documents: ${res.name}`);
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
    } else if (target.id === 'engagement-type-select' || target.name === 'type') {
      const form = target.closest('form');
      const subSelect = form?.querySelector('[name="subType"]');
      if (subSelect) {
        const subList = engagementSubTypes[target.value] || ['General'];
        subSelect.innerHTML = subList.map(s => `<option value="${e(s)}">${e(s)}</option>`).join('');
      }
    } else if (target.dataset.action === 'change-member-role') {
      const memberId = target.dataset.memberId;
      const role = target.value;
      await send(`/projects/${state.project.project.id}/members/${memberId}`, { role }, 'PATCH');
      const m = state.project.members.find(x => x.id === memberId);
      if (m) m.role = role;
      toast(`Updated team member role to ${role}.`);
    }
  } catch (error) {
    report(error);
  }
});

document.addEventListener('input', event => {
  const form = event.target.closest?.('#preferences-form');
  if (form) syncPreferencesSubmit(form);
});

document.addEventListener('change', event => {
  const form = event.target.closest?.('#preferences-form');
  if (!form) return;
  if (event.target.name === 'profilePicture') {
    const file = event.target.files?.[0];
    const preview = form.querySelector('.profile-picture-preview');
    if (file && preview) {
      preview.querySelector('strong').textContent = file.name;
      preview.querySelector('span:last-child').textContent = 'Selected profile picture. It will be saved after policy acceptance.';
    }
  }
  syncPreferencesSubmit(form);
});

async function fileBase64(file) {
  return new Promise((resolveFile, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolveFile(reader.result.split(',')[1]);
    reader.onerror = () => reject(new Error('Cannot read file data.'));
    reader.readAsDataURL(file);
  });
}

function syncPreferencesSubmit(form) {
  if (!form) return;
  const submit = form.querySelector('[data-preferences-submit]');
  if (!submit) return;
  submit.disabled = !form.checkValidity();
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
      if (state.authTab === 'signup' || (!state.user.demo && !state.user.profileComplete)) {
        location.hash = '#preferences';
        renderPreferences();
        toast(state.authTab === 'signup' ? 'Account created. Complete your preferences to continue.' : 'Complete your preferences to continue.');
      } else {
        await refreshWorkspace();
        location.hash = '#hub';
        renderHub();
        toast('Signed in successfully.');
      }
    } else if (form.id === 'preferences-form') {
      const file = data.get('profilePicture');
      if (file?.size > 750 * 1024) throw new Error('Profile picture must be 750 KB or smaller.');
      const result = await send('/me/preferences', {
        name: values.name,
        employeeId: values.employeeId,
        designation: values.designation,
        acceptUsagePolicy: data.get('usagePolicy') === 'accepted',
        ...(file?.size ? { profilePicture: `data:${file.type};base64,${await fileBase64(file)}` } : {})
      }, 'PATCH');
      state.user = result.user;
      state.busy = false;
      await refreshWorkspace();
      location.hash = '#hub';
      renderHub();
      toast('Preferences saved. Welcome to your workspace.');
    } else if (form.id === 'new-project-form') {
      const result = await send('/projects', values);
      try {
        localStorage.setItem(`advisory_setup_pending_${result.project.id}`, 'true');
      } catch {}
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
      toast('Draft saved to Engagement Documents.');
    } else if (form.id === 'project-general-form') {
      await send(`/projects/${state.project.project.id}`, {
        name: values.name,
        client: values.client,
        projectType: values.projectType
      }, 'PATCH');
      state.project.project.name = values.name;
      state.project.project.client = values.client;
      state.project.project.project_type = values.projectType;
      state.busy = false;
      await reloadCurrent();
      if (modalRoot.querySelector('dialog')?.open) {
        const wrap = modalRoot.querySelector('.engagement-setup-container');
        if (wrap) wrap.outerHTML = renderEngagementSetup(true);
      }
      toast('Project General settings updated.');
    } else if (form.id === 'engagement-params-form') {
      await send(`/projects/${state.project.project.id}`, {
        clientId: values.clientId,
        engagementId: values.engagementId,
        fy: values.fy,
        estimatedCompletion: values.estimatedCompletion,
        type: values.type,
        subType: values.subType,
        gaap: values.gaap
      }, 'PATCH');
      state.project.project.client_id = values.clientId;
      state.project.project.engagement_id = values.engagementId;
      state.project.project.fy = values.fy;
      state.project.project.estimated_completion = values.estimatedCompletion;
      state.project.project.type = values.type;
      state.project.project.sub_type = values.subType;
      state.project.project.gaap = values.gaap;
      state.busy = false;
      await reloadCurrent();
      if (modalRoot.querySelector('dialog')?.open) {
        const wrap = modalRoot.querySelector('.engagement-setup-container');
        if (wrap) wrap.outerHTML = renderEngagementSetup(true);
      }
      toast('Engagement Parameters updated.');
    } else if (form.id === 'add-member-form') {
      await send(`/projects/${state.project.project.id}/members`, values);
      finishModal();
      state.setupTab = 'team';
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
  if (!event.target.closest('.notification-menu-wrap')) {
    document.querySelectorAll('.notification-menu-dropdown').forEach(d => d.classList.add('hidden'));
    document.querySelectorAll('.notification-trigger').forEach(b => b.setAttribute('aria-expanded', 'false'));
  }
});

document.addEventListener('keydown', event => {
  if (event.key === 'Escape') {
    document.querySelectorAll('.user-menu-dropdown, .notification-menu-dropdown').forEach(d => d.classList.add('hidden'));
    document.querySelectorAll('.user-menu-trigger, .notification-trigger').forEach(b => b.setAttribute('aria-expanded', 'false'));
  }
  if ((event.key === 'Enter' || event.key === ' ') && event.target?.getAttribute('role') === 'button' && event.target?.dataset?.action) {
    if (event.target.tagName !== 'BUTTON' && event.target.tagName !== 'INPUT' && event.target.tagName !== 'TEXTAREA') {
      event.preventDefault();
      event.target.click();
    }
  }
});

window.addEventListener('hashchange', () => {
  if (modalRoot.querySelector('dialog')) closeModal();
  document.querySelectorAll('.user-menu-dropdown, .notification-menu-dropdown').forEach(d => d.classList.add('hidden'));
  document.querySelectorAll('.user-menu-trigger, .notification-trigger').forEach(b => b.setAttribute('aria-expanded', 'false'));
  route();
});

boot();
