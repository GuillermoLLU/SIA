// Vista «Métricas»: cómo va el soporte, para verlo en vivo. Los datos salen
// del CSV completo de Remedy que carga cada persona (el bridge los calcula y
// los guarda en este ordenador). Al entrar, siempre el Resumen.
//
// Arriba, qué se mira: el equipo, una empresa o un grupo de personas (de partida,
// nuestro equipo) y, si se quiere, con «+ Comparar», otro lado frente a él; cada
// lado con el color que se elija y la × para quitarlo. Al lado, los filtros, que
// valen para todas las pestañas: el periodo, la búsqueda y, con un clic en
// cualquier barra, fila o celda, ese valor.
import './metrics.css';
import { esc, fold } from '../ui/html.js';
import { num, MONTHS } from './format.js';
import { createModel, COMPANIES } from './model.js';
import { createCharts } from './charts.js';
import { createTabs, TABS } from './tabs.js';
import { periodLabel, calendarHtml } from './period.js';
import { attachTip } from './tip.js';

const SEARCH_MS = 250;
const svg = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const CALENDAR_ICON = svg('<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>');
const SEARCH_ICON = svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>');
const CHEVRON = svg('<path d="m6 9 6 6 6-6"/>');
// colores para elegir en cada lado (no el rojo ni el verde: son peor y mejor); de partida, azul y ocre
const COLORS = [['#2f6fb5', 'azul'], ['#c98a3a', 'ocre'], ['#7c4dcc', 'morado'], ['#14919b', 'turquesa'], ['#d6457f', 'rosa'],
  ['#e07b24', 'naranja'], ['#6d7a1f', 'oliva'], ['#5b6472', 'gris']];

