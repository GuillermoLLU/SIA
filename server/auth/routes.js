// /api/auth/*: el transporte HTTP del inicio de sesión. El token de sesión
// viaja en la cabecera X-SIA-Auth. onSession(token) tras entrar o abrir la
// app con sesión (carga lo asignado) y onLogout() al salir.
//   GET  me      → { user } | 401
//   POST login   { email, password, remember } → { token, user } | 401 | 429
//   POST logout  → { ok }
//   POST password { password } → { ok }   cambiar la propia (obligatorio si la puso un admin)
//   POST check   → { ok }   antes del formulario: certificados del cliente y VPN (preflight.js)
// Si la base de la instancia no responde: 503 con el motivo (y code 'certs' o
// 'vpn' + help si faltan los certificados del cliente o la VPN).

import { passwordProblem } from './password.js';
import { failed } from '../shared/http.js';

export const authRoutes = (auth, { json, readBody, onSession, onLogout, platform, preflight }) => async (req, res, action) => {
  const token = req.headers['x-sia-auth'];
  try {
    if (action === 'me' && req.method === 'GET') {
      const ctx = await auth.context(token, { fresh: true }); // al abrir la app: perfil al día
      if (!ctx) return json(res, 401, { error: 'sin sesión' });
      await onSession(token);
      return json(res, 200, { user: ctx.user });
    }
    if (action === 'login' && req.method === 'POST') {
      const { email, password, remember } = await readBody(req);
      const r = await auth.login(email, password, remember);
      if (r.wait) return json(res, 429, { error: `Demasiados intentos. Espera ${r.wait} s.`, wait: r.wait });
      if (r.error) return json(res, 401, { error: r.error });
      await onSession(r.token);
      return json(res, 200, { token: r.token, user: r.user });
    }
    if (action === 'password' && req.method === 'POST') {
      const ctx = await auth.context(token);
      if (!ctx) return json(res, 401, { error: 'Inicia sesión.' });
      const { password } = await readBody(req);
      const problem = passwordProblem(password);
      if (problem) return json(res, 400, { error: problem });
      await platform.updateOwnPassword(ctx.accessToken, password);
      await platform.rpc(ctx.accessToken, 'platform_password_changed');
      auth.refreshProfile(token);
      return json(res, 200, { ok: true });
    }
    if (action === 'check' && req.method === 'POST') {
      await preflight();
      return json(res, 200, { ok: true });
    }
    if (action === 'logout' && req.method === 'POST') {
      await auth.logout(token);
      await onLogout();
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: 'no encontrado' });
  } catch (e) {
    return failed(json, res, e);
  }
};
