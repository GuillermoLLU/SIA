// El cálculo de las métricas desde el repositorio local y su copia en <dir>/datos.json, que es lo que ve la vista.
// Dominio y E/S separados: el cálculo recorre el repositorio; la copia se escribe y se lee con el fichero que llega
// por parámetro (fs) y con el reloj que llega por parámetro (now), así que no depende de nada más.
import path from 'node:path';
import { createDataset, FORMAT, GROUP, TEAM_PROJECT } from './dataset.js';

// El cálculo recorre todas las incidencias (decenas de miles, medio minuto): cada tantas cede el turno para que el
// bridge siga atendiendo (el avance, los terminales…).
const BATCH = 2000;
const pause = () => new Promise((resolve) => setImmediate(resolve));

// jira: { tickets(keys, { onBatch }) } (jira.js); sin él, no se pide nada a Jira.
export const createPublisher = ({ repo, dir, fs, now, jira = null }) => {
  const file = path.join(dir, 'datos.json');

  // Lo que se sabe de Jira (meta.jira): cuándo se trajo, cuántos tickets hay y, si no se pudo traer, por qué.
  const jiraMeta = (message = '') => {
    let tickets = 0;
    for (const t of repo.jiraTickets().values()) if (t.found) tickets++;
    return { at: repo.jiraFetched(), tickets, message };
  };
  // Pide a Jira las claves que no se tienen y las que seguían sin resolver; las que Jira no conoce no se vuelven a pedir.
  // Las de las issues abiertas (open), con su historial (si ha pasado de un equipo a otro: las mal escaladas del
  // Backlog), y también las ya resueltas de las que aún no se sabe. Al resto no se le pide: pesa mucho. Y las de ITSMECOM
  // traídas antes de guardar su equipo (team NULL): a quién se escala es su equipo (dataset.js).
  const syncJira = async (keys, open, onJira) => {
    const saved = repo.jiraTickets();
    const ask = keys.filter((k) => { const t = saved.get(k); return !t || (t.found && !t.resolved) || (t.found && t.moves == null && open.has(k)) || (t.found && t.team == null && k.startsWith(TEAM_PROJECT)); });
    const progress = { phase: 'jira', done: 0, total: ask.length };
    onJira(progress);
    try {
      if (ask.length) repo.saveJira(await jira.tickets(ask, { history: new Set(ask.filter((k) => open.has(k))), onBatch: (n) => { progress.done = n; } }));
      return jiraMeta();
    } catch (e) {
      return jiraMeta(e.message);
    }
  };

  // Las métricas de todo lo guardado en el repositorio. onRow() se llama por cada incidencia que entra en el informe;
  // con onJira (el avance de esa fase), se pide antes a Jira lo que falte.
  const compute = async (name, { onRow = () => {}, onJira = null } = {}) => {
    const dataset = createDataset({ start: repo.firstYear(GROUP) ?? now().getUTCFullYear() });
    let n = 0;
    for (const row of repo.incidents()) {
      if (dataset.add(row)) onRow();
      if (++n % BATCH === 0) await pause();
    }
    const meta = onJira && jira ? await syncJira(dataset.jiraKeys(), new Set(dataset.openJiraKeys()), onJira) : jiraMeta();
    return dataset.build({ file: name, generated: now().toISOString(), tickets: repo.jiraTickets(), jira: meta });
  };

  // Calcula y guarda la copia (con un fichero temporal y un renombrado, para no dejar una copia a medias).
  const publish = async (name, opts) => {
    const data = await compute(name, opts);
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

  return { compute, publish, read, remove };
};
