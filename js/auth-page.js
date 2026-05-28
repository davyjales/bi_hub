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

function showAuthMessages(params) {
  const errEl = document.getElementById('auth-global-error');
  const okEl = document.getElementById('auth-global-success');
  if (errEl) {
    if (params.get('err')) {
      errEl.textContent = decodeURIComponent(params.get('err'));
      errEl.classList.remove('hidden');
    } else {
      errEl.classList.add('hidden');
      errEl.textContent = '';
    }
  }
  if (okEl) {
    if (params.get('info')) {
      okEl.textContent = decodeURIComponent(params.get('info'));
      okEl.classList.remove('hidden');
    } else {
      okEl.classList.add('hidden');
      okEl.textContent = '';
    }
  }
}

function switchTab(which) {
  document.getElementById('pane-login').classList.toggle('hidden', which !== 'login');
  document.getElementById('pane-register').classList.toggle('hidden', which !== 'register');
  document.getElementById('pane-forgot').classList.toggle('hidden', which !== 'forgot');

  const tabLogin = document.getElementById('tab-login');
  const tabRegister = document.getElementById('tab-register');
  const active = 'text-[var(--text-primary)] border-[var(--v-orange)]';
  const idle = 'text-[var(--text-muted)] border-transparent hover:text-[var(--text-primary)]';

  if (tabLogin && tabRegister) {
    if (which === 'login' || which === 'forgot') {
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
  const setor = document.getElementById('reg-role-setor');
  const vis = !!((area && area.checked) || (setor && setor.checked));
  const block = document.getElementById('register-dir-block');
  const list = document.getElementById('register-directory-select');
  if (block) block.classList.toggle('hidden', !vis);
  if (list && !vis) {
    list.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      input.checked = false;
    });
  }
}

async function loadDirectoriesIntoChecklist(containerEl) {
  const r = await fetch('/api/directories', { cache: 'no-store' });
  if (!r.ok) return;
  const data = await r.json();
  const opts =
    data.directories && data.directories.length
      ? data.directories
          .map(
            (d) =>
              `<label class="hub-checkbox-item"><input type="checkbox" name="directory_ids" value="${String(
                d.id,
              )}"><span>${escapeHtml(d.areaKey)}</span></label>`,
          )
          .join('')
      : '';
  containerEl.innerHTML = opts || '<p class="text-xs text-[var(--text-muted)] px-2 py-1">(Sem diretórios — rode o seed)</p>';
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function applyPasswordResetAvailability() {
  const warn = document.getElementById('forgot-mail-unavailable');
  const form = document.getElementById('forgot-form');
  const submit = form?.querySelector('button[type="submit"]');
  let available = false;
  try {
    const r = await fetch('/api/auth/config', { cache: 'no-store' });
    if (r.ok) {
      const data = await r.json();
      available = !!data.passwordResetAvailable;
    }
  } catch (_) {}
  if (warn) warn.classList.toggle('hidden', available);
  if (submit) submit.disabled = !available;
  if (form) {
    form.querySelectorAll('input').forEach((inp) => {
      inp.disabled = !available;
    });
  }
}

async function initAuthPage() {
  initTheme();
  const params = new URLSearchParams(window.location.search);
  showAuthMessages(params);
  await applyPasswordResetAvailability();

  document.getElementById('theme-toggle').addEventListener('click', () => {
    applyTheme(!document.documentElement.classList.contains('dark'));
  });

  const tab = params.get('tab');
  if (tab === 'register') switchTab('register');
  else if (tab === 'forgot') switchTab('forgot');
  else switchTab('login');

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

  document.querySelectorAll('[data-switch-forgot]').forEach((el) => {
    el.addEventListener('click', () => switchTab('forgot'));
  });

  const sel = document.getElementById('register-directory-select');
  if (sel) await loadDirectoriesIntoChecklist(sel);

  try {
    const r = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
    if (r.ok) window.location.replace('/index.html');
  } catch (_) {}
}

document.addEventListener('DOMContentLoaded', initAuthPage);
