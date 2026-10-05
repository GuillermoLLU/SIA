// /api/knowledge/*: conocimiento de cada persona (sesión en X-SIA-Auth; la
// vista Personas la exige el bridge). La base vuelve a comprobarlo todo con su JWT.
//   GET    /bases                          → { bases }  (con sus grupos: { id, name })
//   PUT    /people/:userId/bases/:baseId   { groups: [ids] } → { ok }   (vacío: no la ve)
//   POST   /people/:userId/copy            { from } → { ok }
// Tras cada cambio, sus claves de poder al día (syncKeys: ve otras bases) y
// onChange(token): lo asignado a uno mismo puede haber cambiado.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const knowledgeRoutes = (knowledge, auth, { json, readBody, onChange, syncKeys }) => async (req, res, path) => {
  const token = req.headers['x-sia-auth'];
  try {
    const ctx = await auth.context(token);
    if (!ctx) return json(res, 401, { error: 'Inicia sesión.' });
    const [kind, id, sub, subId] = path;
    if ([id, subId].some((x) => x && !UUID.test(x))) return json(res, 404, { error: 'No existe.' });
    const jwt = ctx.accessToken;
    const changed = async (userId) => {
      const problems = await syncKeys(jwt, userId);
      await onChange(token);
      return json(res, 200, { ok: true, ...(problems.length ? { warning: `Hecho, pero sin su clave de poder en alguna base: ${problems[0]}` } : {}) });
    };

    if (kind === 'bases' && !id && req.method === 'GET') return json(res, 200, { bases: await knowledge.bases(jwt) });
    if (kind === 'people' && id && sub === 'bases' && subId && req.method === 'PUT') {
      const { groups } = await readBody(req);
      await knowledge.setGroups(jwt, id, subId, groups);
      return changed(id);
    }
    if (kind === 'people' && id && sub === 'copy' && req.method === 'POST') {
      const { from } = await readBody(req);
      if (!UUID.test(String(from))) return json(res, 400, { error: 'Elige a otra persona.' });
      await knowledge.copy(jwt, id, from);
      return changed(id);
    }
    return json(res, 404, { error: 'no encontrado' });
  } catch (e) {
    if (!e.status) return json(res, 500, { error: 'Error interno.' });
    return json(res, e.status >= 500 ? 503 : e.status, { error: e.message });
  }
};
