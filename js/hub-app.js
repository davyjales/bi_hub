/* global fetch, AbortController */

const THEME_KEY = 'visteon-bi-hub-theme';
const BI_HUB_HELPER_ORIGIN = 'http://127.0.0.1:47821';
const BANNER_DISMISS_KEY = 'bi-hub-helper-banner-dismissed';

let hubHelperAvailable = false;
let hubOpenCooldownUntil = 0;
/** @type {null | { user: { id: number; username: string; role: string }; access: { type: 'all' | 'scoped'; allowedAreaKeys?: string[] }; canManageBi?: boolean }} */
let hubSession = null;

let selectedArea = null;
/** @type {Array<{ id?: number; title: string; area: string; updated: string; file: string; preview?: string; relativePath?: string }>} */
let reports = [];
/** @type {string[]} */
let manageAreaKeys = [];
let reportsLoadedFromApi = false;

function openUrlInNewTab(url) {
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  Object.assign(a.style, {
    position: 'fixed',
    left: '-9999px',
    top: '0',
    width: '1px',
    height: '1px',
    opacity: '0',
    pointerEvents: 'none',
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
}

const PREVIEW_PLACEHOLDER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="300" viewBox="0 0 600 300"><rect fill="#1e293b" width="600" height="300"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#94a3b8" font-family="system-ui,sans-serif" font-size="15">Preview — adicione a imagem em previews/</text></svg>',
  );

/** Catálogo estático (fallback se a API de disco não estiver disponível). */
const REPORTS_FALLBACK = [];

/** Diretórios vindos da API `/api/directories` (areaKey). */
/** @type {{ id:number; areaKey:string }[]} */
let directoryCatalog = [];

/** Pasta pai selecionada na gestão de diretórios (`null` = raiz). */
let dirCreateParentKey = null;

/** Evita que respostas antigas do histórico de diretórios sobrescrevam uma mais recente. */
let dirHistoryReq = 0;

/** Pastas expandidas no menu View e na gestão de diretórios. */
const viewTreeExpanded = new Set();
const dirTreeExpanded = new Set();

function expandTreeAncestors(key, expandedSet) {
  if (!key) return;
  let p = areaKeyParent(key);
  while (p) {
    expandedSet.add(p);
    p = areaKeyParent(p);
  }
}

function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function escapeAttr(s) {
  return String(s || '').replace(/"/g, '&quot;');
}

function areaKeyParent(key) {
  if (!key || key === 'MPL') return null;
  if (key.startsWith('MPL · ')) {
    const rest = key.slice('MPL · '.length);
    const parts = rest.split('/').filter(Boolean);
    if (parts.length <= 1) return 'MPL';
    return `MPL · ${parts.slice(0, -1).join('/')}`;
  }
  const parts = key.split('/').filter(Boolean);
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join('/');
}

function areaKeyLabel(key) {
  if (key === 'MPL') return 'MPL';
  if (key.startsWith('MPL · ')) {
    const rest = key.slice('MPL · '.length);
    const parts = rest.split('/').filter(Boolean);
    return parts[parts.length - 1] || '—';
  }
  const parts = String(key || '').split('/').filter(Boolean);
  return parts[parts.length - 1] || '—';
}

function areaKeyIsAncestor(ancestor, descendant) {
  if (!ancestor || !descendant) return false;
  if (ancestor === descendant) return true;
  if (ancestor === 'MPL') return descendant === 'MPL' || descendant.startsWith('MPL · ');
  return descendant.startsWith(ancestor + '/');
}

function buildDirectoryTree(allKeys) {
  const keysSet = new Set(allKeys);
  const childrenMap = new Map();
  const roots = [];
  for (const k of keysSet) {
    const p = areaKeyParent(k);
    if (!p || !keysSet.has(p)) {
      roots.push(k);
    } else {
      if (!childrenMap.has(p)) childrenMap.set(p, []);
      childrenMap.get(p).push(k);
    }
  }
  const sortByLabel = (a, b) => areaKeyLabel(a).localeCompare(areaKeyLabel(b), 'pt-BR');
  roots.sort(sortByLabel);
  for (const [p, arr] of childrenMap.entries()) {
    arr.sort(sortByLabel);
    childrenMap.set(p, arr);
  }
  return { roots, childrenMap };
}

function normalizeChildFolderName(name) {
  const n = String(name || '').trim();
  if (!n) return null;
  if (n.includes('/') || n.includes('\\') || n.includes('..')) return null;
  if (n === 'previews') return null;
  return n;
}

function joinAreaKey(parentKey, childName) {
  const child = normalizeChildFolderName(childName);
  if (!child) return null;
  if (!parentKey) return child;
  if (parentKey === 'MPL') return `MPL · ${child}`;
  if (parentKey.startsWith('MPL · ')) return `${parentKey}/${child}`;
  return `${parentKey}/${child}`;
}

function formatDirParentLabel(parentKey) {
  if (!parentKey) return 'Raiz (nível superior)';
  return parentKey;
}

function setDirCreateParent(parentKey) {
  dirCreateParentKey = parentKey;
  if (parentKey) expandTreeAncestors(parentKey, dirTreeExpanded);
  const el = document.getElementById('dir-create-parent-label');
  if (el) el.textContent = formatDirParentLabel(parentKey);
  renderDirectoryList();
}

async function fetchJson(url, opts) {
  const r = await fetch(url, { credentials: 'include', cache: 'no-store', ...opts });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || r.statusText || String(r.status));
  return data;
}

async function loadSession() {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
    if (!r.ok) return false;
    hubSession = await r.json();
    if (hubSession?.mustChangePassword) {
      window.location.replace('/auth.html?tab=change-password');
      return false;
    }
    return !!hubSession && hubSession.user;
  } catch (_) {
    return false;
  }
}

function mapApiReport(r, id) {
  return {
    id,
    title: r.title,
    area: r.area,
    updated: r.updated || '—',
    file: r.file,
    relativePath: r.relativePath || r.relative_path || '',
    preview: r.preview || '',
  };
}

