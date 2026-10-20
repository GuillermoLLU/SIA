// /api/users/*: gestión de usuarios (sesión en X-SIA-Auth; la vista Personas
// la exige el bridge antes de llegar aquí). La base vuelve a comprobarlo todo
// con el JWT de quien llama.
//   GET    /      → { users }
//   POST   /      { email, name, password, role, projects? } → { user, warning? }
//                 projects = [ids]: los proyectos que verá desde el alta
//   PUT    /:id   { name?, role?, views?, active?, password? } → { ok }
//                 role: id de rol (pone sus vistas); views sueltas: personalizado
//   DELETE /:id   → { ok }
//   GET    /roles → { roles }      POST /roles { name, views } → { id }
//   PUT    /roles/:id { name, views } → { ok }   (cambia a quien lo tiene)
//   DELETE /roles/:id → { ok }      (quien lo tenía se queda con sus vistas)
// Los errores de la base o de la función llegan con su estado y su texto.
// syncKeys(jwt, id | null, { drop }) pone al día las claves de poder en la
// base (las vistas) tras cambiar el rol, las vistas o el acceso de alguien, o
// un rol (null: de todos), y las quita antes de borrar a alguien; si algo
// falla, se avisa en `warning`.

import { isUuid } from '../shared/ids.js';
import { keysWarning } from '../knowledge/person-keys.js';
import { failed } from '../shared/http.js';

export const usersRoutes = (users, auth, { json, readBody, assignKnowledge, syncKeys }) => async (req, res, [id, sub]) => {
  const token = req.headers['x-sia-auth'];
  try {
    const ctx = await auth.context(token);
    if (!ctx) return json(res, 401, { error: 'Inicia sesión.' });
    const jwt = ctx.accessToken;
    if (id === 'roles') {
      if (sub && !isUuid(sub)) return json(res, 404, { error: 'Ese rol no existe.' });
      if (!sub && req.method === 'GET') return json(res, 200, { roles: await users.roles(jwt) });
      if (!sub && req.method === 'POST') { const { name, views } = await readBody(req); return json(res, 200, { id: await users.saveRole(jwt, null, { name, views }) }); }
      if (sub && req.method === 'PUT') {
        const { name, views } = await readBody(req);
        await users.saveRole(jwt, sub, { name, views });
        return json(res, 200, { ok: true, ...keysWarning(await syncKeys(jwt, null)) });
      }
      if (sub && req.method === 'DELETE') { await users.removeRole(jwt, sub); return json(res, 200, { ok: true }); }
      return json(res, 404, { error: 'no encontrado' });
    }
    if (id && !isUuid(id)) return json(res, 404, { error: 'Ese usuario no existe.' });

    if (!id && req.method === 'GET') return json(res, 200, { users: await users.list(jwt) });
    if (!id && req.method === 'POST') {
      const { email, name, password, role, projects } = await readBody(req);
      const user = await users.create(jwt, { email, name, password, role });
      // los proyectos elegidos en el alta; la persona ya existe: si algo
      // falla se avisa, no se deshace el alta
      let assignError = null;
      if (Array.isArray(projects) && projects.length) {
        try { await assignKnowledge(jwt, user.id, projects); } catch (e) { assignError = e.message; }
      }
      const keys = keysWarning(await syncKeys(jwt, user.id));
      return json(res, 200, { user, ...(assignError ? { warning: `Creada, pero no se pudo asignar su conocimiento: ${assignError}` } : keys) });
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
    return failed(json, res, e);
  }
};
