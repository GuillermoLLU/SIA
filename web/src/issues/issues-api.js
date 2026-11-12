// Cliente de /api/issues: mi mesa, coger la siguiente, el detalle, devolverla,
// traspasarla, las notas y el histórico en SIA, el equipo (para traspasar), el
// borrador de Resolver, Escalar y cargar el CSV de la foto. `api`: el cliente del bridge (ui/api.js).

export const createIssuesApi = (api) => {
  const id = (x) => encodeURIComponent(x);
  return {
    desk: () => api('/issues'),
    next: () => api('/issues/next', { method: 'POST', body: {} }),
    teammates: async () => (await api('/issues/teammates')).teammates,
    get: (issueId) => api(`/issues/${id(issueId)}`),
    release: (issueId) => api(`/issues/${id(issueId)}/release`, { method: 'POST', body: {} }),
    // Resolver: abrirlo ({ check, draft }) y confirmarlo; el bridge lo comprueba todo
    startResolve: (issueId) => api(`/issues/${id(issueId)}/resolve`),
    resolve: (issueId, fields) => api(`/issues/${id(issueId)}/resolve`, { method: 'POST', body: fields }),
    // el borrador de Resolver, en la BBDD local: el texto y sus imágenes ({ name, type, data en base64 }, numeradas)
    saveDraft: (issueId, fields) => api(`/issues/${id(issueId)}/draft`, { method: 'PUT', body: fields }),
    saveDraftFile: (issueId, file) => api(`/issues/${id(issueId)}/draft/file`, { method: 'PUT', body: file }),
    draftFile: (issueId, n) => api(`/issues/${id(issueId)}/draft/file/${n}`),
    dropDraftFile: (issueId, n) => api(`/issues/${id(issueId)}/draft/file/${n}`, { method: 'DELETE' }),
    // Escalar: abrirlo ({ check, draft }), confirmarlo y su borrador; el bridge comprueba las notas
    startEscalate: (issueId) => api(`/issues/${id(issueId)}/escalate`),
    escalate: (issueId, fields) => api(`/issues/${id(issueId)}/escalate`, { method: 'POST', body: fields }),
    saveEscalateDraft: (issueId, fields) => api(`/issues/${id(issueId)}/escalate/draft`, { method: 'PUT', body: fields }),
    transfer: (issueId, to, comment) => api(`/issues/${id(issueId)}/transfer`, { method: 'POST', body: { to, comment } }),
    addNote: (issueId, body) => api(`/issues/${id(issueId)}/notes`, { method: 'POST', body: { body } }),
    editNote: (issueId, noteId, body) => api(`/issues/${id(issueId)}/notes/${id(noteId)}`, { method: 'PUT', body: { body } }),
    timeline: async (issueId) => (await api(`/issues/${id(issueId)}/timeline`)).timeline,
    // el fichero tal cual: el bridge lo lee en streaming
    upload: (file) => api(`/issues/csv?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file, type: 'text/csv' }),
  };
};