/** Junta catálogo fixo com o do disco; entradas do disco têm prioridade (mesmo título+área). */
function mergeReports(apiList, fallbackList) {
  const map = new Map();
  for (const item of fallbackList) {
    map.set(`${item.area}\0${item.title}`, item);
  }
  for (const item of apiList) {
    map.set(`${item.area}\0${item.title}`, item);
  }
  return Array.from(map.values()).map((r, i) => ({ ...r, id: i + 1 }));
}

async function loadReportsFromApi() {
  const fallback = REPORTS_FALLBACK.slice();
  reports = fallback.slice();
  reportsLoadedFromApi = false;
  try {
    const r = await fetch('/api/bi-files/reports', { credentials: 'include', cache: 'no-store' });
    const data = await r.json().catch(() => ({}));
    if (!r.ok || !Array.isArray(data.reports) || !data.reports.length) {
      return false;
    }
    const fromApi = data.reports.map((item, i) => mapApiReport(item, i + 1));
    if (!fromApi.length) return false;
    reports = mergeReports(fromApi, fallback);
    reportsLoadedFromApi = true;
    return true;
  } catch (_) {
    return false;
  }
}

async function loadManageAreas() {
  manageAreaKeys = [];
  if (!userCanManageBi()) return;
  try {
    const data = await fetchJson('/api/bi-files/manage-areas');
    if (!data.canManage) return;
    if (data.areaKeys === 'all') {
      try {
        const dirs = await fetchJson('/api/directories');
        manageAreaKeys = (dirs.directories || []).map((d) => d.areaKey).filter(Boolean);
      } catch (_) {
        manageAreaKeys = [];
      }
      return;
    }
    manageAreaKeys = data.areaKeys || [];
  } catch (_) {
    manageAreaKeys = [];
  }
}

function userCanManageBi() {
  if (hubSession?.canManageBi) return true;
  const role = hubSession?.user?.role;
  return role === 'admin' || role === 'viewer_all' || role === 'owner_setor';
}

function reportManageKey(r) {
  return r?.relativePath ? String(r.relativePath) : '';
}

function canDeleteReport(r) {
  if (!userCanManageBi() || !reportManageKey(r)) return false;
  const role = hubSession?.user?.role;
  if (role === 'admin' || role === 'viewer_all') return true;
  const areaKey = r.area;
  return manageAreaKeys.some((allowedKey) => {
    if (!allowedKey || !areaKey) return false;
    if (allowedKey === areaKey) return true;
    if (allowedKey === 'MPL') return areaKey === 'MPL' || areaKey.startsWith('MPL · ');
    return areaKey.startsWith(allowedKey + '/');
  });
}

function initialsFrom(username) {
  const p = String(username || '').trim().split(/[\s._-]+/).filter(Boolean);
  if (!p.length) return '?';
  if (p.length === 1) return p[0].slice(0, 2).toUpperCase();
  return (p[0][0] + p[p.length - 1][0]).toUpperCase();
}

function profileLabel(role) {
  const map = {
    admin: 'Administrador',
    viewer_all: 'Owner ADM',
    viewer_area: 'Viewer',
    owner_setor: 'Owner Setor',
  };
  return map[role] || role;
}


function reportsFiltered(list) {
  const access = hubSession?.access;
  if (!access || access.type === 'all') return list;
  const keys = new Set(access.allowedAreaKeys || []);
  return list.filter((r) => r.area && keys.has(r.area));
}

/** Lista para exibir: se a API “esvaziar” o filtro, volta ao catálogo fixo permitido. */
function reportsForDisplay() {
  const current = reportsFiltered(reports);
  if (current.length) return current;
  if (reportsLoadedFromApi) {
    const fromFallback = reportsFiltered(REPORTS_FALLBACK);
    if (fromFallback.length) return fromFallback;
  }
  return current;
}

function allReportsTitleTerm() {
  return hubSession?.access?.type === 'scoped' ? 'Painel autorizado' : 'Todos os Relatórios';
}

function applyHeaderProfile() {
  const nm = hubSession?.user?.username ?? '—';
  const elName = document.getElementById('hub-user-name');
  const elRole = document.getElementById('hub-user-role');
  const elAvatar = document.getElementById('hub-user-avatar');
  const adminLink = document.getElementById('hub-admin-link');
  const dirTab = document.getElementById('tab-gestao-diretorio');
  const pbiTab = document.getElementById('tab-gestao-pbi');
  if (elName) elName.textContent = nm;
  if (elRole) elRole.textContent = hubSession?.user?.role ? profileLabel(hubSession.user.role) : '—';
  if (elAvatar) elAvatar.textContent = initialsFrom(nm);
  if (adminLink) adminLink.classList.toggle('hidden', hubSession?.user?.role !== 'admin');
  if (dirTab) dirTab.classList.toggle('hidden', hubSession?.user?.role !== 'admin');
  if (pbiTab) pbiTab.classList.toggle('hidden', !userCanManageBi());
  document.documentElement.classList.toggle('hub-can-manage-bi', userCanManageBi());
}

function refreshHomeCards() {
  filterByArea(selectedArea);
}

function reportsForMplRoot() {
  return reportsForDisplay().filter((r) => r.area === 'MPL' || r.area.startsWith('MPL ·'));
}

function setLauncherBanner(visible) {
  const b = document.getElementById('launcher-helper-banner');
  if (!b) return;
  if (!visible) {
    b.classList.add('hidden');
    return;
  }
  try {
    if (sessionStorage.getItem(BANNER_DISMISS_KEY) === '1') return;
  } catch (_) {}
  b.classList.remove('hidden');
}

async function probeLauncher() {
  try {
    const c = new AbortController();
    const id = setTimeout(() => c.abort(), 1500);
    const r = await fetch(BI_HUB_HELPER_ORIGIN + '/api/ping', {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      signal: c.signal,
    });
    clearTimeout(id);
    hubHelperAvailable = r.ok;
  } catch (_) {
    hubHelperAvailable = false;
  }
  setLauncherBanner(!hubHelperAvailable);
}

