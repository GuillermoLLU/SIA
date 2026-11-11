// Un cruce real entre dos estados de la pantalla: el anterior se disuelve mientras aparece el
// nuevo, sin fotogramas vacíos. Sin soporte, o si se pide menos movimiento, cambia sin más.
// change no se espera: lo que tarde en pintarse no debe congelar la pantalla.
import { prefersReducedMotion } from './dom.js';

export const crossfade = (change, { doc = document, reduced = prefersReducedMotion } = {}) => {
  if (!doc.startViewTransition || reduced()) { change(); return; }
  doc.startViewTransition(() => { change(); });
};
