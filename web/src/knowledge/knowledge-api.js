// Cliente de /api/knowledge (vista Personas): la base de la instancia con sus
// proyectos ({ id, name }, sin tokens) y el conocimiento de cada persona.
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
    base: async () => (await call('/base')).base,
    setProjects: (userId, projects) => call(`/people/${id(userId)}/projects`, 'PUT', { projects }),
    copy: (userId, fromId) => call(`/people/${id(userId)}/copy`, 'POST', { from: fromId }),
  };
};
