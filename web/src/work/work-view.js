// Vista «Equipo soporte» (vista work): un control rápido de la calidad del equipo y de
// cada persona (team.js). Con los datos de las Métricas, que se cargan desde
// allí; se vuelven a leer al abrir la vista, por si se han actualizado desde
// Snowflake. Es el equipo de Indra. Clic en una persona: se abre en Métricas frente
// al resto de su equipo (openPerson). Si la persona también gestiona el equipo,
// «Gestionar equipo» lleva a la gestión de personas (onManage).
// Es una vista sobre el dominio de las Métricas: su modelo, sus piezas de pantalla (charts.js, period.js, tip.js) y
// los estilos de esas piezas (metrics.css); lo suyo, en team.js y work.css.
import '../metrics/metrics.css';
import './work.css';
import { esc } from '../ui/html.js';
import { createModel } from '../metrics/model.js';
import { createCharts } from '../metrics/charts.js';
import { periodLabel } from '../metrics/period.js';
import { mountPeriodPanel } from '../metrics/period-panel.js';
import { attachTip } from '../metrics/tip.js';
import { coverage } from '../metrics/view.js';
import { teamPanel } from './team.js';

const CALENDAR_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';

export const mountWorkView = (root, { api, openPerson, onManage }) => {
  let m = null, ch = null, generated = null, calendar = false, panel = null;
  root.classList.add('wk-view');
  const ui = { exp: {}, sort: {}, charts: new Set() };   // charts: los bloques con su gráfica desplegada
  const $ = (s) => root.querySelector(s);

  const manage = onManage ? '<button class="wk-switch-view" data-manage>Gestionar equipo</button>' : '';
  // cabecera: título, fecha de los datos y, a la derecha, el periodo (si hay datos) y «Gestionar equipo»
  const page = (body, tools = '') => `<div class="mt-page"><header class="mt-top wk-top"><h2 class="mt-title">Equipo soporte</h2>${body}<span class="wk-tools">${tools}${manage}</span></header>`;

  const renderFrame = () => {
    const period = '<div class="mt-period"><button class="mt-btn mt-icon-btn" data-calendar aria-haspopup="true">' + CALENDAR_ICON + '<span data-period></span></button><div class="mt-pop mt-cal" data-cal hidden></div></div>';
    root.innerHTML = `${page(`<span class="mt-date" data-coverage></span>`, period)}
      <div class="wk-main" data-main></div>
    </div><div class="mt-tip" data-tip-box hidden></div>`;
  };

  const render = () => {
    const { S } = m;
    S.sides = [{ company: 0 }, null];   // el equipo de Indra
    m.refilter();
    $('[data-period]').textContent = periodLabel(m);
    $('[data-coverage]').textContent = coverage(m);
    $('[data-cal]').hidden = !calendar;
    $('[data-main]').innerHTML = teamPanel(m, ch, ui);
  };


  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-manage]')) return onManage();
    if (!m) return;
    if (e.target.closest('[data-calendar]')) { calendar = !calendar; if (calendar) panel.open(); return render(); }
    if (calendar && !e.target.closest('.mt-pop')) { calendar = false; render(); }
    const chart = e.target.closest('[data-chart]');
    if (chart) {
      const id = chart.dataset.chart;
      if (ui.charts.has(id)) ui.charts.delete(id); else ui.charts.add(id);
      return render();
    }
    const sort = e.target.closest('[data-sort]');
    if (sort) {
      const [id, c] = sort.dataset.sort.split(':'), cur = ui.sort[id];
      ui.sort[id] = [c, cur && cur[0] === c ? -cur[1] : -1];
      return render();
    }
    const person = e.target.closest('[data-person]');
    if (person) openPerson?.(Number(person.dataset.person));
  });

  // Escape cierra el panel del periodo. En el documento, no en la vista: al elegir una fecha se repinta y el foco se
  // va; la vista se monta una sola vez (main.js), así que el oyente no se acumula.
  document.addEventListener('keydown', (e) => {
    if (m && !root.hidden && e.key === 'Escape' && calendar) { calendar = false; render(); }
  });
  attachTip(root, () => m.NAMES());

  // Al abrir: los datos de las Métricas; si no han cambiado, se queda como estaba.
  return {
    show: async () => {
      try {
        const data = await api.load();
        if (!data) { m = null; root.innerHTML = `${page('')}<div class="mt-empty"><b>Aún no hay datos</b><span>Se traen de Snowflake desde Métricas, con «Actualizar y generar informe».</span></div></div>`; return; }
        if (data.meta.generated !== generated) {
          generated = data.meta.generated;
          m = createModel(data);
          m.resetPeriod();   // de partida, el mes en curso
          ch = createCharts(m, ui);
          renderFrame();
          // el panel del periodo (period-panel.js): elegir en la rejilla lo aplica y lo cierra; una fecha, lo deja abierto
          panel = mountPeriodPanel($('[data-cal]'), { model: () => m, onPick: (close) => { if (close) calendar = false; render(); } });
        }
        render();
      } catch (e) {
        root.innerHTML = `${page('')}<p class="mt-empty">No se pudo cargar el panel: ${esc(e.message)}</p></div>`;
      }
    },
  };
};
