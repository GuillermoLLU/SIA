// Vista «Backlog»: la cola del equipo, lo que nadie tiene aún, en el orden en
// que la regla lo iría repartiendo. Para quien reparte el trabajo: aquí se
// mira la cola entera (Issues solo enseña la siguiente). Se filtra por texto,
// origen y criticidad; filtrar no cambia el puesto de cada una. Se recarga al
// abrir la vista. Es una vista sobre el dominio de Issues (sus piezas y estilos).
import '../issues/issues.css';
import './backlog.css';
import { esc } from '../ui/html.js';
import { SEVERITY_ES, snapshotInfo, age } from '../issues/format.js';
import { sev, origin } from '../issues/parts.js';
import { EMPTY_FILTER, filterIssues, summary } from './filter.js';

export const mountBacklogView = (root, { api }) => {
  let data = null, filter = { ...EMPTY_FILTER }, now = new Date();

  const page = (body, snap = '') => `<div class="bl-page"><div class="bl-top iss-top"><h2 class="iss-title">Backlog</h2>${snap}</div>${body}</div>`;

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
      <p class="bl-sum"><span><b>${s.total}</b> sin coger</span><span><b>${s.urgent}</b> críticas o altas</span><span><b>${s.prio}</b> priorizadas por negocio</span><span><b>${s.sisu}</b> SISU · <b>${s.sga}</b> SGA</span></p>
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
