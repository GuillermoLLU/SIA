// /api/users/*: gestión de usuarios, solo para administradores (sesión en
// X-SIA-Auth). La base vuelve a comprobarlo todo con el JWT de quien llama.
//   GET    /      → { users }
//   POST   /      { email, name, password, role } → { user }
//   PUT    /:id   { name?, role?, active?, password? } → { ok }
//   DELETE /:id   → { ok }
// Los errores de la base o de la función llegan con su estado y su texto.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const usersRoutes = (users, auth, { json, readBody }) => async (req, res, id) => {
  const token = req.headers['x-sia-auth'];
  try {
    const ctx = await auth.context(token);
    if (!ctx) return json(res, 401, { error: 'Inicia sesión.' });
    if (ctx.user.role !== 'admin') return json(res, 403, { error: 'Solo para administradores.' });
    if (id && !UUID.test(id)) return json(res, 404, { error: 'Ese usuario no existe.' });
    const jwt = ctx.accessToken;

    if (!id && req.method === 'GET') return json(res, 200, { users: await users.list(jwt) });
    if (!id && req.method === 'POST') {
      const { email, name, password, role } = await readBody(req);
      return json(res, 200, { user: await users.create(jwt, { email, name, password, role }) });
    }
    if (id && req.method === 'PUT') {
      const { name, role, active, password } = await readBody(req);
      await users.update(jwt, id, { name, role, active, password });
      if (id === ctx.user.id) auth.refreshProfile(token); // su propio nombre: que se vea ya
      return json(res, 200, { ok: true });
    }
    if (id && req.method === 'DELETE') {
      await users.remove(jwt, id);
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: 'no encontrado' });
  } catch (e) {
    if (!e.status) return json(res, 500, { error: 'Error interno.' });
    return json(res, e.status >= 500 ? 503 : e.status, { error: e.message });
  }
};
