// Cliente de /api/knowledge (Equipo): la base de la instancia con sus
// proyectos ({ id, name }, sin tokens) y el conocimiento de cada persona.
// Errores con el texto del bridge. `api`: ui/api.js.

export const createKnowledgeApi = (api) => {
  const id = (x) => encodeURIComponent(x);
  return {
    base: async () => (await api('/knowledge/base')).base,
    setProjects: (userId, projects) => api(`/knowledge/people/${id(userId)}/projects`, { method: 'PUT', body: { projects } }),
  };
};
