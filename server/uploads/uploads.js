// Adjuntos de los chats (dominio, sin E/S): el nombre con el que se guarda
// un fichero subido desde la UI. Temporales por arranque.
import path from 'node:path';

// «<n>-<nombre saneado><ext>»: solo el nombre del fichero (sin carpetas),
// letras, números y guiones, y la extensión en minúsculas, para que la ruta
// que luego se escribe en el prompt no rompa nada.
export const uploadName = (name, seq) => {
  const raw = String(name || '');
  const ext = (path.extname(raw).toLowerCase().replace(/[^.a-z0-9]/g, '')) || '.png';
  const stem = path.basename(raw, path.extname(raw)).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'imagen';
  return `${seq}-${stem}${ext}`;
};
