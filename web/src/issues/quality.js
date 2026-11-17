// Cuánto cuenta un texto que escribe el técnico (Resolver, Escalar), sin DOM: se llena con lo
// escrito hasta lo que suele ocupar uno completo (`full` caracteres: la nota interna, 400; cada
// pregunta al centro, 250). Las fichas de imagen no cuentan.
import { TAG } from './tag-editor.js';

export const FULL = { note: 400, what: 250, how: 250, prevent: 250, comment: 250 };
export const noteQuality = (text, full = FULL.note) => {
  const len = String(text ?? '').replace(TAG, '').trim().length;
  const pct = Math.min(100, Math.round(len / full * 100));
  const [low, mid] = [full * 0.15, full * 0.45];
  // level: cómo se pinta (low en rojo, mid en naranja, good en amarillo, ok en verde)
  return { pct, label: !len ? 'Sin escribir' : len < low ? 'Muy corta' : len < mid ? 'Corta' : len < full ? 'Bien' : 'Completa', level: len < low ? 'low' : len < mid ? 'mid' : len < full ? 'good' : 'ok' };
};
