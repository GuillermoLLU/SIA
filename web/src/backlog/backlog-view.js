// Vista «Backlog»: la cola del equipo, lo que nadie tiene aún, en el orden
// en que la regla elegida lo iría repartiendo (la básica u otra del selector).
// Para quien reparte el trabajo: aquí se mira la cola entera, Issues solo
// enseña la siguiente. Arriba, el panel: cuánto hay de cada tipo; sus
// tarjetas filtran la lista al pulsarlas, varias a la vez, y el buscador
// acota por código, centro o texto (filter.js); filtrar no cambia el puesto.
// Debajo, la lista con su propio scroll; al pulsar una issue se abre su
// detalle a la derecha (side-panel.js), desde donde se asigna a alguien del
// equipo. Se recarga al abrir la vista y con «Actualizar backlog». Es una
// vista sobre el dominio de Issues (sus piezas y estilos).
import '../issues/issues.css';
import './backlog.css';
import { esc } from '../ui/html.js';
import { snapshotInfo, age } from '../issues/format.js';
import { sev, origin } from '../issues/parts.js';
import { EMPTY_FILTER, SEVERITIES, filterIssues, toggle, tileCounts, isFiltering } from './filter.js';
import { openRulesModal } from './rules-modal.js';
import { sidePanel } from './side-panel.js';
import { pickClick } from '../ui/picker.js';

const PLURAL = { CRITICAL: 'Críticas', HIGH: 'Altas', MEDIUM: 'Medias', LOW: 'Bajas' };

