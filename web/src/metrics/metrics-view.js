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
import { PHASES, progressOf, progressHtml } from './progress.js';
import { COLORS, defaultColors, freeColor, dayOf, coverage, freeCompany, withoutSide, togglePerson, filterKey } from './view.js';
import { sheetOf, sheetCsv, sheetFile } from './sheet.js';
import { downloadText } from './download.js';

const SEARCH_MS = 250;
const LOAD = 'Actualizar y generar informe';
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

  const loadButton = () => `<button class="mt-load ${loading ? 'mt-busy' : ''}" data-update ${loading ? 'disabled' : ''}>${loading ? 'Actualizando…' : LOAD}</button>`;

  const renderEmpty = () => {
    root.innerHTML = `<div class="mt-page"><header class="mt-top"><h2 class="mt-title">Métricas</h2></header>
      <div class="mt-empty"><b>Aún no hay datos</b>
        <span>Trae de Snowflake las incidencias de Remedy (con notas e historial) desde 2025, para comparar con el año anterior. Se guardan en el repositorio local de este ordenador y de él salen las métricas; cada vez que actualices, solo llega lo nuevo y lo cambiado.</span>
        ${loadButton()}</div></div>`;
  };

  const sideSlot = (k) => `<div class="mt-period mt-slot" data-slot="${k}"><button class="mt-btn mt-icon-btn mt-side" data-side="${k}" aria-haspopup="true"><i class="mt-c${k}"></i><span data-side-name="${k}"></span>${CHEVRON}</button><button class="mt-btn mt-x" data-side-remove="${k}" title="Quitar de la comparación">×</button>
    <div class="mt-pop mt-who" data-side-pop="${k}" hidden><div data-side-companies="${k}"></div><input type="search" data-who-q placeholder="Buscar personas…"><div class="mt-who-list" data-side-list="${k}"></div></div></div>`;

  // Lo fijo de la vista (cabecera, comparación, filtros, pestañas); lo de dentro se repinta con cada cambio.
  const renderFrame = () => {
    const { meta } = m.data;
    root.innerHTML = `<div class="mt-page">
      <header class="mt-top"><h2 class="mt-title">Métricas</h2>
        <span class="mt-date" data-coverage title="${esc(`${meta.file}, actualizado el ${dayOf(meta.generated)}`)}"></span>
        ${loadButton()}</header>
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

  // Mientras se actualiza, una capa encima con el avance (progress.js): lo de debajo se queda viejo, así que no se
  // puede tocar (inert). La capa se pinta una vez y luego solo cambian sus cifras, para que la barra avance suave.
  const cover = (t0) => {
    const el = document.createElement('div');
    el.className = 'mt-loading';
    const paint = (view) => {
      if (!el.firstElementChild) { el.innerHTML = progressHtml(view); return; }
      el.querySelector('[role=progressbar]').setAttribute('aria-valuenow', view.percent);
      el.querySelector('.mt-load-figure b').textContent = view.percent;
      el.querySelector('.mt-load-bar i').style.width = `${view.percent}%`;
      el.querySelector('.mt-load-now b').textContent = PHASES[view.phase].label;
      el.querySelector('.mt-load-now span').textContent = view.left;
      el.querySelector('.mt-load-detail').textContent = view.detail;
      el.querySelectorAll('.mt-load-steps li').forEach((li, i) => { li.className = i < view.phase ? 'mt-done' : i === view.phase ? 'mt-now' : ''; });
    };
    // el último avance del bridge, cuándo empezó su fase (para su ritmo) y lo más alto que ha llegado la barra (nunca retrocede)
    let last = null, phaseT0 = t0, top = 0;
    return {
      el,
      set: (p) => {
        if ((p?.phase ?? null) !== (last?.phase ?? null)) phaseT0 = Date.now();
        last = p ?? last;
      },
      tick: () => {
        const now = Date.now(), view = progressOf(last, { elapsed: now - t0, phaseMs: now - phaseT0 });
        top = Math.max(top, view.percent);
        paint({ ...view, percent: top });
      },
      finish: () => paint({ phase: PHASES.length - 1, percent: 100, detail: 'Abriendo las métricas con los datos nuevos…', left: 'Hecho' }),
    };
  };

  // La primera vez puede abrirse el navegador para entrar en Snowflake con la cuenta de Inditex.
  const update = async () => {
    if (loading) return;
    loading = true;
    if (m) $('.mt-load').outerHTML = loadButton(); else renderEmpty();
    const c = cover(Date.now());
    root.scrollTop = 0;
    root.classList.add('mt-updating');
    $('.mt-page').inert = true;
    root.append(c.el);
    c.tick();
    const poll = setInterval(async () => { try { c.set(await api.progress()); } catch { /* sigue con lo último */ } }, POLL_MS);
    const ticker = setInterval(c.tick, TICK_MS);
    const stop = () => { clearInterval(poll); clearInterval(ticker); };
    try {
      const { counts } = await api.update();
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
      toast?.(e.message);
    } finally {
      stop();
      root.classList.remove('mt-updating');
    }
  };

  // La sábana del Resumen, a CSV: lo que se ve ahora (filtros y lados), entero, descargado como fichero (sheet.js).
  const exportSheet = () => {
    const list = sheetOf(m);
    if (!list.length) return;
    downloadText(sheetFile(m), sheetCsv(m, list), 'text/csv;charset=utf-8');
    toast?.(`Exportadas ${num(list.length)} incidencias a ${sheetFile(m)}.`);
  };

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-update]')) return update();
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
    const t = e.target.closest('[data-tab],[data-go],[data-rm],[data-exp],[data-sort],[data-svc],[data-evo],[data-flk],[data-shk],[data-only],[data-f2],[data-f]');
    if (!t) return;
    const d = t.dataset;
    if (d.tab || d.go) { tab = d.tab || d.go; root.scrollTop = 0; }
    else if (d.svc) ui.svc[d.svc] = !ui.svc[d.svc];   // Servicio y SLA: comparar con el año anterior o con T-Systems
    else if (d.evo) ui.evo = d.evo;   // Resumen: la evolución del backlog o entrantes frente a atendidas
    else if (d.flk) { ui.flowOff = { ...ui.flowOff, [d.flk]: !ui.flowOff?.[d.flk] }; }   // y en estas, encender o apagar una serie
    // Turnos: clic, solo ese turno; con Ctrl (o Cmd), sumarlo o quitarlo (sin quedarse sin ninguno)
    else if (d.shk != null) {
      const k = Number(d.shk), cur = ui.shifts || [0, 1, 2];
      if (!(e.ctrlKey || e.metaKey)) ui.shifts = [k];
      else if (!cur.includes(k)) ui.shifts = [...cur, k].sort();
      else if (cur.length > 1) ui.shifts = cur.filter((x) => x !== k);
    }
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
  };
};
