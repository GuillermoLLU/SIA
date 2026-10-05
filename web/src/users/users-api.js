// Cliente de /api/users (vista Personas): personas y roles. Los errores de reglas llegan
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
    create: (user) => call('', 'POST', user), // → { user, warning? }
    update: (id, patch) => call(`/${encodeURIComponent(id)}`, 'PUT', patch),
    remove: (id) => call(`/${encodeURIComponent(id)}`, 'DELETE'),
    roles: async () => (await call('/roles')).roles,
    saveRole: (id, role) => (id ? call(`/roles/${encodeURIComponent(id)}`, 'PUT', role) : call('/roles', 'POST', role)),
    removeRole: (id) => call(`/roles/${encodeURIComponent(id)}`, 'DELETE'),
  };
};
