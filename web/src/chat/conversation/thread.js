// La conversación de un chat como hilo (view.js): de las piezas que manda el
// bridge (server/chats/copilot.js) salen las filas que se pintan. Cada
// herramienta se junta con su resultado y las que van seguidas se agrupan en
// un solo bloque plegable, para que las respuestas no se pierdan entre
// «Leyó…», «Editó…». De lo que escribe la persona se sacan los adjuntos (las
// rutas a uploads/ que la caja pone al adjuntar), para enseñarlos aparte.
// Dominio puro.
//   { kind: 'user', id, text, files: [nombre] }
//   { kind: 'text', id, text }
//   { kind: 'tools', id, tools: [{ id, name, summary, detail, result, error, done }] }
//   { kind: 'ask', id, ask?, plan?, result, done }   lo que pregunta (opciones o
//     un plan que aprobar), en su propia tarjeta (ask.js)
//   { kind: 'auth', id, detail, retry, state, live }   Copilot no tiene sesión
//     iniciada (server/chats/auth.js). state: 'needed' (falta) | 'logged' (en el
//     equipo sí hay: el chat no la ha podido usar) | 'ready' (ya está: se puede
//     seguir). live: es lo último que ha pasado (nada se ha escrito después):
//     solo entonces lleva sus botones

// una ruta a uploads/ (con espacios en las carpetas: «Application Support»)
const UPLOAD = /(^|\s)\/(?:[^\n/]+\/)*?uploads\/([^\s/]+\.[a-z0-9]{2,5})(?=\s|$)/gi;

export const uploadsOf = (text) => {
  const files = [];
  const rest = text.replace(UPLOAD, (_m, lead, name) => { files.push(name); return lead; }).replace(/[ \t]{2,}/g, ' ').trim();
  return { text: rest, files };
};

export const threadOf = (items) => {
  const results = new Map(items.filter((i) => i.kind === 'result').map((r) => [r.id, r]));
  const authStates = new Map(items.filter((i) => i.kind === 'auth-state').map((a) => [a.id, a.state])); // el último de cada una
  const lastAuth = items.findLast((i) => i.kind === 'auth' || (i.kind === 'user' && !i.local)); // lo enviado y sin eco (el que no llegó) no la deja atrás
  const rows = [];
  for (const it of items) {
    if (it.kind === 'auth') { rows.push({ kind: 'auth', id: it.id, detail: it.detail || '', retry: it.retry || null, state: authStates.get(it.id) || 'needed', live: it === lastAuth }); continue; }
    if (it.kind === 'user') rows.push({ kind: 'user', id: it.id, ...uploadsOf(it.text), ...(it.local ? { local: true } : {}) });
    else if (it.kind === 'text') rows.push({ kind: 'text', id: it.id, text: it.text });
    else if (it.kind === 'tool') {
      const r = results.get(it.id);
      if (it.ask || it.plan) { rows.push({ kind: 'ask', id: it.id, ask: it.ask, plan: it.plan, result: r?.text ?? '', done: !!r }); continue; }
      const tool = { id: it.id, name: it.name, summary: it.summary, detail: it.detail, result: r?.text ?? '', error: !!r?.error, done: !!r };
      const last = rows.at(-1);
      if (last?.kind === 'tools') last.tools.push(tool);
      else rows.push({ kind: 'tools', id: `tools:${it.id}`, tools: [tool] });
    }
  }
  return rows;
};

// una firma de la fila: si no cambia, no hace falta repintarla
export const rowSig = (row) => JSON.stringify(row);

// Lo que se acaba de enviar, antes de que el bridge lo devuelva como pieza
// de la conversación (Copilot lo repite al recibirlo, y tarda: al abrir el
// chat, lo que tarde en arrancar): se pinta ya, optimista, al final del hilo,
// y se quita en cuanto llega la pieza de verdad con el mismo texto. Los que
// nadie devuelve en un buen rato (LOCAL_MAX_MS) se dan por perdidos.
export const LOCAL_MAX_MS = 120_000;
let localSeq = 0;
export const localItem = (text, now = Date.now()) => ({ kind: 'user', id: `local:${++localSeq}`, text, local: true, at: now });
export const settleLocal = (locals, incoming, now = Date.now()) => {
  let rest = locals.filter((l) => now - l.at < LOCAL_MAX_MS);
  for (const it of incoming) {
    if (it.kind !== 'user') continue;
    const i = rest.findIndex((l) => l.text.trim() === String(it.text || '').trim());
    if (i >= 0) rest = [...rest.slice(0, i), ...rest.slice(i + 1)];
  }
  return rest;
};
