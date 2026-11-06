// /api/metrics (vista Métricas; leer, también con la del Panel de trabajo; lo exige el bridge).
//   GET  /               → { data }  (null: aún no hay incidencias guardadas)
//   GET  /progress       → { progress }: por dónde va la actualización en curso (null: ninguna)
//   POST /update         → { meta, counts }: pide a Snowflake lo nuevo y lo cambiado y lo suma al
//                          repositorio local; counts: { inserted, updated, unchanged, kept }.
//                          Cuerpo { from, to } solo con la base vacía: la primera carga de ese periodo.
//   POST /clear          borra todo lo guardado en este ordenador → { cleared }
//   POST /cancel         cancela la actualización o la carga de un CSV mientras no haya entrado nada → { cancelled }
//   POST /csv?name=      cuerpo: el CSV de la consulta de Remedy, tal cual → { meta, counts }
//   GET  /sql?from=&to=  → { sql }: la consulta para copiar a Snowflake de ese periodo (solo texto)
// Los datos se calculan y se quedan en este ordenador (store.js).

import { failed } from '../shared/http.js';
import { isCsvName } from '../shared/csv.js';
import { periodSql } from './query.js';

// Cada ruta: «MÉTODO tarea» → su manejador. Sin más segmentos en la ruta (la tabla es la lista completa).
export const metricsRoutes = (store, { json, readBody }) => {
  const table = {
    'GET ': async (req, res) => json(res, 200, { data: await store.load() }),
    'GET progress': (req, res) => json(res, 200, { progress: store.progress() }),
    // { from, to } (AAAA-MM-DD) solo para la primera carga con la base vacía; sin cuerpo, la actualización de siempre
    'POST update': async (req, res) => json(res, 200, await store.update(await readBody(req))),
    'POST clear': async (req, res) => json(res, 200, await store.clear()),
    'POST cancel': (req, res) => json(res, 200, store.cancel()),
    'POST csv': async (req, res, query) => {
      const name = query?.get('name') || '';
      if (!isCsvName(name)) { req.resume(); return json(res, 400, { error: 'Elige un fichero .csv.' }); }
      req.setEncoding('utf8');
      return json(res, 200, await store.importCsv(req, name, Number(req.headers?.['content-length']) || 0));
    },
    'GET sql': (req, res, query) => json(res, 200, { sql: periodSql({ from: query?.get('from') || '', to: query?.get('to') || '' }) }),
  };
  return async (req, res, path, who, query) => {
    try {
      const [what, ...rest] = path;
      const handler = !rest.length && table[`${req.method} ${what ?? ''}`];
      if (!handler) return json(res, 404, { error: 'no encontrado' });
      return await handler(req, res, query);
    } catch (e) {
      return failed(json, res, e);   // los errores del slice traen su status (400 un periodo que no vale, 409 una carga en marcha…)
    }
  };
};
