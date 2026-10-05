// Vista «Métricas» (esqueleto): OKRs del departamento, KPIs y otros
// indicadores. Objetivos, resultados clave e indicadores están por definir.
import { panelHead, emptyBlock } from '../panels/panel.js';
import { METRICS_ICON } from '../users/views.js';

export const mountMetricsView = (root) => {
  root.innerHTML = `${panelHead({ title: 'Métricas', lead: 'OKRs, KPIs y otros indicadores del departamento.' })}
    <div class="pn-section"><h3>OKRs</h3>
      <div class="pn-card">${emptyBlock({ icon: METRICS_ICON, title: 'Aún no hay objetivos', text: 'Cada objetivo tendrá sus resultados clave, con su progreso y su responsable.' })}</div>
    </div>
    <div class="pn-section"><h3>KPIs</h3>
      <div class="pn-card">${emptyBlock({ icon: METRICS_ICON, title: 'Aún no hay indicadores', text: 'Indicadores con su valor, su objetivo y su evolución en el tiempo.' })}</div>
    </div>
    <div class="pn-section"><h3>Otras métricas</h3>
      <div class="pn-card">${emptyBlock({ icon: METRICS_ICON, title: 'Por definir', text: 'Cualquier otra métrica que queramos seguir.' })}</div>
    </div>`;
};
