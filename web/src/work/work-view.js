// «Equipo soporte», una pestaña de Métricas: un control rápido de la calidad del equipo y de
// cada persona (team.js). Con los datos de las Métricas, que se cargan desde
// allí; se vuelven a leer al abrir la vista, por si se han actualizado desde
// Snowflake. Es el equipo de Indra. Clic en una persona: el panel se filtra a sus
// datos; otro clic, o «Quitar filtro», vuelve al equipo. Si la persona también gestiona el equipo,
// «Gestionar equipo» lleva a la gestión de personas (onManage).
// Es una vista sobre el dominio de las Métricas: su modelo, sus piezas de pantalla (charts.js, period.js, tip.js) y
// los estilos de esas piezas (metrics.css); lo suyo, en team.js y work.css.
import '../metrics/metrics.css';
import './work.css';
import { esc } from '../ui/html.js';
import { createModel } from '../metrics/model.js';
import { createCharts } from '../metrics/charts.js';
import { periodLabel, lastDays } from '../metrics/period.js';
import { mountPeriodPanel } from '../metrics/period-panel.js';
import { attachTip } from '../metrics/tip.js';
import { coverage } from '../metrics/view.js';
import { num } from '../metrics/format.js';
import { sheetCsv, sheetFile } from '../metrics/sheet.js';
import { downloadText } from '../metrics/download.js';
import { teamPanel, conclusionsPanel, teamIssues } from './team.js';
import { TEAM_SHEET_COLS } from './team-sheet.js';
import { pickDays } from './activity.js';

const CALENDAR_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';

const DEFAULT_DAYS = 15;   // el periodo con el que abre la vista

export const mountWorkView = (root, { api, onManage, toast }) => {
  let m = null, ch = null, generated = null, calendar = false, panel = null, onPage = 'team', drag = null;
  root.classList.add('wk-view');
  const ui = { exp: {}, sort: {}, charts: new Set(), range: null, actSeries: null };   // charts: los bloques con su gráfica desplegada
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
    // las conclusiones aún no dependen del periodo: sin selector
    $('.mt-period').hidden = onPage === 'conclusions';
    $('[data-main]').innerHTML = onPage === 'conclusions' ? conclusionsPanel() : teamPanel(m, ch, ui);
  };


  // La sábana, a CSV: entera y con los filtros de ahora (sheet.js).
  const exportSheet = () => {
    const list = teamIssues(m, ui), file = sheetFile(m, 'incidencias-equipo');
    if (!list.length) return;
    downloadText(file, sheetCsv(m, list, TEAM_SHEET_COLS), 'text/csv;charset=utf-8');
    toast?.(`Exportadas ${num(list.length)} incidencias a ${file}.`);
  };

  const applyRange = ({ period, range }) => { ui.range = range; m.setPeriod(...period); render(); };
  // Elegir días en la actividad: mientras se arrastra solo se resalta; al soltar se aplica. Con Ctrl (o Cmd) se suma a lo elegido.
  const dayAt = (e) => document.elementFromPoint(e.clientX, e.clientY)?.closest('[data-act-day]');
  const paintDrag = () => {
    if (drag.multi) return;
    const lo = Math.min(drag.from, drag.to), hi = Math.max(drag.from, drag.to);
    for (const el of root.querySelectorAll('[data-act-day]')) { const d = Number(el.dataset.actDay); el.classList.toggle('wk-act-out', d < lo || d > hi); }
  };
  root.addEventListener('pointerdown', (e) => {
    const day = e.button === 0 && e.target.closest('[data-act-day]');
    if (!day || !m) return;
    e.preventDefault();
    drag = { from: Number(day.dataset.actDay), to: Number(day.dataset.actDay), multi: e.ctrlKey || e.metaKey };
    paintDrag();
  });
  // en el documento: se puede soltar fuera de la gráfica, y la vista se monta una sola vez (main.js)
  document.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const day = dayAt(e);
    if (day) { drag.to = Number(day.dataset.actDay); paintDrag(); }
  });
  document.addEventListener('pointerup', () => {
    if (!drag) return;
    const { from, to, multi } = drag, { S } = m;
    drag = null;
    applyRange(pickDays(ui.range, [S.d0, S.d1], from, to, multi));
  });

  root.addEventListener('click', (e) => {
    if (e.target.closest('[data-manage]')) return onManage();
    if (!m || e.target.closest('a')) return;
    if (e.target.closest('[data-export]')) return exportSheet();
    if (e.target.closest('[data-calendar]')) { calendar = !calendar; if (calendar) panel.open(); return render(); }
    if (calendar && !e.target.closest('.mt-pop')) { calendar = false; render(); }
    if (e.target.closest('[data-person-clear]')) { ui.person = null; return render(); }
    if (e.target.closest('[data-range-clear]')) return applyRange({ period: ui.range.base, range: null });
    const series = e.target.closest('[data-act-series]');
    if (series) { const k = series.dataset.actSeries; ui.actSeries = ui.actSeries === k ? null : k; return render(); }
    const more = e.target.closest('[data-exp]');
    if (more) { ui.exp[more.dataset.exp] = !ui.exp[more.dataset.exp]; return render(); }
    const toPage = e.target.closest('[data-page]');
    if (toPage) { onPage = toPage.dataset.page; return render(); }
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
    if (person) { const k = Number(person.dataset.person); ui.person = ui.person === k ? null : k; render(); }
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
        if (!data) { m = null; root.innerHTML = `${page('')}<div class="mt-empty"><b>Aún no hay datos</b><span>Se cargan desde Métricas: con «Cargar datos» la primera vez, o con un CSV de Remedy.</span></div></div>`; return; }
        if (data.meta.generated !== generated) {
          generated = data.meta.generated;
          ui.person = null;   // los índices de las personas cambian con los datos
          ui.range = null;
          m = createModel(data);
          m.setPeriod(...lastDays(m, DEFAULT_DAYS));
          ch = createCharts(m, ui);
          renderFrame();
          // el panel del periodo (period-panel.js): elegir en la rejilla lo aplica y lo cierra; una fecha, lo deja abierto
          panel = mountPeriodPanel($('[data-cal]'), { model: () => m, onPick: (close) => { if (close) calendar = false; ui.range = null; render(); } });
        }
        render();
      } catch (e) {
        root.innerHTML = `${page('')}<p class="mt-empty">No se pudo cargar el panel: ${esc(e.message)}</p></div>`;
      }
    },
  };
};
