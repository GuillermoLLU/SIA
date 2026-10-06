// /api/issues (vista Issues; la exige el bridge):
//   GET / → { taken, issues }  (taken: hora de la foto, o null si no hay fuente)

export const issuesRoutes = (source, { json }) => (req, res, path) => {
  if (path.length || req.method !== 'GET') return json(res, 404, { error: 'no encontrado' });
  try { return json(res, 200, source.load()); }
  catch { return json(res, 500, { error: 'No se pudieron leer las issues.' }); }
};
