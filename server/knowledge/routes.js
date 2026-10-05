// /api/knowledge/*: asignación de conocimiento, solo para administradores
// (sesión en X-SIA-Auth). La base vuelve a comprobarlo todo con su JWT.
//   GET    /bases             → { bases }
//   POST   /bases             { name, url, key } → { id }
//   DELETE /bases/:id         → { ok }
//   GET    /grants/:userId    → { grants }   (tokens enmascarados)
//   POST   /grants            { user, base, groupName, token } → { id }
//   DELETE /grants/:id        → { ok }
// Tras cada cambio, onChange(token): lo asignado a uno mismo puede haber cambiado.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const knowledgeRoutes = (knowledge, auth, { json, readBody, onChange }) => async (req, res, kind, id) => {
  const token = req.headers['x-sia-auth'];
  try {
    const ctx = await auth.context(token);
    if (!ctx) return json(res, 401, { error: 'Inicia sesión.' });
    if (ctx.user.role !== 'admin') return json(res, 403, { error: 'Solo para administradores.' });
    if (id && !UUID.test(id)) return json(res, 404, { error: 'No existe.' });
    const jwt = ctx.accessToken;
    const changed = async (body) => { await onChange(token); return json(res, 200, body); };

    if (kind === 'bases' && !id && req.method === 'GET') return json(res, 200, { bases: await knowledge.listBases(jwt) });
    if (kind === 'bases' && !id && req.method === 'POST') {
      const { name, url, key } = await readBody(req);
      return changed({ id: await knowledge.addBase(jwt, { name, url, key }) });
    }
    if (kind === 'bases' && id && req.method === 'DELETE') { await knowledge.removeBase(jwt, id); return changed({ ok: true }); }
    if (kind === 'grants' && id && req.method === 'GET') return json(res, 200, { grants: await knowledge.listGrants(jwt, id) });
    if (kind === 'grants' && !id && req.method === 'POST') {
      const { user, base, groupName, token: groupToken } = await readBody(req);
      return changed({ id: await knowledge.grant(jwt, { user, base, groupName, token: groupToken }) });
    }
    if (kind === 'grants' && id && req.method === 'DELETE') { await knowledge.revoke(jwt, id); return changed({ ok: true }); }
    return json(res, 404, { error: 'no encontrado' });
  } catch (e) {
    if (!e.status) return json(res, 500, { error: 'Error interno.' });
    return json(res, e.status >= 500 ? 503 : e.status, { error: e.message });
  }
};
