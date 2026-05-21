/* global fetch, AbortController */

const THEME_KEY = 'visteon-bi-hub-theme';
const BI_HUB_HELPER_ORIGIN = 'http://127.0.0.1:47821';
const BANNER_DISMISS_KEY = 'bi-hub-helper-banner-dismissed';

let hubHelperAvailable = false;
let hubOpenCooldownUntil = 0;
/** @type {null | { user: { id: number; username: string; role: string }; access: { type: 'all' | 'scoped'; allowedAreaKeys?: string[] } }} */
let hubSession = null;

let selectedArea = null;

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

const reports = [
  {
    id: 1,
    title: 'Análise de Services',
    area: 'MPL · CS',
    updated: '—',
    file: 'P:\\2026\\20 - Power BI\\MPL\\CS\\Análise de Services.pbix',
    preview: 'previews/mpl-cs-analise-de-services.png',
  },
  {
    id: 2,
    title: 'BI Customer Service Report',
    area: 'MPL · CS',
    updated: '—',
    file: 'P:\\2026\\20 - Power BI\\MPL\\CS\\BI Customer Service Report.pbix',
    preview: 'previews/mpl-cs-bi-customer-service-report.png',
  },
  {
    id: 3,
    title: 'Rastreabilidade',
    area: 'MPL · CS',
    updated: '—',
    file: 'P:\\2026\\20 - Power BI\\MPL\\CS\\Rastreabilidade.pbix',
    preview: 'previews/mpl-cs-rastreabilidade.png',
  },
  {
    id: 4,
    title: 'Revenue Projection 2',
    area: 'MPL · CS',
    updated: '—',
    file: 'P:\\2026\\20 - Power BI\\MPL\\CS\\Revenue Projection 2.pbix',
    preview: 'previews/mpl-cs-revenue-projection-2.png',
  },
  {
    id: 5,
    title: 'Dashboard Obsolescencia (cópia)',
    area: 'MPL · Inventário',
    updated: '—',
    file: 'P:\\2026\\20 - Power BI\\MPL\\Inventário\\Dashboard Obsolescencia - copia.pbix',
    preview: 'previews/mpl-inventario-dashboard-obsolescencia-copia.png',
  },
  {
    id: 6,
    title: 'BI Plano SMD RV4',
    area: 'MPL · PCP',
    updated: '—',
    file: 'P:\\2026\\20 - Power BI\\MPL\\PCP\\BI Plano SMD RV4.pbix',
    preview: 'previews/mpl-pcp-bi-plano-smd-rv4.png',
  },
  {
    id: 7,
    title: 'BI Plano SMD RV5',
    area: 'MPL · PCP',
    updated: '—',
    file: 'P:\\2026\\20 - Power BI\\MPL\\PCP\\BI Plano SMD RV5.pbix',
    preview: 'previews/mpl-pcp-bi-plano-smd-rv5.png',
  },
  {
    id: 8,
    title: 'BI Planejamento',
    area: 'MPL · PCP',
    updated: '—',
    file: 'P:\\2026\\20 - Power BI\\MPL\\PCP\\BI Planejamento.pbix',
    preview: 'previews/mpl-pcp-bi-planejamento.png',
  },
];

const rootAreas = [
  'Engenharia Industrial',
  'Finance',
  'Manufatura',
  'MPL',
  'New Models',
  'OPEX',
  'Qualidade',
  'RH',
  'Tax',
];

const mplSubAreas = [
  { key: 'MPL · PCP', label: 'PCP' },
  { key: 'MPL · RFU', label: 'RFU' },
  { key: 'MPL · WH', label: 'WH' },
  { key: 'MPL · CS', label: 'CS' },
  { key: 'MPL · Cycle Count', label: 'Cycle Count' },
  { key: 'MPL · Inventário', label: 'Inventário' },
];

async function loadSession() {
  try {
    const r = await fetch('/api/auth/me', { credentials: 'include', cache: 'no-store' });
    if (!r.ok) return false;
    hubSession = await r.json();
    return !!hubSession && hubSession.user;
  } catch (_) {
    return false;
  }
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
    viewer_all: 'Visualização geral',
    viewer_area: 'Visualização por diretório',
  };
  return map[role] || role;
}

function reportsFiltered(list) {
  if (!hubSession || hubSession.access.type === 'all') return list;
  const keys = new Set(hubSession.access.allowedAreaKeys || []);
  return list.filter((r) => keys.has(r.area));
}

function rootAreasForUser() {
  if (!hubSession || hubSession.access.type === 'all') return rootAreas;
  const keys = new Set(hubSession.access.allowedAreaKeys || []);
  return rootAreas.filter((area) => {
    if (area === 'MPL') return mplSubAreas.some(({ key }) => keys.has(key));
    return keys.has(area);
  });
}

function mplSubAreasForUser() {
  if (!hubSession || hubSession.access.type === 'all') return mplSubAreas;
  const keys = new Set(hubSession.access.allowedAreaKeys || []);
  return mplSubAreas.filter(({ key }) => keys.has(key));
}

function allReportsTitleTerm() {
  return hubSession && hubSession.access.type === 'scoped' ? 'Painel autorizado' : 'Todos os Relatórios';
}

