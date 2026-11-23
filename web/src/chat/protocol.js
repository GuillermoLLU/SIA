// El protocolo con el bridge por WebSocket (sin DOM): todos los mensajes son
// JSON pequeños. Aquí, cómo se construyen los que manda la web, cómo se leen
// los del bridge y qué significa cada código de cierre.

export const msg = {
  // abrir un chat. issue: el chat ligado a esa issue; prompt: la pregunta con
  // la que arranca el Chat
  start: (knowledge, projects, { issue = null, prompt = null } = {}) =>
    ({ type: 'start', knowledge, projects, ...(issue ? { issue } : {}), ...(prompt ? { prompt } : {}) }),
  attach: (sessionId) => ({ type: 'attach', sessionId }),
  // matar la sesión propia del socket o, por el socket de control, otra
  kill: (sessionId = null) => (sessionId ? { type: 'kill', sessionId } : { type: 'kill' }),
  asset: ({ name, absPath }) => ({ type: 'asset', asset: { name, absPath } }),
  // lo escrito, parar, las respuestas a lo que pregunta (una opción por
  // pregunta, o el visto bueno a un plan) y preguntar si su cuenta ya tiene
  // sesión («Ya la he iniciado» en su tarjeta)
  say: (text) => ({ type: 'say', text }),
  stop: () => ({ type: 'stop' }),
  answer: (requestId, answers) => ({ type: 'answer', requestId, answers }),
  approve: (requestId, allow) => ({ type: 'answer', requestId, allow }),
  authCheck: () => ({ type: 'auth-check' }),
};

export const parse = (raw) => { try { return JSON.parse(raw); } catch { return null; } };

// Cierres con significado: 4423 el bridge echó el candado; 4409 otra ventana tomó los chats (handoff). Cualquier otro cierre NO significa que
// el chat haya muerto —vive en el bridge—: suspender el Mac, bloquear la
// pantalla o perder la red tumban el socket mientras el proceso sigue vivo.
export const closeReason = (code) => (code === 4423 ? 'locked' : code === 4409 ? 'handoff' : 'lost');

// Mandar por un socket solo si está abierto.
export const sendOn = (ws, m) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };
export const isOpen = (ws) => ws?.readyState === WebSocket.OPEN;
