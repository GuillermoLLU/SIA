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
import { periodLabel } from './period.js';
import { mountPeriodPanel } from './period-panel.js';
import { attachTip } from './tip.js';
import { PHASES, CSV_PHASES, CLEAR_PHASES } from './progress.js';
import { mountMetricsModals } from './metrics-modals.js';
import { progressCover } from './progress-cover.js';
import { isNetWarning } from '../ui/net-warning.js';
import { netWarningHtml, shake } from '../ui/net-warning-view.js';
import { COLORS, defaultColors, freeColor, dayOf, coverage, freeCompany, withoutSide, togglePerson, filterKey } from './view.js';

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

export const mountMetricsView = (root, { api, toast }) => {
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
        <span>Trae de Snowflake las incidencias de Remedy (con notas e historial) desde 2026, o carga un CSV de esa misma consulta. Se guardan en el repositorio local de este ordenador y de él salen las métricas; cada vez que actualices, solo llega lo nuevo y lo cambiado.</span>
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
        ${sideSlot(0)}<span class="mt-vs" data-vs>frente a</span>${sideSlot(1)}<button class="mt-btn mt-add" data-side-add>+ Comparar</button>
        <div class="mt-period"><button class="mt-btn mt-icon-btn" data-calendar aria-haspopup="true">${CALENDAR_ICON}<span data-period></span></button><div class="mt-pop mt-cal" data-cal hidden></div></div>
        <div class="mt-chips" data-chips></div>
        <div class="mt-find"><input type="search" data-q placeholder="Título o INC…" hidden><span class="mt-count" data-count></span>
          <button class="mt-search" data-search title="Buscar en el título o por número">${SEARCH_ICON}</button></div>
      </div>
      <nav class="mt-tabs">${TABS.map(([k, l]) => `<button data-tab="${k}">${l}</button>`).join('')}</nav>
      <div class="mt-main" data-main></div>
    </div><div class="mt-tip" data-tip-box hidden></div>`;
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
    $('[data-side-add]').hidden = two;
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
    $('[data-q]').hidden = !(searching || S.q);
    $('[data-count]').innerHTML = `<b>${num(A.length)}</b> issues`;
    root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('mt-on', b.dataset.tab === tab));
    $('[data-main]').innerHTML = tabs.render(tab, A);
  };

  const start = (data) => {
    m = data ? createModel(data) : null;
    m?.resetPeriod();   // de partida, el mes en curso
    ui.exp = {}; ui.sort = {}; tab = 'resumen'; searching = false; closePops();
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
      toast?.(counts.inserted || counts.updated
        ? `Informe actualizado: ${num(counts.inserted)} nuevas y ${num(counts.updated)} actualizadas.`
        : 'Informe actualizado: sin cambios desde la última vez.');
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
    const t = e.target.closest('[data-tab],[data-go],[data-rm],[data-exp],[data-sort],[data-f2],[data-f]');
    if (!t) return;
    const d = t.dataset;
    if (d.tab || d.go) { tab = d.tab || d.go; root.scrollTop = 0; }
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

  // Los datos guardados se leen una vez (aunque los pidan a la vez show y focus).
  let reading = null;
  const ready = () => (m ? Promise.resolve() : (reading ||= api.load().then(start).finally(() => { reading = null; })));
  const failed = (e) => { root.innerHTML = `<div class="mt-page"><p class="mt-empty">No se pudieron cargar las métricas: ${esc(e.message)}</p></div>`; };

  return {
    // Al abrir la vista: siempre el Resumen.
    show: () => ready().then(() => { if (m && tab !== 'resumen') { tab = 'resumen'; render(); } }).catch(failed),
    // Una persona frente al resto de su equipo (desde Equipo soporte).
    focus: (person) => ready().then(() => {
      if (!m) return;
      m.S.sides = [{ people: new Set([person]) }, { company: m.data.company[person] }];
      colors = defaultColors();
      tab = 'resumen'; closePops();
      render();
    }).catch(failed),
  };
};
