// Vista «Métricas»: cómo va el soporte, para verlo en vivo. «Actualizar y generar
// informe» pide a Snowflake las incidencias de Remedy nuevas o cambiadas, se suman
// al repositorio local de incidencias y de él salen los datos (el bridge los
// calcula y los guarda en este ordenador). Al entrar, siempre el Resumen.
//
// Arriba, qué se mira: el equipo, una empresa o un grupo de personas (de partida,
// nuestro equipo) y, si se quiere, con «+ Comparar», otro lado frente a él; cada
// lado con el color que se elija y la × para quitarlo. Al lado, los filtros, que
// valen para todas las pestañas: el periodo, la búsqueda y, con un clic en
// cualquier barra, fila o celda, ese valor.
import './metrics.css';
import { esc, fold } from '../ui/html.js';
import { num } from './format.js';
import { createModel, COMPANIES } from './model.js';
import { createCharts } from './charts.js';
import { createTabs } from './tabs.js';
import { FACES, faceOf, faceTabs, firstTab, routeTo } from './faces.js';
import { periodLabel, presetRange, cmpOptions, rangeLabel } from './period.js';
import { DAY } from './rules.js';
import { reportBounds, reportHead, reportName, withDates, sidesOf, systemsFilter, PICKS, pickedFilter, pickedText, withShifts, shiftsFilter } from './report.js';
import { exportPdf, previewReport } from './print.js';
import { companyPick, presetPick, comparePop, pickCompany, pickPreset } from './quick-bar.js';
import { mountPeriodPanel } from './period-panel.js';
import { attachTip } from './tip.js';
import { toggleProject } from './resolution.js';
import { applyTableSorts, toggleTableSort } from './table-sort.js';
import { PHASES, CSV_PHASES, CLEAR_PHASES } from './progress.js';
import { mountMetricsModals } from './metrics-modals.js';
import { progressCover } from './progress-cover.js';
import { isNetWarning } from '../ui/net-warning.js';
import { netWarningHtml, shake } from '../ui/net-warning-view.js';
import { COLORS, defaultColors, freeColor, dayOf, coverage, freeCompany, withoutSide, togglePerson, filterKey, anyFilter, clearFilters, pickOnly, pickBoth } from './view.js';
import { sheetOf, sheetCsv, sheetFile } from './sheet.js';
import { downloadText } from './download.js';
import { teamPanel } from '../work/team.js';
import { pressStartedIn } from '../ui/dom.js';

const SEARCH_MS = 250;
const LOAD = 'Actualizar y generar informe';
const FIRST_LOAD = 'Cargar datos';   // la primera vez, con la base local vacía
const POLL_MS = 400;     // cada cuánto se pregunta al bridge por el avance de la actualización
const TICK_MS = 200;     // y cada cuánto se repinta (el porcentaje es de tiempo: se mueve aunque no haya cifras nuevas)
const FINISH_MS = 450;   // el 100 % a la vista un momento antes de abrir las métricas nuevas
const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const CALENDAR_ICON = svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>');
const SEARCH_ICON = svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>');
const CHEVRON = svg('<path d="m6 9 6 6 6-6"/>');

