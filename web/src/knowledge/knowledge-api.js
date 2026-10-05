// Cliente de /api/knowledge (solo administradores): bases de la instancia
// (con sus grupos { id, name }, sin tokens) y conocimiento de cada persona.
// Errores con el texto del bridge.

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
    bases: async () => (await call('/bases')).bases,
    addBase: (base) => call('/bases', 'POST', base),
    setPowerKey: (baseId, powerKey) => call(`/bases/${id(baseId)}`, 'PUT', { powerKey }),
    removeBase: (baseId) => call(`/bases/${id(baseId)}`, 'DELETE'),
    setGroups: (userId, baseId, groups) => call(`/people/${id(userId)}/bases/${id(baseId)}`, 'PUT', { groups }),
    copy: (userId, fromId) => call(`/people/${id(userId)}/copy`, 'POST', { from: fromId }),
  };
};
