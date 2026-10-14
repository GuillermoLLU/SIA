// /api/metrics (vista Métricas; la exige el bridge).
//   GET  /               → { data }  (null: aún no se ha cargado ningún CSV)
//   POST /csv?name=<fichero>  cuerpo: el CSV completo de Remedy, tal cual → { meta }
// Los datos se calculan y se quedan en este ordenador (store.js).

const CSV_NAME = /^[^/\\]{1,200}$/;

export const metricsRoutes = (store, { json }) => async (req, res, path, query) => {
  try {
    const [what] = path;
    if (!what && req.method === 'GET') return json(res, 200, { data: store.load() });
    if (what === 'csv' && !path[1] && req.method === 'POST') {
      const name = query.get('name') || '';
      if (!CSV_NAME.test(name) || !name.toLowerCase().endsWith('.csv')) { req.resume(); return json(res, 400, { error: 'Elige un fichero .csv.' }); }
      req.setEncoding('utf8');
      return json(res, 200, { meta: await store.importCsv(req, name) });
    }
    return json(res, 404, { error: 'no encontrado' });
  } catch (e) {
    if (!e.status) return json(res, 500, { error: 'Error interno.' });
    return json(res, e.status, { error: e.message });
  }
};
