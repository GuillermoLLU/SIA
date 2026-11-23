// Los borradores de Resolver y de Escalar (E/S): en la BBDD local de SIA, un SQLite
// (node:sqlite, como el repositorio de Métricas) en <dir>/borradores.sqlite de
// este ordenador. Uno por persona e issue, con sus imágenes (numeradas: en el
// texto van como [imagenN]); no sale de aquí.
import path from 'node:path';
import { FIELDS } from './draft.js';

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS resolve_drafts (user_id TEXT NOT NULL, issue_id TEXT NOT NULL, at TEXT NOT NULL,
    note TEXT, what TEXT, how TEXT, prevent TEXT, PRIMARY KEY (user_id, issue_id));
  CREATE TABLE IF NOT EXISTS resolve_draft_images (user_id TEXT NOT NULL, issue_id TEXT NOT NULL, n INTEGER NOT NULL,
    name TEXT NOT NULL, type TEXT, data BLOB NOT NULL, PRIMARY KEY (user_id, issue_id, n));
  CREATE TABLE IF NOT EXISTS escalate_drafts (user_id TEXT NOT NULL, issue_id TEXT NOT NULL, at TEXT NOT NULL,
    fields TEXT NOT NULL, PRIMARY KEY (user_id, issue_id));`;
// El de Escalar va en su tabla, con lo escrito en un JSON (cleanEscalate, escalate.js): sin
// imágenes. Una BBDD de antes la crea al abrirse (IF NOT EXISTS).
// v2: el idioma de la nota externa; v3: el paso en el que se quedó; v4: las imágenes,
// varias y numeradas, en su tabla (el adjunto único de antes pasa a ser la 1)
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
  if (version < 4) {
    // solo una BBDD de antes tiene el adjunto único (las columnas file_*); una nueva nace sin ellas
    const hadFile = db.prepare('PRAGMA table_info(resolve_drafts)').all().some((c) => c.name === 'file_data');
    if (hadFile) db.exec(`INSERT INTO resolve_draft_images (user_id, issue_id, n, name, type, data)
      SELECT user_id, issue_id, 1, file_name, file_type, file_data FROM resolve_drafts WHERE file_data IS NOT NULL;
      UPDATE resolve_drafts SET file_name = NULL, file_type = NULL, file_data = NULL;`);
    db.exec('PRAGMA user_version = 4;');
  }
  const stamp = () => now().toISOString();
  // fila vacía si aún no hay borrador: guardar el texto o el adjunto la crea
  const ensure = db.prepare('INSERT OR IGNORE INTO resolve_drafts (user_id, issue_id, at) VALUES (?, ?, ?)');
  const getRow = db.prepare(`SELECT at, ${COLS.join(', ')} FROM resolve_drafts WHERE user_id = ? AND issue_id = ?`);
  const setText = db.prepare(`UPDATE resolve_drafts SET at = ?, ${COLS.map((f) => `${f} = ?`).join(', ')} WHERE user_id = ? AND issue_id = ?`);
  const touch = db.prepare('UPDATE resolve_drafts SET at = ? WHERE user_id = ? AND issue_id = ?');
  const listImages = db.prepare('SELECT n, name, type, length(data) AS size FROM resolve_draft_images WHERE user_id = ? AND issue_id = ? ORDER BY n');
  const nextN = db.prepare('SELECT COALESCE(MAX(n), 0) + 1 AS n FROM resolve_draft_images WHERE user_id = ? AND issue_id = ?');
  const addImage = db.prepare('INSERT INTO resolve_draft_images (user_id, issue_id, n, name, type, data) VALUES (?, ?, ?, ?, ?, ?)');
  const getImage = db.prepare('SELECT name, type, data FROM resolve_draft_images WHERE user_id = ? AND issue_id = ? AND n = ?');
  const dropImage = db.prepare('DELETE FROM resolve_draft_images WHERE user_id = ? AND issue_id = ? AND n = ?');
  const drop = db.prepare('DELETE FROM resolve_drafts WHERE user_id = ? AND issue_id = ?');
  const dropImages = db.prepare('DELETE FROM resolve_draft_images WHERE user_id = ? AND issue_id = ?');
  const getEsc = db.prepare('SELECT at, fields FROM escalate_drafts WHERE user_id = ? AND issue_id = ?');
  const setEsc = db.prepare('INSERT OR REPLACE INTO escalate_drafts (user_id, issue_id, at, fields) VALUES (?, ?, ?, ?)');
  const dropEsc = db.prepare('DELETE FROM escalate_drafts WHERE user_id = ? AND issue_id = ?');

  return {
    // → { at, note, what, how, prevent, lang, step, images: [{ n, name, type, size }] } | null
    get(user, issue) {
      const r = getRow.get(user, issue);
      if (!r) return null;
      const { lang, step, ...rest } = r;
      return { ...rest, lang: lang || 'es', step: step || 1, images: listImages.all(user, issue).map((im) => ({ ...im })) };   // objetos normales, no los de node:sqlite
    },
    // fields: cleanFields(…) → at
    setText(user, issue, fields) {
      const at = stamp();
      ensure.run(user, issue, at);
      setText.run(at, ...COLS.map((f) => fields[f]), user, issue);
      return at;
    },
    // file: cleanFile(…) → { at, n }: la imagen, con el número que le toca (nunca se reutiliza uno quitado)
    addImage(user, issue, file) {
      const at = stamp();
      ensure.run(user, issue, at);
      const { n } = nextN.get(user, issue);
      addImage.run(user, issue, n, file.name, file.type, file.data);
      touch.run(at, user, issue);
      return { at, n };
    },
    // → { name, type, data } | null
    getImage: (user, issue, n) => { const r = getImage.get(user, issue, n); return r ? { ...r } : null; },
    // → at (quitar una que no hay no toca el borrador: devuelve su `at` de antes, o null si no lo hay)
    dropImage(user, issue, n) {
      if (!dropImage.run(user, issue, n).changes) return getRow.get(user, issue)?.at ?? null;
      const at = stamp();
      touch.run(at, user, issue);
      return at;
    },
    drop: (user, issue) => { drop.run(user, issue); dropImages.run(user, issue); },
    // Escalar → { at, ...fields } | null
    getEscalate: (user, issue) => { const r = getEsc.get(user, issue); return r ? { at: r.at, ...JSON.parse(r.fields) } : null; },
    // fields: cleanEscalate(…) → at
    setEscalate(user, issue, fields) { const at = stamp(); setEsc.run(user, issue, at, JSON.stringify(fields)); return at; },
    dropEscalate: (user, issue) => { dropEsc.run(user, issue); },
    close: () => db.close(),
  };
};
