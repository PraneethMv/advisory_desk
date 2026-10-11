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

function toolkitFramework(f) {
  const framework = ({ USGAAP: 'US GAAP', Others: 'Other', IGAAP: 'Other' })[f] || f;
  return frameworks.includes(framework) ? framework : 'IFRS';
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

const workstreamMenu = document.createElement('div');
workstreamMenu.id = 'workstream-actions-menu';
workstreamMenu.className = 'workstream-actions-menu';
workstreamMenu.setAttribute('role', 'menu');
workstreamMenu.hidden = true;
document.body.append(workstreamMenu);
let workstreamMenuTrigger = null;

function closeWorkstreamMenu(restoreFocus = false) {
  const trigger = workstreamMenuTrigger;
  workstreamMenu.hidden = true;
  trigger?.setAttribute('aria-expanded', 'false');
  workstreamMenuTrigger = null;
  if (restoreFocus && trigger?.isConnected) trigger.focus();
}

function toggleWorkstreamMenu(trigger) {
  const wasOpen = workstreamMenuTrigger === trigger && !workstreamMenu.hidden;
  closeWorkstreamMenu();
  if (wasOpen) return;
  const project = state.project?.project;
  const delivery = state.project?.deliverables?.find(d => d.id === trigger.dataset.id);
  if (!project || !delivery) return;
  const attrs = `data-project="${e(project.id)}" data-id="${e(delivery.id)}"`;
  workstreamMenu.innerHTML = `
    <button type="button" role="menuitem" class="workstream-menu-item" data-action="edit-delivery" ${attrs}>${icon('arrow')} Open toolkit</button>
    ${delivery.status !== 'Setup' ? `
      <button type="button" role="menuitem" class="workstream-menu-item" data-action="add-to-documents" ${attrs}>${icon('upload')} Add to Engagement Documents</button>
    ` : ''}
    ${delivery.created_by === state.user.id || project.owner_id === state.user.id ? `
      <button type="button" role="menuitem" class="workstream-menu-item destructive" data-action="delete-workstream" ${attrs} data-name="${e(delivery.title)}">${icon('trash')} Delete</button>
    ` : ''}
  `;
  workstreamMenu.setAttribute('aria-label', `Actions for ${delivery.title}`);
  workstreamMenuTrigger = trigger;
  workstreamMenu.hidden = false;
  trigger.setAttribute('aria-expanded', 'true');
  const anchor = trigger.getBoundingClientRect();
  const menu = workstreamMenu.getBoundingClientRect();
  const left = Math.max(8, Math.min(anchor.right - menu.width, window.innerWidth - menu.width - 8));
  const below = anchor.bottom + 6;
  const top = below + menu.height <= window.innerHeight - 8 ? below : Math.max(8, anchor.top - menu.height - 6);
  workstreamMenu.style.left = `${left}px`;
  workstreamMenu.style.top = `${top}px`;
  workstreamMenu.querySelector('[role="menuitem"]')?.focus();
}
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
  const [projects, finals] = await Promise.all([api('/projects'), api('/final-deliverables')]);
  state.projects = projects.projects;
  state.finalDocuments = finals.documents;
}

