// /api/admin/*: la Administración de la base de conocimiento. Lo único que se
// gestiona son proyectos; las entradas (entries) de cada uno se ven y se
// borran (la capa de contextos queda oculta a la UI).
//   GET    /check                → { base: { perms } }   qué abre la clave de poder (sin gate)
//   GET    /projects             → [{ id, name, entries }]       POST /projects { name } → proyecto
//   DELETE /projects/:id         → { ok }   (onProjectRemoved: sus skills se van de la copia local)
//   GET    /entries?project=<id> → [entry]  DELETE /entries/:id → { ok }
// Cada petición llega con { db, perms }.
import { failed } from '../shared/http.js';

export const projectsRoutes = (projects, { json, readBody, onProjectRemoved }) => async (req, res, [what, id], query, { db, perms }) => {
  if (what === 'check') return json(res, 200, { base: { perms } });
  if (!perms?.admin) return json(res, 403, { error: 'Tu clave de poder no abre la Administración.' });
  try {
    if (what === 'projects') {
      if (!id && req.method === 'GET') return json(res, 200, await projects.list(db));
      if (!id && req.method === 'POST') return json(res, 200, await projects.create(db, (await readBody(req)).name));
      if (id && req.method === 'DELETE') {
        await projects.remove(db, Number(id));
        await onProjectRemoved();
        return json(res, 200, { ok: true });
      }
    }
    if (what === 'entries') {
      if (!id && req.method === 'GET') return json(res, 200, await projects.entries(db, Number(query.get('project'))));
      if (id && req.method === 'DELETE') { await projects.removeEntry(db, Number(id)); return json(res, 200, { ok: true }); }
    }
    return json(res, 404, { error: 'no encontrado' });
  } catch (e) {
    return failed(json, res, e);
  }
};
