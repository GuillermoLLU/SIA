// Traspasar una issue (dominio y su ventana, sin E/S; el cableado, issues-view.js).
// Una sola ventana con dos opciones arriba que cambian el formulario en el sitio:
//  · a un compañero de Issues que conozca su origen: se queda en SIA (la base la
//    mueve y Seguimiento lo pinta como un movimiento);
//  · a otro equipo (de momento, equipos de prueba: transfer-mock.js): queda como
//    nota interna en Seguimiento; aún no llega a Remedy, irá por SIGLO.
// El motivo es el mismo campo en las dos y se conserva al cambiar de opción.
import { esc, svg } from '../ui/html.js';
import { pickerHtml, peoplePicker } from '../ui/picker.js';

const PERSON = svg('<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>', { hidden: true });
const TEAM = svg('<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>', { hidden: true });
const MODES = {
  person: { label: 'A un compañero', icon: PERSON },
  team: { label: 'A otro equipo', icon: TEAM },
};
const modeOf = (m) => (m === 'team' ? 'team' : 'person');

// Los equipos en el selector, agrupados en el orden en que vienen
const teamGroups = (teams) => [...new Set(teams.map((t) => t.group))]
  .map((g) => ({ label: g, options: teams.filter((t) => t.group === g).map((t) => ({ value: t.id, label: t.name })) }));

// La ventana. people: los compañeros que conocen su origen; empty: lo que dice el
// selector sin nadie; teams: los equipos; mode: la opción con la que se abre.
// act, title, ok y modes: para usarla también al reasignar (reassignForm), con una sola opción y sin
// las de arriba.
export const transferForm = (issueId, { people = [], empty = '', teams = [], mode = 'person', act = 'transfer', title = 'Traspasar la issue', ok = 'Traspasar', modes = Object.keys(MODES) } = {}) => {
  const on = modeOf(mode);
  const pane = (m, html) => (modes.includes(m) ? `<div class="iss-field" data-transfer-pane="${m}"${m === on ? '' : ' hidden'}>${html}</div>` : '');
  return `<form class="iss-act-form" data-act-form="${act}" novalidate>
    <header><h3>${title}</h3><span>${esc(issueId)}</span></header>
    <input type="hidden" name="mode" value="${on}">
    ${modes.length > 1 ? `<div class="tr-seg" role="group" aria-label="A quién se traspasa">${modes.map((m) => `<button type="button" data-transfer-mode="${m}" aria-pressed="${m === on}"><i>${MODES[m].icon}</i>${MODES[m].label}</button>`).join('')}</div>` : ''}
    ${pane('person', `<span>Compañero</span>${peoplePicker({ id: 'iss-f-to', name: 'to', people, empty: empty || 'No hay más personas en Issues' })}`)}
    ${pane('team', `<span>Equipo</span>${pickerHtml({ id: 'iss-f-team', name: 'team', placeholder: 'Elige el equipo', groups: teamGroups(teams) })}`)}
    <label class="iss-field" for="iss-f-comment"><span>Motivo</span><textarea id="iss-f-comment" name="comment" rows="5"></textarea></label>
    <p class="iss-act-err" hidden></p>
    <footer><button type="button" class="lab-btn" data-act-cancel>Cancelar</button><button type="submit" class="lab-btn primary" disabled>${ok}</button></footer>
  </form>`;
};

// Reasignar el escalado de otro compañero, desde el seguimiento del equipo (#136): la ventana de
// Traspasar, solo a un compañero. De momento, de prueba: no se mueve (issues-view.js).
export const reassignForm = (issueId, { people = [], empty = '' } = {}) => transferForm(issueId, { people, empty, act: 'reassign', title: 'Reasignar a un compañero', ok: 'Reasignar', modes: ['person'] });

// Lo escrito → los valores según la opción, o lo primero que falta:
//   { values: { mode: 'person', to, comment } }
//   { values: { mode: 'team', team, teamName, comment } }
//   { missing: 'Compañero' | 'Equipo' | 'Motivo' }
export const readTransfer = (raw, teams = []) => {
  const mode = modeOf(raw.mode);
  const comment = String(raw.comment ?? '').trim();
  if (mode === 'person') {
    const to = String(raw.to ?? '').trim();
    if (!to) return { missing: 'Compañero' };
    if (!comment) return { missing: 'Motivo' };
    return { values: { mode, to, comment } };
  }
  const team = teams.find((t) => t.id === raw.team);
  if (!team) return { missing: 'Equipo' };
  if (!comment) return { missing: 'Motivo' };
  return { values: { mode, team: team.id, teamName: team.name, comment } };
};

// El traspaso a otro equipo, como nota en Seguimiento hasta que llegue a Remedy
export const transferNote = ({ teamName, comment }) => `Traspasada a ${teamName}: ${comment}`;