export const mountMetricsView = (root, { api, toast }) => {
  let m = null, tabs = null, tab = 'resumen', loading = false;
  // open: el desplegable abierto ('calendar', 'side0' o 'side1'); anchor: el primer mes marcado a
  // falta del último; who: lo escrito en el buscador de personas; searching: la búsqueda abierta
  let open = null, anchor = null, who = '', searching = false;
  let colors = [COLORS[0][0], COLORS[1][0]];   // el color de cada lado
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

  const sideSlot = (k) => `<div class="mt-period mt-slot" data-slot="${k}"><button class="mt-btn mt-icon-btn mt-side" data-side="${k}" aria-haspopup="true"><i class="mt-c${k}"></i><span data-side-name="${k}"></span>${CHEVRON}</button><button class="mt-btn mt-x" data-side-remove="${k}" title="Quitar de la comparación">×</button>
    <div class="mt-pop mt-who" data-side-pop="${k}" hidden><div data-side-companies="${k}"></div><input type="search" data-who-q placeholder="Buscar personas…"><div class="mt-who-list" data-side-list="${k}"></div></div></div>`;

  // Lo fijo de la vista (cabecera, comparación, filtros, pestañas); lo de dentro se repinta con cada cambio.
  const renderFrame = () => {
    const { meta } = m.data, snap = new Date(m.BASE + m.SNAP * 6e4);
    root.innerHTML = `<div class="mt-page">
      <header class="mt-top"><h2 class="mt-title">Métricas</h2>
        <span class="mt-date" title="${esc(`${meta.file}, cargado el ${dayOf(meta.generated)}`)}">datos hasta el ${snap.getUTCDate()} de ${MONTHS[snap.getUTCMonth()]} de ${snap.getUTCFullYear()}</span>
        ${loadButton('Cargar otro CSV')}</header>
      <div class="mt-fbar">
        ${sideSlot(0)}<span class="mt-vs" data-vs>frente a</span>${sideSlot(1)}<button class="mt-btn mt-add" data-side-add>+ Comparar</button>
        <div class="mt-period"><button class="mt-btn mt-icon-btn" data-calendar aria-haspopup="true">${CALENDAR_ICON}<span data-period></span></button><div class="mt-pop mt-cal" data-cal hidden></div></div>
        <div class="mt-chips" data-chips></div>
        <button class="mt-btn" data-clear>Quitar filtros</button>
        <div class="mt-find"><input type="search" data-q placeholder="Título o INC…" hidden><span class="mt-count" data-count></span>
          <button class="mt-search" data-search title="Buscar en el título o por número">${SEARCH_ICON}</button></div>
      </div>
      <nav class="mt-tabs">${TABS.map(([k, l]) => `<button data-tab="${k}">${l}</button>`).join('')}</nav>
      <div class="mt-main" data-main></div>
    </div><div class="mt-tip" data-tip-box hidden></div>`;
  };

  // Periodo: el botón dice qué meses se miran; el calendario, un mes por casilla. Primer clic, el primer
  // mes; segundo, el último (en cualquier orden). Con un solo mes marcado, al salir del calendario se
  // ve ese mes. Los meses sin datos aún no se pueden marcar.
  const renderPeriod = () => {
    const { S, LASTM } = m;
    $('[data-period]').textContent = periodLabel(S, LASTM, m.data.meta.year);
    const cal = $('[data-cal]');
    cal.hidden = open !== 'calendar';
    if (!cal.hidden) cal.innerHTML = calendarHtml(S, LASTM, m.data.meta.year, anchor);
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
  // la empresa que se pone por defecto a un lado: la primera que no tenga ya el otro
  const freeCompany = (other) => ({ company: [0, 1, 2].find((c) => other?.people || other?.company !== c) });

  const closePops = () => { open = null; anchor = null; who = ''; };
  // Al salir del calendario con un solo mes marcado, ese mes; true si el periodo ha cambiado.
  const settleMonth = () => {
    if (open !== 'calendar' || anchor == null) return false;
    m.S.from = m.S.to = anchor;
    return true;
  };
  const togglePop = (which) => {
    const was = open, changed = settleMonth();
    closePops();
    if (was !== which) open = which;
    if (changed) render(); else { renderPeriod(); renderSides(); }
    const q = open?.startsWith('side') && $(`[data-side-pop="${open.slice(4)}"] [data-who-q]`);
    if (q) { q.value = ''; q.focus(); }
  };

  const render = () => {
    const { S, DIMS } = m;
    m.refilter();
    const A = m.rows();
    const chips = Object.keys(S.f).flatMap((dim) => [...S.f[dim]].map((k) => `<span class="mt-chip">${DIMS[dim].name}: <b>${esc(DIMS[dim].label(k))}</b><button data-rm="${dim}:${k}" title="Quitar">×</button></span>`));
    $('[data-chips]').innerHTML = chips.join('');
    $('[data-clear]').hidden = !(chips.length || S.q || S.from || S.to !== m.LASTM);
    renderPeriod();
    renderSides();
    $('[data-q]').hidden = !(searching || S.q);
    $('[data-count]').innerHTML = `<b>${num(A.length)}</b> issues`;
    root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('mt-on', b.dataset.tab === tab));
    $('[data-main]').innerHTML = tabs.render(tab, A);
  };

  const start = (data) => {
    m = data ? createModel(data) : null;
    ui.exp = {}; ui.sort = {}; tab = 'resumen'; searching = false; closePops();
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
    const { S } = m;
    // desplegables: abrir y cerrar, elegir; un clic fuera los cierra
    if (e.target.closest('[data-calendar]')) return togglePop('calendar');
    const side = e.target.closest('[data-side]');
    if (side) return togglePop(`side${side.dataset.side}`);
    const month = e.target.closest('[data-month]');
    if (month) {
      const k = Number(month.dataset.month);
      if (anchor == null) { anchor = k; return renderPeriod(); }
      [S.from, S.to] = [Math.min(anchor, k), Math.max(anchor, k)];
      closePops();
      return render();
    }
    if (e.target.closest('[data-month-all]')) { S.from = 0; S.to = m.LASTM; closePops(); return render(); }
    const company = e.target.closest('[data-pick-company]');
    if (company) { const [k, c] = company.dataset.pickCompany.split(':').map(Number); S.sides[k] = { company: c }; closePops(); return render(); }
    if (e.target.closest('[data-side-add]')) {
      S.sides[1] = freeCompany(S.sides[0]);
      colors[1] = COLORS.find(([c]) => c !== colors[0])[0];
      closePops();
      return render();
    }
    const remove = e.target.closest('[data-side-remove]');
    if (remove) {
      // queda el otro lado, que pasa a ser A con su color
      if (remove.dataset.sideRemove === '0') { S.sides = [S.sides[1], null]; colors = [colors[1], colors[0]]; } else S.sides[1] = null;
      closePops();
      return render();
    }
    const color = e.target.closest('[data-pick-color]');
    if (color) { const [k, c] = color.dataset.pickColor.split(':'); colors[Number(k)] = c; return renderSides(); }
    const person = e.target.closest('[data-pick-person]');
    if (person) {
      const [k, p] = person.dataset.pickPerson.split(':').map(Number);
      const set = new Set(S.sides[k]?.people || []);
      if (set.has(p)) set.delete(p); else set.add(p);
      S.sides[k] = set.size ? { people: set } : freeCompany(S.sides[1 - k]);
      return render();
    }
    if (open && !e.target.closest('.mt-pop')) {
      const changed = settleMonth();
      closePops();
      if (changed) render(); else { renderPeriod(); renderSides(); }
    }
    if (e.target.closest('[data-search]')) {
      searching = !searching || !!S.q;
      $('[data-q]').hidden = !searching;
      if (searching) $('[data-q]').focus();
      return;
    }
    const t = e.target.closest('[data-tab],[data-go],[data-rm],[data-exp],[data-sort],[data-clear],[data-f2],[data-f]');
    if (!t) return;
    const d = t.dataset;
    if (d.tab || d.go) { tab = d.tab || d.go; root.scrollTop = 0; }
    else if (d.rm) { const [dim, k] = filterKey(d.rm); S.f[dim].delete(k); }
    else if (d.exp) ui.exp[d.exp] = !ui.exp[d.exp];
    else if (d.sort) { const [id, c] = d.sort.split(':'), cur = ui.sort[id]; ui.sort[id] = [c, cur && cur[0] === c ? -cur[1] : -1]; }
    else if (t.matches('[data-clear]')) {
      Object.assign(S, { f: {}, q: '', from: 0, to: m.LASTM });
      $('[data-q]').value = ''; searching = false;
    } else if (d.f2) d.f2.split('|').forEach((x) => { const [dim, k] = filterKey(x); if (!m.isSel(dim, k)) m.toggle(dim, k); });
    else if (d.f) { const [dim, k] = filterKey(d.f); m.toggle(dim, k); }
    render();
  });
  root.addEventListener('change', (e) => {
    if (e.target.matches('[data-csv]')) upload(e.target.files[0]);
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
      colors = [COLORS[0][0], COLORS[1][0]];
      tab = 'resumen'; closePops();
      render();
    }).catch(failed),
  };
};
