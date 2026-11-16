// El cálculo de las métricas desde el repositorio local y su copia en <dir>/datos.json, que es lo que ve la vista.
// Dominio y E/S separados: el cálculo recorre el repositorio; la copia se escribe y se lee con el fichero que llega
// por parámetro (fs) y con el reloj que llega por parámetro (now), así que no depende de nada más.
import path from 'node:path';
import { createDataset, FORMAT, GROUP } from './dataset.js';

// El cálculo recorre todas las incidencias (decenas de miles, medio minuto): cada tantas cede el turno para que el
// bridge siga atendiendo (el avance, los terminales…).
const BATCH = 2000;
const pause = () => new Promise((resolve) => setImmediate(resolve));

export const createPublisher = ({ repo, dir, fs, now }) => {
  const file = path.join(dir, 'datos.json');

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

  // Calcula y guarda la copia (con un fichero temporal y un renombrado, para no dejar una copia a medias).
  const publish = async (name, onRow, sync) => {
    const data = await compute(name, onRow, sync);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(data));
    fs.renameSync(`${file}.tmp`, file);
    return data;
  };

  // La copia guardada, si existe y es del formato actual; si no, null.
  const read = () => {
    try {
      const data = JSON.parse(fs.readFileSync(file, 'utf8'));
      return data?.meta?.format === FORMAT ? data : null;
    } catch {
      return null;
    }
  };

  const remove = () => fs.rmSync(file, { force: true });

  return { compute, publish, read, remove, jiraMeta };
};