// team: una pestaña más, que es otra vista con sus propios datos, periodo y filtros (Equipo soporte): { id, label,
// mount(host) → { show() } }. Se monta una vez, al abrirla; sus clics y su tarjeta se quedan en ella.
export const mountMetricsView = (root, { api, toast, team = null }) => {
  const teamHost = team && Object.assign(document.createElement('div'), { hidden: true });
  let teamView = null;
  for (const type of ['click', 'mousemove']) teamHost?.addEventListener(type, (e) => e.stopPropagation());
  let m = null, tabs = null, tab = 'resumen', loading = false, panel = null;
  // face: la vista elegida en el menú de Métricas (faces.js: servicio, equipo, tecnicas); null, el menú
  let face = null;
  // si la vista deja mirar o comparar con T-Systems; la pestaña Backlog, nunca (solo Indra y sin comparar nada: render)
  // NO_TSYS_TABS: sin T-Systems (solo Indra o personas de Indra); NO_CMP_TABS: además, sin comparar nada
  const NO_TSYS_TABS = ['backlog', 'modulos', 'escalados'], NO_CMP_TABS = ['backlog'];
  const tsys = () => faceOf(face)?.tsys !== false && !NO_TSYS_TABS.includes(tab);
  // open: el desplegable abierto ('calendar', 'side0' o 'side1'); who: lo escrito en el buscador de
  // personas; searching: la búsqueda abierta
  let open = null, who = '', searching = false;
  let colors = defaultColors();   // el color de cada lado
  const ui = { exp: {}, sort: {}, colSort: {} };
  const $ = (s) => root.querySelector(s);
  // Las ventanas de «Cargar CSV» y «Construir SQL»: al cargar, se vuelven a leer los datos y se abren como siempre.
  const modals = mountMetricsModals({
    api, toast,
    onUpload: (file) => uploadCsv(file).catch((e) => toast?.(e.name === 'AbortError' ? 'Cancelado: no ha entrado nada nuevo.' : e.message)),
    onFirstLoad: (range) => update(range),
    onClear: () => clearHistory(),
  });

  const loadButton = () => `<button class="mt-load ${loading ? 'mt-busy' : ''}" data-update ${loading ? 'disabled' : ''}>${loading ? 'Actualizando…' : m ? LOAD : FIRST_LOAD}</button>`;
  // Los tres puntos: lo que se hace pocas veces (exportar un informe, cargar un CSV, construir la consulta). Sin nada
  // encima de la vista. Sin datos (withClear: false), no hay informe que exportar ni histórico que borrar.
  const moreMenu = (withClear = true) => `<div class="mt-menu"><button class="mt-btn mt-icon-btn mt-more" data-more aria-haspopup="menu" aria-expanded="false" aria-label="Más opciones" title="Más opciones"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button>
    <div class="mt-pop mt-menu-pop" data-more-pop role="menu" hidden>${withClear ? '<button role="menuitem" data-open-report>Exportar informe…</button><button role="menuitem" data-export-sheet hidden>Exportar sábana a CSV</button>' : ''}<button role="menuitem" data-open-csv>Cargar CSV…</button><button role="menuitem" data-open-sql>Construir SQL…</button>${withClear ? '<button role="menuitem" class="mt-danger-item" data-clear>Eliminar histórico…</button>' : ''}</div></div>`;
  const setMenu = (on) => {
    const pop = $('[data-more-pop]');
    if (!pop) return;
    pop.hidden = !on;
    $('[data-more]').setAttribute('aria-expanded', String(on));
  };

  const renderEmpty = () => {
    root.innerHTML = `<div class="mt-page mt-empty-page">
      <div class="mt-empty"><b>Aún no hay datos</b>
        <span>Trae de Snowflake las incidencias de Remedy (con notas e historial) desde 2025, para comparar con el año anterior, o carga un CSV de esa misma consulta. Se guardan en el repositorio local de este ordenador y de él salen las métricas; cada vez que actualices, solo llega lo nuevo y lo cambiado.</span>
        <div class="mt-empty-actions">${loadButton()}${moreMenu(false)}</div></div></div>`;
  };

  // El menú de Métricas: una caja por vista (faces.js). Con la cabecera de siempre (actualizar y los tres puntos).
  const renderHub = () => {
    root.innerHTML = `<div class="mt-page">
      <header class="mt-top"><span class="mt-date">${esc(coverage(m))}</span>${loadButton()}${moreMenu()}</header>
      <div class="mt-hub">${FACES.map((f) => `<button type="button" class="settings-box" data-face="${f.id}">${f.icon}<span>${f.label}</span><small>${esc(f.note)}</small></button>`).join('')}</div>
    </div>`;
  };

  const sideSlot = (k) => `<div class="mt-period mt-slot" data-slot="${k}"><button class="mt-btn mt-icon-btn mt-side" data-side="${k}" aria-haspopup="true"><i class="mt-c${k}"></i><span data-side-name="${k}"></span>${CHEVRON}</button><button class="mt-btn mt-x" data-side-remove="${k}" title="Quitar de la comparación">×</button>
    <div class="mt-pop mt-who" data-side-pop="${k}" hidden><div data-side-companies="${k}"></div><input type="search" data-who-q placeholder="Buscar personas…"><div class="mt-who-list" data-side-list="${k}"></div></div></div>`;

  // Lo fijo de la vista (cabecera, comparación, filtros, pestañas); lo de dentro se repinta con cada cambio.
  const renderFrame = () => {
    const { meta } = m.data;
    root.innerHTML = `<div class="mt-page">
      <header class="mt-top">
        <button class="mt-btn mt-hub-back" data-hub-back title="Volver al menú de Métricas">‹ Métricas</button><b class="mt-face">${esc(faceOf(face).label)}</b>
        <span class="mt-date" data-coverage title="${esc(`${meta.file}, actualizado el ${dayOf(meta.generated)}`)}"></span>
        ${loadButton()}${moreMenu()}</header>
      <div class="mt-fbar">
        ${sideSlot(0)}<span class="mt-vs" data-vs>frente a</span>${sideSlot(1)}<div data-qco></div>
        <div class="mt-period"><button class="mt-btn mt-icon-btn" data-calendar aria-haspopup="true">${CALENDAR_ICON}<span data-period></span></button><div class="mt-pop mt-cal" data-cal hidden></div></div>
        <div data-cmp></div>
        <div class="mt-fpicks" data-picks></div>
        <div class="mt-chips" data-chips></div>
        <div class="mt-find"><input type="search" data-q placeholder="Título o INC…" hidden><span class="mt-count" data-count></span>
          <button class="mt-search" data-search title="Buscar en el título o por número">${SEARCH_ICON}</button></div>
      </div>
      <nav class="mt-tabs">${faceTabs(face, team).map(([k, l]) => `<button data-tab="${k}">${l}</button>`).join('')}</nav>
      <div class="mt-main" data-main></div>
    </div><div class="mt-tip" data-tip-box hidden></div>`;
    if (teamHost) $('[data-main]').after(teamHost);
  };

  // Periodo: el botón dice qué fechas se miran; su panel (period-panel.js), la rejilla de meses y los campos Desde y
  // Hasta. Elegir en la rejilla lo aplica y lo cierra; una fecha, lo aplica y lo deja abierto.
  // Las pestañas con «Abiertas ahora» (Módulos y focos, SLAs, Escalados, Análisis tiempos): ahí lo que se ve no depende
  // de las fechas, así que el botón de las fechas se ve apagado y lo dice; elegir unas fechas pasa a la otra vista (la del
  // periodo). NOW_MODE: pestaña → la marca de ui que dice si se mira lo abierto ahora.
  const NOW_MODE = { modulos: 'modNow', sla: 'slaNow', slaq: 'slaNow', escalados: 'escNow', tiempos: 'timesNow' };
  const nowMode = () => !!NOW_MODE[tab] && !!ui[NOW_MODE[tab]] && !(tab === 'modulos' && face === 'equipo');
  const toPeriod = () => { if (nowMode()) ui[NOW_MODE[tab]] = false; };
  const renderPeriod = () => {
    $('[data-period]').textContent = periodLabel(m);
    $('[data-cal]').hidden = open !== 'calendar';
    const b = $('[data-calendar]'), off = nowMode();
    b.classList.toggle('mt-period-off', off);
    if (off) b.dataset.tip = 'No aplica: aquí se ve lo abierto ahora, que no depende de las fechas. Elegir unas fechas pasa a ver lo del periodo.';
    else delete b.dataset.tip;
  };

  // Cada lado: el botón dice qué es y lleva su color; la × lo quita (si hay dos). Su desplegable deja
  // elegir el color, una empresa o personas: las que tienen issues en lo que se ve, por empresa y de
  // más a menos, con un buscador. Cada clic en una persona la marca o desmarca y el desplegable sigue
  // abierto. Quien ya está en el otro lado no se puede marcar, ni la misma empresa a los dos lados.
  const renderSides = () => {
    const { S, DIMS, data } = m, names = m.NAMES(), two = !!S.sides[1];
    colors.forEach((c, k) => root.style.setProperty(`--mt-base${k}`, c));
    $('[data-slot="1"]').hidden = !two;
    $('[data-vs]').hidden = !two;
    for (const k of [0, 1]) {
      const s = S.sides[k], other = S.sides[1 - k];
      $(`[data-side-remove="${k}"]`).hidden = !two;
      const pop = $(`[data-side-pop="${k}"]`);
      if (!s) { pop.hidden = true; continue; }
      $(`[data-side-name="${k}"]`).textContent = names[k];
      $(`[data-side="${k}"]`).title = s.people?.size > 1 ? [...s.people].map((p) => DIMS.as.label(p)).join('\n') : '';
      pop.hidden = open !== `side${k}`;
      if (pop.hidden) continue;
      const taken = (c) => !other?.people && other?.company === c;
      $(`[data-side-companies="${k}"]`).innerHTML = `<p class="mt-who-co">Color</p><div class="mt-colors">${COLORS.map(([c, n]) => `<button data-pick-color="${k}:${c}" class="${colors[k] === c ? 'mt-on' : ''}" style="--mt-swatch:${c}" title="${n}"></button>`).join('')}</div>
        <p class="mt-who-co">Empresa</p><div class="mt-cos">${(tsys() ? [0, 1] : [0]).map((c) => `<button data-pick-company="${k}:${c}" class="${!s.people && s.company === c ? 'mt-on' : ''}" ${taken(c) ? 'disabled title="Ya está en el otro lado"' : ''}>${COMPANIES[c]}</button>`).join('')}</div><p class="mt-who-co">Personas</p>`;
      const q = fold(who.trim()), mine = s.people || new Set(), theirs = other?.people || new Set();
      const all = m.group('as', m.pool()).filter((x) => x.k && (!q || fold(DIMS.as.label(x.k)).includes(q)));
      const groups = (tsys() ? [0, 1, 2] : [0]).map((c) => [c, all.filter((x) => data.company[x.k] === c)]).filter(([, l]) => l.length);
      $(`[data-side-list="${k}"]`).innerHTML = groups.map(([c, l]) => `<p class="mt-who-co mt-who-sub">${c === 2 ? 'Fuera de las dos empresas' : COMPANIES[c]}</p>
        ${l.map((x) => `<button data-pick-person="${k}:${x.k}" class="${mine.has(x.k) ? 'mt-on' : ''}" aria-pressed="${mine.has(x.k)}" ${theirs.has(x.k) ? 'disabled title="Ya está en el otro lado"' : ''}><i class="mt-check"></i><span>${esc(DIMS.as.label(x.k))}</span><small>${num(x.n)}</small></button>`).join('')}`).join('')
        || '<p class="mt-mut">Nadie con ese nombre.</p>';
    }
  };
  // el otro lado: quitarlo (queda el primero) o poner en él una empresa, con un color libre si no estaba
  const sideOps = {
    off: () => { if (m.S.sides[1]) ({ sides: m.S.sides, colors } = withoutSide(m.S.sides, colors, 1)); },
    add: (c) => { const had = !!m.S.sides[1]; m.S.sides[1] = { company: c }; if (!had) colors[1] = freeColor(colors[0]); },
  };
  const closePops = () => { open = null; who = ''; };
  const togglePop = (which) => {
    const was = open;
    closePops();
    if (was !== which) open = which;
    if (open === 'calendar') panel.open();
    renderPeriod(); renderSides();
    const q = open?.startsWith('side') && $(`[data-side-pop="${open.slice(4)}"] [data-who-q]`);
    if (q) { q.value = ''; q.focus(); }
  };

  const render = () => {
    const { S, DIMS } = m;
    // en Backlog no se compara nada (ni con otro lado ni con otro periodo): sin «Comparar» y, si se venía comparando, se quita
    if (NO_CMP_TABS.includes(tab)) {
      if (S.sides[1]) ({ sides: S.sides, colors } = withoutSide(S.sides, colors, 1));
      ui.resCmp = null; ui.cmpPick = false;
    }
    m.refilter();
    const A = m.rows();
    const chips = Object.keys(S.f).flatMap((dim) => [...S.f[dim]].map((k) => `<span class="mt-chip">${DIMS[dim].name}: <b>${esc(DIMS[dim].label(k))}</b><button data-rm="${dim}:${k}" title="Quitar">×</button></span>`));
    // y, si hay algún filtro (aunque sea de una pestaña o la búsqueda), el botón que los quita todos
    const reset = anyFilter(S, ui) ? '<button class="mt-reset" data-reset-filters data-tip="Quita todos los filtros, la búsqueda y los de cada pestaña. El periodo y lo que se compara se quedan.">Quitar filtros</button>' : '';
    $('[data-chips]').innerHTML = chips.join('') + reset;
    $('[data-coverage]').textContent = coverage(m);
    renderPeriod();
    renderSides();
    $('[data-qco]').innerHTML = tsys() ? companyPick(m) : '';
    $('[data-picks]').innerHTML = face === 'servicio' ? '' : tabs.picks();   // SISU o SGA y la prioridad: en Servicio, no (la corona lleva su SISU / SGA)
    $('[data-cmp]').innerHTML = NO_CMP_TABS.includes(tab) ? '' : comparePop(m, ui, tsys());
    $('[data-q]').hidden = !(searching || S.q);
    $('[data-count]').innerHTML = `<b>${num(A.length)}</b> incidencias`;
    root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('mt-on', b.dataset.tab === tab));
    // la pestaña del equipo va por su cuenta: sin los filtros de arriba, que no le afectan
    const onTeam = tab === team?.id;
    // la sábana ya no se ve en ninguna pestaña: en las que la tenían, se exporta desde los tres puntos
    const sheetItem = $('[data-export-sheet]');
    if (sheetItem) sheetItem.hidden = !(onTeam || SHEET_TABS.includes(tab));
    for (const s of ['.mt-fbar', '[data-main]']) $(s).style.display = onTeam ? 'none' : '';
    if (teamHost) teamHost.hidden = !onTeam;
    if (onTeam) {
      teamView ||= team.mount(teamHost);
      teamView.show();
      return;
    }
    $('[data-main]').innerHTML = tabs.render(tab, A, { face, live: true });   // la vista: alguna pestaña cambia con ella (Módulos y focos, en Equipo)
    applyTableSorts($('[data-main]'), tab, ui.colSort);   // y el orden por columnas de cada tabla (table-sort.js)
  };

  const start = (data) => {
    m = data ? createModel(data) : null;
    m?.resetPeriod();   // de partida, los meses en los que tenemos algo abierto (model.js)
    ui.exp = {}; ui.sort = {}; ui.colSort = {}; ui.jiraPick = null; ui.resCmp = null; ui.cmpPick = false; ui.cliFilter = null; tab = firstTab(face, team) || 'resumen'; searching = false; closePops();
    if (!m) return renderEmpty();
    tabs = createTabs(m, createCharts(m, ui), ui);
    if (face) openFrame(); else renderHub();
  };
  // Lo fijo de la vista elegida, su periodo y lo de dentro.
  const openFrame = () => {
    renderFrame();
    // arriba del panel, las fechas rápidas: una lo aplica y lo cierra; con Ctrl (o Cmd), compara con el periodo de ahora
    panel = mountPeriodPanel($('[data-cal]'), { model: () => m, onPick: (close) => { toPeriod(); if (close) closePops(); render(); },
      head: () => presetPick(m, ui),
      onPreset: (key, ctrl) => { const r = presetRange(m, key); if (r && pickPreset(m, ui, key, ctrl || ui.cmpPick, r, sideOps)) { toPeriod(); ui.cmpPick = false; closePops(); render(); } },
      // comparando (ui.cmpPick), un mes: el periodo de ahora frente a ese mes
      onMonth: (k) => { if (!ui.cmpPick) return false; sideOps.off(); ui.resCmp = { a: 'cur', b: `m:${k}` }; ui.cmpPick = false; closePops(); render(); return true; } });
    render();
  };
  // En una vista sin T-Systems, lo que se mira es Indra o personas de Indra: si un lado no lo es, se quita (el
  // primero vuelve a Indra).
  // Devuelve si ha cambiado algo.
  const onlyIndra = () => {
    if (tsys()) return false;
    const S = m.S, indra = (s) => !s || (s.people ? [...s.people].every((p) => m.data.company[p] === 0) : s.company === 0);
    let changed = false;
    if (!indra(S.sides[0])) { S.sides[0] = { company: 0 }; S.sides[1] = null; changed = true; }
    if (!indra(S.sides[1])) { S.sides[1] = null; changed = true; }
    return changed;
  };
  // Entrar en una vista del menú (to: en esa pestaña; si no, en su primera).
  const enterFace = (id, to = null) => {
    face = id; tab = to || firstTab(id, team); root.scrollTop = 0;
    closePops(); onlyIndra(); openFrame();
  };

  // Mientras el servidor trabaja en algo largo (cargar un CSV), la misma capa con su avance que la actualización,
  // con las fases de esa tarea. Si falla, se quita y la vista sigue como estaba.
  const track = async (phases, task, onAbort = () => {}, doneText) => {
    const c = progressCover(Date.now(), phases, () => { onAbort(); api.cancel(); });
    const stop = () => { clearInterval(poll); clearInterval(ticker); };
    let poll = null, ticker = null;
    try {
      root.scrollTop = 0;
      root.classList.add('mt-updating');
      $('.mt-page').inert = true;
      root.append(c.el);
      c.tick();
      poll = setInterval(async () => { try { c.set(await api.progress()); } catch { /* sigue con lo último */ } }, POLL_MS);
      ticker = setInterval(c.tick, TICK_MS);
      const out = await task();
      stop();
      c.finish(doneText);
      return out;
    } catch (e) {
      stop();
      c.el.remove();
      $('.mt-page').inert = false;
      throw e;
    } finally {
      root.classList.remove('mt-updating');
    }
  };

  // Un CSV de Remedy: se sube con su avance (leer y guardar, recalcular) y, al acabar, se abren los datos nuevos.
  const uploadCsv = async (file) => {
    const ctl = new AbortController();   // Cancelar corta la subida también en el navegador
    const { counts } = await track(CSV_PHASES, () => api.uploadCsv(file, ctl.signal), () => ctl.abort());
    await new Promise((r) => setTimeout(r, FINISH_MS));
    start(await api.load());
    toast?.(counts.inserted || counts.updated
      ? `CSV cargado: ${num(counts.inserted)} nuevas y ${num(counts.updated)} actualizadas.`
      : 'CSV cargado: nada nuevo respecto a lo guardado.');
  };

  // Borra lo guardado en este ordenador y vuelve a la pantalla de base vacía (Snowflake no se toca).
  const clearHistory = async () => {
    try {
      await track(CLEAR_PHASES, () => api.clear(), () => {}, 'Histórico eliminado.');
      start(null);
      toast?.('Histórico eliminado: la próxima carga empieza de cero.');
    } catch (e) {
      toast?.(e.message);
    }
  };

  // Falta algo para la red del cliente (la VPN, los certificados): en el sitio del avance, el mismo aviso que en el
  // inicio de sesión (ui/net-warning-view.js). «Reintentar» vuelve a probar (retry); un clic fuera de él lo cierra.
  // Si ya está a la vista y sigue faltando, se sacude.
  const netWarn = (r, retry) => {
    let box = $('.mt-net');
    const again = Boolean(box);
    if (!box) {
      box = document.createElement('div');
      box.className = 'mt-loading mt-net';
      box.innerHTML = '<div class="mt-load-card net-warn" role="alert"></div>';
      root.append(box);
    }
    const card = box.firstElementChild;
    card.innerHTML = netWarningHtml(r);
    box.onclick = (e) => {
      const b = e.target.closest('[data-net-retry]');
      if (b) { b.disabled = true; b.textContent = 'Comprobando…'; return retry(); }
      if (!card.contains(e.target)) closeNet();
    };
    root.classList.add('mt-updating');
    $('.mt-page').inert = true;
    if (again) shake(card);
    card.querySelector('[data-net-retry]').focus({ preventScroll: true });
  };
  const closeNet = () => {
    $('.mt-net')?.remove();
    root.classList.remove('mt-updating');
    $('.mt-page').inert = false;
  };

  // La primera vez puede abrirse el navegador para entrar en Snowflake con la cuenta de Inditex.
  // range: { from, to } con la base vacía (la primera carga del periodo elegido); sin él, la actualización de siempre.
  // Antes de nada, ¿se puede? (api.ready): fuera de la VPN, el aviso, sin enseñar un avance que no va a llegar.
  const update = async (range) => {
    if (loading) return;
    loading = true;
    const blocked = await api.ready().then(() => null, (e) => e);
    if (blocked) {
      loading = false;
      if (isNetWarning(blocked.data?.code)) return netWarn(blocked.data, () => update(range));
      closeNet();
      return toast?.(blocked.message);
    }
    closeNet();
    if (m) $('.mt-load').outerHTML = loadButton(); else renderEmpty();
    const c = progressCover(Date.now(), PHASES, () => api.cancel());
    root.scrollTop = 0;
    root.classList.add('mt-updating');
    $('.mt-page').inert = true;
    root.append(c.el);
    c.tick();
    const poll = setInterval(async () => { try { c.set(await api.progress()); } catch { /* sigue con lo último */ } }, POLL_MS);
    const ticker = setInterval(c.tick, TICK_MS);
    const stop = () => { clearInterval(poll); clearInterval(ticker); };
    try {
      const { counts } = await api.update(range);
      stop();
      c.finish();
      const data = await api.load();
      await new Promise((r) => setTimeout(r, FINISH_MS));
      loading = false;
      start(data);
      const jira = data?.meta?.jira?.message ? ` Jira: ${data.meta.jira.message}` : '';
      toast?.(`${counts.inserted || counts.updated
        ? `Informe actualizado: ${num(counts.inserted)} nuevas y ${num(counts.updated)} actualizadas.`
        : 'Informe actualizado: sin cambios desde la última vez.'}${jira}`);
    } catch (e) {
      loading = false;
      c.el.remove();
      if (m) { $('.mt-page').inert = false; $('.mt-load').outerHTML = loadButton(); } else renderEmpty();
      if (isNetWarning(e.data?.code)) netWarn(e.data, () => update(range));   // p. ej. sin los certificados del cliente
      else toast?.(e.message);
    } finally {
      stop();
      if (!$('.mt-net')) root.classList.remove('mt-updating');
    }
  };

  // La sábana, a CSV (de la pestaña en la que se está): lo que pasa ahora los filtros y los lados, entero, descargado como
  // fichero (sheet.js). Ya no se ve en las pestañas: se exporta desde los tres puntos (Exportar sábana a CSV), solo en
  // las que la tenían (SHEET_TABS; Equipo soporte, la suya: work-view.js).
  const SHEET_TABS = ['backlog', 'escalados', 'cliente', 'tiempos', 'sla', 'slaq'];
  const exportSheet = () => {
    // la sábana de la pestaña: la de Escalados o la de Pendiente de cliente, con sus columnas; si no, lo abierto ahora
    const own = { escalados: [ui.escSheet, 'incidencias-escaladas'], slaq: [ui.slaSheet, 'sin-empezar-sla'], cliente: [ui.cliSheet, 'pendientes-de-cliente'], tiempos: [ui.timesSheet, 'incidencias-tiempos'], sla: [ui.slaSheet, 'sin-empezar-sla'], backlog: [ui.hoySheet, 'incidencias-abiertas'] }[tab];
    const list = own ? own[0].list : sheetOf(m);
    if (!list.length) return;
    const file = own ? sheetFile(m, own[1]) : sheetFile(m);
    downloadText(file, sheetCsv(m, list, own?.[0].cols), 'text/csv;charset=utf-8');
    toast?.(`Exportadas ${num(list.length)} incidencias a ${file}.`);
  };

  // Exportar informe (#15): la ventana para elegir el informe (metrics-modals.js, report) y, al aceptar, el informe
  // impreso a PDF (print.js) o en la vista previa. Lo que lleva cada uno (report.js, REPORTS):
  //   Backlog actual       Foto de hoy, que ya lleva la corona del Resumen, con la sábana entera
  //   Resumen básico       el Resumen sin la corona y lo que la pestaña Histórico no repite
  //   Análisis de tiempos  la pestaña, Actual o Histórico, con los dos desgloses (módulo y centro); la sábana, entera en
  //                        Actual y las que más tardaron en Histórico (todas, ahí, pueden ser miles)
  //   Módulos y focos      la pestaña, Actual o Histórico; comparando con T-Systems, una parte de cada empresa (la
  //                        pestaña no compara empresas: enseñaría solo la primera)
  // Con fechas, el periodo de arriba se cambia solo para pintarlo y vuelve a ser el de antes; la comparación de periodos
  // del Resumen («Comparar») no va, es relativa al periodo de arriba. Lo que se mira, el de la pestaña elegida (solo
  // Indra o Indra frente a T-Systems: AUDIENCES); SGA y SISU, las casillas; los demás filtros, los de arriba. Con la
  // vista previa, «Cambiar opciones» vuelve a abrir la ventana con lo que se había elegido (initial).
  const exportReport = (initial) => {
    if (!m) return;
    const { S, BASE, DIMS, data: { meta } } = m, iso = (min) => new Date(BASE + min * 6e4).toISOString().slice(0, 10);
    // la última carga, en el reloj de quien mira: «12/11/2026 09:30»
    const two = (n) => String(n).padStart(2, '0'), at = new Date(meta.generated);
    const asOf = `${two(at.getDate())}/${two(at.getMonth() + 1)}/${at.getFullYear()} ${two(at.getHours())}:${two(at.getMinutes())}`;
    // el cuerpo de cada informe, con lo de arriba ya puesto para él (A: lo que se mira; now: lo abierto ahora)
    const BODY = {
      // en los informes, nunca la sábana de incidencias
      backlog: (A) => tabs.render('hoy', A, { inReport: true }),
      history: (A) => tabs.render('resumen', A, { state: false }) + tabs.render('historico', A, { inReport: true }),
      tiempos: (A) => tabs.render('tiempos', A, { inReport: true }),
      modulos: (A) => tabs.render('modulos', A),   // solo de Indra (report.js, reportsOf)
      escalados: (A) => tabs.render('escalados', A, { inReport: true }),
      turnos: (A) => tabs.render('turnos', A),   // con el filtro de turno de sus casillas (S.f.tu)
      // Estado de SLAs: lo del periodo y las incidencias; con el MTTR, lo de Análisis tiempos (en qué se va el tiempo y
      // por módulo, de lo resuelto del periodo); Atendidas en SLA; y la calidad, por técnico, y el uso de la IA, por día
      slas: (A, audience, person, params) => tabs.render('resumen', A, { slas: params })
        // frente a T-Systems, sin el desglose por módulo (no trabajamos con los mismos)
        + (params.includes('mttr') ? tabs.render('tiempos', A, { parts: audience === 'ts' ? ['times'] : ['times', 'mo'] }) : '')
        + tabs.render('resumen', A, { slas: params, part: 'sla' })
        + tabs.render('resumen', A, { slas: params, part: 'people' }),
      // el panel de Equipo soporte (work/team.js), con su propio estado: de partida, sin días elegidos ni gráficas
      // desplegadas y con la sábana entera; person, el técnico (null, todo el equipo), frente a la media del equipo
      equipo: (A, audience, person) => {
        const tui = { exp: { 'team-sheet': true }, sort: {}, charts: new Set(), range: null, actSeries: null, person, vsTeam: true, noSheet: true };
        return teamPanel(m, createCharts(m, tui), tui);
      },
    };
    // las listas de casillas de los informes, las de cada pestaña: los módulos y centros con incidencias de lo cargado
    // de Indra (TEAM 0; con lo de sus búsquedas sin técnico) o, frente a T-Systems, de cualquiera de las dos (TEAM 0 o
    // 1); de más a menos. Lo de otros (almacenes, el grupo compartido) no se lista. Sin módulo o sin centro (clave 0)
    // tampoco: entra solo con todo marcado
    const ofTeams = (teams) => { const out = []; for (let i = 0; i < m.N; i++) if (teams.includes(m.TEAM[i])) out.push(i); return out; };
    const listsOf = (rows) => Object.fromEntries(PICKS.map(([dim]) => [dim, m.group(dim, rows).filter((g) => g.k).map((g) => [g.k, DIMS[dim].label(g.k), g.n])]));
    const lists = { indra: listsOf(ofTeams([0])), ts: listsOf(ofTeams([0, 1])) };
    // los periodos que se pueden comparar (los de «Comparar» del Resumen, con datos), con su rango de ahora: «Periodo
    // actual» es el de arriba antes de cambiarlo para el informe
    const periodsNow = cmpOptions(m).filter(([, , r]) => r);
    // los técnicos de Indra (Equipo soporte), por su nombre
    const people = m.group('as', ofTeams([0])).filter((g) => g.k).map((g) => [g.k, DIMS.as.label(g.k)])
      .sort((a, b) => a[1].localeCompare(b[1], 'es'));
    modals.report({
      current: { range: [S.d0, S.d1], from: iso(S.d0), to: iso(S.d1 - DAY), asOf },
      bounds: reportBounds(m), base: BASE, lists, people, periods: periodsNow.map(([k, l, r]) => [k, l, iso(r[0]), iso(r[1] - DAY)]), initial,
      onExport: ({ key, mode, audience, systems, picks, person, params, shifts, cmp, range, preview, choice }) => {
        // lo de arriba se cambia solo para pintar el informe y vuelve a ser lo de antes: los lados (los de la pestaña),
        // el filtro de SGA o SISU (el de las casillas), el periodo (con fechas), la comparación de periodos, las sábanas
        // enteras y lo que eligen las pestañas (Actual o Histórico, desglose; en Escalados, sin proyectos elegidos ni el
        // filtro de las Sin Jira). Equipo soporte, como su pestaña, sin los filtros ni la búsqueda de arriba
        const dated = withDates(key, mode), now = !dated, team = key === 'equipo';
        const keep = { d: [S.d0, S.d1], sides: S.sides, f: { ...S.f }, q: S.q, exp: { ...ui.exp },
          ui: { resCmp: ui.resCmp, timesNow: ui.timesNow, timesBy: ui.timesBy, modNow: ui.modNow, escNow: ui.escNow, jiraPick: ui.jiraPick, escNoJira: ui.escNoJira } };
        let body, cover, names, cos, filters, cmpText = '';
        try {
          S.sides = sidesOf(audience);
          if (team) { S.f = {}; S.q = ''; }
          // los filtros que eligen las casillas: SGA o SISU y, con sus listas, módulos y centros (todo marcado, sin filtro)
          const set = (dim, f) => { if (f) S.f[dim] = f; else delete S.f[dim]; };
          set('ss', systemsFilter(systems));
          if (withShifts(key)) set('tu', shiftsFilter(shifts));
          for (const [dim, keys] of Object.entries(picks)) set(dim, pickedFilter(lists[audience][dim].map(([k]) => k), keys));
          if (dated) { m.setPeriod(range[0], range[1]); ui.resCmp = null; }
          Object.assign(ui, { timesNow: now, timesBy: 'mo', modNow: now, escNow: now, jiraPick: [], escNoJira: false });
          ui.exp = { ...ui.exp, 'res-sheet': true, 'times-sheet': now, 'esc-sheet': true, 'esc-bad': true };
          m.refilter();
          // comparando dos periodos, arriba del todo (con los filtros del informe; de un técnico, lo suyo)
          // cada periodo, con su nombre o, personalizado, por sus fechas
          const periodOf = (s) => ({ label: cmp[s].label ?? rangeLabel(m, cmp[s].range), range: cmp[s].range });
          const top = cmp ? tabs.render('resumen', m.rows(), { vsPeriod: { a: periodOf('a'), b: periodOf('b'), person } }) : '';
          body = top + BODY[key](m.rows(), audience, person, params);
          cmpText = cmp ? `${periodOf('a').label} frente a ${periodOf('b').label}` : '';
          cover = coverage(m);
          names = m.NAMES(); cos = m.CO();
          // los filtros de arriba con que sale (los de las casillas van aparte, cada uno en su fila)
          filters = [...Object.keys(S.f).filter((dim) => dim !== 'ss' && !(dim in picks) && !(dim === 'tu' && withShifts(key))).flatMap((dim) => [...S.f[dim]].map((k) => `${DIMS[dim].name}: ${DIMS[dim].label(k)}`)), ...(S.q ? [`Búsqueda: ${S.q}`] : [])];
        } finally {
          S.sides = keep.sides;
          S.f = keep.f;
          S.q = keep.q;
          if (dated) m.setPeriod(...keep.d);
          Object.assign(ui, keep.ui);
          ui.exp = keep.exp;
          m.refilter();
        }
        const who = person == null ? '' : DIMS.as.label(person);
        const parts = {
          title: reportName(key, range, BASE, { mode, asOf: at.getTime(), audience, systems, person: who }),
          head: reportHead({ key, mode, range, base: BASE, asOf, sides: cos.map((k) => names[k]), systems, filters, person: who, params, shifts, periods: cmpText,
            picks: PICKS.filter(([dim]) => dim in picks).map(([dim, label]) => [label, pickedText(lists[audience][dim].map(([k]) => k), picks[dim], DIMS[dim].label)]).filter(([, v]) => v), coverage: cover, generatedAt: new Date() }),
          body, sideStyle: root.getAttribute('style') || '',
        };
        if (preview) previewReport(parts, { onBack: () => exportReport(choice), toast });
        else exportPdf(parts, { toast });
      },
    });
  };

  const pressedInPop = pressStartedIn(root, (t) => !!t.closest('.mt-pop'));
  root.addEventListener('click', (e) => {
    // con datos, actualizar; sin datos, la primera carga con el periodo que se elige
    if (e.target.closest('[data-update]')) return m ? update() : modals.firstLoad();
    if (e.target.closest('[data-more]')) return setMenu($('[data-more-pop]')?.hidden === true);
    const item = e.target.closest('[data-open-report],[data-export-sheet],[data-open-csv],[data-open-sql],[data-clear]');
    if (item) {
      setMenu(false);
      if (item.hasAttribute('data-open-report')) return exportReport();
      if (item.hasAttribute('data-export-sheet')) return tab === team?.id ? teamView?.exportSheet() : exportSheet();
      if (item.hasAttribute('data-open-csv')) return modals.csv();
      if (item.hasAttribute('data-clear')) return modals.clear();
      return modals.sql();
    }
    if (!e.target.closest('.mt-menu')) setMenu(false);
    if (!m || e.target.closest('a')) return;
    const box = e.target.closest('[data-face]');
    if (box) return enterFace(box.dataset.face);
    if (e.target.closest('[data-hub-back]')) { face = null; closePops(); return renderHub(); }
    if (e.target.closest('[data-export]')) return exportSheet();
    const { S } = m;
    // desplegables: abrir y cerrar, elegir; un clic fuera los cierra
    if (e.target.closest('[data-calendar]')) return togglePop('calendar');
    const side = e.target.closest('[data-side]');
    if (side) return togglePop(`side${side.dataset.side}`);
    const company = e.target.closest('[data-pick-company]');
    if (company) { const [k, c] = company.dataset.pickCompany.split(':').map(Number); S.sides[k] = { company: c }; closePops(); return render(); }
    if (e.target.closest('[data-side-add]')) {
      S.sides[1] = freeCompany(S.sides[0]);
      colors[1] = freeColor(colors[0]);
      closePops();
      return render();
    }
    const remove = e.target.closest('[data-side-remove]');
    if (remove) {
      ({ sides: S.sides, colors } = withoutSide(S.sides, colors, Number(remove.dataset.sideRemove)));
      closePops();
      return render();
    }
    const color = e.target.closest('[data-pick-color]');
    if (color) { const [k, c] = color.dataset.pickColor.split(':'); colors[Number(k)] = c; return renderSides(); }
    const person = e.target.closest('[data-pick-person]');
    if (person) {
      const [k, p] = person.dataset.pickPerson.split(':').map(Number);
      S.sides[k] = togglePerson(S.sides, k, p);
      return render();
    }
    if (open && !pressedInPop() && !e.target.closest('.mt-pop')) { closePops(); renderPeriod(); renderSides(); }
    if (e.target.closest('[data-search]')) {
      searching = !searching || !!S.q;
      $('[data-q]').hidden = !searching;
      if (searching) $('[data-q]').focus();
      return;
    }
    const t = e.target.closest('[data-tab],[data-go],[data-rm],[data-exp],[data-sort],[data-evo],[data-evo-step],[data-qco],[data-cli-f],[data-times-mode],[data-times-by],[data-sla-mode],[data-mod-mode],[data-sla-side],[data-res-pop],[data-res-clear],[data-flk],[data-shk],[data-jc],[data-jc-clear],[data-esc-mode],[data-esc-nojira],[data-esc-by],[data-only],[data-reset-filters],[data-kf],[data-ring-sys],[data-f2],[data-f]');
    // la cabecera de una columna: ordenar la tabla por ella (table-sort.js; las que ya filtran u ordenan van por su lado)
    const colTh = !t && e.target.closest('th[data-colsort]');
    if (colTh) { toggleTableSort(colTh, ui.colSort); render(); return; }
    if (!t) return;
    const d = t.dataset;
    let reframe = false;   // un enlace a una pestaña de otra vista: se cambia a esa vista
    if (d.tab || d.go) {
      const from = tab;
      const [to, k] = routeTo(d.tab || d.go, face);
      tab = k; root.scrollTop = 0;
      if (to !== face) { face = to; onlyIndra(); reframe = true; } else if (onlyIndra()) m.refilter();   // Backlog: sin T-Systems
      // Escalados se abre en Activas llegando desde Foto de hoy o desde el enlace de Pendiente (proveedor) de Resumen; si no,
      // en Histórico. Dentro, se cambia con data-esc-mode.
      if (tab === 'escalados' && from !== tab) { ui.escNow = from === 'resumen' || from === 'backlog' || d.escNow != null; ui.escNoJira = false; }
      if (d.rm) { const [dim, k] = filterKey(d.rm); S.f[dim]?.delete(k); }   // un enlace que quita un filtro al ir (Resumen → Escalados)
      // un enlace con fechas y vista (Resumen → Histórico): esas fechas arriba y esa vista de la evolución
      if (d.period) { const [a, b] = d.period.split(':').map(Number); m.setPeriod(a, b); }
      if (d.goEvo) ui.evo = d.goEvo;
    }
    else if (d.evo) ui.evo = d.evo;   // Histórico: la evolución del backlog o entrantes frente a atendidas
    else if (d.evoStep) ui.evoStep = d.evoStep;   // la evolución del backlog: por días, semanas o meses
    // La barra de arriba (quick-bar.js): la empresa y las fechas rápidas (con Ctrl, o Cmd, se comparan con lo elegido) y
    // «Comparar»: abrir o cerrar su pop-up y aplicar lo elegido en él. Un periodo frente a otro (ui.resCmp, del Resumen)
    // o el mismo frente a T-Systems (el otro lado: vale para todas las pestañas); son excluyentes
    else if (d.timesMode) ui.timesNow = d.timesMode === 'now';   // Análisis tiempos: Actual o Histórico
    else if (d.timesBy) ui.timesBy = d.timesBy;   // y su desglose, por módulo o por centro
    else if (d.slaMode) ui.slaNow = d.slaMode === 'now';   // SLAs: Actual o Histórico
    else if (d.modMode) ui.modNow = d.modMode === 'now';   // Módulos y focos: Actual o Histórico
    else if (d.slaSide) ui.slaOut = d.slaSide === 'out';   // y si sus KPIs dan el % dentro o fuera del SLA
    // Pendiente de cliente: filtrar su sábana por un KPI o un motivo (otra vez, o vacío, lo quita)
    else if (d.cliF != null) ui.cliFilter = !d.cliF || ui.cliFilter === d.cliF ? null : d.cliF;
    // la empresa: clic, mirarla; con Ctrl (o Cmd) o en el modo comparar, compararla con la marcada
    else if (d.qco != null) { if (!pickCompany(m, ui, Number(d.qco), e.ctrlKey || e.metaKey || ui.cmpPick, sideOps)) return; ui.cmpPick = false; }
    // «Comparar»: entrar en el modo comparar (o salir), con el calendario abierto para elegir con qué
    else if (d.resPop != null) { ui.cmpPick = !ui.cmpPick; if (ui.cmpPick) { render(); return togglePop('calendar'); } }
    // y su ×: quita la comparación, sea de periodos o de empresas, o cancela la elección
    else if (d.resClear != null) { if (!ui.cmpPick) { if (S.sides[1]) ({ sides: S.sides, colors } = withoutSide(S.sides, colors, 1)); ui.resCmp = null; } ui.cmpPick = false; }
    else if (d.flk) {   // y en estas, centrarse en una serie (otro clic, soltarla; Ctrl+clic, sumarla), como en los filtros
      const f = ui.flowFocus || [], k = d.flk;
      ui.flowFocus = e.ctrlKey || e.metaKey ? (f.includes(k) ? f.filter((x) => x !== k) : [...f, k]) : f.includes(k) ? f.filter((x) => x !== k) : [k];
    }
    // Turnos: clic, solo ese turno; con Ctrl (o Cmd), sumarlo o quitarlo (sin quedarse sin ninguno)
    else if (d.shk != null) {
      const k = Number(d.shk), cur = ui.shifts || [0, 1, 2];
      // como los demás filtros: clic, solo ese (otro clic en el único elegido, todos otra vez); Ctrl+clic, sumarlo o quitarlo
      if (!(e.ctrlKey || e.metaKey)) ui.shifts = cur.length === 1 && cur[0] === k ? [0, 1, 2] : [k];
      else if (!cur.includes(k)) ui.shifts = [...cur, k].sort();
      else if (cur.length > 1) ui.shifts = cur.filter((x) => x !== k);
    }
    else if (d.jc) { ui.jiraPick = toggleProject(ui.jiraShown, Number(d.jc), e.ctrlKey || e.metaKey); ui.escNoJira = false; }   // Escalados: los proyectos que se comparan y filtran
    else if (d.jcClear != null) ui.jiraPick = [];
    else if (d.escMode) ui.escNow = d.escMode === 'now';   // Escalados: Activas o Histórico
    else if (d.escBy) ui.escBy = d.escBy;   // y su tabla, por proyecto Jira, módulo o centro
    else if (d.escNojira != null) { ui.escNoJira = !ui.escNoJira; if (ui.escNoJira) ui.jiraPick = []; }   // y filtrar por las Sin Jira (sin proyecto)
    // un selector: solo ese valor de la dimensión («dim:clave») o, sin clave («dim:»), todos (sin filtro)
    // con Ctrl (o Cmd), sumarlo o quitarlo (view.js, pickOnly)
    else if (d.ringSys != null) {   // la corona: SISU / SGA, el filtro de toda la página; cada uno se pone o se quita (siempre queda uno; los dos, sin filtro)
      const k = Number(d.ringSys), on = S.f.ss?.size ? [...S.f.ss] : [0, 1];
      const next = on.includes(k) ? (on.length > 1 ? on.filter((x) => x !== k) : on) : [...on, k];
      if (next.length === 2) delete S.f.ss; else S.f.ss = new Set(next);
    }
    else if (d.only != null) { const [dim, k] = d.only.split(':'); pickOnly(S.f, dim, k === '' ? null : Number(k), e.ctrlKey || e.metaKey); }
    else if (d.rm) { const [dim, k] = filterKey(d.rm); S.f[dim].delete(k); }
    else if (d.resetFilters != null) { clearFilters(S, ui); const q = $('[data-q]'); q.value = ''; searching = false; }   // «Quitar filtros»
    else if (d.exp) ui.exp[d.exp] = !ui.exp[d.exp];
    else if (d.sort) { const [id, c] = d.sort.split(':'), cur = ui.sort[id]; ui.sort[id] = [c, cur && cur[0] === c ? -cur[1] : -1]; }
    // un KPI que filtra (SLAs): sus filtros, todos; si ya estaban todos, los quita
    else if (d.kf) { const ks = d.kf.split('|').map(filterKey), all = ks.every(([dim, k]) => m.isSel(dim, k)); ks.forEach(([dim, k]) => { if (m.isSel(dim, k) === all) m.toggle(dim, k); }); }
    else if (d.f2) pickBoth(S.f, d.f2.split('|').map(filterKey), e.ctrlKey || e.metaKey);   // con Ctrl, si ya estaba, quitarlo
    // un filtro de una tabla, una corona, una barra…: clic, centrarse en ese (otro clic, soltarlo); Ctrl+clic, sumarlo o quitarlo
    else if (d.f) { const [dim, k] = filterKey(d.f); pickOnly(S.f, dim, k, e.ctrlKey || e.metaKey); }
    if (reframe) openFrame(); else render();
  });
  let searchTimer;
  root.addEventListener('input', (e) => {
    if (!m) return;
    if (e.target.matches('[data-who-q]')) { who = e.target.value; renderSides(); return; }
    if (!e.target.matches('[data-q]')) return;
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { m.S.q = e.target.value; render(); }, SEARCH_MS);
  });

  attachTip(root, () => m.NAMES());
  // Lo que se pincha sin ser un botón (un KPI o una tarjeta que lleva a su pestaña, un KPI que filtra): también con
  // Intro o la barra espaciadora, como un botón.
  root.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches?.('[role="button"][tabindex]')) { e.preventDefault(); e.target.click(); }
  });
  // Escape: cierra el desplegable abierto; en la búsqueda, la borra y la cierra. Se escucha en todo
  // el documento: al elegir un color el desplegable se repinta y el foco sale de la vista.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('[data-more-pop]') && !$('[data-more-pop]').hidden) return setMenu(false);
    if (!m || root.hidden || e.key !== 'Escape') return;
    if (ui.cmpPick) { ui.cmpPick = false; closePops(); render(); return; }   // el modo comparar: cancelarlo
    if (open) { closePops(); renderPeriod(); renderSides(); return; }
    if (e.target.matches('[data-q]')) { e.target.value = ''; searching = false; m.S.q = ''; render(); }
  });
  root.addEventListener('focusout', (e) => {
    if (m && e.target.matches('[data-q]') && !e.target.value && !e.relatedTarget?.closest('[data-search]')) { searching = false; e.target.hidden = true; }
  });

  // Los datos guardados se leen una vez, aunque se pidan a la vez.
  let reading = null;
  const ready = () => (m ? Promise.resolve() : (reading ||= api.load().then(start).finally(() => { reading = null; })));
  const failed = (e) => { root.innerHTML = `<div class="mt-page"><p class="mt-empty">No se pudieron cargar las métricas: ${esc(e.message)}</p></div>`; };

  return {
    // Al abrir la vista: siempre el menú, con una caja por vista.
    show: () => ready().then(() => { if (m) { face = null; closePops(); renderHub(); } }).catch(failed),
    // De vuelta de la gestión del equipo: la vista Equipo, en su pestaña.
    showTeam: () => ready().then(() => { if (m) enterFace('equipo', team.id); }).catch(failed),
  };
};
