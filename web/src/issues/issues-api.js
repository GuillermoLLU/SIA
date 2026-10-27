// Cliente de /api/issues: mi mesa, coger la siguiente, el detalle, devolverla,
// el equipo (para traspasar) y cargar el CSV de la foto. `api`: el cliente del bridge (ui/api.js).

export const createIssuesApi = (api) => {
  const id = (x) => encodeURIComponent(x);
  return {
    desk: () => api('/issues'),
    next: (rule) => api('/issues/next', { method: 'POST', body: { rule } }),
    teammates: async () => (await api('/issues/teammates')).teammates,
    get: (issueId) => api(`/issues/${id(issueId)}`),
    release: (issueId) => api(`/issues/${id(issueId)}/release`, { method: 'POST', body: {} }),
    // el fichero tal cual: el bridge lo lee en streaming
    upload: (file) => api(`/issues/csv?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file, type: 'text/csv' }),
  };
};