function setSession(data) {
  state.user = data.user;
  state.csrf = data.csrf;
  state.workspace = data.workspace;
  state.standards = data.standards;
  state.memoGuide = data.memoGuide || [];
  state.sectionStatuses = data.sectionStatuses || ['Not started', 'Drafting', 'Ready for review'];
  state.completionChecklist = data.completionChecklist || [];
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
  const isProject = Boolean(['project', 'workstream'].includes(state.page) && state.project && state.project.project);
  const projectData = isProject ? state.project : null;
  const p = projectData?.project;

  const nav = (page, text, symbol, extra = '') => {
    const isActive = (state.page === page) || (page === 'project-setup' && (state.page === 'projects' || state.page === 'project-setup'));
    return `<a href="#${page}" class="nav-link ${isActive ? 'active' : ''}">${icon(symbol)}<span>${text}</span>${extra}</a>`;
  };

  const projectTabNav = (tab, text, symbol, count) => {
    const isTabActive = state.page !== 'workstream' && ((tab === 'setup')
      ? (state.projectTab === 'setup' || state.projectTab === 'team')
      : (state.projectTab === tab));
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

  const finalDeliverablesCount = isProject ? (projectData.resources?.filter(r => r.is_final)?.length || 0) : 0;
  const sidebarNav = isProject ? `
    <div class="nav-label">WORKSPACE</div>
    <nav aria-label="Project navigation">
      ${projectTabNav('overview', 'Dashboard', 'dashboard')}
      ${projectTabNav('resources', 'Project Resources', 'folder', projectData.resources?.filter(r => !r.is_final).length)}
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
    <div class="app-shell ${isProject ? 'engagement-shell' : ''} ${state.page === 'workstream' ? 'workstream-shell' : ''}">
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

function renderDeliverables() {
  const documents = state.finalDocuments || [];
  shell(`
    <section class="page-heading">
      <div>
        <h1>Final Deliverables<span class="heading-dot">.</span></h1>
        <p>Documents moved to Final Deliverables across your projects.</p>
      </div>
      <span class="matrix-parameter-pill">${icon('file')} ${documents.length} final deliverable${documents.length === 1 ? '' : 's'}</span>
    </section>
    <div class="inline-note" style="margin-bottom:20px;">
      ${icon('info')}
      <span>Every document starts in its engagement's Engagement Documents. Select documents there and move them here when they are final.</span>
    </div>
    ${documents.length ? finalDocumentRows(documents) : empty('No final deliverables yet.', 'Select documents in an engagement\'s Engagement Documents and move them to Final Deliverables.')}
  `, 'Deliverables');
}

const documentKind = r => r.kind === 'template' ? 'Company template' : r.kind === 'draft' ? 'Workstream draft' : r.kind === 'export' ? 'Workstream export' : 'Reference';
const documentIcon = r => icon(r.kind === 'template' ? 'book' : r.kind === 'export' ? 'download' : 'file');

// Final documents; inside a project each row can go back to Engagement Documents.
function finalDocumentRows(documents, project = null) {
  return `
    <div class="quiet-section-card table-container-card">
      <div class="quiet-table-wrap">
        <div class="quiet-table-header document-cols">
          <span>DOCUMENT</span>
          <span class="document-header-size">SIZE</span>
          <span class="document-header-author">${project ? 'TYPE' : 'PROJECT'}</span>
          <span class="document-header-time">ADDED</span>
          <span></span>
        </div>
        <div class="resource-list document-table-list">
          ${documents.map(r => {
            const projectId = project?.id || r.project_id;
            return `
              <div class="resource-row quiet-data-row document-cols">
                <div class="document-col-name">
                  <span class="quiet-type-icon tone-blue">${documentIcon(r)}</span>
                  <div class="quiet-name-group">
                    <strong class="resource-title">${e(r.name)}</strong>
                    <small class="resource-meta">${documentKind(r)}</small>
                  </div>
                </div>
                <div class="document-col-size"><code>${size(r.size)}</code></div>
                <div class="document-col-author">${project ? `<span>${documentKind(r)}</span>` : `<a href="#project/${projectId}" class="final-document-project">${e(r.project_name)}</a>`}</div>
                <div class="document-col-time"><span class="font-mono text-muted">${formatDateTime(r.created)}</span></div>
                <div class="document-col-action">
                  <a class="quiet-ghost-action" href="/api/projects/${projectId}/resources/${r.id}" aria-label="Download ${e(r.name)}" title="Download">${icon('download')}</a>
                  ${project ? button(icon('arrow', 'icon-flip'), 'return-to-documents', 'quiet-ghost-action', `data-id="${r.id}" aria-label="Return ${e(r.name)} to Engagement Documents" title="Return to Engagement Documents"`) : ''}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    </div>
  `;
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
          <span class="resource-icon">${documentIcon(r)}</span>
          <div class="resource-name">
            <strong>${e(r.name)}</strong>
            <small>${documentKind(r)} <span>·</span> ${size(r.size)} <span>·</span> ${date(r.created)}</small>
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
  // Documents live in Engagement Documents until they are moved to Final Deliverables.
  const documents = data.resources.filter(r => !r.is_final);
  const finalDocuments = data.resources.filter(r => r.is_final);
  const tabs = [
    ['overview', 'Dashboard'],
    ['resources', 'Project Resources', documents.length],
    ['deliverables', 'Final Deliverables', finalDocuments.length],
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
                  ${badge(d.status)}
                </div>
                <div class="workstream-col-author">
                  <span>${e(creator)}</span>
                </div>
                <div class="workstream-col-time">
                  <span class="font-mono text-muted">${formatDateTime(d.created)}</span>
                </div>
                <div class="workstream-col-action">
                  <button type="button" class="quiet-ghost-action workstream-menu-trigger" data-action="toggle-workstream-menu" data-id="${d.id}" aria-label="Actions for ${e(d.title)}" aria-haspopup="menu" aria-expanded="false" aria-controls="workstream-actions-menu" title="Workstream actions">
                    ${icon('more')}
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
          <span class="workstream-header-type">TYPE</span>
          <span>STATUS</span>
          <span class="workstream-header-author">CREATED BY</span>
          <span class="workstream-header-time">CREATED TIME</span>
          <span></span>
        </div>
        ${workstreamsTableBody}
      </div>
    `;

    const documentsTableBody = !documents.length
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
        <div class="resource-list document-table-list">
          ${documents.map(r => {
            const creator = data.members?.find(m => m.id === r.created_by)?.name || (r.created_by === state.user.id ? state.user.name : 'Team member');
            return `
              <div class="resource-row quiet-data-row document-cols">
                <div class="document-col-name">
                  <input type="checkbox" class="document-select" value="${r.id}" aria-label="Select ${e(r.name)}">
                  <span class="quiet-type-icon tone-blue">${documentIcon(r)}</span>
                  <div class="quiet-name-group">
                    <strong class="resource-title">${e(r.name)}</strong>
                    <small class="resource-meta">${documentKind(r)}</small>
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
          <span class="document-header-size">SIZE</span>
          <span class="document-header-author">ADDED BY</span>
          <span class="document-header-time">CREATED TIME</span>
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
              <span class="quiet-count-chip count-bubble">${documents.length}</span>
            </div>
            <div class="button-row">
              <button type="button" class="btn primary small-btn quiet-header-btn" data-action="move-to-final" id="move-to-final-btn" hidden>
                ${icon('check')} Move to Final Deliverables <span id="move-to-final-count"></span>
              </button>
              <button type="button" class="btn outline small-btn quiet-header-btn" data-action="upload-resource">
                ${icon('upload')} Upload
              </button>
            </div>
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
      <section class="panel resource-panel">${resourceRows(documents)}</section>
      <p class="privacy-footnote" style="font-size:11.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px;margin-top:14px;">
        ${icon('lock')} Files are stored in the local SQLite database and strictly scoped to this project. Maximum 10 MB per file.
      </p>
    `;
  } else if (activeTab === 'deliverables') {
    content = `
      <div class="section-heading">
        <div>
          <h2>Final Deliverables</h2>
          <p>Documents moved here from Engagement Documents. Return a document to make it a working document again.</p>
        </div>
      </div>
      ${finalDocuments.length ? finalDocumentRows(finalDocuments, p) : empty('No final deliverables yet.', 'Select documents in Engagement Documents on the dashboard and choose "Move to Final Deliverables".')}
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
    'Select a toolkit, then set up its engagement workstream.',
    `
      <div class="toolkit-modal-grid">
        <article class="toolkit-modal-card" data-action="new-memo" role="button" tabindex="0">
          <div class="toolkit-card-top">
            <span class="quiet-modal-tile module-icon tone-blue">${icon('file')}</span>
          </div>
          <h3>Memo Builder</h3>
          <p>Frame the question, select applicable accounting standards, cite project evidence, and build a working outline.</p>
          <div class="toolkit-card-action">
            <span class="text-link">Set up workstream ${icon('arrow')}</span>
          </div>
        </article>

        <article class="toolkit-modal-card" data-action="new-deck" role="button" tabindex="0">
          <div class="toolkit-card-top">
            <span class="quiet-modal-tile module-icon tone-red">${icon('slides')}</span>
          </div>
          <h3>Slide Decks</h3>
          <p>Bring structure to a proposal, training session, or technical discussion with native PowerPoint export.</p>
          <div class="toolkit-card-action">
            <span class="text-link">Set up workstream ${icon('arrow')}</span>
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
  const gaap = toolkitFramework(p.gaap);
  showModal(
    'Set Up Memo Workstream',
    'Save the workstream setup. Open it from the dashboard to use Memo Builder.',
    `
      <form id="new-memo-form">
        <div class="form-stack">
          <label>Memo title
            <input name="title" placeholder="e.g. Accounting for Multi-Element Software Arrangement" required maxlength="160" autofocus>
          </label>
          <label>Accounting framework
            <select name="gaap" id="memo-gaap">${options(frameworks, gaap)}</select>
          </label>
          <fieldset class="standards-picker">
            <legend>Relevant standards <span class="optional">Select applicable guidance</span></legend>
            <div id="standards-options">${standardsCheckboxes(gaap)}</div>
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
            <span>Setup saves your brief, standards, and evidence selection. Open the workstream to create and edit the memo.</span>
          </div>
        </div>
        ${modalActions('Setup Workflow')}
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
        <label>Target reporting framework<select name="targetGaap">${options(frameworks, toolkitFramework(state.project?.project?.gaap))}</select></label>
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
    'Set Up Slide Deck Workstream',
    'Save the workstream setup. Open it from the dashboard to use Slide Decks.',
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
            <span>Setup saves your presentation brief and evidence selection. Open the workstream to build and export the deck.</span>
          </div>
        </div>
        ${modalActions('Setup Workflow')}
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

/* Memo Builder: the memo is edited as ordered sections and saved as one structure.
   The DOM is the working copy; collectMemo() reads it back for saving and preview. */
const MEMO_MAX_SECTIONS = 40;
const memoStatusClass = status => status === 'Ready for review' ? 'memo-status-ready' : status === 'Drafting' ? 'memo-status-drafting' : 'memo-status-empty';

function memoHint(heading) {
  const key = heading.toLowerCase().replace(/^\d+(\.\d+)*\.?\s+/, '').trim();
  return state.memoGuide.find(g => g.heading.toLowerCase() === key || g.aliases.includes(key))?.hint || '';
}

function memoSectionCard(section, index) {
  const hint = memoHint(section.heading);
  return `
    <section class="memo-section ${memoStatusClass(section.status)}" id="memo-section-${e(section.id)}" data-section-id="${e(section.id)}">
      <header class="memo-section-head">
        ${button(icon('chevron'), 'memo-toggle-section', 'icon-btn memo-collapse-btn', 'title="Collapse section" aria-label="Collapse section" aria-expanded="true"')}
        <span class="memo-section-num">${index + 1}</span>
        <input class="memo-section-heading" value="${e(section.heading)}" aria-label="Section heading" required maxlength="160">
        <select class="memo-section-status" aria-label="Section status">${options(state.sectionStatuses, section.status)}</select>
        <div class="memo-section-tools">
          ${button(icon('down', 'icon-flip'), 'memo-move-section', 'icon-btn', 'data-dir="-1" title="Move up" aria-label="Move section up"')}
          ${button(icon('down'), 'memo-move-section', 'icon-btn', 'data-dir="1" title="Move down" aria-label="Move section down"')}
          ${button(icon('trash'), 'memo-delete-section', 'icon-btn subtle-danger', 'title="Delete section" aria-label="Delete section"')}
        </div>
      </header>
      <div class="memo-section-content">
        ${hint ? `<p class="memo-section-hint">${icon('info')}<span>${e(hint)}</span></p>` : ''}
        <textarea class="memo-section-body" rows="4" maxlength="30000" spellcheck="true" aria-label="${e(section.heading)} content" placeholder="Write in Markdown. Use - for bullets and ### for sub-headings.">${e(section.body)}</textarea>
      </div>
    </section>
  `;
}

/* The toolkit runs in three stages: Memo Base (preface, standards, engagement
   documents), Builder (the sections), and Review and Completion. All three live in
   one form, so a single save covers them. */
const MEMO_STAGES = [['base', 'Memo Base'], ['builder', 'Builder'], ['review', 'Review and Completion']];
const READY = 'Ready for review';
const memoField = (label, name, value, type = 'text') => `<label>${label}<input name="memo-${name}" type="${type}" value="${e(value || '')}" maxlength="200"></label>`;
const memoCardHead = (iconName, title, text) => `<header class="memo-card-head">${icon(iconName)}<div><h3>${title}</h3><p>${text}</p></div></header>`;
const standardCode = standard => standard.split(' · ')[0].trim().toLowerCase();

function memoStageTabs() {
  return `
    <div class="memo-stage-tabs" role="tablist" aria-label="Memo Builder stages">
      ${MEMO_STAGES.map(([key, label], i) => `
        <button type="button" role="tab" class="memo-stage-tab" id="memo-tab-${key}" data-action="memo-stage" data-stage="${key}" aria-controls="memo-stage-${key}" aria-selected="false">
          <span class="memo-stage-num">${i + 1}</span><span>${label}</span><small class="memo-stage-meta" data-stage-meta="${key}"></small>
        </button>
      `).join('')}
    </div>
  `;
}

// A dropdown of checkboxes; the chips beneath it show what is selected.
function memoMultiSelect(name, items, empty) {
  return `
    <details class="memo-multi" data-multi="${name}">
      <summary><span class="memo-multi-summary"></span>${icon('down')}</summary>
      <div class="memo-multi-menu">
        ${items.map(item => `<label class="checkbox-row"><input type="checkbox" name="${name}" value="${e(item.value)}" data-label="${e(item.label)}" ${item.checked ? 'checked' : ''}><span>${e(item.label)}</span></label>`).join('')}
        <p class="memo-multi-empty" ${items.length ? 'hidden' : ''}>${e(empty)}</p>
      </div>
    </details>
    <div class="memo-chips" data-chips="${name}"></div>
  `;
}

// Saved standards match the catalog by code, so a selection survives a change to a standard's title.
function memoStandardsSelect(gaap, selected) {
  const catalog = state.standards[gaap] || [];
  const codes = new Set(selected.map(standardCode));
  const others = selected.filter(s => !catalog.some(c => standardCode(c) === standardCode(s)));
  const items = [...catalog.map(s => ({ value: s, label: s, checked: codes.has(standardCode(s)) })), ...others.map(s => ({ value: s, label: s, checked: true }))];
  return memoMultiSelect('base-standards', items, 'This framework has no standards catalog. Add the guidance you rely on below.');
}

function memoBaseStage(d, memo) {
  const params = d.params;
  const selectedDocs = new Set(params.resourceIds || []);
  // The workstream's own drafts and exports are outputs, not source material.
  const documents = (state.project.resources || []).filter(r => r.workstream_id !== d.id);
  return `
    <div class="memo-base">
      <section class="memo-card">
        ${memoCardHead('mail', 'Preface', 'Addressees, date, and an opening note that sits above the first section of the memo.')}
        <div class="memo-details-grid">
          ${memoField('To', 'to', memo.header.to)}
          ${memoField('From', 'from', memo.header.from)}
          ${memoField('CC', 'cc', memo.header.cc)}
          ${memoField('Date', 'date', memo.header.date, 'date')}
        </div>
        <label class="memo-preface">Preface <span class="optional">Optional</span>
          <textarea name="memo-preface" rows="3" maxlength="8000" spellcheck="true" placeholder="e.g. This memorandum documents management's assessment of the accounting for…">${e(memo.preface)}</textarea>
        </label>
      </section>
      <section class="memo-card">
        ${memoCardHead('book', 'Applicable standards', 'The framework and the authoritative guidance this memo relies on.')}
        <div class="memo-base-grid">
          <label>Accounting framework
            <select name="base-gaap" id="memo-base-gaap">${options(frameworks, toolkitFramework(params.gaap))}</select>
          </label>
          <div class="memo-field">
            <span class="memo-field-label">Standards</span>
            <div id="memo-standards-field">${memoStandardsSelect(toolkitFramework(params.gaap), params.standards || [])}</div>
            <div class="memo-add-standard">
              <input id="memo-custom-standard" placeholder="Add another standard or topic, e.g. IFRIC 23" maxlength="500" aria-label="Add another standard or topic">
              ${button(icon('plus') + ' Add', 'memo-add-standard', 'btn secondary small-btn')}
            </div>
          </div>
        </div>
      </section>
      <section class="memo-card">
        ${memoCardHead('folder', 'Engagement documents', 'Documents from this engagement that the memo relies on. They will be the source material for the AI drafting agent.')}
        ${memoMultiSelect('base-resourceIds', documents.map(r => ({ value: r.id, label: r.name, checked: selectedDocs.has(r.id) })), 'No engagement documents yet. Upload them from the engagement dashboard.')}
      </section>
    </div>
  `;
}

function memoBuilderStage(memo) {
  return `
    <div class="memo-layout">
      <aside class="memo-outline" aria-label="Memo outline">
        <div class="memo-progress">
          <div class="memo-progress-label"><strong id="memo-progress-count"></strong><span>ready for review</span></div>
          <div class="memo-progress-bar" aria-hidden="true"><span class="memo-progress-ready"></span><span class="memo-progress-drafting"></span></div>
        </div>
        <ol class="memo-outline-list" id="memo-outline-list"></ol>
        ${button(icon('plus') + ' Add section', 'memo-add-section', 'btn secondary small-btn memo-add-btn')}
      </aside>
      <div class="memo-main">
        <div class="memo-builder-bar">
          <div class="view-toggle memo-view-toggle" role="group" aria-label="Memo view">
            ${button(icon('list') + ' Sections', 'memo-view', 'icon-btn selected', 'data-view="sections" aria-pressed="true"')}
            ${button(icon('eye') + ' Preview', 'memo-view', 'icon-btn', 'data-view="preview" aria-pressed="false"')}
          </div>
        </div>
        <div id="memo-sections">${memo.sections.map(memoSectionCard).join('')}</div>
        <div id="memo-preview" class="draft-preview memo-preview" hidden></div>
      </div>
    </div>
  `;
}

function memoReviewStage(memo) {
  return `
    <div class="memo-review">
      <section class="memo-card">
        ${memoCardHead('eye', 'Review', 'Sections marked Ready for review in the Builder, with the framework and standards the memo relies on.')}
        <div id="memo-review-body"></div>
      </section>
      <section class="memo-card memo-completion" id="memo-completion">
        ${memoCardHead('check', 'Completion checklist', 'Confirm each point before the memo is circulated.')}
        <p class="memo-lock" id="memo-completion-lock"></p>
        <div class="memo-checklist">
          ${state.completionChecklist.map(item => `
            <label class="checkbox-row memo-check"><input type="checkbox" name="memo-completion" value="${e(item.id)}" ${memo.completion?.[item.id] ? 'checked' : ''}><span>${e(item.text)}</span></label>
          `).join('')}
        </div>
        <div class="memo-signoff-grid">
          ${memoField('Prepared by', 'preparer', memo.signoff.preparer)}
          ${memoField('Reviewed by', 'reviewer', memo.signoff.reviewer)}
          ${memoField('Approved by', 'approver', memo.signoff.approver)}
        </div>
      </section>
    </div>
  `;
}

function memoEditorLayout(d) {
  const stages = { base: memoBaseStage(d, d.memo), builder: memoBuilderStage(d.memo), review: memoReviewStage(d.memo) };
  return MEMO_STAGES.map(([key]) => `<section class="memo-stage" id="memo-stage-${key}" data-stage="${key}" role="tabpanel" aria-labelledby="memo-tab-${key}" hidden>${stages[key]}</section>`).join('');
}

function collectMemo(form) {
  const field = name => form.querySelector(`[name="memo-${name}"]`)?.value.trim() || '';
  return {
    header: { to: field('to'), from: field('from'), cc: field('cc'), date: field('date') },
    preface: field('preface'),
    signoff: { preparer: field('preparer'), reviewer: field('reviewer'), approver: field('approver') },
    sections: [...form.querySelectorAll('.memo-section')].map(card => ({
      id: card.dataset.sectionId,
      heading: card.querySelector('.memo-section-heading').value.trim(),
      body: card.querySelector('.memo-section-body').value,
      status: card.querySelector('.memo-section-status').value
    })),
    completion: Object.fromEntries([...form.querySelectorAll('[name="memo-completion"]')].map(box => [box.value, box.checked]))
  };
}

function collectMemoBase(form) {
  const checked = name => [...form.querySelectorAll(`[name="${name}"]:checked`)].map(box => box.value);
  return { gaap: form.querySelector('[name="base-gaap"]').value, standards: checked('base-standards'), resourceIds: checked('base-resourceIds') };
}

// Save payload for the workstream editor form, whichever toolkit rendered it.
function deliveryPayload(form) {
  const values = Object.fromEntries(new FormData(form));
  if (form.dataset.kind !== 'memo') return { title: values.title, status: values.status, body: values.body };
  return { title: values.title, status: values.status, memo: collectMemo(form), base: collectMemoBase(form) };
}

function showMemoStage(stage) {
  if (!document.querySelector('.memo-stage')) return;
  document.querySelectorAll('.memo-stage').forEach(panel => { panel.hidden = panel.dataset.stage !== stage; });
  document.querySelectorAll('.memo-stage-tab').forEach(tab => {
    tab.classList.toggle('selected', tab.dataset.stage === stage);
    tab.setAttribute('aria-selected', String(tab.dataset.stage === stage));
  });
  // Textareas measure zero height while hidden, so size them once they are shown.
  document.querySelectorAll(`#memo-stage-${stage} textarea`).forEach(autosize);
  if (stage === 'review') renderMemoReview();
  state.memoStage = { id: state.editing?.id, stage };
}

function renderMemoBase() {
  const nouns = { 'base-standards': ['standard', 'standards'], 'base-resourceIds': ['document', 'documents'] };
  document.querySelectorAll('.memo-multi').forEach(menu => {
    const name = menu.dataset.multi;
    const checked = [...menu.querySelectorAll('input:checked')];
    const [one, many] = nouns[name];
    menu.querySelector('.memo-multi-summary').textContent = checked.length ? `${checked.length} ${checked.length === 1 ? one : many} selected` : `Select ${many}`;
    document.querySelector(`[data-chips="${name}"]`).innerHTML = checked.map(box => `
      <span class="memo-chip">${e(box.dataset.label)}<button type="button" class="memo-chip-remove" data-action="memo-chip-remove" data-name="${name}" data-value="${e(box.value)}" aria-label="Remove ${e(box.dataset.label)}">${icon('close')}</button></span>
    `).join('');
  });
  const standards = document.querySelectorAll('[name="base-standards"]:checked').length;
  const meta = document.querySelector('[data-stage-meta="base"]');
  if (meta) meta.textContent = standards ? `${standards} ${standards === 1 ? 'standard' : 'standards'}` : '';
}

function addMemoStandard() {
  const input = document.querySelector('#memo-custom-standard');
  const value = input?.value.trim();
  if (!value) return;
  const existing = [...document.querySelectorAll('[name="base-standards"]')].find(box => standardCode(box.value) === standardCode(value));
  if (existing) existing.checked = true;
  else {
    const menu = document.querySelector('[data-multi="base-standards"] .memo-multi-menu');
    menu.querySelector('.memo-multi-empty').hidden = true;
    menu.querySelector('.memo-multi-empty').insertAdjacentHTML('beforebegin', `<label class="checkbox-row"><input type="checkbox" name="base-standards" value="${e(value)}" data-label="${e(value)}" checked><span>${e(value)}</span></label>`);
  }
  input.value = '';
  renderMemoBase();
  markDirty();
}

function renderMemoReview() {
  const target = document.querySelector('#memo-review-body');
  if (!target) return;
  const form = target.closest('form');
  const memo = collectMemo(form);
  const base = collectMemoBase(form);
  const ready = memo.sections.map((section, i) => ({ ...section, number: i + 1 })).filter(s => s.status === READY);
  const open = memo.sections.filter(s => s.status !== READY);
  target.innerHTML = `
    <dl class="memo-review-facts">
      <div><dt>Accounting framework</dt><dd>${e(base.gaap)}</dd></div>
      <div><dt>Selected standards</dt><dd>${base.standards.length ? `<div class="memo-chips">${base.standards.map(s => `<span class="memo-chip">${e(s)}</span>`).join('')}</div>` : 'No standards selected'}</dd></div>
    </dl>
    <h4 class="memo-review-subhead">Completed sections <span>${ready.length} of ${memo.sections.length}</span></h4>
    ${ready.length ? ready.map(s => `
      <details class="memo-review-section" open>
        <summary><span class="memo-outline-num">${s.number}</span><span>${e(s.heading || 'Untitled section')}</span></summary>
        <div class="draft-preview">${s.body.trim() ? markdown(s.body) : '<p>[To be completed]</p>'}</div>
      </details>
    `).join('') : '<p class="memo-review-empty">No sections are ready yet. Set a section to Ready for review in the Builder.</p>'}
    ${ready.length && open.length ? `<p class="memo-review-empty">Still in the Builder: ${open.map(s => e(s.heading || 'Untitled section')).join(' · ')}</p>` : ''}
  `;
}

// The completion checklist opens only once every Builder section is ready for review.
function renderMemoCompletion() {
  const panel = document.querySelector('#memo-completion');
  if (!panel) return;
  const statuses = [...document.querySelectorAll('.memo-section-status')].map(select => select.value);
  const open = statuses.filter(status => status !== READY).length;
  const locked = open > 0;
  panel.classList.toggle('locked', locked);
  panel.querySelectorAll('[name="memo-completion"]').forEach(box => { box.disabled = locked; });
  document.querySelector('#memo-completion-lock').innerHTML = locked
    ? `${icon('lock')}<span>Locked until every Builder section is Ready for review. ${open} of ${statuses.length} ${open === 1 ? 'section is' : 'sections are'} still open.</span>`
    : `${icon('check')}<span>All ${statuses.length} sections are ready for review. Complete the checklist below.</span>`;
  const boxes = [...panel.querySelectorAll('[name="memo-completion"]')];
  document.querySelector('[data-stage-meta="review"]').textContent = `${boxes.filter(box => box.checked).length}/${boxes.length} checked`;
}

function renderMemoOutline() {
  const list = document.querySelector('#memo-outline-list');
  if (!list) return;
  const cards = [...document.querySelectorAll('.memo-section')];
  const statusOf = card => card.querySelector('.memo-section-status').value;
  list.innerHTML = cards.map((card, i) => {
    const heading = card.querySelector('.memo-section-heading').value.trim() || 'Untitled section';
    card.querySelector('.memo-section-num').textContent = i + 1;
    card.className = `memo-section ${memoStatusClass(statusOf(card))}${card.classList.contains('collapsed') ? ' collapsed' : ''}`;
    card.querySelector('[data-dir="-1"]').disabled = i === 0;
    card.querySelector('[data-dir="1"]').disabled = i === cards.length - 1;
    card.querySelector('[data-action="memo-delete-section"]').disabled = cards.length === 1;
    return `<li><button type="button" class="memo-outline-item ${memoStatusClass(statusOf(card))}" data-action="memo-jump" data-id="${e(card.dataset.sectionId)}" title="${e(statusOf(card))}"><span class="memo-outline-dot"></span><span class="memo-outline-num">${i + 1}</span><span class="memo-outline-text">${e(heading)}</span></button></li>`;
  }).join('');
  const ready = cards.filter(card => statusOf(card) === 'Ready for review').length;
  const drafting = cards.filter(card => statusOf(card) === 'Drafting').length;
  document.querySelector('#memo-progress-count').textContent = `${ready} of ${cards.length}`;
  document.querySelector('.memo-progress-ready').style.width = `${cards.length ? ready / cards.length * 100 : 0}%`;
  document.querySelector('.memo-progress-drafting').style.width = `${cards.length ? drafting / cards.length * 100 : 0}%`;
  document.querySelector('[data-action="memo-add-section"]').disabled = cards.length >= MEMO_MAX_SECTIONS;
  document.querySelector('[data-stage-meta="builder"]').textContent = `${ready}/${cards.length} ready`;
  renderMemoCompletion();
}

function autosize(textarea) {
  textarea.style.height = 'auto';
  textarea.style.height = `${textarea.scrollHeight + 2}px`;
}

/* Toolkit edits autosave shortly after typing stops, which also keeps the
   workstream's Markdown draft in Engagement Documents current. */
const AUTOSAVE_DELAY = 2000;
let autosaveTimer = null;
let savingWorkstream = null;

function setDraftStatus(text, tone = '') {
  const node = document.querySelector('#draft-status');
  if (!node) return;
  node.textContent = text;
  node.dataset.tone = tone;
}

function markDirty() {
  const form = document.querySelector('#edit-delivery-form');
  if (!form) return;
  form.dataset.dirty = 'true';
  setDraftStatus('Unsaved changes', 'pending');
  clearTimeout(autosaveTimer);
  autosaveTimer = setTimeout(() => saveWorkstream({ quiet: true }), AUTOSAVE_DELAY);
}

// Saves the open toolkit. Quiet saves (autosave) report problems in the status line
// rather than throwing, and skip while required fields are empty.
async function saveWorkstream({ quiet = false } = {}) {
  clearTimeout(autosaveTimer);
  while (savingWorkstream) await savingWorkstream.catch(() => {});
  const form = document.querySelector('#edit-delivery-form');
  if (!form || (quiet && form.dataset.dirty !== 'true')) return;
  if (quiet && !form.checkValidity()) {
    setDraftStatus('Not saved: complete the required fields', 'error');
    return;
  }
  const editing = state.editing;
  form.dataset.dirty = 'false';
  setDraftStatus('Saving…');
  savingWorkstream = send(`/projects/${state.editingProject}/deliverables/${editing.id}`, { ...deliveryPayload(form), updated: editing.updated }, 'PATCH');
  try {
    const result = await savingWorkstream;
    editing.updated = result.updated;
    if (form.dataset.dirty !== 'true') setDraftStatus(`Saved ${new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit' }).format(new Date())}`, 'saved');
  } catch (error) {
    form.dataset.dirty = 'true';
    setDraftStatus(`Not saved: ${error.message}`, 'error');
    if (!quiet) throw error;
  } finally {
    savingWorkstream = null;
  }
}

function showMemoView(view) {
  const form = document.querySelector('#edit-delivery-form');
  const preview = document.querySelector('#memo-preview');
  if (!form || !preview) return;
  if (view === 'preview') {
    const memo = collectMemo(form);
    const header = [['To', memo.header.to], ['From', memo.header.from], ['CC', memo.header.cc], ['Date', memo.header.date]].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`);
    const body = [`# ${form.querySelector('[name="title"]').value}`, ...header, ...(memo.preface ? ['', memo.preface] : []),
      ...memo.sections.map((s, i) => `## ${i + 1}. ${s.heading || 'Untitled section'}\n${s.body.trim() || '[To be completed]'}`),
      `## ${memo.sections.length + 1}. Review and sign-off\n- Prepared by: ${memo.signoff.preparer || '[Pending]'}\n- Reviewed by: ${memo.signoff.reviewer || '[Pending]'}\n- Approved by: ${memo.signoff.approver || '[Pending]'}`].join('\n');
    preview.innerHTML = markdown(body);
  }
  preview.hidden = view !== 'preview';
  document.querySelector('#memo-sections').hidden = view === 'preview';
  document.querySelectorAll('[data-action="memo-view"]').forEach(b => {
    b.classList.toggle('selected', b.dataset.view === view);
    b.setAttribute('aria-pressed', String(b.dataset.view === view));
  });
}

function addMemoSection() {
  const container = document.querySelector('#memo-sections');
  if (!container || container.children.length >= MEMO_MAX_SECTIONS) return;
  showMemoView('sections');
  const id = crypto.randomUUID().slice(0, 8);
  container.insertAdjacentHTML('beforeend', memoSectionCard({ id, heading: 'New section', body: '', status: state.sectionStatuses[0] }, container.children.length));
  const card = container.lastElementChild;
  autosize(card.querySelector('.memo-section-body'));
  renderMemoOutline();
  markDirty();
  card.scrollIntoView({ behavior: 'smooth', block: 'center' });
  const heading = card.querySelector('.memo-section-heading');
  heading.focus({ preventScroll: true });
  heading.select();
}

function removeMemoSection(id) {
  document.querySelector(`.memo-section[data-section-id="${CSS.escape(id)}"]`)?.remove();
  renderMemoOutline();
  markDirty();
}

function initMemoEditor(d) {
  renderMemoOutline();
  renderMemoBase();
  showMemoStage(state.memoStage?.id === d.id ? state.memoStage.stage : 'base');
}

// Exports download the last saved version of the workstream.
function exportMenu(d, project, id) {
  const base = `/api/projects/${project}/deliverables/${id}/export`;
  const office = d.kind === 'memo' ? ['docx', 'Word (.docx)'] : ['pptx', 'PowerPoint (.pptx)'];
  const formats = [['md', 'Markdown (.md)'], office, ['pdf', 'PDF (.pdf)']];
  return `
    <div class="export-menu">
      ${button(icon('download') + icon('down', 'export-menu-caret'), 'toggle-export-menu', 'icon-btn export-menu-trigger', 'title="Export" aria-label="Export" aria-haspopup="menu" aria-expanded="false" aria-controls="export-menu-list"')}
      <div class="export-menu-list" id="export-menu-list" role="menu" aria-label="Export" hidden>
        ${formats.map(([format, label]) => `<a role="menuitem" class="workstream-menu-item" href="${base}/${format}">${icon('file')} ${label}</a>`).join('')}
      </div>
    </div>
  `;
}

function setExportMenu(open) {
  const list = document.querySelector('#export-menu-list');
  if (!list) return;
  list.hidden = !open;
  document.querySelector('.export-menu-trigger')?.setAttribute('aria-expanded', String(open));
  if (open) list.querySelector('[role="menuitem"]')?.focus();
}

async function editDelivery(project, id) {
  location.hash = `#project/${project}/workstream/${id}`;
}

async function renderWorkstream(project, id) {
  const [projectData, data] = await Promise.all([
    api(`/projects/${project}`),
    api(`/projects/${project}/deliverables/${id}`)
  ]);
  state.project = projectData;
  state.editing = data.deliverable;
  state.editingProject = project;
  const d = state.editing;
  const p = projectData.project;
  const params = d.params;
  const toolkit = d.kind === 'memo' ? 'Memo Builder' : 'Slide Decks';
  const pending = !d.body.trim();
  const isMemo = d.kind === 'memo' && Boolean(d.memo);
  const evidence = (params.resourceIds || []).map(resourceId => projectData.resources.find(r => r.id === resourceId));
  const details = d.kind === 'memo'
    ? [['Accounting framework', params.gaap], ['Selected standards', params.standards.join(' · ') || 'No standards selected']]
    : [['Deck type', params.deckType], ['Proposal area', params.area], ['IPO focus', params.ipoTrack], ['Current framework', params.currentGaap], ['Target framework', params.targetGaap], ['Audience', params.audience], ['Current methodologies', params.methodologies]];

  const content = pending ? `
    <section class="panel workstream-setup-summary">
      <div class="workstream-toolkit-intro">
        <span class="module-icon ${d.kind === 'memo' ? 'tone-blue' : 'tone-red'}">${icon(d.kind === 'memo' ? 'file' : 'slides')}</span>
        <div>
          <h2>Your workstream is ready</h2>
          <p>Use ${toolkit} to create a working outline from the saved setup, then edit and export your ${d.kind === 'memo' ? 'memo' : 'presentation'}.</p>
        </div>
      </div>
      <dl class="workstream-setup-details">
        ${details.filter(([, value]) => value).map(([label, value]) => `<div><dt>${e(label)}</dt><dd>${e(value)}</dd></div>`).join('')}
        <div><dt>${d.kind === 'memo' ? 'Transaction brief' : 'Presentation objectives and brief'}</dt><dd class="workstream-brief">${e(params.problem)}</dd></div>
        <div><dt>Selected project evidence</dt><dd>${evidence.length ? evidence.map(r => `<span class="workstream-evidence-item">${e(r?.name || 'Selected resource is unavailable')}</span>`).join('') : 'No resources selected'}</dd></div>
      </dl>
      <div class="workstream-toolkit-actions">
        ${button(icon('plus') + (d.kind === 'memo' ? ' Create memo outline' : ' Create deck outline'), 'generate-outline', 'btn primary')}
      </div>
    </section>
  ` : `
      <form id="edit-delivery-form" class="${isMemo ? 'memo-editor' : ''}" data-kind="${d.kind}">
        <div class="editor-meta">
          <label>Title
            <input name="title" value="${e(d.title)}" required maxlength="160">
          </label>
          <label>Review status
            <select name="status">${options(['Draft', 'In review', 'Approved', ...(d.status === 'Final' ? ['Final'] : [])], d.status)}</select>
          </label>
        </div>

        <div class="editor-toolbar">
          ${isMemo ? memoStageTabs() : `<span>${icon('slides')} Executive Presentation · Live Markdown Preview</span>`}
          ${exportMenu(d, project, id)}
        </div>

        ${isMemo ? memoEditorLayout(d) : `
        <div class="editor-grid">
          <label class="editor-input-label">
            <span class="sr-only">Deliverable content</span>
            <textarea id="draft-body" name="body" spellcheck="true" required maxlength="200000">${e(d.body)}</textarea>
          </label>
          <div class="draft-preview deck-preview" id="draft-preview">
            ${slidePreview(d.body)}
          </div>
        </div>
        `}

        <div class="form-error" role="alert"></div>
        <div class="modal-actions">
          <span id="draft-status" class="draft-status" aria-live="polite"></span>
          <a href="#project/${project}" class="btn secondary">Back to engagement</a>
          <button type="submit" class="btn secondary">Save draft ${icon('check')}</button>
          <button type="button" class="btn primary" data-action="add-to-documents" data-project="${project}" data-id="${id}">
            ${icon('upload')} Add to Engagement Documents
          </button>
        </div>
      </form>
    `;

  shell(`
    <div class="workstream-toolkit-page">
      <section class="page-heading">
        <div>
          <div class="quiet-eyebrow">${e(toolkit)} · Engagement Workstream</div>
          <h1>${e(d.title)}</h1>
          <p>${e(p.name)} · ${e(p.client)}</p>
        </div>
        <div class="button-row">
          ${badge(d.status)}
          <a href="#project/${project}" class="btn secondary small-btn">${icon('folder')} Back to engagement</a>
        </div>
      </section>
      ${content}
    </div>
  `, 'Engagement Manager', `${p.name} / ${toolkit}`);
  if (isMemo && !pending) initMemoEditor(d);
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
  closeWorkstreamMenu();
  // Leaving a toolkit flushes its pending autosave before the page is replaced.
  await saveWorkstream({ quiet: true });
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
  const workstreamMatch = /^project\/([\w-]+)\/workstream\/([\w-]+)$/.exec(hash);

  try {
    if (hash === 'preferences') {
      state.page = 'preferences';
      renderPreferences();
    } else if (workstreamMatch) {
      state.page = 'workstream';
      await renderWorkstream(workstreamMatch[1], workstreamMatch[2]);
    } else if (projectMatch) {
      state.page = 'project';
      await openProject(projectMatch[1], state.project?.project?.id === projectMatch[1]);
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
  else if (state.page === 'workstream') await renderWorkstream(state.editingProject, state.editing.id);
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
  if (target.closest('.workstream-actions-menu')) closeWorkstreamMenu();

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
    } else if (action === 'toggle-workstream-menu') {
      toggleWorkstreamMenu(target);
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
      if (state.page === 'workstream') location.hash = `#project/${state.project.project.id}`;
      else renderProject();
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
    } else if (action === 'generate-outline') {
      state.busy = true;
      target.disabled = true;
      target.textContent = 'Creating outline…';
      try {
        await send(`/projects/${state.editingProject}/deliverables/${state.editing.id}/generate`, { updated: state.editing.updated });
        await reloadCurrent();
        toast('Outline created. You can now edit it in the toolkit.');
      } finally {
        state.busy = false;
        if (target.isConnected) {
          target.disabled = false;
          target.textContent = state.editing.kind === 'memo' ? 'Create memo outline' : 'Create deck outline';
        }
      }
    } else if (action === 'toggle-export-menu') {
      setExportMenu(document.querySelector('#export-menu-list')?.hidden);
    } else if (action === 'memo-stage') {
      showMemoStage(target.dataset.stage);
    } else if (action === 'memo-add-standard') {
      addMemoStandard();
    } else if (action === 'memo-chip-remove') {
      const box = [...document.querySelectorAll(`[name="${target.dataset.name}"]`)].find(input => input.value === target.dataset.value);
      if (box) box.checked = false;
      renderMemoBase();
      markDirty();
    } else if (action === 'memo-view') {
      showMemoView(target.dataset.view);
    } else if (action === 'memo-add-section') {
      addMemoSection();
    } else if (action === 'memo-move-section') {
      const card = target.closest('.memo-section');
      const sibling = target.dataset.dir === '-1' ? card.previousElementSibling : card.nextElementSibling;
      if (!sibling) return;
      if (target.dataset.dir === '-1') sibling.before(card); else sibling.after(card);
      renderMemoOutline();
      markDirty();
      card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      (target.disabled ? card.querySelector('.memo-section-heading') : target).focus({ preventScroll: true });
    } else if (action === 'memo-toggle-section') {
      const card = target.closest('.memo-section');
      const collapsed = card.classList.toggle('collapsed');
      if (!collapsed) autosize(card.querySelector('.memo-section-body'));
      target.setAttribute('aria-expanded', String(!collapsed));
      target.setAttribute('aria-label', collapsed ? 'Expand section' : 'Collapse section');
      target.title = collapsed ? 'Expand section' : 'Collapse section';
    } else if (action === 'memo-delete-section') {
      const card = target.closest('.memo-section');
      if (!card.querySelector('.memo-section-body').value.trim()) {
        removeMemoSection(card.dataset.sectionId);
        return;
      }
      const heading = card.querySelector('.memo-section-heading').value.trim() || 'Untitled section';
      confirmAction('Delete this section?', `"${heading}" and its content will be removed from the memo when you save the draft.`, 'delete-memo-section-form', `data-id="${e(card.dataset.sectionId)}"`);
    } else if (action === 'memo-jump') {
      showMemoView('sections');
      const card = document.querySelector(`.memo-section[data-section-id="${CSS.escape(target.dataset.id)}"]`);
      if (!card) return;
      card.classList.remove('collapsed');
      card.querySelector('.memo-collapse-btn')?.setAttribute('aria-expanded', 'true');
      autosize(card.querySelector('.memo-section-body'));
      card.scrollIntoView({ behavior: 'smooth', block: 'start' });
      card.querySelector('.memo-section-body').focus({ preventScroll: true });
    } else if (action === 'add-to-documents') {
      // Creates the Word (memo) or PowerPoint (deck) document, from the latest edits when the toolkit is open.
      event.stopPropagation();
      const projectId = target.dataset.project;
      const deliverableId = target.dataset.id;
      if (document.querySelector('#edit-delivery-form')) await saveWorkstream();
      const added = await send(`/projects/${projectId}/deliverables/${deliverableId}/save-to-documents`, {});
      if (state.page !== 'workstream') await reloadCurrent();
      toast(`Added to Engagement Documents: ${added.name}`);
    } else if (action === 'move-to-final' || action === 'return-to-documents') {
      const toFinal = action === 'move-to-final';
      const resourceIds = toFinal ? [...document.querySelectorAll('.document-select:checked')].map(box => box.value) : [target.dataset.id];
      if (!resourceIds.length) return;
      await send(`/projects/${state.project.project.id}/documents/final`, { resourceIds, final: toFinal });
      await reloadCurrent();
      toast(toFinal ? `Moved ${resourceIds.length} ${resourceIds.length === 1 ? 'document' : 'documents'} to Final Deliverables.` : 'Returned to Engagement Documents.');
    } else if (action === 'add-member') {
      addMember();
    } else if (action === 'delete-workstream') {
      confirmAction(
        'Delete this workstream?',
        `${target.dataset.name} and its draft will be permanently deleted. Saved exports and reference documents will remain in Engagement Documents.`,
        'delete-workstream-form',
        `data-project="${e(target.dataset.project)}" data-id="${e(target.dataset.id)}"`
      );
      const submit = modalRoot.querySelector('#delete-workstream-form button[type="submit"]');
      if (submit) submit.innerHTML = `Delete workstream ${icon('trash')}`;
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
  if (event.target.closest('#edit-delivery-form') && !event.target.matches('#memo-custom-standard')) markDirty();
  if (event.target.matches('.document-select')) {
    const selected = document.querySelectorAll('.document-select:checked').length;
    document.querySelector('#move-to-final-btn').hidden = !selected;
    document.querySelector('#move-to-final-count').textContent = selected > 1 ? `(${selected})` : '';
  }
  if (event.target.closest('.memo-editor')) {
    if (event.target.matches('.memo-section-body')) autosize(event.target);
    if (event.target.matches('.memo-section-heading, .memo-section-status')) renderMemoOutline();
    if (event.target.matches('[name="memo-preface"]')) autosize(event.target);
    if (event.target.closest('.memo-multi')) renderMemoBase();
    if (event.target.matches('[name="memo-completion"]')) renderMemoCompletion();
  }
  if (event.target.id === 'draft-body') {
    const preview = document.querySelector('#draft-preview');
    if (preview && state.editing) {
      preview.innerHTML = state.editing.kind === 'deck' ? slidePreview(event.target.value) : markdown(event.target.value);
    }
  }
});

// A blank section heading fails validation; make sure it is visible so the browser can point to it.
document.addEventListener('invalid', event => {
  if (event.target.closest('.memo-editor')) {
    showMemoStage(event.target.closest('.memo-stage')?.dataset.stage || 'builder');
    showMemoView('sections');
    event.target.closest('.memo-section')?.classList.remove('collapsed');
  }
}, true);

// Memo Base dropdowns and the export menu close on a click elsewhere; the export menu also closes once an item is chosen.
document.addEventListener('click', event => {
  document.querySelectorAll('.memo-multi[open]').forEach(menu => { if (!menu.contains(event.target)) menu.open = false; });
  if (!event.target.closest('.export-menu-trigger') && (!event.target.closest('.export-menu') || event.target.closest('[role="menuitem"]'))) setExportMenu(false);
});

// Escape closes the export menu; Enter in the extra-standard field adds it rather than submitting the memo.
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && document.querySelector('#export-menu-list:not([hidden])')) {
    setExportMenu(false);
    document.querySelector('.export-menu-trigger')?.focus();
  }
  if (event.key === 'Enter' && event.target.id === 'memo-custom-standard') {
    event.preventDefault();
    addMemoStandard();
  }
});

window.addEventListener('beforeunload', event => {
  if (document.querySelector('#edit-delivery-form[data-dirty="true"]')) event.preventDefault();
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
    } else if (target.id === 'memo-base-gaap') {
      // Keep only the hand-added standards; catalog picks belong to the previous framework.
      const catalogCodes = new Set(Object.values(state.standards).flat().map(standardCode));
      const custom = [...document.querySelectorAll('[name="base-standards"]:checked')].map(box => box.value).filter(s => !catalogCodes.has(standardCode(s)));
      document.querySelector('#memo-standards-field').innerHTML = memoStandardsSelect(target.value, custom);
      renderMemoBase();
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
      const projectId = state.project.project.id;
      await send(`/projects/${projectId}/workstreams`, {
        kind,
        title: values.title,
        resourceIds: data.getAll('resourceIds'),
        params: { ...values, standards: data.getAll('standards') }
      });
      finishModal();
      state.projectTab = 'overview';
      if (state.page === 'project') await reloadCurrent();
      else location.hash = `#project/${projectId}`;
      toast('Workstream set up. Open it from Engagement Workstreams to use the toolkit.');
    } else if (form.id === 'edit-delivery-form') {
      await saveWorkstream();
      state.busy = false;
      await reloadCurrent();
      toast('Draft saved. Its Markdown copy in Engagement Documents is up to date.');
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
    } else if (form.id === 'delete-memo-section-form') {
      finishModal();
      removeMemoSection(form.dataset.id);
      toast('Section removed. Save the draft to keep this change.');
    } else if (form.id === 'delete-workstream-form') {
      await api(`/projects/${form.dataset.project}/deliverables/${form.dataset.id}`, { method: 'DELETE' });
      finishModal();
      await reloadCurrent();
      toast('Workstream deleted.');
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
  if (!event.target.closest('.workstream-menu-trigger, .workstream-actions-menu')) closeWorkstreamMenu();
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
  if (!workstreamMenu.hidden) {
    if (event.key === 'Escape' || event.key === 'Tab') {
      closeWorkstreamMenu(true);
      if (event.key === 'Escape') event.preventDefault();
    } else if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) && workstreamMenu.contains(event.target)) {
      event.preventDefault();
      const items = [...workstreamMenu.querySelectorAll('[role="menuitem"]')];
      const index = items.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items[next]?.focus();
    }
  }
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

window.addEventListener('resize', () => closeWorkstreamMenu());
document.addEventListener('scroll', () => closeWorkstreamMenu(), true);

window.addEventListener('hashchange', () => {
  if (modalRoot.querySelector('dialog')) closeModal();
  document.querySelectorAll('.user-menu-dropdown, .notification-menu-dropdown').forEach(d => d.classList.add('hidden'));
  document.querySelectorAll('.user-menu-trigger, .notification-trigger').forEach(b => b.setAttribute('aria-expanded', 'false'));
  route();
});

boot();
