// Vista «Panel de trabajo» (esqueleto): cómo va el trabajo de cada persona
// del equipo. Las métricas concretas están por definir.
import { panelHead, emptyBlock, statCard } from '../panels/panel.js';
import { WORK_ICON } from '../users/views.js';

const TEAM = ['Issues abiertas', 'Resueltas esta semana', 'Tiempo medio de resolución', 'Dentro de SLA'];
const COLUMNS = ['Persona', 'Abiertas', 'Resueltas', 'Tiempo medio', 'Chats con IA', 'Conocimiento aportado'];

export const mountWorkView = (root) => {
  root.innerHTML = `${panelHead({ title: 'Panel de trabajo', lead: 'Cómo va el trabajo del equipo y de cada persona.' })}
    <div class="pn-section"><h3>Equipo</h3><div class="pn-stats">${TEAM.map(statCard).join('')}</div></div>
    <div class="pn-section"><h3>Por persona</h3>
      <div class="pn-table">
        <div class="pn-row" style="grid-template-columns: 1.6fr repeat(5, 1fr)">${COLUMNS.map((c) => `<span>${c}</span>`).join('')}</div>
        ${emptyBlock({ icon: WORK_ICON, title: 'Métricas por definir', text: 'Cuando decidamos qué medir de cada persona, saldrá aquí una fila por cada una.' })}
      </div>
    </div>`;
};
