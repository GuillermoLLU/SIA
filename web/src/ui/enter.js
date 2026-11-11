// La entrada en cascada de una vista (.view-enter, style.css): sus bloques suben un poco y aparecen
// escalonados, como una issue al abrirla. Si la vista se repinta mientras entra (llegan datos
// frescos), la cascada se corta y lo nuevo sale ya quieto: repetirla desde cero es lo que parpadea.
//   ms: lo que dura · reduced(): sin cascada si el sistema pide menos movimiento
import { prefersReducedMotion } from './dom.js';

const CLS = 'view-enter';
const running = new WeakMap();   // el → stop() de la entrada en curso

export const playEnter = (el, { ms = 1000, reduced = prefersReducedMotion, Observer = globalThis.MutationObserver, timers = globalThis } = {}) => {
  if (reduced()) return;
  running.get(el)?.();   // la anterior, si no había acabado
  el.classList.remove(CLS);
  void el.offsetWidth;   // reiniciar la cascada si se vuelve a la misma
  el.classList.add(CLS);
  const stop = () => { el.classList.remove(CLS); watch.disconnect(); timers.clearTimeout(timer); running.delete(el); };
  const watch = new Observer(stop);
  watch.observe(el, { childList: true });
  const timer = timers.setTimeout(stop, ms);
  running.set(el, stop);
};
