// Los datos de las Métricas de este ordenador. Cada actualización pide a
// Snowflake las incidencias nuevas o cambiadas desde la última (query.js), las
// suma al repositorio local de incidencias (repository.js, SQLite) y de él se
// calculan las métricas (publish.js); el cálculo se guarda en <dir>/datos.json para
// abrir la vista al instante. Nada de esto sale de aquí ni va a la base.
import { checkColumns, DataError, GROUP } from './dataset.js';
import { rangeOf, buildQuery, firstLoadRange } from './query.js';
import { createPublisher } from './publish.js';
import { csvReader } from '../shared/csv.js';

const SOURCE = 'Snowflake';
const secs = (from, to) => `${((to - from) / 1000).toFixed(1).replace('.', ',')} s`;
const num = (n) => n.toLocaleString('es-ES');

// source: { rows(sql, binds, { onConnect, onTotal }) } (snowflake.js), las filas de la consulta una a una. fs: el
// sistema de ficheros (datos.json), now: el reloj, log: dónde se apunta cuánto tardó cada fase (el registro del bridge).
export const createMetricsStore = (dir, { repo, source, fs, now = () => new Date(), log = () => {} }) => {
  const publisher = createPublisher({ repo, dir, fs, now });
  const ms = () => now().getTime();
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
  // El avance cuenta lo que entra en el informe.
  const counted = () => { if (progress) progress.done++; };

  // Calcula desde el repositorio y guarda la copia: lo que ve la vista.
  const publish = async (name) => {
    const data = await publisher.publish(name, counted);
    cache = data;
    return data;
  };

  // datos.json es una copia: si falta o es de otro formato, se recalcula desde el repositorio.
  const load = async () => {
    if (cache === undefined) {
      cache = publisher.read();
      if (!cache) {
        try { cache = await publisher.compute('repositorio local'); } catch { cache = null; }
      }
    }
    return cache;
  };

  // Lo nuevo y lo cambiado, con los criterios de siempre (incidents.js: decide), en
  // una transacción: si algo falla, no entra nada y la siguiente lo vuelve a pedir.
  // range: { from, to } solo con la base vacía (la primera carga con un periodo elegido); con datos, se ignora.
  const update = async (range = null) => {
    if (loading) throw Object.assign(new Error('Ya se está actualizando: espera a que termine.'), { status: 409 });
    loading = true;
    abort = new AbortController();
    const { signal } = abort;
    progress = { phase: 'prepare', done: 0, total: 0 };
    const t = { start: ms() };
    try {
      const empty = repo.extremes().first === null;
      const { sql, binds } = buildQuery(empty && range?.from ? firstLoadRange(range) : rangeOf(repo.extremes()));
      const run = repo.begin();
      let counts;
      try {
        let rows = 0;
        const onConnect = () => { t.connect = ms(); progress = { phase: 'connect', done: 0, total: 0 }; };
        const onTotal = (total) => { t.query = ms(); progress = { phase: 'download', done: 0, total }; };
        // Cada fila, con la cancelación a la vista: si se cancela mientras Snowflake sigue, no hay que esperar a la siguiente fila.
        const stop = new Promise((ok) => signal.addEventListener('abort', () => ok(ABORTED), { once: true }));
        const it = source.rows(sql, binds, { onConnect, onTotal })[Symbol.asyncIterator]();
        for (;;) {
          const step = await Promise.race([it.next(), stop]);
          if (step === ABORTED) {
            await it.return?.().catch(() => {});   // cierra el iterador: así el conector suelta la conexión de Snowflake
            throw cancelled();
          }
          if (step.done) break;
          const row = step.value;
          if (!rows++) checkColumns(row);
          keep(run, row);
          progress.done++;
        }
        counts = run.commit();
        abort = null;   // lo guardado ya está en la base: a partir de aquí no se cancela
        t.saved = ms();
      } catch (e) {
        run.rollback();
        log(`[sia] la actualización no ha entrado: ${e.message}`);
        throw e;
      }
      progress = { phase: 'compute', done: 0, total: repo.reportCount(GROUP) };
      const data = await publish(SOURCE);
      t.done = ms();
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

  // Borra todo lo guardado en este ordenador (la base local y su copia calculada). Snowflake no se toca.
  // Con el avance de lo borrado (progress: { phase: 'clear', done, total }), igual que las otras tareas.
  const clear = async () => {
    if (loading) throw Object.assign(new Error('Hay una carga en marcha: espera a que termine.'), { status: 409 });
    loading = true;
    progress = { phase: 'clear', done: 0, total: repo.count() };
    try {
      await repo.clearAll((done, total) => { progress = { phase: 'clear', done, total }; });
      publisher.remove();
      cache = null;
      return { cleared: true };
    } finally {
      loading = false;
      progress = null;
    }
  };

  // ¿Se puede actualizar desde Snowflake? Antes de enseñar el avance (la VPN): si no, el error que lo explica.
  return { load, update, importCsv, cancel, clear, ready: () => source.ready(), progress: () => progress };
};
