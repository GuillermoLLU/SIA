// Vista «Panel de trabajo»: un control rápido de la calidad del equipo y de
// cada persona (team.js). Con los datos de las Métricas, que se cargan desde
// allí; se vuelven a leer al abrir la vista, por si alguien ha cargado otro
// CSV. De partida, el equipo de Indra; «Comparar con T-Systems» añade el suyo
// y la diferencia. Clic en una persona: se abre en Métricas frente al resto de
// su equipo (openPerson).
import '../metrics/metrics.css';
import './work.css';
import { esc } from '../ui/html.js';
import { MONTHS } from '../metrics/format.js';
import { createModel } from '../metrics/model.js';
import { createCharts } from '../metrics/charts.js';
import { periodLabel, calendarHtml } from '../metrics/period.js';
import { attachTip } from '../metrics/tip.js';
import { teamPanel } from './team.js';

const CALENDAR_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>';

export const mountWorkView = (root, { api, openPerson }) => {
  let m = null, ch = null, generated = null, compare = false, calendar = false, anchor = null;
  const ui = { exp: {}, sort: {} };
  const $ = (s) => root.querySelector(s);

  const page = (body) => `<div class="mt-page"><header class="mt-top"><h2 class="mt-title">Panel de trabajo</h2>${body}</header>`;

  const renderFrame = () => {
    const snap = new Date(m.BASE + m.SNAP * 6e4);
    root.innerHTML = `${page(`<span class="mt-date">datos hasta el ${snap.getUTCDate()} de ${MONTHS[snap.getUTCMonth()]} de ${snap.getUTCFullYear()}</span>`)}
      <div class="mt-fbar">
        <div class="mt-period"><button class="mt-btn mt-icon-btn" data-calendar aria-haspopup="true">${CALENDAR_ICON}<span data-period></span></button><div class="mt-pop mt-cal" data-cal hidden></div></div>
        <label class="wk-switch"><input type="checkbox" data-compare> Comparar con T-Systems</label>
      </div>
      <div class="wk-main" data-main></div>
    </div><div class="mt-tip" data-tip-box hidden></div>`;
  };

  const render = () => {
    const { S, LASTM } = m, year = m.data.meta.year;
    S.sides = [{ company: 0 }, compare ? { company: 1 } : null];
    m.refilter();
    $('[data-period]').textContent = periodLabel(S, LASTM, year);
    const cal = $('[data-cal]');
    cal.hidden = !calendar;
    if (calendar) cal.innerHTML = calendarHtml(S, LASTM, year, anchor);
    $('[data-compare]').checked = compare;
    $('[data-main]').innerHTML = teamPanel(m, ch, ui);
  };

  // Calendario: con un solo mes marcado, al salir se ve ese mes.
  const closeCalendar = () => {
    if (anchor != null) { m.S.from = m.S.to = anchor; }
    calendar = false; anchor = null;
  };

  root.addEventListener('click', (e) => {
    if (!m) return;
    const { S } = m;
    if (e.target.closest('[data-calendar]')) { if (calendar) closeCalendar(); else calendar = true; return render(); }
    const month = e.target.closest('[data-month]');
    if (month) {
      const k = Number(month.dataset.month);
      if (anchor == null) { anchor = k; return render(); }
      [S.from, S.to] = [Math.min(anchor, k), Math.max(anchor, k)];
      calendar = false; anchor = null;
      return render();
    }
    if (e.target.closest('[data-month-all]')) { S.from = 0; S.to = m.LASTM; calendar = false; anchor = null; return render(); }
    if (calendar && !e.target.closest('.mt-pop')) { closeCalendar(); render(); }
    const sort = e.target.closest('[data-sort]');
    if (sort) {
      const [id, c] = sort.dataset.sort.split(':'), cur = ui.sort[id];
      ui.sort[id] = [c, cur && cur[0] === c ? -cur[1] : -1];
      return render();
    }
    const person = e.target.closest('[data-person]');
    if (person) openPerson?.(Number(person.dataset.person));
  });
  root.addEventListener('change', (e) => {
    if (m && e.target.matches('[data-compare]')) { compare = e.target.checked; render(); }
  });
  document.addEventListener('keydown', (e) => {
    if (m && !root.hidden && e.key === 'Escape' && calendar) { calendar = false; anchor = null; render(); }
  });
  attachTip(root, () => m.NAMES());

  // Al abrir: los datos de las Métricas; si no han cambiado, se queda como estaba.
  return {
    show: async () => {
      try {
        const data = await api.load();
        if (!data) { m = null; root.innerHTML = `${page('')}<div class="mt-empty"><b>Aún no hay datos</b><span>Se cargan desde Métricas, con el CSV completo de la consulta de issues.</span></div></div>`; return; }
        if (data.meta.generated !== generated) {
          generated = data.meta.generated;
          m = createModel(data);
          ch = createCharts(m, ui);
          renderFrame();
        }
        render();
      } catch (e) {
        root.innerHTML = `${page('')}<p class="mt-empty">No se pudo cargar el panel: ${esc(e.message)}</p></div>`;
      }
    },
  };
};
