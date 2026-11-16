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

// Los adjuntos van con el mensaje como sus rutas, cada una en su línea detrás
// del texto: así Copilot ve las imágenes (server/chats/copilot.js: sendParams)
// y la burbuja las enseña aparte (thread.js: uploadsOf). Solo adjuntos, sin
// texto, también vale.
export const withFiles = (text, paths) => [text, ...paths].filter(Boolean).join('\n');

export const isImageName = (name) => /\.(png|jpe?g|gif|webp|bmp|svg|heic|avif)$/i.test(name || '');
// la extensión de un fichero, para su ficha («PDF», «XLSX»)
export const fileExt = (name) => (String(name || '').split('.').pop() || 'file').toUpperCase().slice(0, 5);