async function ensureHelper() {
  if (hubHelperAvailable) return true;
  try {
    const c = new AbortController();
    const id = setTimeout(() => c.abort(), 700);
    const r = await fetch(BI_HUB_HELPER_ORIGIN + '/api/ping', {
      method: 'GET',
      mode: 'cors',
      cache: 'no-store',
      signal: c.signal,
    });
    clearTimeout(id);
    if (r.ok) {
      hubHelperAvailable = true;
      setLauncherBanner(false);
      return true;
    }
  } catch (_) {}
  return false;
}

function toFileUrl(winPath) {
  const parts = winPath.replace(/\\/g, '/').split('/');
  const pathPart = parts.map((seg) => (/^[A-Za-z]:$/.test(seg) ? seg : encodeURIComponent(seg))).join('/');
  return 'file:///' + pathPart;
}

function applyTheme(dark) {
  const root = document.documentElement;
  const icon = document.getElementById('theme-icon');
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

document.getElementById('theme-toggle')?.addEventListener('click', () => {
  applyTheme(!document.documentElement.classList.contains('dark'));
});

function renderViewMenu() {
  const viewMenu = document.getElementById('view-megamenu');
  const treeBox = document.getElementById('view-area-tree');
  if (!viewMenu || !treeBox) return;

  const access = hubSession?.access;
  const scoped = access?.type === 'scoped';
  const allLabel = scoped ? 'Painel autorizado' : 'Todas as áreas';
  const allActive = selectedArea === null ? ' is-active' : '';

  const allRow = `
    <button type="button" data-area="__all__" class="${allActive}">
      <i class="fa-solid fa-layer-group hub-icon-blue text-xs w-4 shrink-0"></i>
      <span class="hub-view-area-label text-[13px]">${allLabel}</span>
    </button>`;

  const allKeys = (directoryCatalog || []).map((d) => d.areaKey).filter(Boolean);
  const allKeysSet = new Set(allKeys);

  const allowedSet =
    !access || access.type === 'all'
      ? new Set(allKeys)
      : new Set((access.allowedAreaKeys || []).filter((k) => allKeysSet.has(k)));

  const keysToShow = new Set();
  for (const k of allowedSet) {
    keysToShow.add(k);
    let p = areaKeyParent(k);
    while (p) {
      keysToShow.add(p);
      p = areaKeyParent(p);
    }
  }

  const { roots, childrenMap } = buildDirectoryTree(Array.from(keysToShow));

  if (selectedArea) expandTreeAncestors(selectedArea, viewTreeExpanded);

  const renderNode = (key) => {
    const children = childrenMap.get(key) || [];
    const hasChildren = children.length > 0;
    const isExpanded = viewTreeExpanded.has(key);
    const isActive = selectedArea === key || areaKeyIsAncestor(key, selectedArea);
    const activeClass = isActive ? ' is-active' : '';
    const label = areaKeyLabel(key);
    const icon = hasChildren && isExpanded ? 'fa-folder-open' : 'fa-folder';

    const toggle = hasChildren
      ? `<button type="button" class="hub-tree-toggle" data-view-tree-toggle="${escapeAttr(key)}" aria-label="Mostrar ou ocultar subpastas" aria-expanded="${isExpanded}">
           <i class="fa-solid fa-chevron-right hub-tree-chevron${isExpanded ? ' is-open' : ''}" aria-hidden="true"></i>
         </button>`
      : '<span class="hub-tree-spacer" aria-hidden="true"></span>';

    return `
      <div class="hub-tree-branch${isExpanded ? ' is-expanded' : ''}">
        <div class="hub-tree-row">
          ${toggle}
          <button type="button" data-area="${escapeAttr(key)}" class="hub-tree-area-btn${activeClass}">
            <i class="fa-solid ${icon} hub-icon-orange text-xs w-4 shrink-0"></i>
            <span class="hub-view-area-label truncate">${escapeHtml(label)}</span>
          </button>
        </div>
        ${
          hasChildren
            ? `<div class="hub-tree-children space-y-0.5${isExpanded ? '' : ' hidden'}">${children.map(renderNode).join('')}</div>`
            : ''
        }
      </div>`;
  };

  treeBox.innerHTML = allRow + roots.map(renderNode).join('');

  treeBox.querySelectorAll('[data-view-tree-toggle]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const key = btn.getAttribute('data-view-tree-toggle');
      if (!key) return;
      if (viewTreeExpanded.has(key)) viewTreeExpanded.delete(key);
      else viewTreeExpanded.add(key);
      renderViewMenu();
    });
  });

  treeBox.querySelectorAll('[data-area]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = btn.getAttribute('data-area');
      filterByArea(v === '__all__' ? null : v);
      viewMenu.classList.add('hidden');
      showHubPanel('home');
      setActiveTab('view');
    });
  });
}

