// Los datos de las Métricas de este ordenador. Cada actualización pide a
// Snowflake las incidencias nuevas o cambiadas desde la última (query.js), las
// suma al repositorio local de incidencias (repository.js, SQLite) y de él se
// calculan las métricas; el cálculo se guarda en <dir>/datos.json para abrir la
// vista al instante. Nada de esto sale de aquí ni va a la base. Antes de calcular,
// se piden a Jira los tickets escalados que aún no se tienen o seguían sin resolver
// (jira.js), para los tiempos de escalado; si Jira no responde o no está configurado,
// el informe sale igual con lo que ya había y meta.jira dice por qué.
import fs from 'node:fs';
import path from 'node:path';
import { createDataset, checkColumns, FORMAT, GROUP } from './dataset.js';
import { rangeOf, buildQuery } from './query.js';

const SOURCE = 'Snowflake';
// El cálculo recorre todas las incidencias (decenas de miles, medio minuto): cada
// tantas cede el turno para que el bridge siga atendiendo (el avance, los terminales…).
const BATCH = 2000;
const pause = () => new Promise((resolve) => setImmediate(resolve));
const secs = (from, to) => `${((to - from) / 1000).toFixed(1).replace('.', ',')} s`;
const num = (n) => n.toLocaleString('es-ES');

// source: { rows(sql, binds, { onConnect, onTotal }) } (snowflake.js), las filas de la consulta una a una. jira:
// { tickets(keys, { onBatch }) } (jira.js); sin él, no se pide nada a Jira. log: dónde se apunta cuánto tardó cada
// fase de una actualización (el registro del bridge).
export const createMetricsStore = (dir, { repo, source, jira = null, now = () => new Date(), log = () => {} }) => {
  const file = path.join(dir, 'datos.json');
  let cache;            // undefined: sin leer aún; null: no hay datos
  let loading = false;
  // Mientras se actualiza, por dónde va: { phase: 'prepare' (cargar el conector) | 'connect' | 'download' | 'compute' | 'jira', done, total }.
  let progress = null;

  // Lo que se sabe de Jira (meta.jira): cuándo se trajo, cuántos tickets hay y, si no se pudo traer, por qué.
  const jiraMeta = (message = '') => {
    let tickets = 0;
    for (const t of repo.jiraTickets().values()) if (t.found) tickets++;
    return { at: repo.jiraFetched(), tickets, message };
  };
  // Pide a Jira las claves que no se tienen y las que seguían sin resolver; las que Jira no conoce no se vuelven a pedir.
  const syncJira = async (keys) => {
    const saved = repo.jiraTickets();
    const ask = keys.filter((k) => { const t = saved.get(k); return !t || (t.found && !t.resolved); });
    progress = { phase: 'jira', done: 0, total: ask.length };
    try {
      if (ask.length) repo.saveJira(await jira.tickets(ask, { onBatch: (n) => { progress.done = n; } }));
      return jiraMeta();
    } catch (e) {
      return jiraMeta(e.message);
    }
  };

  // Las métricas de todo lo guardado en el repositorio; con refresh, pidiendo antes a Jira lo que falte.
  const compute = async (name, refresh = false) => {
    const dataset = createDataset({ start: repo.firstYear(GROUP) ?? now().getUTCFullYear() });
    let n = 0;
    for (const row of repo.incidents()) {
      dataset.add(row);
      if (progress) progress.done++;
      if (++n % BATCH === 0) await pause();
    }
    const meta = refresh && jira ? await syncJira(dataset.jiraKeys()) : jiraMeta();
    return dataset.build({ file: name, generated: now().toISOString(), tickets: repo.jiraTickets(), jira: meta });
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
        for await (const row of source.rows(sql, binds, { onConnect, onTotal })) {
          if (!rows++) checkColumns(row);
          run.add(row);
          progress.done++;
        }
        counts = run.commit();
        t.saved = Date.now();
      } catch (e) {
        run.rollback();
        throw e;
      }
      progress = { phase: 'compute', done: 0, total: repo.count() };
      const data = await compute(SOURCE, true);
      t.done = Date.now();
      t.query ??= t.saved;   // una fuente que no avisa: lo que no se sabe cuenta con la fase siguiente
      t.connect ??= t.start;
      const fetched = counts.inserted + counts.updated + counts.unchanged + counts.kept;
      log(`[sia] métricas actualizadas en ${secs(t.start, t.done)}: conector ${secs(t.start, t.connect)} · conexión y consulta ${secs(t.connect, t.query)}`
        + ` · ${num(fetched)} incidencias de Snowflake (${num(counts.inserted)} nuevas, ${num(counts.updated)} actualizadas) en ${secs(t.query, t.saved)}`
        + ` · informe de ${num(repo.count())} incidencias y Jira en ${secs(t.saved, t.done)}`
        + (data.meta.jira.message ? ` · Jira: ${data.meta.jira.message}` : ` · ${num(data.meta.jira.tickets)} tickets de Jira`));
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(`${file}.tmp`, JSON.stringify(data));
      fs.renameSync(`${file}.tmp`, file);
      cache = data;
      return { meta: data.meta, counts, jira: data.meta.jira };
    } finally {
      loading = false;
      progress = null;
    }
  };

  return { load, update, progress: () => progress };
};
