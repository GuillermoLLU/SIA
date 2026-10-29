// Cliente de /api/backlog: la cola del equipo. `api`: el cliente del bridge (ui/api.js).

export const createBacklogApi = (api) => ({
  list: () => api('/backlog'),
});
