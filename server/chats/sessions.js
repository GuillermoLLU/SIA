// Las sesiones de chat (dominio, sin E/S). El chat vive en el bridge: si el
// navegador se recarga o se cae el WebSocket, la sesión sigue; el cliente se
// re-engancha con `attach` y recibe lo que lleva. «Cerrar chat» manda `kill`
// explícito. Protocolo (todo JSON; bridge.js y web/src/chat/protocol.js):
//   bridge→cliente: hello (Copilot, skills, sesiones vivas y proyectos) /
//     started / transcript / typing / thinking / ask / ask-off / turn / meta /
//     auth-check / exit / gone / error / sessions
//   cliente→bridge: start / attach / say / stop / answer / auth-check / kill

// Códigos de cierre con significado para el cliente: 4409 («otro dispositivo
// tomó los chats») se distingue de una caída de red y pasa a modo pasivo.
export const CLOSE = { HANDOFF: 4409, LOCKED: 4423 };

// `attached`: algún dispositivo tiene esta sesión enganchada ahora mismo. Los
// clientes lo usan para ofrecer «usar el chat aquí» en vez de robarla.
export const sessionList = (sessions) => [...sessions.values()].map((s) => ({ id: s.id, ...s.meta, attached: !!s.ws }));

// Lo que la vista necesita saber del chat: con qué modelo y esfuerzo va,
// cuáles ofrece su cuenta y, con «Auto», el que ha contestado.
export const metaOf = ({ model = null, effort = null, modelVia = null, models = [] }) => ({ model, effort, modelVia, models });

export const pickMode = (knowledge) => (knowledge === 'demand' ? 'demand' : 'auto');

// acceso: techo del token ∩ selección del chat (sin selección, todo el techo)
export const pickProjects = (ceiling, chosen) => (Array.isArray(chosen) && chosen.length ? ceiling.filter((id) => chosen.includes(id)) : ceiling);

export const isIssueId = (id) => /^INC\d+$/.test(String(id ?? ''));

// La pregunta con la que arranca un chat (su primer mensaje), o nada.
export const PROMPT_MAX = 4000;
export const firstPrompt = (prompt) => (typeof prompt === 'string' && prompt.trim() ? prompt.trim().slice(0, PROMPT_MAX) : null);
