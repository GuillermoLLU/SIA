// /api/auth/*: el transporte HTTP del inicio de sesión. El token de sesión
// viaja en la cabecera X-SIA-Auth.
//   GET  me      → { user } | 401
//   POST login   { name, password, remember } → { token, user } | 401 | 429
//   POST logout  → { ok }

import { publicUser } from '../users/users.js';

export const authRoutes = (auth, { json, readBody }) => async (req, res, action) => {
  const token = req.headers['x-sia-auth'];
  if (action === 'me' && req.method === 'GET') {
    const user = auth.userOf(token);
    return user ? json(res, 200, { user: publicUser(user) }) : json(res, 401, { error: 'sin sesión' });
  }
  if (action === 'login' && req.method === 'POST') {
    const { name, password, remember } = await readBody(req);
    const r = auth.login(name, password, remember);
    if (r.wait) return json(res, 429, { error: `Demasiados intentos. Espera ${r.wait} s.`, wait: r.wait });
    if (!r.token) return json(res, 401, { error: 'Usuario o contraseña incorrectos.' });
    return json(res, 200, { token: r.token, user: publicUser(r.user) });
  }
  if (action === 'logout' && req.method === 'POST') {
    auth.logout(token);
    return json(res, 200, { ok: true });
  }
  return json(res, 404, { error: 'no encontrado' });
};
