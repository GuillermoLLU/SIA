// /api/metrics (vista Métricas; leer, también con la del Panel de trabajo; lo exige el bridge).
//   GET  /        → { data }  (null: aún no hay incidencias guardadas)
//   GET  /progress → { progress }: por dónde va la actualización en curso (null: ninguna)
//   POST /update  → { meta, counts }: pide a Snowflake lo nuevo y lo cambiado y lo suma al
//                   repositorio local; counts: { inserted, updated, unchanged, kept }
// Los datos se calculan y se quedan en este ordenador (store.js).

import { failed } from '../shared/http.js';

export const metricsRoutes = (store, { json }) => async (req, res, path) => {
  try {
    const [what] = path;
    if (!what && req.method === 'GET') return json(res, 200, { data: await store.load() });
    if (what === 'progress' && !path[1] && req.method === 'GET') return json(res, 200, { progress: store.progress() });
    if (what === 'update' && !path[1] && req.method === 'POST') return json(res, 200, await store.update());
    return json(res, 404, { error: 'no encontrado' });
  } catch (e) {
    return failed(json, res, e);
  }
};
