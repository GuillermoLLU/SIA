// /api/backlog (vista Backlog; la exige el bridge, que ya ha resuelto la
// sesión: `who` = { user, accessToken }).
//   GET    /?rule=<id>   → { taken, rule, rules, issues }  (la cola del equipo en el orden de esa regla, en breve)
//   GET    /rules        → { criteria, rules }  (el catálogo de criterios y las reglas, con los suyos)
//   POST   /rules        { name, criteria } → { id }  (crear; 400 si no vale)
//   PUT    /rules/:id    { name, criteria } → { id }
//   DELETE /rules/:id    → { ok }
import { failed } from '../shared/http.js';
import { isUuid } from '../shared/ids.js';

export const backlogRoutes = (backlog, { json, readBody }) => async (req, res, [id, sub], who, query) => {
  try {
    if (!id && req.method === 'GET') return json(res, 200, await backlog.list(who, query.get('rule')));
    if (id === 'rules') {
      if (!sub && req.method === 'GET') return json(res, 200, await backlog.rules(who));
      if ((!sub && req.method === 'POST') || (isUuid(sub) && req.method === 'PUT')) {
        const r = await backlog.saveRule(who, sub || null, await readBody(req));
        return r.error ? json(res, 400, { error: r.error }) : json(res, 200, { id: r.id });
      }
      if (isUuid(sub) && req.method === 'DELETE') { await backlog.deleteRule(who, sub); return json(res, 200, { ok: true }); }
    }
    return json(res, 404, { error: 'no encontrado' });
  } catch (e) {
    return failed(json, res, e);
  }
};
