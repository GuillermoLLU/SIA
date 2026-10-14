// Vista «Métricas»: cómo va el soporte, Indra frente a T-Systems, para verlo
// en vivo. Los datos salen del CSV completo de Remedy que carga cada persona
// (el bridge los calcula y los guarda en este ordenador). Al entrar, siempre
// el Resumen; arriba, los filtros, que valen para todas las pestañas, y con
// un clic en cualquier barra, fila o celda se filtra por ese valor.
import './metrics.css';
import { esc } from '../ui/html.js';
import { num, MONTHS } from './format.js';
import { createModel, COMPANIES } from './model.js';
import { createCharts } from './charts.js';
import { createTabs, TABS } from './tabs.js';

const SEARCH_MS = 250;

export const mountMetricsView = (root, { api, toast }) => {
  let m = null, tabs = null, tab = 'resumen', loading = false;
  const ui = { exp: {}, sort: {} };
  const $ = (s) => root.querySelector(s);

  const dayOf = (iso) => { const d = new Date(iso); return `${d.getDate()} de ${MONTHS[d.getMonth()]}`; };
  const loadButton = (label) => `<label class="mt-load ${loading ? 'mt-busy' : ''}">${loading ? 'Calculando…' : label}<input type="file" accept=".csv,text/csv" data-csv hidden ${loading ? 'disabled' : ''}></label>`;

  const renderEmpty = () => {
    root.innerHTML = `<div class="mt-page"><header class="mt-top"><h2 class="mt-title">Métricas</h2></header>
      <div class="mt-empty"><b>Aún no hay datos</b>
        <span>Carga el CSV completo de la consulta de issues del año (con notas e historial). Se calcula y se queda en este ordenador.</span>
        ${loadButton('Cargar CSV')}</div></div>`;
  };

  // Lo fijo de la vista (cabecera, filtros, pestañas); lo de dentro se repinta con cada cambio.
  const renderFrame = () => {
    const { meta } = m.data, snap = new Date(m.BASE + m.SNAP * 6e4);
    const months = MONTHS.slice(0, m.LASTM + 1).map((mm, k) => `<option value="${k}">${mm}</option>`).join('');
    root.innerHTML = `<div class="mt-page">
      <header class="mt-top"><h2 class="mt-title">Métricas</h2>
        <span class="mt-snap" title="${esc(meta.file)}">${esc(meta.group)} · ${num(meta.rows)} issues de ${meta.year} · datos hasta el ${snap.getUTCDate()} de ${MONTHS[snap.getUTCMonth()]} · cargados el ${dayOf(meta.generated)}</span>
        ${loadButton('Cargar otro CSV')}</header>
      <div class="mt-fbar">
        <div class="mt-seg" data-companies></div>
        <label>Desde <select data-from>${months}</select></label>
        <label>hasta <select data-to>${months}</select></label>
        <label class="mt-chk"><input type="checkbox" data-auto> Incluir avisos automáticos</label>
        <input type="search" data-q placeholder="Buscar en el título o INC…">
        <div class="mt-chips" data-chips></div>
        <button class="mt-btn" data-clear>Quitar filtros</button>
        <span class="mt-count" data-count></span>
      </div>
      <nav class="mt-tabs">${TABS.map(([k, l]) => `<button data-tab="${k}">${l}</button>`).join('')}</nav>
      <div class="mt-main" data-main></div>
    </div><div class="mt-tip" data-tip-box hidden></div>`;
    $('[data-to]').value = m.S.to;
  };

  const render = () => {
    const { S, DIMS } = m;
    m.refilter();
    const A = m.rows();
    const chips = Object.keys(S.f).flatMap((dim) => [...S.f[dim]].map((k) => `<span class="mt-chip">${DIMS[dim].name}: <b>${esc(DIMS[dim].label(k))}</b><button data-rm="${dim}:${k}" title="Quitar">×</button></span>`));
    $('[data-chips]').innerHTML = chips.join('');
    $('[data-clear]').hidden = !(chips.length || S.q || S.from || S.to !== m.LASTM || S.auto);
    $('[data-companies]').innerHTML = [0, 1, 2].map((k) => `<button class="${S.co[k] ? 'mt-on' : ''}" data-co="${k}"><i class="mt-c${k}"></i>${COMPANIES[k]}</button>`).join('');
    $('[data-count]').innerHTML = `<b>${num(A.length)}</b> de ${num(m.N)} issues`;
    root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('mt-on', b.dataset.tab === tab));
    $('[data-main]').innerHTML = tabs.render(tab, A);
  };

  const start = (data) => {
    m = data ? createModel(data) : null;
    ui.exp = {}; ui.sort = {}; tab = 'resumen';
    if (!m) return renderEmpty();
    tabs = createTabs(m, createCharts(m, ui), ui);
    renderFrame();
    render();
  };

  const upload = async (file) => {
    if (!file) return;
    loading = true;
    if (m) $('.mt-load').outerHTML = loadButton(''); else renderEmpty();
    try {
      const { meta } = await api.upload(file);
      loading = false;
      start(await api.load());
      toast?.(`Cargadas ${num(meta.rows)} issues de ${meta.group}.`);
    } catch (e) {
      loading = false;
      if (m) $('.mt-load').outerHTML = loadButton('Cargar otro CSV'); else renderEmpty();
      toast?.(e.message);
    }
  };

  const filterKey = (s) => { const p = s.indexOf(':'); return [s.slice(0, p), Number(s.slice(p + 1))]; };
  root.addEventListener('click', (e) => {
    if (!m || e.target.closest('a')) return;
    const t = e.target.closest('[data-tab],[data-co],[data-rm],[data-exp],[data-sort],[data-clear],[data-f2],[data-f]');
    if (!t) return;
    const d = t.dataset, { S } = m;
    if (d.tab) { tab = d.tab; root.scrollTop = 0; }
    else if (d.co) { const k = Number(d.co); S.co[k] = !S.co[k]; if (!S.co.some(Boolean)) S.co[k] = true; }
    else if (d.rm) { const [dim, k] = filterKey(d.rm); S.f[dim].delete(k); }
    else if (d.exp) ui.exp[d.exp] = !ui.exp[d.exp];
    else if (d.sort) { const [id, c] = d.sort.split(':'), cur = ui.sort[id]; ui.sort[id] = [c, cur && cur[0] === c ? -cur[1] : -1]; }
    else if (t.matches('[data-clear]')) {
      Object.assign(S, { f: {}, q: '', from: 0, to: m.LASTM, auto: false });
      $('[data-q]').value = ''; $('[data-from]').value = 0; $('[data-to]').value = m.LASTM; $('[data-auto]').checked = false;
    } else if (d.f2) d.f2.split('|').forEach((x) => { const [dim, k] = filterKey(x); if (!m.isSel(dim, k)) m.toggle(dim, k); });
    else if (d.f) { const [dim, k] = filterKey(d.f); m.toggle(dim, k); }
    render();
  });
  root.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-csv]')) { upload(t.files[0]); return; }
    if (!m) return;
    const { S } = m;
    if (t.matches('[data-from]')) { S.from = Number(t.value); if (S.to < S.from) { S.to = S.from; $('[data-to]').value = S.to; } }
    else if (t.matches('[data-to]')) { S.to = Number(t.value); if (S.from > S.to) { S.from = S.to; $('[data-from]').value = S.from; } }
    else if (t.matches('[data-auto]')) S.auto = t.checked;
    else return;
    render();
  });
  let searchTimer;
  root.addEventListener('input', (e) => {
    if (!m || !e.target.matches('[data-q]')) return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { m.S.q = e.target.value; render(); }, SEARCH_MS);
  });

  // Tarjeta al pasar el ratón: el texto de data-tip o, en una diferencia
  // entre empresas, Indra a la izquierda, la diferencia en el centro y T-Systems a la derecha.
  root.addEventListener('mousemove', (e) => {
    const tip = $('[data-tip-box]');
    if (!tip) return;
    const t = e.target.closest('[data-cmp],[data-tip]');
    if (!t) { tip.hidden = true; return; }
    if (t.dataset.cmp) {
      const [a, d, b, cls] = t.dataset.cmp.split('¦');
      tip.className = 'mt-tip mt-tip-cmp';
      tip.innerHTML = `<div><span>${COMPANIES[0]}</span><b class="mt-a">${esc(a)}</b></div><div><span>diferencia</span><b class="${cls}">${esc(d)}</b></div><div><span>${COMPANIES[1]}</span><b class="mt-b">${esc(b)}</b></div>`;
    } else { tip.className = 'mt-tip'; tip.textContent = t.dataset.tip; }
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight, cmp = !!t.dataset.cmp;
    tip.style.left = `${Math.max(8, Math.min(e.clientX - (cmp ? w / 2 : -14), innerWidth - w - 8))}px`;
    tip.style.top = `${e.clientY + 18 + h > innerHeight ? e.clientY - h - 12 : e.clientY + 18}px`;
  });
  root.addEventListener('mouseleave', () => { const tip = $('[data-tip-box]'); if (tip) tip.hidden = true; });

  // Al abrir la vista: los datos guardados (la primera vez) y siempre el Resumen.
  return {
    show: async () => {
      try {
        if (!m) return start(await api.load());
        if (tab !== 'resumen') { tab = 'resumen'; render(); }
      } catch (e) {
        root.innerHTML = `<div class="mt-page"><p class="mt-empty">No se pudieron cargar las métricas: ${esc(e.message)}</p></div>`;
      }
    },
  };
};