function renderCards(filteredReports) {
  const grid = document.getElementById('reports-grid');
  if (!filteredReports.length) {
    grid.innerHTML = `
          <div class="col-span-full rounded-2xl border border-dashed border-[var(--panel-border)] bg-[var(--panel-bg)] px-6 py-16 text-center">
            <p class="text-sm font-medium text-[var(--text-primary)]">Nenhum relatório nesta área</p>
            <p class="mt-1 text-xs hub-section-label">Adicione entradas em <span class="font-mono">reports</span> ou escolha outra pasta.</p>
          </div>`;
    return;
  }
  grid.innerHTML = filteredReports
    .map((r) => {
      const previewSrc = r.preview ? r.preview : PREVIEW_PLACEHOLDER;
      const manageKey = reportManageKey(r);
      const canManageThis = canDeleteReport(r);
      const manageBtns = canManageThis
        ? `<div class="hub-card-manage-actions">
            <button type="button" class="bi-edit-btn rounded-lg bg-slate-900/80 px-2 py-1 text-[10px] font-semibold text-white hover:bg-slate-900" data-edit="${encodeURIComponent(manageKey)}" title="Editar relatório">Editar</button>
            <button type="button" class="bi-move-btn rounded-lg bg-blue-900/80 px-2 py-1 text-[10px] font-semibold text-white hover:bg-blue-900"data-move="${encodeURIComponent(manageKey)}" title="Mover para outro diretório">Mover</button>
            <button type="button" class="bi-delete-btn rounded-lg bg-red-600/90 px-2 py-1 text-[10px] font-semibold text-white hover:bg-red-600" data-delete="${encodeURIComponent(manageKey)}" title="Excluir relatório">Excluir</button>
          </div>`
        : '';
      return `
        <article class="hub-card rounded-2xl overflow-hidden cursor-pointer relative" data-open="${encodeURIComponent(r.file)}">
          ${manageBtns}
          <div class="h-44 relative overflow-hidden bg-black">
            <img src="${previewSrc}" alt="" class="preview-img js-preview-thumb w-full h-full object-cover opacity-95" loading="lazy">
            <div class="hub-preview-overlay absolute inset-0 flex items-end p-3">
              <span class="hub-cta-btn text-xs font-semibold px-4 py-2 rounded-xl w-full flex items-center justify-center gap-2">
                <i class="fa-solid fa-arrow-up-right-from-square hub-icon-blue"></i>
                Abrir no Power BI Desktop
              </span>
            </div>
          </div>
          <div class="p-4">
            <span class="hub-tag inline-block px-2.5 py-1 text-[11px] rounded-lg mb-2">${r.area}</span>
            <h3 class="font-semibold text-base leading-snug mb-1 line-clamp-2">${r.title}</h3>
            <p class="text-xs hub-section-label">Atualizado em ${r.updated}</p>
          </div>
        </article>`;
    })
    .join('');

  grid.querySelectorAll('[data-open]').forEach((el) => {
    el.addEventListener('click', (ev) => {
      if (ev.target.closest('.bi-delete-btn')) return;
      if (ev.target.closest('.bi-edit-btn')) return;
      if (ev.target.closest('.bi-move-btn')) return;
      openReport(decodeURIComponent(el.getAttribute('data-open')));
    });
  });
  grid.querySelectorAll('.bi-delete-btn').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      deleteReport(decodeURIComponent(btn.getAttribute('data-delete')));
    });
  });
  grid.querySelectorAll('.bi-edit-btn').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const rel = decodeURIComponent(btn.getAttribute('data-edit'));
      const r = reportsForDisplay().find((x) => x.relativePath === rel);
      if (r) openEditModal(r);
    });
  });
  grid.querySelectorAll('.bi-move-btn').forEach((btn) => {
    btn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      const rel = decodeURIComponent(btn.getAttribute('data-move'));
      const r = reportsForDisplay().find((x) => x.relativePath === rel);
      if (r) openMoveModal(r);
    });
  });
  grid.querySelectorAll('img.js-preview-thumb').forEach((img) => {
    img.addEventListener('error', function onThumbErr() {
      this.removeEventListener('error', onThumbErr);
      this.src = PREVIEW_PLACEHOLDER;
    });
  });
}

async function openReport(winPath) {
  if (Date.now() < hubOpenCooldownUntil) return;
  if (!confirm('Deseja abrir este arquivo .pbix no Power BI Desktop?')) return;
  hubOpenCooldownUntil = Date.now() + 900;
  if (await ensureHelper()) {
    const url = BI_HUB_HELPER_ORIGIN + '/api/open?path=' + encodeURIComponent(winPath);
    openUrlInNewTab(url);
    return;
  }
  const cmdHintEl = document.getElementById('launcher-helper-cmd-hint');
  if (cmdHintEl) cmdHintEl.classList.remove('hidden');
  const msg =

    'O ajudante local (BI-Hub-Helper.ps1) não está em execução. Sem ele, o navegador pode abrir a Microsoft Store em vez do Power BI Desktop.\n\n' +
    'Execute BI-Hub-Helper.ps1 na pasta do hub e tente de novo.\n\n' +
    'Continuar mesmo assim pelo navegador? (abre numa nova guia)';
  if (confirm(msg)) openUrlInNewTab(toFileUrl(winPath));
}

function filterByArea(area) {
  selectedArea = area;
  if (area === null) {
    document.getElementById('area-title').textContent = allReportsTitleTerm();
    renderCards(reportsForDisplay());
  } else if (area === 'MPL') {
    document.getElementById('area-title').textContent = 'MPL';
    renderCards(reportsForMplRoot());
  } else {
    document.getElementById('area-title').textContent = area;
    renderCards(
      reportsForDisplay().filter(
        (r) => r.area === area || (r.area && r.area.startsWith(area + '/')),
      ),
    );
  }
  renderViewMenu();
}


document.getElementById('launcher-helper-banner-dismiss')?.addEventListener('click', () => {
  try {
    sessionStorage.setItem(BANNER_DISMISS_KEY, '1');
  } catch (_) {}
  setLauncherBanner(false);
});

const cmdHintEl = document.getElementById('launcher-helper-cmd-hint');
const dlBtn = document.getElementById('launcher-helper-download');
if (dlBtn && cmdHintEl) {
  dlBtn.addEventListener('click', () => {
    cmdHintEl.classList.add('hidden');
  });
  // Se o helper falhar ao abrir algum relatório, mostramos o comando (ver openReport).
}

initTheme();

function setUploadMsg(text, isError) {
  const el = document.getElementById('bi-upload-msg');
  if (!el) return;
  if (!text) {
    el.classList.add('hidden');
    return;
  }
  el.textContent = text;
  el.classList.remove('hidden');
  el.classList.toggle('text-red-500', !!isError);
  el.classList.toggle('text-emerald-600', !isError);
}

