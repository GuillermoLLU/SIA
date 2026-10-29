// Cliente de /api/issues: mi mesa, coger la siguiente, el detalle, devolverla,
// el equipo (para traspasar), el borrador de Resolver y cargar el CSV de la foto. `api`: el cliente del bridge (ui/api.js).

export const createIssuesApi = (api) => {
  const id = (x) => encodeURIComponent(x);
  return {
    desk: () => api('/issues'),
    next: (rule) => api('/issues/next', { method: 'POST', body: { rule } }),
    teammates: async () => (await api('/issues/teammates')).teammates,
    get: (issueId) => api(`/issues/${id(issueId)}`),
    release: (issueId) => api(`/issues/${id(issueId)}/release`, { method: 'POST', body: {} }),
    // Resolver: abrirlo ({ check, draft }) y confirmarlo; el bridge lo comprueba todo
    startResolve: (issueId) => api(`/issues/${id(issueId)}/resolve`),
    resolve: (issueId, fields) => api(`/issues/${id(issueId)}/resolve`, { method: 'POST', body: fields }),
    // el borrador de Resolver, en la BBDD local: el texto y su adjunto ({ name, type, data en base64 })
    saveDraft: (issueId, fields) => api(`/issues/${id(issueId)}/draft`, { method: 'PUT', body: fields }),
    dropDraft: (issueId) => api(`/issues/${id(issueId)}/draft`, { method: 'DELETE' }),
    saveDraftFile: (issueId, file) => api(`/issues/${id(issueId)}/draft/file`, { method: 'PUT', body: file }),
    dropDraftFile: (issueId) => api(`/issues/${id(issueId)}/draft/file`, { method: 'DELETE' }),
    // el fichero tal cual: el bridge lo lee en streaming
    upload: (file) => api(`/issues/csv?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file, type: 'text/csv' }),
  };
};
