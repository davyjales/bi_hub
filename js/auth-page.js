const THEME_KEY = 'visteon-bi-hub-theme';

function applyTheme(dark) {
  const root = document.documentElement;
  const icon = document.getElementById('theme-icon');
  if (dark) {
    root.classList.add('dark');
    icon?.classList.remove('fa-moon');
    icon?.classList.add('fa-sun');
  } else {
    root.classList.remove('dark');
    icon?.classList.remove('fa-sun');
    icon?.classList.add('fa-moon');
  }
  try {
    localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
  } catch (_) {}
}

function initTheme() {
  let dark = false;
  try {
    const saved = localStorage.getItem(THEME_KEY);
    if (saved === 'dark' || saved === 'light') {
      dark = saved === 'dark';
    } else {
      dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    }
  } catch (_) {
    dark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  applyTheme(dark);
}

function showAuthError(params) {
  const el = document.getElementById('auth-global-error');
  if (!el || !params.get('err')) return;
  el.textContent = decodeURIComponent(params.get('err'));
  el.classList.remove('hidden');
}

function switchTab(which) {
  document.getElementById('pane-login').classList.toggle('hidden', which !== 'login');
  document.getElementById('pane-register').classList.toggle('hidden', which !== 'register');
  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  if (tabLogin && tabRegister) {
    const active = 'text-[var(--text-primary)] border-[var(--v-orange)]';
    const idle = 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-primary)]';
    if (which === 'login') {
      tabLogin.className = `flex-1 py-3 text-sm font-semibold border-b-2 ${active}`;
      tabRegister.className = `flex-1 py-3 text-sm font-semibold border-b-2 ${idle}`;
    } else {
      tabRegister.className = `flex-1 py-3 text-sm font-semibold border-b-2 ${active}`;
      tabLogin.className = `flex-1 py-3 text-sm font-semibold border-b-2 ${idle}`;
    }
  }
}

function toggleDirBlock() {
  const area = document.getElementById('reg-role-area');
  const vis = !!(area && area.checked);
  const block = document.getElementById('register-dir-block');
  const sel = document.getElementById('register-directory-select');
  if (block) block.classList.toggle('hidden', !vis);
  if (sel && !vis) {
    [...sel.selectedOptions].forEach((opt) => {
      opt.selected = false;
    });
  }
}

async function loadDirectoriesIntoSelect(selectEl) {
  const r = await fetch('/api/directories', { cache: 'no-store' });
  if (!r.ok) return;
  const data = await r.json();
  const opts =
    data.directories && data.directories.length
      ? data.directories
          .map((d) => `<option value="${String(d.id)}">${escapeHtml(d.areaKey)}</option>`)
          .join('')
      : '';
  selectEl.innerHTML = opts || '<option value="">(Sem diretórios — rode o seed)</option>';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function initAuthPage() {
  initTheme();
  const params = new URLSearchParams(window.location.search);
  showAuthError(params);

  document.getElementById('theme-toggle').addEventListener('click', () => {
    applyTheme(!document.documentElement.classList.contains('dark'));
  });

  switchTab(params.get('tab') === 'register' ? 'register' : 'login');
  toggleDirBlock();

  document.querySelectorAll('input[name="role"]').forEach((el) => {
    el.addEventListener('change', toggleDirBlock);
  });

  document.querySelectorAll('[data-switch-login]').forEach((el) => {
    el.addEventListener('click', () => switchTab('login'));
  });

  document.querySelectorAll('[data-switch-register]').forEach((el) => {
    el.addEventListener('click', () => switchTab('register'));
  });

  const sel = document.getElementById('register-directory-select');
  if (sel) await loadDirectoriesIntoSelect(sel);

  try {
    const r = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
    if (r.ok) window.location.replace('/index.html');
  } catch (_) {}
}

document.addEventListener('DOMContentLoaded', initAuthPage);
