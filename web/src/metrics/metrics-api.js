// Cliente de /api/metrics: los datos calculados y cargar un CSV nuevo.

export const createMetricsApi = (apiBase, session) => {
  const call = async (path, init = {}) => {
    const r = await fetch(`${apiBase}/metrics${path}`, { ...init, headers: { ...init.headers, ...session.headers() } });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  };
  return {
    load: async () => (await call('')).data,
    // el fichero tal cual: el bridge lo lee en streaming
    upload: (file) => call(`/csv?name=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'Content-Type': 'text/csv' }, body: file }),
  };
};
