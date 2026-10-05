// /api/auth/*: el transporte HTTP del inicio de sesión. El token de sesión
// viaja en la cabecera X-SIA-Auth. onSession(token) tras entrar o abrir la
// app con sesión (carga lo asignado) y onLogout() al salir.
//   GET  me      → { user } | 401
//   POST login   { email, password, remember } → { token, user } | 401 | 429
//   POST logout  → { ok }
// Si la base de la instancia no responde: 503 con el motivo.

export const authRoutes = (auth, { json, readBody, onSession, onLogout }) => async (req, res, action) => {
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
    if (action === 'logout' && req.method === 'POST') {
      await auth.logout(token);
      await onLogout();
      return json(res, 200, { ok: true });
    }
    return json(res, 404, { error: 'no encontrado' });
  } catch (e) {
    return json(res, e.status === 502 || e.status === 503 ? 503 : 500, { error: e.status ? e.message : 'Error interno.' });
  }
};
