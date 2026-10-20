// Los puertos del bridge: pares [ws, api] poco comunes, con alternativas. Si
// en un par ya vive un SIA DE ESTA MISMA VERSIÓN, se adopta (la UI hablará
// con él); si es de otra versión o el par está ocupado por otra cosa, se
// salta al siguiente. La versión importa: un bridge viejo que se quedó
// abierto (un `node dev.mjs` olvidado, una app sin cerrar) respondería a la
// app nueva con su código y su número de versión antiguos, y desde fuera
// parecería que la actualización no se ha instalado.
import net from 'node:net';

export const PORT_PAIRS = [[57413, 57414], [58527, 58528], [59641, 59642]];

export const isFree = (port) => new Promise((resolve) => {
  const probe = net.createServer()
    .once('error', () => resolve(false))
    .once('listening', () => probe.close(() => resolve(true)));
  probe.listen(port, '0.0.0.0');
});

// ¿Vive un SIA en ese puerto de API? Devuelve su versión ('' si es tan antiguo
// que el ping aún no la decía) o null si ahí no hay ningún SIA.
export const siaAt = async (apiPort) => {
  try {
    const r = await fetch(`http://127.0.0.1:${apiPort}/api/ping`, { signal: AbortSignal.timeout(800) });
    const p = await r.json();
    return p.sia === true ? String(p.version || '') : null;
  } catch { return null; }
};

// El par a usar. `forced`: SIA_PORT (y api = ws + 1). → { ws, api }
export const choosePair = async (version, { forced, pairs = PORT_PAIRS, probe = siaAt, free = isFree, log = console } = {}) => {
  if (forced) return { ws: Number(forced), api: Number(forced) + 1 };
  for (const [ws, api] of pairs) {
    const running = await probe(api);
    if (running === version) { log.log(`[sia] bridge v${running} ya activo en ${ws}/${api} — esta instancia lo reutiliza`); return { ws, api }; }
    if (running !== null) { log.warn(`[sia] en ${ws}/${api} hay un SIA de otra versión (${running ? `v${running}` : 'anterior'}) y esta es la v${version} — no se adopta; probando el siguiente par`); continue; }
    if (await free(ws) && await free(api)) return { ws, api };
    log.warn(`[sia] par ${ws}/${api} ocupado por otro proceso — probando el siguiente`);
  }
  log.warn('[sia] sin pares libres — intentando el primero igualmente');
  return { ws: pairs[0][0], api: pairs[0][1] };
};
