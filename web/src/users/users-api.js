// Cliente de /api/users (solo administradores). Los errores de reglas llegan
// como Error con el texto del bridge («Ya hay un usuario…»).

export const createUsersApi = (apiBase, session) => {
  const call = async (path, method = 'GET', body) => {
    const r = await fetch(`${apiBase}/users${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...session.headers() },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  };
  return {
    list: async () => (await call('')).users,
    create: async (user) => (await call('', 'POST', user)).user,
    update: (id, patch) => call(`/${encodeURIComponent(id)}`, 'PUT', patch),
    remove: (id) => call(`/${encodeURIComponent(id)}`, 'DELETE'),
  };
};
