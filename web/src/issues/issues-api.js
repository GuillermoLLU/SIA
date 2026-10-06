// Cliente de /api/issues: mi mesa, coger la siguiente, el detalle, devolverla
// y el equipo (para traspasar).

export const createIssuesApi = (apiBase, session) => {
  const call = async (path, method = 'GET', body) => {
    const r = await fetch(`${apiBase}/issues${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...session.headers() },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error || `HTTP ${r.status}`);
    return data;
  };
  const id = (x) => encodeURIComponent(x);
  return {
    desk: () => call(''),
    next: (rule) => call('/next', 'POST', { rule }),
    teammates: async () => (await call('/teammates')).teammates,
    get: (issueId) => call(`/${id(issueId)}`),
    release: (issueId) => call(`/${id(issueId)}/release`, 'POST', {}),
  };
};
