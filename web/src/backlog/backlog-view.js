// Vista «Backlog»: la cola del equipo, lo que nadie tiene aún, en el orden en
// que la regla lo iría repartiendo. Para quien reparte el trabajo: aquí se
// mira la cola entera (Issues solo enseña la siguiente). Arriba, el panel:
// cuánto hay de cada tipo, y las tarjetas filtran la lista al pulsarlas, varias
// a la vez, y el buscador acota por código, centro o texto (filter.js);
// filtrar no cambia el puesto de cada una. Debajo, la lista con su propio scroll. Se recarga al abrir la vista. Es una vista sobre el
// dominio de Issues (sus piezas y estilos).
import '../issues/issues.css';
import './backlog.css';
import { esc } from '../ui/html.js';
import { SEVERITY_ES, snapshotInfo, age } from '../issues/format.js';
import { sev, origin } from '../issues/parts.js';
import { EMPTY_FILTER, SEVERITIES, filterIssues, toggle, tileCounts, isFiltering } from './filter.js';

const PLURAL = { CRITICAL: 'Críticas', HIGH: 'Altas', MEDIUM: 'Medias', LOW: 'Bajas' };

// toast: avisos de la app. Las reglas de priorización se gestionarán desde aquí (botón de la cabecera).
export const mountBacklogView = (root, { api, toast }) => {
  let data = null, filter = { ...EMPTY_FILTER }, now = new Date();

  const page = (body, head = '') => `<div class="bl-page"><div class="bl-top iss-top"><h2 class="iss-title">Backlog</h2>${head}</div>${body}</div>`;

  // una tarjeta del panel: qué se mide y el número; pulsada, filtra la lista
  const tile = (label, value, { key, value: v, on, kind = '' }) =>
    `<button class="bl-tile${kind ? ` ${kind}` : ''}" data-key="${key}" data-value="${v}" aria-pressed="${on}"><span>${label}</span><b>${value}</b></button>`;

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
        <label class="bl-search"><input type="search" data-q placeholder="Buscar una issue, un centro o un texto" value="${esc(filter.q)}" aria-label="Buscar en el backlog"></label>
        <p class="bl-shown">${filtering ? `<b>${shown.length}</b> de ${c.total} · <button class="bl-clear" data-key="all">Ver todas</button>` : 'En el orden de la regla básica'}</p>
      </div>
      ${shown.length ? `<div class="bl-list">${shown.map(row).join('')}</div>` : `<p class="bl-empty">${c.total ? 'Ninguna issue cumple lo marcado.' : 'La cola está vacía: no queda nada sin coger.'}</p>`}`,
      `<span class="bl-total"><b>${c.total}</b> sin coger</span><span class="iss-snap${snap.stale ? ' stale' : ''}">${snap.text}</span><button class="bl-rules" data-rules>Reglas de priorización</button>`);
  };

  const load = async () => {
    data = await api.list();
    now = new Date();
    render();
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
  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-rules]')) return toast?.('Las reglas de priorización se crearán y ajustarán desde aquí; aún no está.');
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