// dialogs y toast: los de la app. «Reglas de priorización» abre el modal (rules-modal.js).
export const mountBacklogView = (root, { api, dialogs, toast }) => {
  let data = null, filter = { ...EMPTY_FILTER }, now = new Date(), loading = false, rule = 'basic';
  // el panel lateral: la issue abierta, su detalle, el equipo y qué está en marcha
  let opened = null, detail = null, people = [], side = { busy: false, error: null };

  const page = (body) => `<div class="bl-page"><h2 class="iss-title">Backlog</h2>${body}</div>`;

  // una tarjeta del panel: qué se mide y el número; pulsada, filtra la lista
  const tile = (label, value, { key, value: v, on, kind = '' }) =>
    `<button class="bl-tile${kind ? ` ${kind}` : ''}" data-key="${key}" data-value="${v}" aria-pressed="${on}"><span>${label}</span><b>${value}</b></button>`;

  const row = (i) => `<button class="bl-row${i.id === opened ? ' on' : ''}" data-id="${esc(i.id)}">
      <span class="bl-rank">${i.rank}</span>
      <span class="iss-line">${sev(i.priority)}<span class="iss-code">${esc(i.center || '—')}</span>${origin(i)}${i.prio ? '<span class="iss-prio">Priorizada por negocio</span>' : ''}<span class="iss-when">hace ${age(i.reported, now)}</span></span>
      <span class="iss-text">${esc(i.text)}</span>
    </button>`;

  const sideHtml = () => (detail ? sidePanel({ detail, people, busy: side.busy, error: side.error, now }) : '<p class="bl-empty">Cargando…</p>');

  const render = () => {
    if (!data.taken) {
      root.innerHTML = page('<p class="bl-empty"><b>Aún no hay foto de Remedy</b>Se carga desde Issues con el CSV de la consulta; el Backlog sale de ahí.</p>');
      return;
    }
    const snap = snapshotInfo(data.taken, now);
    const c = tileCounts(data.issues, filter);
    const shown = filterIssues(data.issues, filter);
    const filtering = isFiltering(filter);
    root.innerHTML = page(`
      <div class="bl-panel">
        ${tile('SISU', c.sisu, { key: 'origin', value: 'sisu', on: filter.origin.includes('sisu'), kind: 'sisu' })}
        ${tile('SGA', c.sga, { key: 'origin', value: 'sga', on: filter.origin.includes('sga'), kind: 'sga' })}
        ${tile('Priorizadas', c.prio, { key: 'prio', value: '', on: filter.prio, kind: 'prio' })}
        ${SEVERITIES.map((s) => tile(PLURAL[s], c.severity[s], { key: 'severity', value: s, on: filter.severity.includes(s), kind: s })).join('')}
      </div>
      <div class="bl-bar">
        <button class="bl-btn" data-reload${loading ? ' disabled' : ''}>${loading ? 'Actualizando…' : 'Actualizar backlog'}</button>
        <span class="iss-snap${snap.stale ? ' stale' : ''}">${snap.text}</span>
        ${filtering ? `<p class="bl-shown"><b>${shown.length}</b> de ${c.total} · <button class="bl-clear" data-key="all">Ver todas</button></p>` : ''}
        <label class="bl-order">Orden <select data-rule>${data.rules.map((r) => `<option value="${esc(r.id)}"${r.id === data.rule ? ' selected' : ''}>${esc(r.label)}</option>`).join('')}</select></label>
        <label class="bl-search"><input type="search" data-q placeholder="Buscar una issue, un centro o un texto" value="${esc(filter.q)}" aria-label="Buscar en el backlog"></label>
        <button class="bl-btn" data-rules>Reglas de priorización</button>
      </div>
      <div class="bl-main">
        ${shown.length ? `<div class="bl-list">${shown.map(row).join('')}</div>` : `<p class="bl-empty">${c.total ? 'Ninguna issue cumple lo marcado.' : 'La cola está vacía: no queda nada sin coger.'}</p>`}
        ${opened ? `<aside class="bl-side" data-side aria-label="Detalle de la issue">${sideHtml()}</aside>` : ''}
      </div>`);
  };

  const load = async () => {
    loading = true;
    if (data) render(); // el botón de actualizar, ocupado
    try { data = await api.list(rule); rule = data.rule; now = new Date(); } // la regla pedida puede ya no existir: la que el bridge aplicó
    finally { loading = false; if (data) render(); }
  };

  // el buscador repinta la lista sin perder el foco ni el cursor
  root.addEventListener('input', (e) => {
    if (!e.target.matches('[data-q]')) return;
    filter = { ...filter, q: e.target.value };
    const pos = e.target.selectionStart;
    render();
    const q = root.querySelector('[data-q]');
    q.focus();
    q.setSelectionRange(pos, pos);
  });
  root.addEventListener('change', (e) => {
    if (!e.target.matches('[data-rule]')) return;
    rule = e.target.value;
    load().catch((err) => toast?.(`No se pudo ordenar el backlog: ${err.message}`));
  });
  const paintSide = () => { const el = root.querySelector('[data-side]'); if (el) el.innerHTML = sideHtml(); };
  const closeSide = () => { opened = null; detail = null; side = { busy: false, error: null }; render(); };
  const openIssue = async (id) => {
    opened = id; detail = null; side = { busy: false, error: null };
    render();
    try {
      const [got, team] = await Promise.all([api.get(id), people.length ? people : api.people()]);
      people = team;
      if (opened !== id) return; // mientras llegaba, se abrió otra
      detail = got;
      paintSide();
    } catch (err) {
      if (opened !== id) return;
      toast?.(`No se pudo abrir la issue: ${err.message}`);
      closeSide();
    }
  };
  // una acción del panel: ocupado mientras va; después, done() y la lista al día
  const act = async (go, done) => {
    side = { busy: true, error: null }; paintSide();
    try { await go(); side = { busy: false, error: null }; done?.(); await load(); }
    catch (err) { side = { busy: false, error: err.message }; paintSide(); }
  };
  root.addEventListener('submit', (e) => {
    if (!e.target.matches('[data-assign-form]')) return;
    e.preventDefault();
    const to = e.target.elements.to.value;
    if (!to) { side = { ...side, error: 'Elige a quién asignarla.' }; return paintSide(); }
    const name = people.find((u) => u.id === to)?.name || 'esa persona';
    act(() => api.assign(opened, to), () => { toast?.(`Asignada a ${name}: ya está en su mesa.`); closeSide(); });
  });

  root.addEventListener('click', (e) => {
    if (pickClick(root, e.target)) return;
    const rowEl = e.target.closest('.bl-row');
    if (rowEl) return rowEl.dataset.id === opened ? closeSide() : openIssue(rowEl.dataset.id);
    if (e.target.closest('[data-side-close]')) return closeSide();
    if (e.target.closest('[data-prioritize]')) return toast?.('Pendiente: priorizar es poner la etiqueta PRIO en Remedy, y SIA aún no puede escribirla. De momento, en Remedy.');
    if (e.target.closest('[data-rules]')) return openRulesModal({ api, dialogs, toast, onChange: () => load().catch(() => {}) }).catch((err) => toast?.(`No se pudieron cargar las reglas: ${err.message}`));
    if (e.target.closest('[data-reload]')) return load().catch((err) => toast?.(`No se pudo actualizar el backlog: ${err.message}`));
    const b = e.target.closest('[data-key]');
    if (!b) return;
    const { key, value } = b.dataset;
    filter = key === 'all' ? { ...EMPTY_FILTER } : toggle(filter, key, value);
    render();
  });

  return {
    show: () => load().catch((err) => { root.innerHTML = page(`<p class="bl-empty">No se pudo cargar el backlog: ${esc(err.message)}</p>`); }),
  };
};
