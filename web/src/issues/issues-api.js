// Cliente de /api/issues: la foto de issues ({ taken, issues }).

export const createIssuesApi = (apiBase, session) => ({
  load: async () => {
    const r = await fetch(`${apiBase}/issues`, { headers: session.headers() });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  },
});
