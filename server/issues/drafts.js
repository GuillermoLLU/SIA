// Los borradores de Resolver (E/S): en la BBDD local de SIA, un SQLite
// (node:sqlite, como el repositorio de Métricas) en <dir>/borradores.sqlite de
// este ordenador. Uno por persona e issue, con su adjunto; no sale de aquí.
import path from 'node:path';
import { FIELDS } from './draft.js';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS resolve_drafts (user_id TEXT NOT NULL, issue_id TEXT NOT NULL, at TEXT NOT NULL,
    note TEXT, what TEXT, how TEXT, prevent TEXT, file_name TEXT, file_type TEXT, file_data BLOB,
    PRIMARY KEY (user_id, issue_id));`;
// v2: el idioma de la nota externa; v3: el paso en el que se quedó
const COLS = [...FIELDS, 'lang', 'step'];

// DatabaseSync: la clase de node:sqlite (se inyecta, como en metrics/repository.js).
export const createResolveDrafts = ({ DatabaseSync, file, fs, now = () => new Date() }) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(SCHEMA);
  const version = db.prepare('PRAGMA user_version').get().user_version;
  if (version < 2) db.exec('ALTER TABLE resolve_drafts ADD COLUMN lang TEXT; PRAGMA user_version = 2;');
  if (version < 3) db.exec('ALTER TABLE resolve_drafts ADD COLUMN step INTEGER; PRAGMA user_version = 3;');
  const stamp = () => now().toISOString();
  // fila vacía si aún no hay borrador: guardar el texto o el adjunto la crea
  const ensure = db.prepare('INSERT OR IGNORE INTO resolve_drafts (user_id, issue_id, at) VALUES (?, ?, ?)');
  const getRow = db.prepare(`SELECT at, ${COLS.join(', ')}, file_name, file_type, length(file_data) AS file_size FROM resolve_drafts WHERE user_id = ? AND issue_id = ?`);
  const setText = db.prepare(`UPDATE resolve_drafts SET at = ?, ${COLS.map((f) => `${f} = ?`).join(', ')} WHERE user_id = ? AND issue_id = ?`);
  const setFile = db.prepare('UPDATE resolve_drafts SET at = ?, file_name = ?, file_type = ?, file_data = ? WHERE user_id = ? AND issue_id = ?');
  const drop = db.prepare('DELETE FROM resolve_drafts WHERE user_id = ? AND issue_id = ?');

  return {
    // → { at, note, what, how, prevent, lang, step, file: { name, type, size } | null } | null
    get(user, issue) {
      const r = getRow.get(user, issue);
      if (!r) return null;
      const { file_name: name, file_type: type, file_size: size, lang, step, ...rest } = r;
      return { ...rest, lang: lang || 'es', step: step || 1, file: name ? { name, type, size } : null };
    },
    // fields: cleanFields(…) → at
    setText(user, issue, fields) {
      const at = stamp();
      ensure.run(user, issue, at);
      setText.run(at, ...COLS.map((f) => fields[f]), user, issue);
      return at;
    },
    // file: cleanFile(…) o null para quitarlo → at
    setFile(user, issue, file) {
      const at = stamp();
      if (file) ensure.run(user, issue, at);   // quitar un adjunto que no hay no crea un borrador vacío
      setFile.run(at, file?.name ?? null, file?.type ?? null, file?.data ?? null, user, issue);
      return at;
    },
    drop: (user, issue) => { drop.run(user, issue); },
    close: () => db.close(),
  };
};
