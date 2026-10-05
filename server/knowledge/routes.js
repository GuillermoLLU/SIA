// /api/knowledge/*: conocimiento de cada persona (sesión en X-SIA-Auth; la
// vista Personas la exige el bridge). La base vuelve a comprobarlo todo con su JWT.
//   GET  /base                      → { base }  (con sus proyectos: { id, name })
//   PUT  /people/:userId/projects   { projects: [ids] } → { ok }   (vacío: ninguno)
//   POST /people/:userId/copy       { from } → { ok }
// Tras cada cambio, sus claves de poder al día (syncKeys) y onChange(token):
// lo asignado a uno mismo puede haber cambiado.

import { isUuid } from '../shared/ids.js';
import { keysWarning } from './person-keys.js';

export const knowledgeRoutes = (knowledge, auth, { json, readBody, onChange, syncKeys }) => async (req, res, path) => {
  const token = req.headers['x-sia-auth'];
  try {
    const ctx = await auth.context(token);
    if (!ctx) return json(res, 401, { error: 'Inicia sesión.' });
    const [kind, id, sub] = path;
    if (id && !isUuid(id)) return json(res, 404, { error: 'No existe.' });
    const jwt = ctx.accessToken;
    const changed = async (userId) => {
      const problems = await syncKeys(jwt, userId);
      await onChange(token);
      return json(res, 200, { ok: true, ...keysWarning(problems) });
    };

    if (kind === 'base' && !id && req.method === 'GET') return json(res, 200, { base: await knowledge.base(jwt) });
    if (kind === 'people' && id && sub === 'projects' && req.method === 'PUT') {
      const { projects } = await readBody(req);
      await knowledge.setProjects(jwt, id, projects);
      return changed(id);
    }
    if (kind === 'people' && id && sub === 'copy' && req.method === 'POST') {
      const { from } = await readBody(req);
      if (!isUuid(from)) return json(res, 400, { error: 'Elige a otra persona.' });
      await knowledge.copy(jwt, id, from);
      return changed(id);
    }
    return json(res, 404, { error: 'no encontrado' });
  } catch (e) {
    if (!e.status) return json(res, 500, { error: 'Error interno.' });
    return json(res, e.status >= 500 ? 503 : e.status, { error: e.message });
  }
};
