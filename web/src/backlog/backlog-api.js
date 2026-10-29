// Cliente de /api/backlog: la cola del equipo. `api`: el cliente del bridge (ui/api.js).

export const createBacklogApi = (api) => ({
  // → { taken, rule, rules, issues } en el orden de la regla pedida
  list: (rule) => api(`/backlog${rule ? `?rule=${encodeURIComponent(rule)}` : ''}`),
});
