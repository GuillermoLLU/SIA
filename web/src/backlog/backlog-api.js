// Cliente de /api/backlog: la cola del equipo, el detalle de una issue (para
// asignarla) y las reglas de priorización.
// `api`: el cliente del bridge (ui/api.js).

export const createBacklogApi = (api) => ({
  // → { taken, rule, rules, issues } en el orden de la regla pedida
  list: (rule) => api(`/backlog${rule ? `?rule=${encodeURIComponent(rule)}` : ''}`),
  // → { issue, claimedBy }
  get: (id) => api(`/backlog/${encodeURIComponent(id)}`),
  people: async () => (await api('/backlog/people')).people,
  assign: (id, to) => api(`/backlog/${encodeURIComponent(id)}/assign`, { method: 'POST', body: { to } }),
  // → { criteria, rules }: el catálogo de criterios y las reglas con los suyos
  rules: () => api('/backlog/rules'),
  // crear (id null) o cambiar → { id }
  saveRule: (id, rule) => (id ? api(`/backlog/rules/${encodeURIComponent(id)}`, { method: 'PUT', body: rule }) : api('/backlog/rules', { method: 'POST', body: rule })),
  deleteRule: (id) => api(`/backlog/rules/${encodeURIComponent(id)}`, { method: 'DELETE' }),
});
