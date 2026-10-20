// Dónde está el bridge. La app Electron pasa los puertos por query (?ws=&api=).
// Desde el móvil la web la sirve el propio bridge (mismo origen). En navegador
// (dev) se sondean los pares candidatos hasta dar con un SIA vivo.

export const PORT_PAIRS = [[57413, 57414], [58527, 58528], [59641, 59642]];

export const bridgeFromQuery = (q) => (q.get('ws') && q.get('api')
  ? { wsUrl: `ws://localhost:${q.get('ws')}`, apiBase: `http://localhost:${q.get('api')}/api` }
  : null);

// MÓVIL: la web servida por el bridge en la red local (o por el túnel), no en localhost.
export const isPhoneLocation = (loc) => loc.protocol.startsWith('http') && !['localhost', '127.0.0.1'].includes(loc.hostname);

// Se pregunta a todos los pares y se prefiere el bridge de DESARROLLO (el de
// node dev.mjs). Con una app SIA instalada y abierta, el primer par es el
// suyo: quedarse con «el primero que responde» enganchaba la web de dev a un
// bridge de otra versión, y lo nuevo parecía no funcionar. Sin ninguno a la
// vista, el primer par (reintentos al abrir chats).
export const pickBridge = (found) => found.find((f) => f.dev) || found[0] || { w: PORT_PAIRS[0][0], a: PORT_PAIRS[0][1] };

export const discoverBridge = async (fetch = globalThis.fetch) => {
  const found = (await Promise.all(PORT_PAIRS.map(async ([w, a]) => {
    try {
      const p = await (await fetch(`http://localhost:${a}/api/ping`, { signal: AbortSignal.timeout(900) })).json();
      return p.sia ? { w, a, dev: p.dev === true } : null;
    } catch { return null; }
  }))).filter(Boolean);
  const pick = pickBridge(found);
  return { wsUrl: `ws://localhost:${pick.w}`, apiBase: `http://localhost:${pick.a}/api` };
};
