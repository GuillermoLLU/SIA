// /api/backlog (vista Backlog; la exige el bridge, que ya ha resuelto la
// sesión: `who` = { user, accessToken }).
//   GET /?rule=<id>  → { taken, rule, rules, issues }  (la cola del equipo en el orden de esa regla, en breve)
import { failed } from '../shared/http.js';

export const backlogRoutes = (backlog, { json }) => async (req, res, [id], who, query) => {
  try {
    if (!id && req.method === 'GET') return json(res, 200, await backlog.list(who, query.get('rule')));
    return json(res, 404, { error: 'no encontrado' });
  } catch (e) {
    return failed(json, res, e);
  }
};
