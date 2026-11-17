// El proceso en marcha, igual en toda la web: el título, el giro y, debajo,
// sus fases, que se van marcando (la hecha con ✓, la actual latiendo, las que
// faltan en gris). Lo usan Resolver (issues/resolve-form.js) y el chat mientras
// Copilot arranca (chat/conversation/view.js). Sus estilos, en loader.css
// (los carga main.js: este módulo es puro y se prueba en Node).
import { esc } from './html.js';

// phases: los textos de las fases, en orden (sin ninguna, solo el giro)
export const loaderHtml = ({ title, phases = [] }) => `<div class="ld" data-loader>
    <h4 class="ld-title" data-loader-title>${esc(title)}</h4>
    <i class="ld-spin"></i>
    <ol class="ld-phases" data-phases>${phasesHtml(phases)}</ol>
  </div>`;
export const phasesHtml = (phases) => phases.map((text, k) => `<li data-phase="${k}"><i></i>${esc(text)}</li>`).join('');

// En la lista de fases, la fase i es la actual y las anteriores quedan hechas
export const markPhase = (list, i) => {
  [...list.children].forEach((li, k) => { li.classList.toggle('done', k < i); li.classList.toggle('doing', k === i); });
};
