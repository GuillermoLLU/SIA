// Vista «Backlog»: la cola del equipo, lo que nadie tiene aún, en el orden en
// que la regla lo iría repartiendo. Para quien reparte el trabajo: aquí se
// mira la cola entera (Issues solo enseña la siguiente). Se filtra por texto,
// origen y criticidad; filtrar no cambia el puesto de cada una. Arriba, el
// panel: cuánto hay y de qué tipo; debajo, la lista con su propio scroll. Se
// recarga al abrir la vista. Es una vista sobre el dominio de Issues (sus piezas y estilos).
import '../issues/issues.css';
import './backlog.css';
import { esc } from '../ui/html.js';
import { SEVERITY_ES, snapshotInfo, age } from '../issues/format.js';
import { sev, origin } from '../issues/parts.js';
import { EMPTY_FILTER, filterIssues, summary } from './filter.js';

export const mountBacklogView = (root, { api }) => {
  let data = null, filter = { ...EMPTY_FILTER }, now = new Date();

  const page = (body, snap = '') => `<div class="bl-page"><div class="bl-top iss-top"><h2 class="iss-title">Backlog</h2>${snap}</div>${body}</div>`;

  // una tarjeta del panel: qué se mide, el número y un detalle
  const tile = (label, value, hint, kind = '') => `<div class="bl-tile${kind ? ` ${kind}` : ''}"><span>${label}</span><b>${value}</b><small>${hint}</small></div>`;
  const byOrigin = (c) => (c.total ? `${c.urgent} críticas o altas · ${c.prio} priorizadas` : 'ninguna sin coger');

  const row = (i) => `<div class="bl-row" data-id="${esc(i.id)}">
      <span class="bl-rank">${i.rank}</span>
      <span class="iss-line">${sev(i.priority)}<span class="iss-code">${esc(i.center || '—')}</span>${origin(i)}${i.prio ? '<span class="iss-prio">Priorizada por negocio</span>' : ''}<span class="iss-when">hace ${age(i.reported, now)}</span></span>
      <span class="iss-text">${esc(i.text)}</span>
    </div>`;

  const render = () => {
    if (!data.taken) {
      root.innerHTML = page('<p class="bl-empty"><b>Aún no hay foto de Remedy</b>Se carga desde Issues con el CSV de la consulta; el Backlog sale de ahí.</p>');
      return;
    }
    const snap = snapshotInfo(data.taken, now);
    const s = summary(data.issues);
    const shown = filterIssues(data.issues, filter);
    const option = (value, label, current) => `<option value="${value}"${value === current ? ' selected' : ''}>${label}</option>`;
    root.innerHTML = page(`
      <div class="bl-panel">
        ${tile('Sin coger', s.total, Object.entries(s.bySeverity).filter(([, n]) => n).map(([k, n]) => `${n} ${SEVERITY_ES[k].toLowerCase()}${n === 1 ? '' : 's'}`).join(' · ') || 'la cola está vacía')}
        ${tile('SISU', s.sisu.total, byOrigin(s.sisu), 'sisu')}
        ${tile('SGA', s.sga.total, byOrigin(s.sga), 'sga')}
        ${tile('Críticas o altas', s.urgent, s.total ? `${Math.round(s.urgent / s.total * 100)} % de la cola` : 'nada en la cola', s.urgent ? 'urgent' : '')}
        ${tile('Priorizadas por negocio', s.prio, s.prio ? 'van las primeras de la cola' : 'ninguna marcada')}
        ${tile('La más antigua', s.oldest ? age(s.oldest.reported, now) : '—', s.oldest ? `${esc(s.oldest.id)} · centro ${esc(s.oldest.center || '—')}` : 'nada en la cola')}
      </div>
      <div class="bl-filters">
        <input type="search" data-q placeholder="Buscar por código, centro o texto" value="${esc(filter.q)}" aria-label="Buscar">
        <select data-origin aria-label="Origen">${option('all', 'SISU y SGA', filter.origin)}${option('sisu', 'Solo SISU', filter.origin)}${option('sga', 'Solo SGA', filter.origin)}</select>
        <select data-severity aria-label="Criticidad">${option('all', 'Toda criticidad', filter.severity)}${Object.entries(SEVERITY_ES).map(([k, v]) => option(k, v, filter.severity)).join('')}</select>
        ${shown.length !== s.total ? `<span class="bl-shown">${shown.length} de ${s.total}</span>` : ''}
      </div>
      ${shown.length ? `<div class="bl-list">${shown.map(row).join('')}</div>` : `<p class="bl-empty">${s.total ? 'Ninguna issue cumple el filtro.' : 'La cola está vacía: no queda nada sin coger.'}</p>`}`,
      `<span class="iss-snap${snap.stale ? ' stale' : ''}">${snap.text}</span>`);
  };

  const load = async () => {
    data = await api.list();
    now = new Date();
    render();
  };

  // los filtros repintan la lista sin perder el foco del buscador
  root.addEventListener('input', (e) => {
    if (e.target.matches('[data-q]')) { filter.q = e.target.value; const pos = e.target.selectionStart; render(); const q = root.querySelector('[data-q]'); q.focus(); q.setSelectionRange(pos, pos); }
  });
  root.addEventListener('change', (e) => {
    if (e.target.matches('[data-origin]')) { filter.origin = e.target.value; render(); }
    if (e.target.matches('[data-severity]')) { filter.severity = e.target.value; render(); }
  });

  return {
    show: () => load().catch((err) => { root.innerHTML = page(`<p class="bl-empty">No se pudo cargar el backlog: ${esc(err.message)}</p>`); }),
  };
};
