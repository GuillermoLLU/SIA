// Cliente de /api/metrics: los datos calculados y cargar un CSV nuevo. `api`: ui/api.js.

export const createMetricsApi = (api) => ({
  load: async () => (await api('/metrics')).data,
  // el fichero tal cual: el bridge lo lee en streaming
  upload: (file) => api(`/metrics/csv?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file, type: 'text/csv' }),
});
