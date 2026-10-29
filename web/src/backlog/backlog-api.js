// Cliente de /api/backlog: la cola del equipo y las reglas de priorización.
// `api`: el cliente del bridge (ui/api.js).

export const createBacklogApi = (api) => ({
  // → { taken, rule, rules, issues } en el orden de la regla pedida
  list: (rule) => api(`/backlog${rule ? `?rule=${encodeURIComponent(rule)}` : ''}`),
  // → { criteria, rules }: el catálogo de criterios y las reglas con los suyos
  rules: () => api('/backlog/rules'),
  // crear (id null) o cambiar → { id }
  saveRule: (id, rule) => (id ? api(`/backlog/rules/${encodeURIComponent(id)}`, { method: 'PUT', body: rule }) : api('/backlog/rules', { method: 'POST', body: rule })),
  deleteRule: (id) => api(`/backlog/rules/${encodeURIComponent(id)}`, { method: 'DELETE' }),
});
