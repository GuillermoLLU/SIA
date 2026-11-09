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
import { createTabs, TABS } from './tabs.js';
import { periodLabel, presetRange } from './period.js';
import { companyPick, presetPick, comparePop, pickCompany, pickPreset } from './quick-bar.js';
import { mountPeriodPanel } from './period-panel.js';
import { attachTip } from './tip.js';
import { toggleProject } from './resolution.js';
import { PHASES, CSV_PHASES, CLEAR_PHASES } from './progress.js';
import { mountMetricsModals } from './metrics-modals.js';
import { progressCover } from './progress-cover.js';
import { isNetWarning } from '../ui/net-warning.js';
import { netWarningHtml, shake } from '../ui/net-warning-view.js';
import { COLORS, defaultColors, freeColor, dayOf, coverage, freeCompany, withoutSide, togglePerson, filterKey } from './view.js';
import { sheetOf, sheetCsv, sheetFile } from './sheet.js';
import { downloadText } from './download.js';

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
  // open: el desplegable abierto ('calendar', 'side0' o 'side1'); who: lo escrito en el buscador de
  // personas; searching: la búsqueda abierta
  let open = null, who = '', searching = false;
  let colors = defaultColors();   // el color de cada lado
  const ui = { exp: {}, sort: {} };
  const $ = (s) => root.querySelector(s);
  // Las ventanas de «Cargar CSV» y «Construir SQL»: al cargar, se vuelven a leer los datos y se abren como siempre.
  const modals = mountMetricsModals({
    api, toast,
    onUpload: (file) => uploadCsv(file).catch((e) => toast?.(e.name === 'AbortError' ? 'Cancelado: no ha entrado nada nuevo.' : e.message)),
    onFirstLoad: (range) => update(range),
    onClear: () => clearHistory(),
  });

  const loadButton = () => `<button class="mt-load ${loading ? 'mt-busy' : ''}" data-update ${loading ? 'disabled' : ''}>${loading ? 'Actualizando…' : m ? LOAD : FIRST_LOAD}</button>`;
  // Los tres puntos: lo que se hace pocas veces (cargar un CSV, construir la consulta). Sin nada encima de la vista.
  // Sin datos (withClear: false), no hay histórico que borrar.
  const moreMenu = (withClear = true) => `<div class="mt-menu"><button class="mt-btn mt-icon-btn mt-more" data-more aria-haspopup="menu" aria-expanded="false" aria-label="Más opciones" title="Más opciones"><svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg></button>
    <div class="mt-pop mt-menu-pop" data-more-pop role="menu" hidden><button role="menuitem" data-open-csv>Cargar CSV…</button><button role="menuitem" data-open-sql>Construir SQL…</button>${withClear ? '<button role="menuitem" class="mt-danger-item" data-clear>Eliminar histórico…</button>' : ''}</div></div>`;
  const setMenu = (on) => {
    const pop = $('[data-more-pop]');
    if (!pop) return;
    pop.hidden = !on;
    $('[data-more]').setAttribute('aria-expanded', String(on));
  };

  const renderEmpty = () => {
    root.innerHTML = `<div class="mt-page mt-empty-page"><header class="mt-top"><h2 class="mt-title">Métricas</h2></header>
      <div class="mt-empty"><b>Aún no hay datos</b>
        <span>Trae de Snowflake las incidencias de Remedy (con notas e historial) desde 2025, para comparar con el año anterior, o carga un CSV de esa misma consulta. Se guardan en el repositorio local de este ordenador y de él salen las métricas; cada vez que actualices, solo llega lo nuevo y lo cambiado.</span>
        <div class="mt-empty-actions">${loadButton()}${moreMenu(false)}</div></div></div>`;
  };

  const sideSlot = (k) => `<div class="mt-period mt-slot" data-slot="${k}"><button class="mt-btn mt-icon-btn mt-side" data-side="${k}" aria-haspopup="true"><i class="mt-c${k}"></i><span data-side-name="${k}"></span>${CHEVRON}</button><button class="mt-btn mt-x" data-side-remove="${k}" title="Quitar de la comparación">×</button>
    <div class="mt-pop mt-who" data-side-pop="${k}" hidden><div data-side-companies="${k}"></div><input type="search" data-who-q placeholder="Buscar personas…"><div class="mt-who-list" data-side-list="${k}"></div></div></div>`;

  // Lo fijo de la vista (cabecera, comparación, filtros, pestañas); lo de dentro se repinta con cada cambio.
  const renderFrame = () => {
    const { meta } = m.data;
    root.innerHTML = `<div class="mt-page">
      <header class="mt-top"><h2 class="mt-title">Métricas</h2>
        <span class="mt-date" data-coverage title="${esc(`${meta.file}, actualizado el ${dayOf(meta.generated)}`)}"></span>
        ${loadButton()}${moreMenu()}</header>
      <div class="mt-fbar">
        ${sideSlot(0)}<span class="mt-vs" data-vs>frente a</span>${sideSlot(1)}<div data-qco></div>
        <div data-presets></div><div class="mt-period"><button class="mt-btn mt-icon-btn" data-calendar aria-haspopup="true">${CALENDAR_ICON}<span data-period></span></button><div class="mt-pop mt-cal" data-cal hidden></div></div>
        <div data-cmp></div>
        <div class="mt-chips" data-chips></div>
        <div class="mt-find"><input type="search" data-q placeholder="Título o INC…" hidden><span class="mt-count" data-count></span>
          <button class="mt-search" data-search title="Buscar en el título o por número">${SEARCH_ICON}</button></div>
      </div>
      <nav class="mt-tabs">${[...TABS, ...(team ? [[team.id, team.label]] : [])].map(([k, l]) => `<button data-tab="${k}">${l}</button>`).join('')}</nav>
      <div class="mt-main" data-main></div>
    </div><div class="mt-tip" data-tip-box hidden></div>`;
    if (teamHost) $('[data-main]').after(teamHost);
  };

  // Periodo: el botón dice qué fechas se miran; su panel (period-panel.js), la rejilla de meses y los campos Desde y
  // Hasta. Elegir en la rejilla lo aplica y lo cierra; una fecha, lo aplica y lo deja abierto.
  const renderPeriod = () => {
    $('[data-period]').textContent = periodLabel(m);
    $('[data-cal]').hidden = open !== 'calendar';
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
        <p class="mt-who-co">Empresa</p><div class="mt-cos">${[0, 1, 2].map((c) => `<button data-pick-company="${k}:${c}" class="${!s.people && s.company === c ? 'mt-on' : ''}" ${taken(c) ? 'disabled title="Ya está en el otro lado"' : ''}>${COMPANIES[c]}</button>`).join('')}</div><p class="mt-who-co">Personas</p>`;
      const q = fold(who.trim()), mine = s.people || new Set(), theirs = other?.people || new Set();
      const all = m.group('as', m.pool()).filter((x) => x.k && (!q || fold(DIMS.as.label(x.k)).includes(q)));
      const groups = [0, 1, 2].map((c) => [c, all.filter((x) => data.company[x.k] === c)]).filter(([, l]) => l.length);
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
    m.refilter();
    const A = m.rows();
    const chips = Object.keys(S.f).flatMap((dim) => [...S.f[dim]].map((k) => `<span class="mt-chip">${DIMS[dim].name}: <b>${esc(DIMS[dim].label(k))}</b><button data-rm="${dim}:${k}" title="Quitar">×</button></span>`));
    $('[data-chips]').innerHTML = chips.join('');
    $('[data-coverage]').textContent = coverage(m);
    renderPeriod();
    renderSides();
    $('[data-qco]').innerHTML = companyPick(m);
    $('[data-presets]').innerHTML = presetPick(m, ui);
    $('[data-cmp]').innerHTML = comparePop(m, ui);
    $('[data-q]').hidden = !(searching || S.q);
    $('[data-count]').innerHTML = `<b>${num(A.length)}</b> incidencias`;
    root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('mt-on', b.dataset.tab === tab));
    // la pestaña del equipo va por su cuenta: sin los filtros de arriba, que no le afectan
    const onTeam = tab === team?.id;
    for (const s of ['.mt-fbar', '[data-main]']) $(s).style.display = onTeam ? 'none' : '';
    if (teamHost) teamHost.hidden = !onTeam;
    if (onTeam) {
      teamView ||= team.mount(teamHost);
      teamView.show();
      return;
    }
    $('[data-main]').innerHTML = tabs.render(tab, A);
  };

  const start = (data) => {
    m = data ? createModel(data) : null;
    m?.resetPeriod();   // de partida, el año fiscal en curso (desde el 1 de febrero)
    ui.exp = {}; ui.sort = {}; ui.jiraPick = null; ui.resCmp = null; ui.resPop = false; ui.cliFilter = null; tab = 'resumen'; searching = false; closePops();
    if (!m) return renderEmpty();
    tabs = createTabs(m, createCharts(m, ui), ui);
    renderFrame();
    panel = mountPeriodPanel($('[data-cal]'), { model: () => m, onPick: (close) => { if (close) closePops(); render(); } });
    render();
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

  // La sábana, a CSV (del Resumen o de Escalados): lo que se ve ahora (filtros y lados), entero, descargado como fichero (sheet.js).
  const exportSheet = () => {
    // la sábana de la pestaña: la de Escalados o la de Pendiente de cliente, con sus columnas; si no, lo abierto ahora
    const own = { escalados: [ui.escSheet, 'incidencias-escaladas'], cliente: [ui.cliSheet, 'pendientes-de-cliente'] }[tab];
    const list = own ? own[0].list : sheetOf(m);
    if (!list.length) return;
    const file = own ? sheetFile(m, own[1]) : sheetFile(m);
    downloadText(file, sheetCsv(m, list, own?.[0].cols), 'text/csv;charset=utf-8');
    toast?.(`Exportadas ${num(list.length)} incidencias a ${file}.`);
  };

  root.addEventListener('click', (e) => {
    // con datos, actualizar; sin datos, la primera carga con el periodo que se elige
    if (e.target.closest('[data-update]')) return m ? update() : modals.firstLoad();
    if (e.target.closest('[data-more]')) return setMenu($('[data-more-pop]')?.hidden === true);
    const item = e.target.closest('[data-open-csv],[data-open-sql],[data-clear]');
    if (item) {
      setMenu(false);
      if (item.hasAttribute('data-open-csv')) return modals.csv();
      if (item.hasAttribute('data-clear')) return modals.clear();
      return modals.sql();
    }
    if (!e.target.closest('.mt-menu')) setMenu(false);
    if (!m || e.target.closest('a')) return;
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
    if (open && !e.target.closest('.mt-pop')) { closePops(); renderPeriod(); renderSides(); }
    if (e.target.closest('[data-search]')) {
      searching = !searching || !!S.q;
      $('[data-q]').hidden = !searching;
      if (searching) $('[data-q]').focus();
      return;
    }
    // Resumen: el pop-up de «Comparar» se cierra con un clic fuera de él (sin aplicar nada)
    const outRes = ui.resPop && !e.target.closest('.mt-res-cmp');
    if (outRes) ui.resPop = false;
    const t = e.target.closest('[data-tab],[data-go],[data-rm],[data-exp],[data-sort],[data-evo],[data-evo-step],[data-qco],[data-preset],[data-cli-f],[data-res-pop],[data-res-apply],[data-res-clear],[data-flk],[data-shk],[data-jc],[data-jc-clear],[data-esc-mode],[data-esc-nojira],[data-only],[data-f2],[data-f]');
    if (!t) { if (outRes) render(); return; }
    const d = t.dataset;
    if (d.tab || d.go) {
      const from = tab;
      tab = d.tab || d.go; root.scrollTop = 0;
      // Escalados se abre en Activas llegando desde Backlog o desde el enlace de Pendiente (proveedor) de Resumen; si no,
      // en Histórico. Dentro, se cambia con data-esc-mode.
      if (tab === 'escalados' && from !== 'escalados') { ui.escNow = from === 'backlog' || d.escNow != null; ui.escNoJira = false; }
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
    // Pendiente de cliente: filtrar su sábana por un KPI o un motivo (otra vez, o vacío, lo quita)
    else if (d.cliF != null) ui.cliFilter = !d.cliF || ui.cliFilter === d.cliF ? null : d.cliF;
    else if (d.qco != null) { if (!pickCompany(m, ui, Number(d.qco), e.ctrlKey || e.metaKey, sideOps)) return; }
    else if (d.preset) { const r = presetRange(m, d.preset); if (!r || !pickPreset(m, ui, d.preset, e.ctrlKey || e.metaKey, r, sideOps)) return; }
    else if (d.resPop != null) ui.resPop = !ui.resPop;
    else if (d.resApply != null) {
      const pop = t.closest('[data-res-popup]'), mode = pop.querySelector('input[name="res-mode"]:checked')?.value;
      const off = () => { if (S.sides[1]) ({ sides: S.sides, colors } = withoutSide(S.sides, colors, 1)); };
      if (mode === 'tsys') { const had = !!S.sides[1]; ui.resCmp = null; S.sides[1] = { company: 1 }; if (!had) colors[1] = freeColor(colors[0]); }
      else if (mode === 'periods') { off(); ui.resCmp = { a: pop.querySelector('[data-res-a]').value, b: pop.querySelector('[data-res-b]').value }; }
      ui.resPop = false;
    }
    // y la × de «Comparar»: quita la comparación, sea de periodos o con T-Systems
    else if (d.resClear != null) { if (S.sides[1]) ({ sides: S.sides, colors } = withoutSide(S.sides, colors, 1)); ui.resCmp = null; ui.resPop = false; }
    else if (d.flk) { ui.flowOff = { ...ui.flowOff, [d.flk]: !ui.flowOff?.[d.flk] }; }   // y en estas, encender o apagar una serie
    // Turnos: clic, solo ese turno; con Ctrl (o Cmd), sumarlo o quitarlo (sin quedarse sin ninguno)
    else if (d.shk != null) {
      const k = Number(d.shk), cur = ui.shifts || [0, 1, 2];
      if (!(e.ctrlKey || e.metaKey)) ui.shifts = [k];
      else if (!cur.includes(k)) ui.shifts = [...cur, k].sort();
      else if (cur.length > 1) ui.shifts = cur.filter((x) => x !== k);
    }
    else if (d.jc) { ui.jiraPick = toggleProject(ui.jiraShown, Number(d.jc)); ui.escNoJira = false; }   // Escalados: los proyectos que se comparan y filtran
    else if (d.jcClear != null) ui.jiraPick = [];
    else if (d.escMode) ui.escNow = d.escMode === 'now';   // Escalados: Activas o Histórico
    else if (d.escNojira != null) { ui.escNoJira = !ui.escNoJira; if (ui.escNoJira) ui.jiraPick = []; }   // y filtrar por las Sin Jira (sin proyecto)
    // un selector: solo ese valor de la dimensión («dim:clave») o, sin clave («dim:»), todos (sin filtro)
    else if (d.only != null) { const [dim, k] = d.only.split(':'); if (k === '') delete S.f[dim]; else S.f[dim] = new Set([Number(k)]); }
    else if (d.rm) { const [dim, k] = filterKey(d.rm); S.f[dim].delete(k); }
    else if (d.exp) ui.exp[d.exp] = !ui.exp[d.exp];
    else if (d.sort) { const [id, c] = d.sort.split(':'), cur = ui.sort[id]; ui.sort[id] = [c, cur && cur[0] === c ? -cur[1] : -1]; }
    else if (d.f2) d.f2.split('|').forEach((x) => { const [dim, k] = filterKey(x); if (!m.isSel(dim, k)) m.toggle(dim, k); });
    else if (d.f) { const [dim, k] = filterKey(d.f); m.toggle(dim, k); }
    render();
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
  // Escape: cierra el desplegable abierto; en la búsqueda, la borra y la cierra. Se escucha en todo
  // el documento: al elegir un color el desplegable se repinta y el foco sale de la vista.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('[data-more-pop]') && !$('[data-more-pop]').hidden) return setMenu(false);
    if (!m || root.hidden || e.key !== 'Escape') return;
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
    // Al abrir la vista: siempre el Resumen.
    show: () => ready().then(() => { if (m && tab !== 'resumen') { tab = 'resumen'; render(); } }).catch(failed),
    // De vuelta de la gestión del equipo: su pestaña.
    showTeam: () => ready().then(() => { if (m) { tab = team.id; render(); } }).catch(failed),
  };
};
