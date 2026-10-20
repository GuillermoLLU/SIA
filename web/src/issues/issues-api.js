// Cliente de /api/issues: mi mesa, coger la siguiente, el detalle, devolverla
// y el equipo (para traspasar). `api`: el cliente del bridge (ui/api.js).

export const createIssuesApi = (api) => {
  const id = (x) => encodeURIComponent(x);
  return {
    desk: () => api('/issues'),
    next: (rule) => api('/issues/next', { method: 'POST', body: { rule } }),
    teammates: async () => (await api('/issues/teammates')).teammates,
    get: (issueId) => api(`/issues/${id(issueId)}`),
    release: (issueId) => api(`/issues/${id(issueId)}/release`, { method: 'POST', body: {} }),
  };
};
