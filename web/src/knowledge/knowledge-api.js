// Cliente de /api/knowledge (solo administradores): bases de la instancia y
// qué grupos de cada base tiene cada usuario. Errores con el texto del bridge.

export const createKnowledgeApi = (apiBase, session) => {
  const call = async (path, method = 'GET', body) => {
    const r = await fetch(`${apiBase}/knowledge${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...session.headers() },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  };
  const id = (x) => encodeURIComponent(x);
  return {
    listBases: async () => (await call('/bases')).bases,
    addBase: (base) => call('/bases', 'POST', base),
    removeBase: (baseId) => call(`/bases/${id(baseId)}`, 'DELETE'),
    listGrants: async (userId) => (await call(`/grants/${id(userId)}`)).grants,
    grant: (g) => call('/grants', 'POST', g),
    revoke: (grantId) => call(`/grants/${id(grantId)}`, 'DELETE'),
  };
};
