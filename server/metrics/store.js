// Los datos de las Métricas de este ordenador. Cada actualización pide a
// Snowflake las incidencias nuevas o cambiadas desde la última (query.js), las
// suma al repositorio local de incidencias (repository.js, SQLite) y de él se
// calculan las métricas; el cálculo se guarda en <dir>/datos.json para abrir la
// vista al instante. Nada de esto sale de aquí ni va a la base.
import fs from 'node:fs';
import path from 'node:path';
import { createDataset, checkColumns, DataError, FORMAT, GROUP } from './dataset.js';
import { rangeOf, buildQuery } from './query.js';
import { csvReader } from '../shared/csv.js';

const SOURCE = 'Snowflake';
// El cálculo recorre todas las incidencias (decenas de miles, medio minuto): cada
// tantas cede el turno para que el bridge siga atendiendo (el avance, los terminales…).
const BATCH = 2000;
const pause = () => new Promise((resolve) => setImmediate(resolve));
const secs = (from, to) => `${((to - from) / 1000).toFixed(1).replace('.', ',')} s`;
const num = (n) => n.toLocaleString('es-ES');

// source: { rows(sql, binds, { onConnect, onTotal }) } (snowflake.js), las filas de la consulta una a una. log: dónde se
// apunta cuánto tardó cada fase de una actualización (el registro del bridge).
export const createMetricsStore = (dir, { repo, source, now = () => new Date(), log = () => {} }) => {
  const file = path.join(dir, 'datos.json');
  let cache;            // undefined: sin leer aún; null: no hay datos
  let loading = false;
  // Mientras se actualiza, por dónde va: { phase: 'prepare' (cargar el conector) | 'connect' | 'download' | 'compute', done, total }.
  let progress = null;
  // Lo que se puede cancelar: la descarga de Snowflake o la lectura de un CSV, hasta que lo nuevo entra en la base.
  // Después, ya no se deshace: lo guardado se queda y solo falta recalcular.
  let abort = null;
  const ABORTED = Symbol('cancelado');
  const cancelled = () => Object.assign(new Error('Cancelado: no ha entrado nada nuevo.'), { status: 409, cancelled: true });
  const cancel = () => { if (!abort) return { cancelled: false }; abort.abort(); return { cancelled: true }; };

  // Solo se guardan las del grupo; una que ya no lo es (o nunca lo fue) se quita de lo guardado. Así la base no crece
  // con incidencias que el informe no usa, y las que salen del grupo dejan de contar.
  const keep = (run, row) => {
    if (row.ASSIGNEDGROUP.trim() === GROUP) run.add(row);
    else run.remove(row.INCIDENTNUMBER);
  };

  // Las métricas de todo lo guardado en el repositorio.
  const compute = async (name) => {
    const dataset = createDataset({ start: repo.firstYear(GROUP) ?? now().getUTCFullYear() });
    let n = 0;
    for (const row of repo.incidents()) {
      if (dataset.add(row) && progress) progress.done++;   // el avance cuenta lo que entra en el informe
      if (++n % BATCH === 0) await pause();
    }
    return dataset.build({ file: name, generated: now().toISOString() });
  };

  // Calcula desde el repositorio y lo guarda en datos.json (y en memoria): lo que ve la vista.
  const publish = async (name) => {
    const data = await compute(name);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(data));
    fs.renameSync(`${file}.tmp`, file);
    cache = data;
    return data;
  };

  // datos.json es una copia: si falta o es de otro formato, se recalcula desde el repositorio.
  const load = async () => {
    if (cache === undefined) {
      try { cache = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { cache = null; }
      if (cache?.meta?.format !== FORMAT) {
        try { cache = await compute('repositorio local'); } catch { cache = null; }
      }
    }
    return cache;
  };

  // Lo nuevo y lo cambiado, con los criterios de siempre (incidents.js: decide), en
  // una transacción: si algo falla, no entra nada y la siguiente lo vuelve a pedir.
  const update = async () => {
    if (loading) throw Object.assign(new Error('Ya se está actualizando: espera a que termine.'), { status: 409 });
    loading = true;
    abort = new AbortController();
    const { signal } = abort;
    progress = { phase: 'prepare', done: 0, total: 0 };
    const t = { start: Date.now() };
    try {
      const { sql, binds } = buildQuery(rangeOf(repo.extremes()));
      const run = repo.begin();
      let counts;
      try {
        let rows = 0;
        const onConnect = () => { t.connect = Date.now(); progress = { phase: 'connect', done: 0, total: 0 }; };
        const onTotal = (total) => { t.query = Date.now(); progress = { phase: 'download', done: 0, total }; };
        // Cada fila, con la cancelación a la vista: si se cancela mientras Snowflake sigue, no hay que esperar a la siguiente fila.
        const stop = new Promise((ok) => signal.addEventListener('abort', () => ok(ABORTED), { once: true }));
        const it = source.rows(sql, binds, { onConnect, onTotal })[Symbol.asyncIterator]();
        for (;;) {
          const step = await Promise.race([it.next(), stop]);
          if (step === ABORTED) throw cancelled();
          if (step.done) break;
          const row = step.value;
          if (!rows++) checkColumns(row);
          keep(run, row);
          progress.done++;
        }
        counts = run.commit();
        abort = null;   // lo guardado ya está en la base: a partir de aquí no se cancela
        t.saved = Date.now();
      } catch (e) {
        run.rollback();
        log(`[sia] la actualización no ha entrado: ${e.message}`);
        throw e;
      }
      progress = { phase: 'compute', done: 0, total: repo.reportCount(GROUP) };
      const data = await publish(SOURCE);
      t.done = Date.now();
      t.query ??= t.saved;   // una fuente que no avisa: lo que no se sabe cuenta con la fase siguiente
      t.connect ??= t.start;
      const fetched = counts.inserted + counts.updated + counts.unchanged + counts.kept;
      log(`[sia] métricas actualizadas en ${secs(t.start, t.done)}: conector ${secs(t.start, t.connect)} · conexión y consulta ${secs(t.connect, t.query)}`
        + ` · ${num(fetched)} incidencias de Snowflake (${num(counts.inserted)} nuevas, ${num(counts.updated)} actualizadas, ${num(run.removed)} quitadas por salir del grupo) en ${secs(t.query, t.saved)}`
        + ` · informe de ${num(progress.total)} incidencias en ${secs(t.saved, t.done)}`);
      return { meta: data.meta, counts };
    } finally {
      loading = false;
      abort = null;
      progress = null;
    }
  };

  // Un CSV de la consulta de Remedy (completa, con notas e historial), cargado a mano. Sus filas pasan por las
  // mismas reglas que las de Snowflake (incidents.js: decide): es una foto, así que no pisa lo guardado más
  // reciente. Una transacción, como la actualización; luego se recalcula el informe.
  // bytes: el tamaño del fichero (la cabecera Content-Length), para el avance; 0 si no se sabe.
  const importCsv = async (chunks, name, bytes = 0) => {
    if (loading) throw Object.assign(new Error('Ya se está cargando: espera a que termine.'), { status: 409 });
    loading = true;
    abort = new AbortController();
    const { signal } = abort;
    progress = { phase: 'download', done: 0, total: bytes, unit: 'bytes' };
    try {
      const run = repo.begin();
      let rows = 0, counts;
      try {
        const reader = csvReader((row) => { if (!rows++) checkColumns(row); keep(run, row); });
        for await (const chunk of chunks) {
          if (signal.aborted) throw cancelled();
          reader.push(chunk);
          progress.done += Buffer.byteLength(chunk);
        }
        reader.end();
        if (!rows) throw new DataError('Ese CSV no tiene filas.');
        counts = run.commit();
        abort = null;
      } catch (e) {
        run.rollback();
        log(`[sia] la carga del CSV «${name}» no ha entrado: ${e.message}`);
        throw e;
      }
      progress = { phase: 'compute', done: 0, total: repo.reportCount(GROUP) };
      const data = await publish(name);
      return { meta: data.meta, counts };
    } finally {
      loading = false;
      abort = null;
      progress = null;
    }
  };

  return { load, update, importCsv, cancel, progress: () => progress };
};
