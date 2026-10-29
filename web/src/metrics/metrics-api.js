// Cliente de /api/metrics: los datos calculados, actualizarlos desde Snowflake, cargar un CSV de Remedy y
// construir la consulta de un periodo. `api`: ui/api.js.

export const createMetricsApi = (api) => ({
  load: async () => (await api('/metrics')).data,
  update: () => api('/metrics/update', { method: 'POST' }),
  // por dónde va la actualización en curso (null: ninguna)
  progress: async () => (await api('/metrics/progress')).progress,
  // cancela lo que está en marcha, si aún no ha entrado nada en la base → { cancelled }
  cancel: () => api('/metrics/cancel', { method: 'POST' }),
  // el CSV de la consulta de Remedy, tal cual (el cuerpo es el fichero) → { meta, counts }
  uploadCsv: (file, signal) => api(`/metrics/csv?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file, type: 'text/csv', signal }),
  // la consulta para copiar a Snowflake de ese periodo (desde y hasta, AAAA-MM-DD, inclusive) → texto
  sql: async (from, to) => (await api(`/metrics/sql?from=${from}&to=${to}`)).sql,
});
