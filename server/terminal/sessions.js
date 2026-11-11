// Las sesiones de chat (dominio, sin E/S). El PTY vive en el bridge: si el
// navegador se recarga o se cae el WebSocket, la sesión sigue; el cliente se
// re-engancha con `attach` y recibe el scrollback. «Cerrar chat» manda `kill`
// explícito. Protocolo (todo JSON): bridge→cliente: launchers / started /
// history / data / exit / gone / error / sessions / theme · cliente→bridge:
// start / attach / input / resize / asset / kill.

// Códigos de cierre con significado para el cliente: 4409 («otro dispositivo
// tomó los chats») se distingue de una caída de red y pasa a modo pasivo.
export const CLOSE = { HANDOFF: 4409, LOCKED: 4423 };

export const BUFFER_CAP = 400_000; // ~400 KB de scrollback por sesión
export const MAX_ASSETS = 100;

// El scrollback, recortado al 75 % del tope cuando lo pasa.
export const appendBuffer = (buffer, data, cap = BUFFER_CAP) => {
  const b = buffer + data;
  return b.length > cap ? b.slice(-Math.floor(cap * 0.75)) : b;
};

// `attached`: algún dispositivo tiene esta sesión enganchada ahora mismo. Los
// clientes lo usan para ofrecer «usar el chat aquí» en vez de robarla.
export const sessionList = (sessions) => [...sessions.values()].map((s) => ({ id: s.id, ...s.meta, assets: s.assets, attached: !!s.ws }));

export const pickMode = (knowledge) => (knowledge === 'demand' ? 'demand' : 'auto');

// acceso: techo del token ∩ selección del chat (sin selección, todo el techo)
export const pickProjects = (ceiling, chosen) => (Array.isArray(chosen) && chosen.length ? ceiling.filter((id) => chosen.includes(id)) : ceiling);

export const isIssueId = (id) => /^INC\d+$/.test(String(id ?? ''));

// La pregunta con la que arranca un chat (el primer mensaje al CLI), o nada.
export const PROMPT_MAX = 4000;
export const firstPrompt = (prompt) => (typeof prompt === 'string' && prompt.trim() ? prompt.trim().slice(0, PROMPT_MAX) : null);

// Un adjunto anunciado por un cliente, acotado; null si no vale.
export const assetFrom = (msg) => (msg?.name && msg?.absPath ? { name: String(msg.name).slice(0, 80), absPath: String(msg.absPath) } : null);
