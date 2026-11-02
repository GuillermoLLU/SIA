// El protocolo con el bridge por WebSocket (sin DOM): todos los mensajes son
// JSON pequeños. Aquí, cómo se construyen los que manda la web, cómo se leen
// los del bridge y qué significa cada código de cierre.

export const msg = {
  // lanzar un CLI en una sesión nueva. issue: el chat ligado a esa issue;
  // prompt: la pregunta con la que arranca el Chat
  start: (launcher, knowledge, projects, cols, rows, { issue = null, prompt = null } = {}) =>
    ({ type: 'start', launcher, knowledge, projects, cols, rows, ...(issue ? { issue } : {}), ...(prompt ? { prompt } : {}) }),
  attach: (sessionId) => ({ type: 'attach', sessionId }),
  input: (data) => ({ type: 'input', data }),
  resize: (cols, rows) => ({ type: 'resize', cols, rows }),
  // matar la sesión propia del socket o, por el socket de control, otra
  kill: (sessionId = null) => (sessionId ? { type: 'kill', sessionId } : { type: 'kill' }),
  asset: ({ name, absPath }) => ({ type: 'asset', asset: { name, absPath } }),
};

export const parse = (raw) => { try { return JSON.parse(raw); } catch { return null; } };

// Cierres con significado: 4423 el bridge echó el candado; 4409 otra ventana tomó los chats (handoff). Cualquier otro cierre NO significa que
// el chat haya muerto —el PTY vive en el bridge—: suspender el Mac, bloquear
// la pantalla o perder la red tumban el socket mientras el proceso sigue vivo.
export const closeReason = (code) => (code === 4423 ? 'locked' : code === 4409 ? 'handoff' : 'lost');

// Mandar por un socket solo si está abierto.
export const sendOn = (ws, m) => { if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); };
export const isOpen = (ws) => ws?.readyState === WebSocket.OPEN;
