// Lo que Copilot pregunta (opciones de ask_user, aprobar un plan) y cómo se
// contesta desde la tarjeta (cards.js): una pregunta de una respuesta, con un
// clic; de varias, eligiendo y «Enviar respuestas»; el plan, aprobándolo o
// no. Dominio puro.

const MAX_QUESTIONS = 4;

// ¿se puede contestar desde la tarjeta? (preguntas con opciones)
export const answerable = (ask) => Array.isArray(ask) && ask.length > 0 && ask.length <= MAX_QUESTIONS
  && ask.every((q) => q.options.length > 0);

// ¿con un clic? (una pregunta, una respuesta)
export const instant = (ask) => answerable(ask) && ask.length === 1 && !ask[0].multi;

// ¿está todo contestado? picks: por pregunta, los índices elegidos
export const complete = (ask, picks) => ask.every((q, n) => (picks[n]?.length ?? 0) > 0 && (q.multi || picks[n].length === 1));

// las respuestas por pregunta (las de varias, juntas con comas), como las espera el bridge
export const answerMap = (ask, picks) => Object.fromEntries(ask.map((q, n) => [q.question, (picks[n] || []).map((i) => q.options[i]?.label ?? '').filter(Boolean).join(', ')]));

// lo que se contestó, de lo que anota el bridge al recibirlo
// («"¿pregunta?"="respuesta"»): [{ question, answer }]; si no se entiende
// (p. ej. se descartó), nada
export const answersOf = (result) => [...String(result || '').matchAll(/"([^"]*)"="([^"]*)"/g)]
  .map((m) => ({ question: m[1], answer: m[2] }));
