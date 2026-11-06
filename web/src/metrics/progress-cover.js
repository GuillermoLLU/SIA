// La capa con el avance de una tarea de Métricas (progress.js pone las cifras): se pinta encima de la vista, que se
// queda como está. La capa se pinta una vez y luego solo cambian sus cifras, para que la barra avance suave.
// El reloj (now) y el cancelar llegan por parámetro; la vista decide qué hace cada uno.
import { PHASES, progressOf, progressHtml } from './progress.js';

export const progressCover = (t0, phases = PHASES, onCancel = () => {}, now = () => Date.now()) => {
  const el = document.createElement('div');
  el.className = 'mt-loading';
  el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-cancel]');
    if (!b) return;
    b.disabled = true;
    b.textContent = 'Cancelando…';
    onCancel();
  });
  const paint = (view) => {
    if (!el.firstElementChild) {
      el.innerHTML = progressHtml(view, phases);
      el.querySelector('.mt-load-card').insertAdjacentHTML('beforeend', '<button class="mt-btn mt-load-cancel" data-cancel>Cancelar</button>');
    }
    el.querySelector('[role=progressbar]').setAttribute('aria-valuenow', view.percent);
    el.querySelector('.mt-load-figure b').textContent = view.percent;
    el.querySelector('.mt-load-bar i').style.width = `${view.percent}%`;
    el.querySelector('.mt-load-now b').textContent = phases[view.phase].label;
    el.querySelector('.mt-load-now span').textContent = view.left;
    el.querySelector('.mt-load-detail').textContent = view.detail;
    // ya no se puede cancelar: se recalcula, o se está borrando
    el.querySelector('[data-cancel]').hidden = ['compute', 'clear'].includes(phases[view.phase].id);
    el.querySelectorAll('.mt-load-steps li').forEach((li, i) => { li.className = i < view.phase ? 'mt-done' : i === view.phase ? 'mt-now' : ''; });
  };
  // el último avance del bridge, cuándo empezó su fase (para su ritmo) y lo más alto que ha llegado la barra (nunca retrocede)
  let last = null, phaseT0 = t0, top = 0;
  return {
    el,
    set: (p) => {
      if ((p?.phase ?? null) !== (last?.phase ?? null)) phaseT0 = now();
      last = p ?? last;
    },
    tick: () => {
      const t = now(), view = progressOf(last, { elapsed: t - t0, phaseMs: t - phaseT0 }, phases);
      top = Math.max(top, view.percent);
      paint({ ...view, percent: top });
    },
    finish: (text = 'Abriendo las métricas con los datos nuevos…') => paint({ phase: phases.length - 1, percent: 100, detail: text, left: 'Hecho' }),
  };
};
