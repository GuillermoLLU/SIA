// Vista «Métricas del servicio» (vista service): solo para quien coordina el servicio. Con los datos de las Métricas,
// que se cargan desde allí; se vuelven a leer al abrir la vista, por si se han actualizado. Tiene su propio periodo
// (period.js), sin tocar el de Métricas. Es una vista sobre el dominio de las Métricas: su modelo y sus piezas de
// pantalla; lo suyo, en service.js, panel.js y service.css.
import '../metrics/metrics.css';
import './service.css';
import { esc } from '../ui/html.js';
import { createModel } from '../metrics/model.js';
import { createCharts } from '../metrics/charts.js';
import { createCommon } from '../metrics/tabs/common.js';
import { dmy } from '../metrics/format.js';
import { attachTip } from '../metrics/tip.js';
import { coverage } from '../metrics/view.js';
import { servicePanel } from './panel.js';
import { SHORTCUTS, DEFAULT_SHORTCUT, shortcutRange, rangeError, toMinutes, parseDay, isoOf, todayOf } from './period.js';

const TITLE = 'Métricas del servicio';
const page = (body) => `<div class="mt-page"><header class="mt-top"><h2 class="mt-title">${TITLE}</h2>${body}</div>`;

export const mountServiceView = (root, { api, now = () => new Date() }) => {
  let m = null, panel = null, generated = null;
  const ui = { exp: {}, sort: {}, svc: { prev: false, ts: false } };
  const today = () => todayOf(now());
  // lo que se mira: un atajo o un rango a mano, y lo que hay escrito en las fechas sin aplicar
  let shortcut = DEFAULT_SHORTCUT, range = shortcutRange(shortcut, today());
  const $ = (s) => root.querySelector(s);

  const renderFrame = () => {
    root.innerHTML = `${page(`<span class="mt-date" data-coverage></span></header>
      <div class="sv-period">
        <div class="mt-seg mt-seg-sm" role="group" aria-label="Periodo">${SHORTCUTS.map(([k, l]) => `<button class="mt-seg-b" data-short="${k}">${esc(l)}</button>`).join('')}</div>
        <form class="sv-range" data-range novalidate>
          <label>Desde <input type="date" name="from"></label>
          <label>Hasta <input type="date" name="to"></label>
          <button class="mt-btn" type="submit">Aplicar</button>
          <span class="sv-range-err" data-err hidden></span>
        </form>
        <span class="sv-now" data-now></span>
      </div>
      <div class="sv-main" data-main></div>`)}<div class="mt-tip" data-tip-box hidden></div>`;
  };

  // Las fechas elegibles: hasta ayer, y la de fin no antes de la de inicio (ni la de inicio después de la de fin).
  const limitDates = () => {
    const form = $('[data-range]'), last = isoOf(today() - 864e5), { from, to } = form.elements;
    from.max = to.value && to.value < last ? to.value : last;
    to.max = last;
    to.min = from.value;
  };

  const render = () => {
    $('[data-coverage]').textContent = coverage(m);
    root.querySelectorAll('[data-short]').forEach((b) => {
      const on = b.dataset.short === shortcut;
      b.classList.toggle('mt-on', on);
      b.setAttribute('aria-pressed', String(on));
    });
    const { from, to } = $('[data-range]').elements;
    from.value = isoOf(range.from);
    to.value = isoOf(range.to);
    limitDates();
    $('[data-err]').hidden = true;
    const days = Math.round((range.to - range.from) / 864e5) + 1;
    $('[data-now]').textContent = `${dmy(range.from)} – ${dmy(range.to)} · ${days} ${days === 1 ? 'día' : 'días'}`;
    $('[data-main]').innerHTML = panel(toMinutes(range, m.BASE));
  };

  root.addEventListener('click', (e) => {
    if (!m) return;
    const short = e.target.closest('[data-short]');
    if (short) { shortcut = short.dataset.short; range = shortcutRange(shortcut, today()); return render(); }
    const svc = e.target.closest('[data-svc]');
    if (svc) { ui.svc[svc.dataset.svc] = !ui.svc[svc.dataset.svc]; render(); }
  });
  root.addEventListener('input', (e) => { if (e.target.closest('[data-range]')) limitDates(); });
  root.addEventListener('submit', (e) => {
    e.preventDefault();
    const { from, to } = $('[data-range]').elements, error = rangeError(from.value, to.value, today());
    const box = $('[data-err]');
    box.textContent = error;
    box.hidden = !error;
    if (error) return;
    shortcut = null;
    range = { from: parseDay(from.value), to: parseDay(to.value) };
    render();
  });
  attachTip(root, () => m.NAMES());

  return {
    show: async () => {
      try {
        const data = await api.load();
        if (!data) { m = null; root.innerHTML = page(`</header><div class="mt-empty"><b>Aún no hay datos</b><span>Se traen de Snowflake desde Métricas, con «Actualizar y generar informe».</span></div>`); return; }
        if (data.meta.generated !== generated) {
          generated = data.meta.generated;
          m = createModel(data);
          m.refilter();
          panel = servicePanel(createCommon(m, createCharts(m, ui), ui));
          renderFrame();
        }
        // el periodo de un atajo acaba siempre ayer, aunque la vista lleve abierta desde otro día
        if (shortcut) range = shortcutRange(shortcut, today());
        render();
      } catch (e) {
        root.innerHTML = page(`</header><p class="mt-empty">No se pudo cargar el panel: ${esc(e.message)}</p>`);
      }
    },
  };
};
