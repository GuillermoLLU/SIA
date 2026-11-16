// /api/providers/copilot: la cuenta de Copilot (copilot-auth.js). Es de cada
// persona y no toca la base de conocimiento: solo exige sesión.
//   GET  /copilot         → { ok, loggedIn, login, via, usage } (o { ok: false, error })
//   POST /copilot/login   → arranca el login por código → { running, ok, error, url, code }
//   GET  /copilot/login   → cómo va
//   POST /copilot/cancel  → lo deja
//   POST /copilot/logout  → cierra la sesión → { ok } (o { ok: false, error })
export const providersRoutes = (copilot, { json }) => async (req, res, [provider, action]) => {
  if (provider !== 'copilot') return json(res, 404, { error: 'no encontrado' });
  if (!action && req.method === 'GET') return json(res, 200, await copilot.status());
  if (action === 'login' && req.method === 'POST') return json(res, 200, await copilot.login());
  if (action === 'login' && req.method === 'GET') return json(res, 200, copilot.progress());
  if (action === 'cancel' && req.method === 'POST') return json(res, 200, copilot.cancel());
  if (action === 'logout' && req.method === 'POST') return json(res, 200, await copilot.logout());
  return json(res, 404, { error: 'no encontrado' });
};