function manageableAreaKeysList() {
  const allKeys = (directoryCatalog || []).map((d) => d.areaKey).filter(Boolean);
  return manageAreaKeys.length
    ? manageAreaKeys.slice()
    : hubSession?.access?.type === 'scoped'
      ? hubSession.access.allowedAreaKeys || []
      : allKeys;
}

function fillManageAreaSelect() {
  const sel = document.getElementById('bi-upload-area');
  if (!sel) return;
  const keys = manageableAreaKeysList();
  sel.innerHTML = (keys || [])
    .map((k) => `<option value="${escapeAttr(k)}">${escapeHtml(k)}</option>`)
    .join('');
}

function fillMoveAreaSelect(currentAreaKey) {
  const sel = document.getElementById('bi-move-area');
  if (!sel) return;
  const keys = manageableAreaKeysList().filter((k) => k && k !== currentAreaKey);
  if (!keys.length) {
    sel.innerHTML = '<option value="">(Sem outros diretórios disponíveis)</option>';
    sel.disabled = true;
    return;
  }
  sel.disabled = false;
  sel.innerHTML = keys.map((k) => `<option value="${escapeAttr(k)}">${escapeHtml(k)}</option>`).join('');
}

async function loadDirHistory() {
  const box = document.getElementById('dir-history-list');
  if (!box) return;
  if (hubSession?.user?.role !== 'admin') {
    box.innerHTML = '<p class="text-sm hub-section-label">Histórico disponível apenas para administradores.</p>';
    return;
  }
  const reqId = ++dirHistoryReq;
  box.innerHTML = '<p class="text-sm hub-section-label">A carregar…</p>';
  try {
    const data = await fetchJson('/api/directories/history?limit=30');
    if (reqId !== dirHistoryReq) return;
    const entries = Array.isArray(data.entries) ? data.entries : [];
    if (!entries.length) {
      box.innerHTML = '<p class="text-sm hub-section-label">Sem registos ainda.</p>';
      return;
    }
    box.innerHTML = entries
      .map((e) => {
        const action =
          e.action === 'create' ? 'Criou' : e.action === 'rename' ? 'Renomeou' : 'Excluiu';
        const when = e.createdAt ? new Date(e.createdAt).toLocaleString('pt-BR') : '';
        const pathDetail =
          e.action === 'rename' && e.oldAreaKey
            ? `<span class="font-mono text-xs block mt-1 leading-snug">${escapeHtml(e.oldAreaKey)} → ${escapeHtml(e.areaKey)}</span>`
            : `<span class="font-mono text-xs block mt-1 leading-snug">${escapeHtml(e.areaKey)}</span>`;
        return `<div class="rounded-lg border border-[var(--panel-border)] px-3 py-2.5 space-y-1">
          <span class="text-sm font-semibold text-[var(--text-primary)]">${action}</span>
          ${pathDetail}
          <span class="block text-xs hub-section-label">${escapeHtml(e.username)} · ${when}</span>
        </div>`;
      })
      .join('');
  } catch (err) {
    if (reqId !== dirHistoryReq) return;
    box.innerHTML = `<p class="text-sm text-red-500">${err.message || 'Erro ao carregar histórico.'}</p>`;
  }
}

async function loadBiHistory() {
  const box = document.getElementById('bi-history-list');
  if (!box) return;
  if (!userCanManageBi()) {
    box.innerHTML = '<p class="text-sm hub-section-label">Sem permissão para ver o histórico.</p>';
    return;
  }
  box.innerHTML = '<p class="text-sm hub-section-label">A carregar…</p>';
  try {
    const data = await fetchJson('/api/bi-files/history?limit=30');
    const entries = data.entries || [];
    if (!entries.length) {
      box.innerHTML = '<p class="text-sm hub-section-label">Sem registos ainda.</p>';
      return;
    }
    box.innerHTML = entries
      .map((e) => {
        const action =
          e.action === 'upload'
            ? 'Inseriu'
            : e.action === 'edit'
              ? 'Editou'
              : e.action === 'move'
                ? 'Moveu'
                : 'Excluiu';
        const when = e.createdAt ? new Date(e.createdAt).toLocaleString('pt-BR') : '';
        const areaDetail =
          e.action === 'move' && e.oldAreaKey
            ? `<span class="font-mono text-xs block mt-1 leading-snug">${escapeHtml(e.oldAreaKey)} → ${escapeHtml(e.areaKey)}</span>`
            : `<span class="block text-xs hub-section-label">${escapeHtml(e.areaKey)}</span>`;
        return `<div class="rounded-lg border border-[var(--panel-border)] px-3 py-2.5 space-y-1">
          <span class="text-sm font-semibold text-[var(--text-primary)]">${action}</span>
          <span class="font-mono text-xs block leading-snug">${escapeHtml(e.fileName)}</span>
          ${areaDetail}
          <span class="block text-xs hub-section-label">${escapeHtml(e.username)} · ${when}</span>
        </div>`;
      })
      .join('');
  } catch (err) {
    box.innerHTML = `<p class="text-sm text-red-500">${err.message || 'Erro ao carregar histórico.'}</p>`;
  }
}

function showHubPanel(panelId) {
  document.querySelectorAll('.hub-content-panel').forEach((el) => {
    const name = el.id.replace(/^hub-panel-/, '');
    el.classList.toggle('is-active', name === panelId);
  });
  if (panelId === 'home') refreshHomeCards();
}

function openGestaoPbiPanel() {
  if (!userCanManageBi()) return;
  fillManageAreaSelect();
  setUploadMsg('');
  const fileInput = document.getElementById('bi-upload-file');
  const previewInput = document.getElementById('bi-upload-preview');
  if (fileInput) fileInput.value = '';
  if (previewInput) previewInput.value = '';
  showHubPanel('gestao-pbi');
  setActiveTab('gestao-pbi');
  loadBiHistory();
}

async function refreshReportsView() {
  await loadReportsFromApi();
  filterByArea(selectedArea);
}

