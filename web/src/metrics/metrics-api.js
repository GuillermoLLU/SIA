// Cliente de /api/metrics: los datos calculados y actualizarlos desde Snowflake. `api`: ui/api.js.

export const createMetricsApi = (api) => ({
  load: async () => (await api('/metrics')).data,
  update: () => api('/metrics/update', { method: 'POST' }),
  // por dónde va la actualización en curso (null: ninguna)
  progress: async () => (await api('/metrics/progress')).progress,
});
