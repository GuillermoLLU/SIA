// /api/backlog (vista Backlog; la exige el bridge, que ya ha resuelto la
// sesión: `who` = { user, accessToken }).
//   GET    /?rule=<id>       → { taken, rule, rules, issues }  (la cola del equipo de sus orígenes, en el orden de esa regla, en breve)
//   GET    /people           → { people: [{ id, name }] }  (el equipo de Issues, a quién asignar)
//   GET    /:id              → { issue, claimedBy }  (una issue entera; 404 si no está en la foto o no es de sus orígenes)
//   POST   /:id/assign       { to } → { ok }  (a la mesa de esa persona)
//   GET    /rules            → { criteria, rules }  (el catálogo de criterios y las reglas, con los suyos)
//   POST   /rules            { name, criteria } → { id }  (crear; 400 si no vale)
//   PUT    /rules/:id        { name, criteria } → { id }
//   DELETE /rules/:id        → { ok }
import { failed } from '../shared/http.js';
import { isUuid } from '../shared/ids.js';

const ISSUE_ID = /^INC\d+$/;

export const backlogRoutes = (backlog, { json, readBody }) => async (req, res, [id, sub], who, query) => {
  try {
    if (!id && req.method === 'GET') return json(res, 200, await backlog.list(who, query.get('rule')));
    if (id === 'people' && !sub && req.method === 'GET') return json(res, 200, { people: await backlog.people(who) });
    if (id === 'rules') {
      if (!sub && req.method === 'GET') return json(res, 200, await backlog.rules(who));
      if ((!sub && req.method === 'POST') || (isUuid(sub) && req.method === 'PUT')) {
        const r = await backlog.saveRule(who, sub || null, await readBody(req));
        return r.error ? json(res, 400, { error: r.error }) : json(res, 200, { id: r.id });
      }
      if (isUuid(sub) && req.method === 'DELETE') { await backlog.deleteRule(who, sub); return json(res, 200, { ok: true }); }
      return json(res, 404, { error: 'no encontrado' });
    }
    if (!ISSUE_ID.test(id || '')) return json(res, 404, { error: 'No existe.' });
    if (!sub && req.method === 'GET') {
      const got = await backlog.get(who, id);
      return got ? json(res, 200, got) : json(res, 404, { error: 'Esa issue ya no está en la foto.' });
    }
    if (sub === 'assign' && req.method === 'POST') {
      const { to } = await readBody(req);
      if (!isUuid(to)) return json(res, 400, { error: 'Elige a quién asignarla.' });
      await backlog.assign(who, id, to);
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: 'no encontrado' });
  } catch (e) {
    return failed(json, res, e);
  }
};