async function deleteReport(relativePath) {
  if (!relativePath) return;
  if (!confirm('Excluir este relatório .pbix do servidor? Esta ação não pode ser desfeita.')) return;
  try {
    await fetchJson('/api/bi-files/file', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relativePath }),
    });
    await refreshReportsView();
    loadBiHistory();
  } catch (err) {
    alert(err.message || 'Não foi possível excluir.');
  }
}

document.getElementById('bi-upload-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  setUploadMsg('A enviar…', false);
  const areaKey = document.getElementById('bi-upload-area')?.value;
  const fileInput = document.getElementById('bi-upload-file');
  const previewInput = document.getElementById('bi-upload-preview');
  const file = fileInput?.files?.[0];
  const preview = previewInput?.files?.[0] || null;
  if (!areaKey || !file) {
    setUploadMsg('Selecione área e ficheiro .pbix.', true);
    return;
  }
  const fd = new FormData();
  fd.append('areaKey', areaKey);
  fd.append('fileName', file.name);
  fd.append('file', file);
  if (preview) fd.append('preview', preview);
  try {
    const r = await fetch('/api/bi-files/upload', {
      method: 'POST',
      credentials: 'include',
      body: fd,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Falha no envio.');
    setUploadMsg('Relatório enviado com sucesso.', false);
    fileInput.value = '';
    previewInput.value = '';
    await refreshReportsView();
    loadBiHistory();
  } catch (err) {
    setUploadMsg(err.message || 'Erro no envio.', true);
  }
});

function setEditMsg(text, isError) {
  const el = document.getElementById('bi-edit-msg');
  if (!el) return;
  if (!text) {
    el.classList.add('hidden');
    return;
  }
  el.textContent = text;
  el.classList.remove('hidden');
  el.classList.toggle('text-red-500', !!isError);
  el.classList.toggle('text-emerald-600', !isError);
}

function openEditModal(report) {
  if (!report?.relativePath) return;
  document.getElementById('bi-edit-relative-path').value = report.relativePath;
  document.getElementById('bi-edit-title-input').value = report.title || '';
  document.getElementById('bi-edit-preview').value = '';
  setEditMsg('');

  const img = document.getElementById('bi-edit-current-preview');
  if (img) img.src = report.preview ? report.preview : PREVIEW_PLACEHOLDER;

  document.getElementById('bi-edit-modal')?.classList.remove('hidden');
}

function closeEditModal() {
  document.getElementById('bi-edit-modal')?.classList.add('hidden');
}

document.getElementById('bi-edit-close')?.addEventListener('click', closeEditModal);
document.getElementById('bi-edit-cancel')?.addEventListener('click', closeEditModal);
document.getElementById('bi-edit-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'bi-edit-modal') closeEditModal();
});

function setMoveMsg(text, isError) {
  const el = document.getElementById('bi-move-msg');
  if (!el) return;
  if (!text) {
    el.classList.add('hidden');
    return;
  }
  el.textContent = text;
  el.classList.remove('hidden');
  el.classList.toggle('text-red-500', !!isError);
  el.classList.toggle('text-emerald-600', !isError);
}

function openMoveModal(report) {
  if (!report?.relativePath) return;
  document.getElementById('bi-move-relative-path').value = report.relativePath;
  const nameEl = document.getElementById('bi-move-report-name');
  const areaEl = document.getElementById('bi-move-current-area');
  if (nameEl) nameEl.textContent = report.title || report.fileName || 'Relatório';
  if (areaEl) areaEl.textContent = `Diretório atual: ${report.area || '—'}`;
  fillMoveAreaSelect(report.area || '');
  setMoveMsg('');
  document.getElementById('bi-move-modal')?.classList.remove('hidden');
}

function closeMoveModal() {
  document.getElementById('bi-move-modal')?.classList.add('hidden');
}

document.getElementById('bi-move-close')?.addEventListener('click', closeMoveModal);
document.getElementById('bi-move-cancel')?.addEventListener('click', closeMoveModal);
document.getElementById('bi-move-modal')?.addEventListener('click', (e) => {
  if (e.target.id === 'bi-move-modal') closeMoveModal();
});

document.getElementById('bi-move-save')?.addEventListener('click', async () => {
  const relativePath = document.getElementById('bi-move-relative-path')?.value;
  const targetAreaKey = document.getElementById('bi-move-area')?.value;
  const sel = document.getElementById('bi-move-area');
  if (!relativePath || !targetAreaKey || sel?.disabled) {
    setMoveMsg('Selecione um diretório de destino.', true);
    return;
  }
  setMoveMsg('A mover…', false);
  try {
    const data = await fetchJson('/api/bi-files/move', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ relativePath, targetAreaKey }),
    });
    if (!data.moved) {
      setMoveMsg('O relatório já está neste diretório.', true);
      return;
    }
    setMoveMsg('Relatório movido com sucesso.', false);
    closeMoveModal();
    await refreshReportsView();
    loadBiHistory();
  } catch (err) {
    setMoveMsg(err.message || 'Erro ao mover.', true);
  }
});

