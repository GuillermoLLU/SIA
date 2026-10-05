// /api/users/*: gestión de usuarios, solo para administradores (sesión en
// X-SIA-Auth).
//   GET    /             → { users }
//   POST   /             { name, password, role } → { user }
//   PUT    /:id          { name?, password?, role? } → { user }
//   DELETE /:id          → { ok }
// Errores de reglas (nombre repetido, último admin…): 400 con { error }.

import { publicUser } from './users.js';

const pick = ({ name, password, role }) => ({ name, password, role });

export const usersRoutes = (users, { json, readBody, currentUser }) => async (req, res, id) => {
  const actor = currentUser(req);
  if (!actor) return json(res, 401, { error: 'Inicia sesión.' });
  if (actor.role !== 'admin') return json(res, 403, { error: 'Solo para administradores.' });
  const reply = (r, extra) => (r.error ? json(res, 400, { error: r.error }) : json(res, 200, extra(r)));

  if (!id && req.method === 'GET') return json(res, 200, { users: users.all().map(publicUser) });
  if (!id && req.method === 'POST') return reply(users.create(pick(await readBody(req))), (r) => ({ user: publicUser(r.user) }));
  if (id && req.method === 'PUT') return reply(users.update(id, pick(await readBody(req))), (r) => ({ user: publicUser(r.user) }));
  if (id && req.method === 'DELETE') return reply(users.remove(id, actor.id), () => ({ ok: true }));
  return json(res, 404, { error: 'no encontrado' });
};
