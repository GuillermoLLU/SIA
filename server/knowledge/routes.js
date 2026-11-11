// /api/knowledge/*: conocimiento de cada persona (la vista Personas la exige
// el bridge, que ya ha resuelto la sesión: `who` = { user, accessToken }).
// La base vuelve a comprobarlo todo con su JWT.
//   GET  /base                      → { base }  (con sus proyectos: { id, name })
//   PUT  /people/:userId/projects   { projects: [ids] } → { ok }   (vacío: ninguno)
//   POST /people/:userId/copy       { from } → { ok }
// Tras cada cambio, sus claves de poder al día (syncKeys) y onChange(who): lo
// asignado a quien llama puede haber cambiado.

import { isUuid } from '../shared/ids.js';
import { failed } from '../shared/http.js';
import { keysWarning } from './person-keys.js';

export const knowledgeRoutes = (knowledge, { json, readBody, onChange, syncKeys }) => async (req, res, [kind, id, sub], who) => {
  const jwt = who.accessToken;
  try {
    if (id && !isUuid(id)) return json(res, 404, { error: 'No existe.' });
    const changed = async (userId) => {
      const problems = await syncKeys(jwt, userId);
      await onChange(who);
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
    return failed(json, res, e);
  }
};
