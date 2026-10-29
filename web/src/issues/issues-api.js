// Cliente de /api/issues: mi mesa, coger la siguiente, el detalle, devolverla,
// traspasarla, las notas y el histórico en SIA, el equipo (para traspasar) y
// cargar el CSV de la foto. `api`: el cliente del bridge (ui/api.js).

export const createIssuesApi = (api) => {
  const id = (x) => encodeURIComponent(x);
  return {
    desk: () => api('/issues'),
    next: (rule) => api('/issues/next', { method: 'POST', body: { rule } }),
    teammates: async () => (await api('/issues/teammates')).teammates,
    get: (issueId) => api(`/issues/${id(issueId)}`),
    release: (issueId) => api(`/issues/${id(issueId)}/release`, { method: 'POST', body: {} }),
    transfer: (issueId, to, comment) => api(`/issues/${id(issueId)}/transfer`, { method: 'POST', body: { to, comment } }),
    addNote: (issueId, body) => api(`/issues/${id(issueId)}/notes`, { method: 'POST', body: { body } }),
    timeline: async (issueId) => (await api(`/issues/${id(issueId)}/timeline`)).timeline,
    // el fichero tal cual: el bridge lo lee en streaming
    upload: (file) => api(`/issues/csv?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file, type: 'text/csv' }),
  };
};