function applyHeaderProfile() {
  const nm = hubSession?.user?.username ?? '—';
  const elName = document.getElementById('hub-user-name');
  const elRole = document.getElementById('hub-user-role');
  const elAvatar = document.getElementById('hub-user-avatar');
  const adminLink = document.getElementById('hub-admin-link');
  if (elName) elName.textContent = nm;
  if (elRole) elRole.textContent = hubSession?.user?.role ? profileLabel(hubSession.user.role) : '—';
  if (elAvatar) elAvatar.textContent = initialsFrom(nm);
  if (adminLink) adminLink.classList.toggle('hidden', hubSession?.user?.role !== 'admin');
}

function isMplBranchVisible() {
  return selectedArea === 'MPL' || (selectedArea != null && selectedArea.startsWith('MPL ·'));
}

function reportsForMplRoot() {
  return reportsFiltered(reports.filter((r) => r.area.startsWith('MPL ·')));
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

document.getElementById('theme-toggle').addEventListener('click', () => {
  applyTheme(!document.documentElement.classList.contains('dark'));
});

function syncMplAside() {
  const el = document.getElementById('mpl-sub-aside');
  const open = isMplBranchVisible();
  el.classList.toggle('is-open', open);
  el.setAttribute('aria-hidden', open ? 'false' : 'true');
}

function renderMplSubList() {
  const container = document.getElementById('mpl-sub-list');
  const subs = mplSubAreasForUser();
  if (!isMplBranchVisible()) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = subs
    .map(({ key, label }) => {
      const active = selectedArea === key ? ' is-active' : '';
      const esc = key.replace(/"/g, '"');
      return `
        <button type="button" data-mpl-sub="${esc}"
          class="hub-area-item w-full text-left px-4 py-2.5 flex items-center gap-3${active}">
          <i class="fa-solid fa-folder-open hub-icon-orange text-sm w-4 shrink-0"></i>
          <span class="font-medium text-sm">${label}</span>
        </button>`;
    })
    .join('');

  container.querySelectorAll('[data-mpl-sub]').forEach((btn) => {
    btn.addEventListener('click', () => {
      filterByArea(btn.getAttribute('data-mpl-sub'));
    });
  });
}

function renderAreas() {
  const container = document.getElementById('areas-list');
  const areas = rootAreasForUser();
  const allActive = selectedArea === null ? ' is-active' : '';
  const scoped = hubSession && hubSession.access.type === 'scoped';
  const allLabel = scoped ? 'Painel autorizado' : 'Todas as áreas';
  const allRow = `
        <button type="button" data-area="__all__"
          class="hub-area-item w-full text-left px-4 py-2.5 flex items-center gap-3${allActive}">
          <i class="fa-solid fa-layer-group hub-icon-blue text-sm w-4 shrink-0"></i>
          <span class="font-medium text-sm">${allLabel}</span>
        </button>`;
  const rows = areas
    .map((area) => {
      const isMpl = area === 'MPL';
      const mplContext =
        selectedArea === 'MPL' || (selectedArea != null && selectedArea.startsWith('MPL ·'));
      const rowActive = isMpl ? mplContext : selectedArea === area;
      const activeClass = rowActive ? ' is-active' : '';
      return `
        <button type="button" data-area="${area.replace(/"/g, '"')}"
          class="hub-area-item w-full text-left px-4 py-2.5 flex items-center gap-3${activeClass}">
          <i class="fa-solid fa-folder hub-icon-orange text-sm w-4 shrink-0"></i>
          <span class="font-medium text-sm flex-1 min-w-0 truncate">${area}</span>
          ${isMpl ? '<i class="fa-solid fa-chevron-right text-[10px] text-[var(--text-muted)] shrink-0" aria-hidden="true"></i>' : ''}
        </button>`;
    })
    .join('');
  container.innerHTML = allRow + rows;

  container.querySelectorAll('[data-area]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const v = btn.getAttribute('data-area');
      filterByArea(v === '__all__' ? null : v);
    });
  });

  syncMplAside();
  renderMplSubList();
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
      return `
        <article class="hub-card rounded-2xl overflow-hidden cursor-pointer group" data-open="${encodeURIComponent(r.file)}">
          <div class="h-44 relative overflow-hidden bg-black">
            <img src="${previewSrc}" alt="" class="preview-img js-preview-thumb w-full h-full object-cover opacity-95" loading="lazy">
            <div class="hub-preview-overlay absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex items-end p-3">
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
    el.addEventListener('click', () => openReport(decodeURIComponent(el.getAttribute('data-open'))));
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
  document.getElementById('search-input').value = '';
  if (area === null) {
    document.getElementById('area-title').textContent = allReportsTitleTerm();
    renderCards(reportsFiltered(reports));
  } else if (area === 'MPL') {
    document.getElementById('area-title').textContent = 'MPL';
    renderCards(reportsForMplRoot());
  } else {
    document.getElementById('area-title').textContent = area;
    renderCards(reportsFiltered(reports.filter((r) => r.area === area)));
  }
  renderAreas();
}

document.getElementById('search-input').addEventListener('input', (e) => {
  const term = e.target.value.toLowerCase().trim();
  selectedArea = null;
  const allowed = reportsFiltered(reports);
  const filtered = term
    ? allowed.filter((r) => r.title.toLowerCase().includes(term) || r.area.toLowerCase().includes(term))
    : allowed;
  document.getElementById('area-title').textContent = term ? 'Resultados da busca' : allReportsTitleTerm();
  renderCards(filtered);
  renderAreas();
});

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


(async function bootstrapHub() {
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
  applyHeaderProfile();
  renderAreas();
  renderCards(reportsFiltered(reports));
  probeLauncher();
})();

