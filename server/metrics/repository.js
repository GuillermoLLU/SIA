// El repositorio local de incidencias: un fichero SQLite (node:sqlite) en este
// ordenador que acumula las incidencias de Remedy sin perder lo ya guardado. No sale de
// aquí ni va al repositorio de código: lleva datos de la operación. Se escribe
// directo en el fichero, sin cargarlo en memoria: crece con los años sin límite.
//
//   incidents        una fila por INCIDENTNUMBER con todas las columnas de la consulta, tal cual,
//                    y LASTUPDATE_BBDD: cuándo la actualizó SIA (no es LASTMODIFIEDDATE, que es de Remedy)
//   audit_events     AUDIT_DETAIL abierto: un cambio por fila (fecha, quién, campo, old_value, new_value)
//   worklog_entries  WORKLOG_DETAIL abierto: una nota por fila
// Las dos últimas se rehacen con cada alta o cambio y sirven para consultar por fecha
// (cambios de estado, actividad…) sin volver a leer los textos largos.
import path from 'node:path';
import { decide, auditEvents, worklogEntries } from './incidents.js';

const ID = 'INCIDENTNUMBER', UPDATED = 'LASTUPDATE_BBDD';
const q = (name) => `"${name.replaceAll('"', '""')}"`;

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS incidents (${ID} TEXT PRIMARY KEY, ${UPDATED} TEXT);
  CREATE TABLE IF NOT EXISTS audit_events (incident TEXT NOT NULL, seq INTEGER NOT NULL, at TEXT, who TEXT, field TEXT, old_value TEXT, new_value TEXT, PRIMARY KEY (incident, seq));
  CREATE INDEX IF NOT EXISTS audit_at ON audit_events (at);
  CREATE INDEX IF NOT EXISTS audit_field_at ON audit_events (field, at);
  CREATE TABLE IF NOT EXISTS worklog_entries (incident TEXT NOT NULL, seq INTEGER NOT NULL, at TEXT, who TEXT, text TEXT, PRIMARY KEY (incident, seq));
  CREATE INDEX IF NOT EXISTS worklog_at ON worklog_entries (at);
  PRAGMA user_version = 1;`;

// Las columnas que se consultan por rango o por grupo llevan índice.
const INDEXED = ['REPORTEDDATE', 'LASTRESOLUTIONDATE', 'ASSIGNEDGROUP'];

// DatabaseSync: la clase de node:sqlite (se inyecta, como el resto de dependencias).
export const createRepository = ({ DatabaseSync, file, fs, now = () => new Date() }) => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.rmSync(`${file}.tmp`, { force: true });   // lo que dejó una carga cortada con el motor anterior (sql.js)
  const db = new DatabaseSync(file);
  // WAL y más caché: guardar una actualización va el doble de rápido en un fichero de gigas (medido: 2.946
  // incidencias en 9,8 s frente a 14–18 s). Deja junto al fichero sus -wal y -shm mientras está abierto.
  db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; PRAGMA cache_size = -65536;');
  db.exec(SCHEMA);

  const columns = () => db.prepare('PRAGMA table_info(incidents)').all().map((c) => c.name);

  // Las columnas que no estaban (una consulta con campos nuevos) se añaden, sin tocar lo guardado.
  const ensureColumns = (names) => {
    const known = new Set(columns());
    for (const name of names) {
      if (known.has(name)) continue;
      db.exec(`ALTER TABLE incidents ADD COLUMN ${q(name)} TEXT`);
      if (INDEXED.includes(name)) db.exec(`CREATE INDEX IF NOT EXISTS ${q(`incidents_${name}`)} ON incidents (${q(name)})`);
    }
  };

  // Una actualización es una transacción: o entra entera o no entra nada.
  // add(fila) por cada fila; commit() la confirma y rollback() la deshace.
  const begin = () => {
    db.exec('BEGIN');
    const counts = { inserted: 0, updated: 0, unchanged: 0, kept: 0 };
    let ready = null;

    const setup = (row) => {
      const names = Object.keys(row).filter((c) => c !== UPDATED);
      ensureColumns(names);
      const set = names.filter((c) => c !== ID);
      const cols = [...names, UPDATED];
      ready = {
        names, set,
        find: db.prepare(`SELECT * FROM incidents WHERE ${ID} = ?`),
        insert: db.prepare(`INSERT INTO incidents (${cols.map(q).join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`),
        update: db.prepare(`UPDATE incidents SET ${[...set, UPDATED].map((c) => `${q(c)} = ?`).join(', ')} WHERE ${ID} = ?`),
        dropAudit: db.prepare('DELETE FROM audit_events WHERE incident = ?'),
        dropWorklog: db.prepare('DELETE FROM worklog_entries WHERE incident = ?'),
        audit: db.prepare('INSERT INTO audit_events (incident, seq, at, who, field, old_value, new_value) VALUES (?, ?, ?, ?, ?, ?, ?)'),
        worklog: db.prepare('INSERT INTO worklog_entries (incident, seq, at, who, text) VALUES (?, ?, ?, ?, ?)'),
      };
    };

    const add = (row) => {
      const id = row[ID];
      if (!id) return;
      if (!ready) setup(row);
      const { names, set, find, insert, update, dropAudit, dropWorklog, audit, worklog } = ready;
      const action = decide(find.get(id), row);
      if (action === 'keep' || action === 'same') { counts[action === 'keep' ? 'kept' : 'unchanged']++; return; }
      const stamp = now().toISOString();
      if (action === 'insert') { insert.run(...names.map((c) => row[c]), stamp); counts.inserted++; }
      else { update.run(...set.map((c) => row[c]), stamp, id); counts.updated++; }
      dropAudit.run(id); dropWorklog.run(id);
      auditEvents(row.AUDIT_DETAIL).forEach((e, n) => audit.run(id, n, e.at, e.who, e.field, e.before, e.after));
      worklogEntries(row.WORKLOG_DETAIL).forEach((e, n) => worklog.run(id, n, e.at, e.who, e.text));
    };

    return {
      add,
      commit: () => { db.exec('COMMIT'); return counts; },
      rollback: () => db.exec('ROLLBACK'),
    };
  };

  // Las incidencias, una a una, como filas de la consulta: las columnas que no tenía (de una carga anterior) salen
  // vacías. count: cuántas son (para el avance del cálculo).
  function* incidents() {
    for (const row of db.prepare(`SELECT * FROM incidents ORDER BY ${ID}`).iterate()) {
      for (const c in row) if (row[c] === null) row[c] = '';
      yield row;
    }
  }
  const count = () => db.prepare('SELECT COUNT(*) AS n FROM incidents').get().n;

  // El año de la primera incidencia abierta del grupo (null: no hay ninguna).
  const firstYear = (group) => {
    if (!['REPORTEDDATE', 'ASSIGNEDGROUP'].every((c) => columns().includes(c))) return null;   // aún no se ha cargado nada
    const r = db.prepare(`SELECT MIN(REPORTEDDATE) AS d FROM incidents WHERE TRIM(ASSIGNEDGROUP) = ? AND REPORTEDDATE GLOB '[0-9][0-9][0-9][0-9]-*'`).get(group);
    return r?.d ? Number(r.d.slice(0, 4)) : null;
  };

  // Desde dónde pedir a Snowflake (query.js: rangeOf): la apertura más antigua y la
  // última modificación guardadas, de todos los grupos (null: aún no hay nada).
  const extremes = () => {
    if (!['REPORTEDDATE', 'LASTMODIFIEDDATE'].every((c) => columns().includes(c))) return { first: null, last: null };
    const date = (c) => `CASE WHEN ${c} GLOB '[0-9][0-9][0-9][0-9]-*' THEN ${c} END`;
    const r = db.prepare(`SELECT MIN(${date('REPORTEDDATE')}) AS first, MAX(${date('LASTMODIFIEDDATE')}) AS last FROM incidents`).get();
    return { first: r.first ?? null, last: r.last ?? null };
  };

  return { begin, incidents, count, firstYear, extremes, close: () => db.close() };
};