document.getElementById('bi-edit-save')?.addEventListener('click', async () => {
  const relativePath = document.getElementById('bi-edit-relative-path')?.value;
  const newTitle = document.getElementById('bi-edit-title-input')?.value?.trim();
  const previewInput = document.getElementById('bi-edit-preview');
  const preview = previewInput?.files?.[0] || null;

  if (!relativePath || !newTitle) {
    setEditMsg('Informe o nome do PBI.', true);
    return;
  }

  setEditMsg('A guardar…', false);
  const fd = new FormData();
  fd.append('relativePath', relativePath);
  fd.append('newTitle', newTitle);
  if (preview) fd.append('preview', preview);

  try {
    const r = await fetch('/api/bi-files/file', {
      method: 'PATCH',
      credentials: 'include',
      body: fd,
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || 'Falha ao guardar.');
    setEditMsg('Alterações guardadas.', false);
    closeEditModal();
    await refreshReportsView();
    loadBiHistory();
  } catch (err) {
    setEditMsg(err.message || 'Erro ao guardar.', true);
  }
});

function setActiveTab(tabId) {
  const tabs = document.querySelectorAll('.hub-nav-tab[data-tab]');
  tabs.forEach((btn) => {
    const id = btn.getAttribute('data-tab');
    if (id === tabId) btn.classList.add('is-active');
    else btn.classList.remove('is-active');
  });
}

async function loadDirectoriesCatalog() {
  try {
    const data = await fetchJson('/api/directories');
    directoryCatalog = data.directories || [];
  } catch (_) {
    directoryCatalog = [];
  }
}

async function refreshDirectoryUi() {
  await loadDirectoriesCatalog();
  await loadManageAreas();
  try {
    renderViewMenu();
    renderDirectoryList();
  } catch (err) {
    console.error('[bi-hub] refreshDirectoryUi:', err);
    const listBox = document.getElementById('dir-list');
    if (listBox) {
      listBox.innerHTML =
        '<p class="text-xs text-red-500">Não foi possível desenhar a árvore de diretórios. Recarregue a página.</p>';
    }
  } finally {
    await loadDirHistory();
  }
}

function initNavInteractions() {
  const tabHome = document.getElementById('tab-home');
  const tabView = document.getElementById('tab-view');
  const viewMenu = document.getElementById('view-megamenu');
  const tabGestaoPbi = document.getElementById('tab-gestao-pbi');
  const tabGestaoDir = document.getElementById('tab-gestao-diretorio');

  if (tabHome) {
    tabHome.addEventListener('click', () => {
      selectedArea = null;
      showHubPanel('home');
      setActiveTab('home');
      document.getElementById('area-title').textContent = allReportsTitleTerm();
      renderCards(reportsForDisplay());
      renderViewMenu();
    });
  }

  if (tabView && viewMenu) {
    let hoverTimeout = null;

    function openMenu() {
      clearTimeout(hoverTimeout);
      viewMenu.classList.remove('hidden');
    }
    function closeMenuDelayed() {
      clearTimeout(hoverTimeout);
      hoverTimeout = setTimeout(() => {
        viewMenu.classList.add('hidden');
      }, 180);
    }

    tabView.addEventListener('mouseenter', openMenu);
    tabView.addEventListener('mouseleave', closeMenuDelayed);
    viewMenu.addEventListener('mouseenter', () => {
      clearTimeout(hoverTimeout);
    });
    viewMenu.addEventListener('mouseleave', closeMenuDelayed);

    tabView.addEventListener('click', () => {
      if (viewMenu.classList.contains('hidden')) {
        viewMenu.classList.remove('hidden');
      } else {
        viewMenu.classList.add('hidden');
      }
    });
  }

  if (tabGestaoPbi) {
    tabGestaoPbi.addEventListener('click', () => {
      openGestaoPbiPanel();
    });
  }

  if (tabGestaoDir) {
    tabGestaoDir.addEventListener('click', () => {
      if (hubSession?.user?.role === 'admin') {
        openGestaoDiretorioPanel();
      }
    });
  }
}

function setDirMsg(text, isError) {
  const el = document.getElementById('dir-manage-msg');
  if (!el) return;
  if (!text) {
    el.classList.add('hidden');
    return;
  }
  el.textContent = text;
  el.classList.remove('hidden');
  el.classList.toggle('text-red-500', !!isError);
  el.classList.toggle('text-emerald-600', !isError);
}

function renderDirectoryList() {
  const box = document.getElementById('dir-list');
  if (!box) return;

  const byKey = new Map((directoryCatalog || []).map((d) => [d.areaKey, d]));
  const allKeys = Array.from(byKey.keys()).filter(Boolean);

  if (!allKeys.length) {
    box.innerHTML = '<p class="text-xs hub-section-label">Sem diretórios. Use o formulário acima para criar na raiz.</p>';
    return;
  }

  const { roots, childrenMap } = buildDirectoryTree(allKeys);

  if (dirCreateParentKey) expandTreeAncestors(dirCreateParentKey, dirTreeExpanded);

  const renderManageNode = (key) => {
    const entry = byKey.get(key);
    const id = entry?.id;
    const children = childrenMap.get(key) || [];
    const hasChildren = children.length > 0;
    const isExpanded = dirTreeExpanded.has(key);
    const isParent = dirCreateParentKey === key;
    const parentClass = isParent ? ' dir-parent-selected' : '';
    const label = areaKeyLabel(key);
    const fullPath = key !== label ? `<span class="text-[10px] hub-section-label truncate block sm:inline sm:ml-1">${escapeHtml(key)}</span>` : '';

    const toggle = hasChildren
      ? `<button type="button" class="hub-tree-toggle self-start shrink-0" data-dir-tree-toggle="${escapeAttr(key)}" aria-label="Mostrar ou ocultar subpastas" aria-expanded="${isExpanded}">
           <i class="fa-solid fa-chevron-right hub-tree-chevron${isExpanded ? ' is-open' : ''}" aria-hidden="true"></i>
         </button>`
      : '<span class="hub-tree-spacer self-start shrink-0" aria-hidden="true"></span>';

    const adminRow =
      id != null
        ? `<div class="flex flex-wrap gap-2 mt-2 sm:mt-0 sm:shrink-0 w-full sm:w-auto">
            <input class="hub-search min-w-0 flex-1 rounded-xl py-1.5 px-2 text-xs sm:max-w-[220px]" value="${escapeAttr(key)}" data-dir-name="${id}" title="area_key completo">
            <button type="button" class="rounded-lg border border-[var(--panel-border)] px-2 py-1 text-[10px] font-semibold hover:border-[var(--v-orange)] hover:text-[var(--v-orange)] transition" data-dir-save="${id}">Renomear</button>
            <button type="button" class="rounded-lg border border-red-600/35 px-2 py-1 text-[10px] font-semibold text-red-700 dark:text-red-400 hover:border-red-500 transition" data-dir-del="${id}">Excluir</button>
          </div>`
        : '';

    return `
      <div class="dir-tree-item hub-tree-branch${parentClass}${isExpanded ? ' is-expanded' : ''}">
        <div class="dir-tree-row flex flex-col sm:flex-row sm:items-start gap-1 border border-[var(--panel-border)] rounded-xl p-2">
          <div class="hub-tree-row min-w-0 flex-1">
            ${toggle}
            <button type="button" class="dir-tree-pick min-w-0 flex-1" data-dir-pick-parent="${escapeAttr(key)}" title="Criar subpasta aqui">
              <i class="fa-solid fa-folder hub-icon-orange text-xs w-4 shrink-0"></i>
              <span class="font-medium truncate">${escapeHtml(label)}</span>
              ${fullPath}
            </button>
          </div>
          ${adminRow}
        </div>
        ${
          hasChildren
            ? `<div class="hub-tree-children space-y-1 mt-1${isExpanded ? '' : ' hidden'}">${children.map(renderManageNode).join('')}</div>`
            : ''
        }
      </div>`;
  };

  const rootPickClass = dirCreateParentKey === null ? ' dir-parent-selected' : '';
  box.innerHTML = `
    <div class="dir-tree-item${rootPickClass} mb-2">
      <button type="button" class="dir-tree-pick w-full border border-dashed border-[var(--panel-border)] rounded-xl" data-dir-pick-parent="" title="Criar pasta no nível superior">
        <i class="fa-solid fa-folder-plus hub-icon-blue text-xs w-4 shrink-0"></i>
        <span>Raiz — novo diretório no nível superior</span>
      </button>
    </div>
    ${roots.map(renderManageNode).join('')}
  `;

  box.querySelectorAll('[data-dir-tree-toggle]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const key = btn.getAttribute('data-dir-tree-toggle');
      if (!key) return;
      if (dirTreeExpanded.has(key)) dirTreeExpanded.delete(key);
      else dirTreeExpanded.add(key);
      renderDirectoryList();
    });
  });

  box.querySelectorAll('[data-dir-pick-parent]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const raw = btn.getAttribute('data-dir-pick-parent');
      setDirCreateParent(raw === '' || raw == null ? null : raw);
      document.getElementById('dir-create-name')?.focus();
    });
  });

  box.querySelectorAll('[data-dir-save]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.getAttribute('data-dir-save'));
      const input = box.querySelector(`[data-dir-name="${id}"]`);
      const areaKey = input?.value?.trim();
      if (!id || !areaKey) return;
      setDirMsg('A renomear…', false);
      try {
        await fetchJson('/api/directories/' + id, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ areaKey }),
        });
        await refreshDirectoryUi();
        setDirMsg('Diretório atualizado.', false);
      } catch (err) {
        setDirMsg(err.message || 'Erro ao renomear.', true);
      }
    });
  });

  box.querySelectorAll('[data-dir-del]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = Number(btn.getAttribute('data-dir-del'));
      if (!id) return;
      if (!confirm('Excluir este diretório do disco e do sistema?')) return;
      setDirMsg('A excluir…', false);
      try {
        await fetchJson('/api/directories/' + id, { method: 'DELETE' });
        await refreshDirectoryUi();
        setDirMsg('Diretório excluído.', false);
      } catch (err) {
        setDirMsg(err.message || 'Erro ao excluir.', true);
      }
    });
  });
}

