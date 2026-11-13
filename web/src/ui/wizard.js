// Las piezas de los asistentes por pasos (Resolver y Escalar, en issues/): las flechas del pie,
// cómo entra y sale un paso, el aviso del campo que falta y el cierre por fases. Las clases y los
// tiempos van con issues.css. Los temporizadores se entregan a `track`, para que quien los usa
// pueda pararlos al cerrar.
import { prefersReducedMotion } from './dom.js';

export const BACK_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 12H5"/><path d="m12 19-7-7 7-7"/></svg>';
export const NEXT_ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>';
export const FLASH_MS = 1800;   // lo que dura el parpadeo y el aviso de un campo vacío
export const PHASE_MS = 1000;   // cada fase del cierre
export const FADE_MS = 300;     // lo que tarda en irse lo de antes

// El paso n ([data-rstep]) entra desde el lado del que viene mientras el anterior sale por el otro.
export const slideStep = (f, prev, n, reduced = prefersReducedMotion()) => {
  const sec = f.querySelector(`[data-rstep="${n}"]`), out = prev && prev !== n ? f.querySelector(`[data-rstep="${prev}"]`) : null;
  for (const p of f.querySelectorAll('[data-rstep]')) p.classList.remove('in-fwd', 'in-back', 'out-fwd', 'out-back');
  if (!out || reduced) return;
  const fwd = n > prev;
  void sec.offsetWidth;   // reiniciar la animación
  sec.classList.add(fwd ? 'in-fwd' : 'in-back');
  out.hidden = false; out.classList.add(fwd ? 'out-fwd' : 'out-back');
  out.addEventListener('animationend', () => { out.hidden = true; out.classList.remove('out-fwd', 'out-back'); }, { once: true });
};

// El campo `el` parpadea en rojo con el aviso en el centro de `box`, y todo se va solo.
export const flashEmpty = (el, box, text) => {
  box.querySelector('.rv-ed-note')?.remove();
  const note = box.ownerDocument.createElement('span');
  note.className = 'rv-ed-note'; note.textContent = text;
  box.append(note);
  el.classList.remove('blink'); void el.offsetWidth; el.classList.add('blink');   // reiniciar si se repite
  el.focus();
  setTimeout(() => { note.remove(); el.classList.remove('blink'); }, FLASH_MS);
};

// `el` se va con un difuminado y, cuando ya no está, se resuelve.
export const fadeOut = (el, track) => new Promise((done) => {
  el.classList.add('leaving');
  track(setTimeout(() => { el.hidden = true; el.classList.remove('leaving'); done(); }, FADE_MS));
});

// Las fases de un proceso en el cargador ([data-loader-title], [data-phases]), marcadas una a una
// (de momento, un simulacro). alive(): si la ventana sigue; si no, se para. → promesa al acabar.
export const runPhases = (loader, title, html, { alive, track }) => new Promise((done) => {
  loader.querySelector('[data-loader-title]').textContent = title;
  const list = loader.querySelector('[data-phases]');
  list.innerHTML = html;
  const phases = [...list.children];
  const run = (i) => {
    if (!alive()) return;
    if (i > 0) phases[i - 1].classList.replace('doing', 'done');
    if (i === phases.length) return done();
    phases[i].classList.add('doing');
    track(setTimeout(() => run(i + 1), PHASE_MS));
  };
  run(0);
});
