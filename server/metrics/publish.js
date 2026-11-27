// El cálculo de las métricas desde el repositorio local y su copia en <dir>/datos-f<formato>.json, que es lo que ve la
// vista. Dominio y E/S separados: el cálculo recorre el repositorio; la copia se escribe y se lee con el fichero que
// llega por parámetro (fs) y con el reloj que llega por parámetro (now), así que no depende de nada más.
//
// Una copia por formato (FORMAT, dataset.js): dos versiones de SIA sobre el mismo repositorio (cambiar de rama, o una
// instalación más nueva y otra más vieja) tienen cada una la suya y no se pisan, así que ninguna tiene que recalcular
// al volver a ella. La de antes, datos.json, se sigue leyendo si es del formato actual (no se recalcula al pasar a
// esta versión); ya no se escribe.
import path from 'node:path';
import { createDataset, FORMAT, GROUP } from './dataset.js';

// El cálculo recorre todas las incidencias (decenas de miles, medio minuto): cada tantas cede el turno para que el
// bridge siga atendiendo (el avance, los terminales…).
const BATCH = 2000;
const pause = () => new Promise((resolve) => setImmediate(resolve));

export const copyName = (format = FORMAT) => `datos-f${format}.json`;
const LEGACY = 'datos.json';

export const createPublisher = ({ repo, dir, fs, now }) => {
  const file = path.join(dir, copyName());

  // Lo que se sabe de Jira (meta.jira): cuándo se trajo, cuántos tickets hay y, si no se pudo traer, por qué.
  const jiraMeta = (message = '') => {
    let tickets = 0;
    for (const t of repo.jiraTickets().values()) if (t.found) tickets++;
    return { at: repo.jiraFetched(), tickets, message };
  };

  // Las métricas de todo lo guardado en el repositorio. onRow() se llama por cada incidencia que entra en el informe.
  // sync(claves): pide a Jira lo que falte, antes de calcular, y devuelve meta.jira (sin él, no se pide nada).
  const compute = async (name, onRow = () => {}, sync = null) => {
    const dataset = createDataset({ start: repo.firstYear(GROUP) ?? now().getUTCFullYear() });
    let n = 0;
    for (const row of repo.incidents()) {
      if (dataset.add(row)) onRow();
      if (++n % BATCH === 0) await pause();
    }
    const jira = sync ? await sync(dataset.jiraKeys()) : jiraMeta();
    return dataset.build({ file: name, generated: now().toISOString(), tickets: repo.jiraTickets(), jira });
  };

  // Guarda la copia de unas métricas ya calculadas (con un fichero temporal y un renombrado, para no dejar una copia a
  // medias).
  const save = (data) => {
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(data));
    fs.renameSync(`${file}.tmp`, file);
    return data;
  };

  // Calcula y guarda la copia.
  const publish = async (name, onRow, sync) => save(await compute(name, onRow, sync));

  // La copia guardada, si existe y es del formato actual (la suya o, de antes, datos.json); si no, null.
  const readOne = (f) => {
    try {
      const data = JSON.parse(fs.readFileSync(f, 'utf8'));
      return data?.meta?.format === FORMAT ? data : null;
    } catch {
      return null;
    }
  };
  const read = () => readOne(file) ?? readOne(path.join(dir, LEGACY));

  // Borrar el histórico: todas las copias, de este formato y de los demás (sin la base, ninguna vale ya).
  const remove = () => {
    let names = [copyName(), LEGACY];
    try { names = [...new Set([...names, ...fs.readdirSync(dir).filter((n) => /^datos(-f\d+)?\.json$/.test(n))])]; } catch { /* sin carpeta: nada más */ }
    for (const n of names) fs.rmSync(path.join(dir, n), { force: true });
  };

  return { compute, publish, save, read, remove, jiraMeta };
};