function openGestaoDiretorioPanel() {
  if (hubSession?.user?.role !== 'admin') return;
  setDirMsg('');
  dirCreateParentKey = null;
  const parentLabel = document.getElementById('dir-create-parent-label');
  if (parentLabel) parentLabel.textContent = formatDirParentLabel(null);
  const nameInput = document.getElementById('dir-create-name');
  if (nameInput) nameInput.value = '';
  showHubPanel('gestao-diretorio');
  setActiveTab('gestao-diretorio');
  loadDirHistory();
  refreshDirectoryUi().catch((err) => {
    console.error('[bi-hub] refreshDirectoryUi:', err);
    try {
      renderDirectoryList();
    } catch (_) {
      /* ignore */
    }
    loadDirHistory();
  });
}

document.getElementById('dir-create-parent-root')?.addEventListener('click', () => {
  setDirCreateParent(null);
  document.getElementById('dir-create-name')?.focus();
});

document.getElementById('dir-create-form')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const childName = document.getElementById('dir-create-name')?.value?.trim();
  const areaKey = joinAreaKey(dirCreateParentKey, childName);
  if (!areaKey) {
    setDirMsg('Nome inválido. Digite apenas o nome da pasta (sem barras /).', true);
    return;
  }
  setDirMsg('A criar…', false);
  try {
    await fetchJson('/api/directories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ areaKey }),
    });
    await refreshDirectoryUi();
    document.getElementById('dir-create-name').value = '';
    setDirMsg(`Diretório criado: ${areaKey}`, false);
  } catch (err) {
    setDirMsg(err.message || 'Erro ao criar.', true);
  }
});

(async function bootstrapHub() {
  try {
    const ok = await loadSession();
    if (!ok) {
      window.location.replace(
        '/auth.html?err=' +
          encodeURIComponent(
            'O utilizador não tem permissões para entrar no sistema. Aguarde aprovações do administrador.',
          ),
      );
      return;
    }
    reports = REPORTS_FALLBACK.slice();
    await loadManageAreas();
    await loadReportsFromApi();
    await loadDirectoriesCatalog();
    applyHeaderProfile();
    showHubPanel('home');
    renderViewMenu();
    initNavInteractions();
    probeLauncher();
  } catch (err) {
    console.error('[bi-hub] bootstrap:', err);
    reports = REPORTS_FALLBACK.slice();
    applyHeaderProfile();
    showHubPanel('home');
  }
})();

