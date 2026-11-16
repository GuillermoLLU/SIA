// La caja de escribir (composer.js), lo que es puro: qué se envía y qué tecla
// lo envía. Dominio puro.

// lo que se manda a Copilot: el texto tal cual (puede tener varias líneas), o
// nada si está vacío
export const messageOf = (text) => {
  const t = String(text ?? '').replace(/\s+$/, '');
  return t.trim() ? t : null;
};

// Enter envía; Shift+Enter es salto de línea; mientras se compone un acento o
// un carácter (IME), Enter es del teclado, no nuestro
export const sends = ({ key, shiftKey, isComposing }) => key === 'Enter' && !shiftKey && !isComposing;

// Esc dos veces seguidas vacía la caja. Una sola no hace nada (puede ser para
// otra cosa: cerrar un menú)
export const ESC_TWICE_MS = 600;
export const escapes = ({ key, isComposing }) => key === 'Escape' && !isComposing;
// ¿este Esc (en `now`) va seguido del anterior (en `lastAt`, o null si no hubo)?
export const escTwice = (lastAt, now) => lastAt != null && now - lastAt <= ESC_TWICE_MS;

// añadir algo a lo escrito (la orden de una skill), separado por un espacio
export const appendText = (text, more) => {
  if (!more) return text;
  if (!text) return more;
  return /\s$/.test(text) ? text + more : `${text} ${more}`;
};

// Un adjunto en la caja: no su ruta (larga y fea), sino una marca corta
// («[Imagen 1]», «[Archivo 2]») que al enviar se cambia por la ruta, que es lo
// que Copilot necesita. Si se borra la marca, ese adjunto no se envía.
const IMAGE = /\.(png|jpe?g|gif|webp|bmp|svg|heic|avif)$/i;

// la marca del adjunto `path`, contando los que ya hay de su clase
export const attachMark = (path, files) => {
  const kind = IMAGE.test(path) ? 'Imagen' : 'Archivo';
  const n = files.filter((f) => f.mark.startsWith(`[${kind} `)).length + 1;
  return `[${kind} ${n}]`;
};

// meter `piece` donde está el cursor (start–end), con un espacio a cada lado
// si hace falta → { text, at } (at: dónde queda el cursor)
export const insertAt = (text, start, end, piece) => {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const lead = before && !/\s$/.test(before) ? ' ' : '';
  const tail = after && /^\s/.test(after) ? '' : ' ';
  const head = before + lead + piece + tail;
  return { text: head + after, at: head.length };
};

// lo que se envía: cada marca, por su ruta
export const expandMarks = (text, files) => files.reduce((t, f) => t.split(f.mark).join(f.path), text);
