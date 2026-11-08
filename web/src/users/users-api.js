// Cliente de /api/users (Equipo): personas, roles y las reglas de priorización. Los errores de reglas llegan
// como Error con el texto del bridge («Ya hay un usuario…»). `api`: ui/api.js.

export const createUsersApi = (api) => {
  const id = (x) => encodeURIComponent(x);
  return {
    list: async () => (await api('/users')).users,
    create: (user) => api('/users', { method: 'POST', body: user }), // → { user, warning? }
    update: (userId, patch) => api(`/users/${id(userId)}`, { method: 'PUT', body: patch }),
    remove: (userId) => api(`/users/${id(userId)}`, { method: 'DELETE' }),
    roles: async () => (await api('/users/roles')).roles,
    saveRole: (roleId, role) => (roleId ? api(`/users/roles/${id(roleId)}`, { method: 'PUT', body: role }) : api('/users/roles', { method: 'POST', body: role })),
    removeRole: (roleId) => api(`/users/roles/${id(roleId)}`, { method: 'DELETE' }),
    rules: async () => (await api('/users/rules')).rules,   // las de priorización, para elegir la de cada rol y persona
  };
};
