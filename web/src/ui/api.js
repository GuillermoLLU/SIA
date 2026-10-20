// El cliente de la API del bridge, uno para toda la web: cada llamada manda y
// recibe JSON, lleva las cabeceras de la sesión y, si el bridge responde con
// error, lo lanza con su texto, su estado y lo que vino en el cuerpo (p. ej.
// los segundos de espera de un 429). onReply(status, data) ve cada respuesta
// antes: es donde la app reacciona a una sesión caducada o al candado.
export const createApi = (apiBase, headers, { onReply = () => {}, fetch = globalThis.fetch } = {}) =>
  async (path, { method = 'GET', body, type = 'application/json', timeoutMs } = {}) => {
    const r = await fetch(`${apiBase}${path}`, {
      method,
      headers: { ...(body === undefined ? {} : { 'Content-Type': type }), ...headers() },
      ...(body === undefined ? {} : { body: type === 'application/json' ? JSON.stringify(body) : body }),
      ...(timeoutMs ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    });
    const data = await r.json().catch(() => ({}));
    onReply(r.status, data);
    if (!r.ok) throw Object.assign(new Error(data.error || `HTTP ${r.status}`), { status: r.status, data });
    return data;
  };
