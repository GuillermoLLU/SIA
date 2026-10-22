// /api/issues (vista Issues; la exige el bridge, que ya ha resuelto la sesión:
// `who` = { user, accessToken }).
//   GET  /              → { taken, rules, free, next, desk, today, history }
//                         (next: la que tocaría ahora; desk: mis issues, en breve;
//                          history: lo medido en SIA, 12 semanas)
//   GET  /:id           → { issue, sameCenter }
//   GET  /teammates     → { teammates: [{ id, name }] }  (el equipo de Issues, sin mí)
//   POST /next          { rule } → { id }  (null: no queda ninguna libre)
//   POST /:id/release   → { ok }  (devolverla a la cola)
//   POST /csv?name=<fichero>  cuerpo: el CSV de la consulta, tal cual → { meta }
//                         (la foto de Issues; se queda en este ordenador, source.js)
import { failed } from '../shared/http.js';
import { isCsvName } from '../shared/csv.js';

const ISSUE_ID = /^INC\d+$/;

export const issuesRoutes = (issues, { json, readBody }) => async (req, res, [id, action], who, query) => {
  try {
    if (id === 'csv' && !action && req.method === 'POST') {
      const name = query.get('name') || '';
      if (!isCsvName(name)) { req.resume(); return json(res, 400, { error: 'Elige un fichero .csv.' }); }
      req.setEncoding('utf8');
      return json(res, 200, { meta: await issues.importCsv(req, name) });
    }
    if (!id && req.method === 'GET') return json(res, 200, await issues.desk(who));
    if (id === 'teammates' && !action && req.method === 'GET') return json(res, 200, { teammates: await issues.teammates(who) });
    if (id === 'next' && !action && req.method === 'POST') return json(res, 200, { id: await issues.next(who, (await readBody(req)).rule) });
    if (!ISSUE_ID.test(id || '')) return json(res, 404, { error: 'No existe.' });
    if (action === 'release' && req.method === 'POST') { await issues.release(who, id); return json(res, 200, { ok: true }); }
    if (!action && req.method === 'GET') {
      const got = await issues.get(who, id);
      return got ? json(res, 200, got) : json(res, 404, { error: 'Esa issue ya no está en la foto.' });
    }
    return json(res, 404, { error: 'no encontrado' });
  } catch (e) {
    return failed(json, res, e);
  }
};
