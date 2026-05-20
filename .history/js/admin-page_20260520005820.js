'use strict';

(() => {
  const THEME_KEY = 'visteon-bi-hub-theme';

  const ROLE_LABEL = {
    admin: 'Administrador',
    viewer_all: 'Visualização geral',
    viewer_area: 'Visualização por diretório',
  };

  const STATUS_LABEL = {
    approved: 'Autorizado',
    pending: 'Pendente',
  };

  /** @type {{ id:number; areaKey:string }[]} */
  let directories = [];
  /** @type {any[]} */
  let users = [];

  function escapeHtml(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function applyTheme(dark) {
    const icon = document.getElementById('theme-icon');
    const root = document.documentElement;
    if (dark) {
      root.classList.add('dark');
      icon.classList.remove('fa-moon');
      icon.classList.add('fa-sun');
    } else {
      root.classList.remove('dark');
      icon.classList.remove('fa-sun');
      icon.classList.add('fa-moon');
    }
    try {
      localStorage.setItem(THEME_KEY, dark ? 'dark' : 'light');
    } catch (_) {}
  }

  function initThemeFromStorage() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      if (saved === 'dark' || saved === 'light') applyTheme(saved === 'dark');
      else applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches);
    } catch (_) {
      applyTheme(window.matchMedia('(prefers-color-scheme: dark)').matches);
    }
  }

  async function fetchJson(url, opts) {
    const r = await fetch(url, { credentials: 'include', cache: 'no-store', ...opts });
    const ct = r.headers.get('content-type') || '';
    let data = {};
    try {
      data = ct.includes('application/json') ? await r.json() : {};
    } catch (_) {
      data = {};
    }
    if (!r.ok) throw new Error(data.error || r.statusText || String(r.status));
    return data;
  }

  function fillDirectorySelect(sel, selectedIds) {
    const want = selectedIds.map(Number).filter((n) => n > 0);
    sel.innerHTML = directories
      .map((d) => {
        const id = Number(d.id);
        const selAttr = want.includes(id) ? ' selected' : '';
        return '<option value="' + id + '"' + selAttr + '>' + escapeHtml(d.areaKey) + '</option>';
      })
      .join('');
    if (!directories.length)
      sel.innerHTML = '<option value="">' + escapeHtml('(Sem diretorios)') + '</option>';
  }

  function toggleCreateDirs() {
    const role =
      [...document.querySelectorAll('input[name="create-role"]')].find((r) => r.checked)?.value ||
      'viewer_all';
    document.getElementById('create-dirs').classList.toggle('hidden', role !== 'viewer_area');
  }

  function toggleEditDirs() {
    const role =
      [...document.querySelectorAll('input[name="edit-role"]')].find((r) => r.checked)?.value ||
      'viewer_all';
    document.getElementById('edit-dirs').classList.toggle('hidden', role !== 'viewer_area');
  }

  async function reloadUsersTable() {
    const data = await fetchJson('/api/users');
    users = data.users || [];

    const tbody = document.getElementById('users-body');
    tbody.innerHTML = '';

    if (!users.length) {
      const tr = document.createElement('tr');
      tr.innerHTML =
        '<td colspan="6" class="px-4 py-6 text-center text-sm text-[var(--text-muted)]">Sem utilizadores</td>';
      tbody.appendChild(tr);
      return;
    }

    for (const u of users) {
      let dirTxt = '—';

      if (u.role === 'viewer_area') {
        const keys = Array.isArray(u.directories)
          ? u.directories.map((d) => d.areaKey || d.area_key || '').filter(Boolean)
          : [];
        dirTxt = keys.length ? keys.join(', ') : 'sem diretorio';
      }

      const isPending = (u.status || 'pending') === 'pending';

      const tr = document.createElement('tr');
      tr.className = 'border-t border-[var(--panel-border)]';

      tr.innerHTML =
        '<td class="px-4 py-3 font-medium">' +
        escapeHtml(u.username) +
        '</td>' +

        '<td class="px-4 py-3 text-sm">' +
        escapeHtml(ROLE_LABEL[u.role] || u.role) +
        '</td>' +

        '<td class="px-4 py-3 text-xs">' +
        escapeHtml(dirTxt) +
        '</td>' +

        '<td class="px-4 py-3 text-sm">' +
        '<span class="px-2 py-1 rounded text-xs ' +
        (isPending
          ? 'bg-yellow-500/20 text-yellow-600'
          : 'bg-green-500/20 text-green-600') +
        '">' +
        escapeHtml(STATUS_LABEL[u.status] || 'Pendente') +
        '</span>' +
        '</td>' +

        '<td class="px-4 py-3 text-right whitespace-nowrap">' +
        '<button type="button" data-status="' +
        u.id +
        '" class="text-xs px-3 py-1.5 rounded-lg border ' +
        (isPending
          ? 'border-green-600/35 text-green-700 hover:border-green-500'
          : 'border-yellow-600/35 text-yellow-700 hover:border-yellow-500') +
        '">' +
        (isPending ? 'Autorizar' : 'Bloquear') +
        '</button>' +
        '</td>' +

        '<td class="px-4 py-3 text-right whitespace-nowrap">' +
        '<button type="button" data-edit="' +
        u.id +
        '" class="text-xs px-3 py-1.5 rounded-lg border border-[var(--panel-border)] hover:border-[var(--v-orange)]">' +
        'Editar</button>' +
        '</td>' +

        '<td class="px-4 py-3 text-right whitespace-nowrap">' +
        '<button type="button" data-del="' +
        u.id +
        '" class="text-xs px-3 py-1.5 rounded-lg border border-red-600/35 text-red-700 dark:text-red-400 hover:border-red-500">' +
        'Apagar</button>' +
        '</td>';

      // STATUS TOGGLE (AUTORIZAR / BLOQUEAR)
      tr.querySelector('[data-status]').addEventListener('click', async () => {
        const newStatus = isPending ? 'approved' : 'pending';

          const url =
            newStatus === 'approved'
              ? '/api/users/' + u.id + '/approve'
              : '/api/users/' + u.id + '/reject';

          await fetchJson(url, {
            method: 'POST',
          });

        await reloadUsersTable();
      });

      // EDIT
      tr.querySelector('[data-edit]').addEventListener('click', () => beginEdit(u.id));

      // DELETE
      tr.querySelector('[data-del]').addEventListener('click', async () => {
        if (!confirm('Apagar utilizador "' + u.username + '" permanentemente ?')) return;

        await fetchJson('/api/users/' + u.id, { method: 'DELETE' });
        hideEdit();
        await reloadUsersTable();
      });

      tbody.appendChild(tr);
    }
  }

  function beginEdit(uid) {
    const u = users.find((x) => x.id === uid);
    if (!u) return;

    document.getElementById('edit-user-id').value = String(uid);
    document.getElementById('edit-username').value = u.username;

    document.querySelectorAll('input[name="edit-role"]').forEach((r) => {
      r.checked = r.value === u.role;
    });

    toggleEditDirs();

    const ids = Array.isArray(u.directoryIds)
      ? u.directoryIds.map(Number).filter((x) => x > 0)
      : [];

    fillDirectorySelect(document.getElementById('edit-directories'), ids);

    document.getElementById('edit-password').value = '';

    document.getElementById('edit-panel').classList.remove('hidden');
    document.getElementById('edit-panel').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function hideEdit() {
    document.getElementById('edit-panel').classList.add('hidden');
    document.getElementById('edit-user-id').value = '';
  }

  async function bootstrap() {
    initThemeFromStorage();

    document.getElementById('theme-toggle').addEventListener('click', () => {
      applyTheme(!document.documentElement.classList.contains('dark'));
    });

    let okAdmin = false;

    try {
      const me = await fetchJson('/api/auth/me');
      okAdmin = me && me.user && me.user.role === 'admin';
    } catch (_) {
      okAdmin = false;
    }

    if (!okAdmin) {
      window.location.replace('/auth.html');
      return;
    }

    const dirs = await fetchJson('/api/directories');
    directories = dirs.directories || [];

    fillDirectorySelect(document.getElementById('create-directories'), []);
    toggleCreateDirs();

    await reloadUsersTable();

    document.querySelectorAll('input[name="create-role"]').forEach((el) => {
      el.addEventListener('change', toggleCreateDirs);
    });

    document.querySelectorAll('input[name="edit-role"]').forEach((el) => {
      el.addEventListener('change', toggleEditDirs);
    });

    document.getElementById('create-user-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      const username = document.getElementById('create-username').value.trim();
      const password = document.getElementById('create-password').value;
      const role = [...document.querySelectorAll('input[name="create-role"]')].find((r) => r.checked)?.value;

      const ids = [...document.getElementById('create-directories').selectedOptions]
        .map((o) => Number(o.value))
        .filter((n) => n > 0);

      const payload = { username, password, role };

      if (role === 'viewer_area') payload.directoryIds = ids;

      await fetchJson('/api/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      document.getElementById('create-user-form').reset();
      toggleCreateDirs();
      fillDirectorySelect(document.getElementById('create-directories'), []);
      await reloadUsersTable();
    });

    document.getElementById('edit-save').addEventListener('click', async () => {
      const id = Number(document.getElementById('edit-user-id').value);
      if (!id) return;

      const username = document.getElementById('edit-username').value.trim();
      const password = document.getElementById('edit-password').value;
      const role = [...document.querySelectorAll('input[name="edit-role"]')].find((r) => r.checked)?.value;

      const ids = [...document.getElementById('edit-directories').selectedOptions]
        .map((o) => Number(o.value))
        .filter((n) => n > 0);

      const body = { username, role, directoryIds: ids };
      if (password.trim().length) body.password = password;

      await fetchJson('/api/users/' + id, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      hideEdit();
      await reloadUsersTable();
    });

    document.getElementById('edit-cancel').addEventListener('click', hideEdit);

    document.getElementById('admin-go-hub').addEventListener('click', () => {
      window.location.href = '/index.html';
    });
  }

  document.addEventListener('DOMContentLoaded', bootstrap);
})();