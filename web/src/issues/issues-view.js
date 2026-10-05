// Vista «Issues» (esqueleto): el gestor de incidencias de soporte. Aquí irán
// la lista con sus filtros, el detalle de cada una y su resolución con IA.
import { panelHead, emptyBlock } from '../panels/panel.js';
import { ISSUES_ICON } from '../users/views.js';

const STATES = ['Todas', 'Abiertas', 'En curso', 'Esperando', 'Resueltas'];
const COLUMNS = ['#', 'Título', 'Estado', 'Prioridad', 'Asignada a', 'Actualizada'];

export const mountIssuesView = (root) => {
  root.innerHTML = `${panelHead({ title: 'Issues', lead: 'El gestor de incidencias de soporte: entran, se reparten, se resuelven (con ayuda de la IA) y se cierran.' })}
    <div class="pn-tools">
      <input class="settings-input" placeholder="Buscar issue" aria-label="Buscar issue" disabled />
      ${STATES.map((s, i) => `<button class="pp-chip${i ? '' : ' on'}" disabled>${s}</button>`).join('')}
      <button class="lab-btn primary" disabled title="Próximamente">+ Nueva issue</button>
    </div>
    <div class="pn-section">
      <div class="pn-table">
        <div class="pn-row" style="grid-template-columns: 60px 1fr 110px 100px 150px 110px">${COLUMNS.map((c) => `<span>${c}</span>`).join('')}</div>
        ${emptyBlock({ icon: ISSUES_ICON, title: 'Aún no hay issues', text: 'Aquí aparecerán las incidencias de soporte en cuanto definamos de dónde llegan y su flujo.' })}
      </div>
    </div>`;
};
