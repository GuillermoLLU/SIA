// /api/users/*: gestión de usuarios (sesión en X-SIA-Auth; la vista Personas
// la exige el bridge antes de llegar aquí). La base vuelve a comprobarlo todo
// con el JWT de quien llama.
//   GET    /      → { users }
//   POST   /      { email, name, password, role, knowledge? } → { user, warning? }
//                 knowledge = { baseId: [ids de grupo] }: lo que verá desde el alta
//   PUT    /:id   { name?, role?, views?, active?, password? } → { ok }   (un rol sin vistas trae las suyas)
//   DELETE /:id   → { ok }
// Los errores de la base o de la función llegan con su estado y su texto.
// syncKeys(jwt, id, { drop }) pone al día sus claves de poder en las bases
// (sus vistas) tras cambiar su rol, vistas o acceso, y las quita antes de
// borrarla; si algo falla, se avisa en `warning`.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const keysWarning = (problems) => (problems.length ? { warning: `Hecho, pero sin su clave de poder en alguna base: ${problems[0]}` } : {});

export const usersRoutes = (users, auth, { json, readBody, assignKnowledge, syncKeys }) => async (req, res, id) => {
  const token = req.headers['x-sia-auth'];
  try {
    const ctx = await auth.context(token);
    if (!ctx) return json(res, 401, { error: 'Inicia sesión.' });
    if (id && !UUID.test(id)) return json(res, 404, { error: 'Ese usuario no existe.' });
    const jwt = ctx.accessToken;

    if (!id && req.method === 'GET') return json(res, 200, { users: await users.list(jwt) });
    if (!id && req.method === 'POST') {
      const { email, name, password, role, knowledge } = await readBody(req);
      const user = await users.create(jwt, { email, name, password, role });
      // el conocimiento elegido en el alta, base a base; la persona ya existe:
      // si algo falla se avisa, no se deshace el alta
      const failed = [];
      for (const [baseId, ids] of Object.entries(knowledge || {})) {
        if (!UUID.test(baseId) || !Array.isArray(ids) || !ids.length) continue;
        try { await assignKnowledge(jwt, user.id, baseId, ids); } catch (e) { failed.push(e.message); }
      }
      const keys = keysWarning(await syncKeys(jwt, user.id));
      return json(res, 200, { user, ...(failed.length ? { warning: `Creada, pero no se pudo asignar parte de su conocimiento: ${failed[0]}` } : keys) });
    }
    if (id && req.method === 'PUT') {
      const { name, role, views, active, password } = await readBody(req);
      await users.update(jwt, id, { name, role, views, active, password });
      if (id === ctx.user.id) auth.refreshProfile(token); // su propio nombre: que se vea ya
      const access = role !== undefined || views !== undefined || active !== undefined;
      return json(res, 200, { ok: true, ...(access ? keysWarning(await syncKeys(jwt, id)) : {}) });
    }
    if (id && req.method === 'DELETE') {
      await syncKeys(jwt, id, { drop: true }); // sus claves fuera de las bases antes de que deje de existir
      await users.remove(jwt, id);
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: 'no encontrado' });
  } catch (e) {
    if (!e.status) return json(res, 500, { error: 'Error interno.' });
    return json(res, e.status >= 500 ? 503 : e.status, { error: e.message });
  }
};
