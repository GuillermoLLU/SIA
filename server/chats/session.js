// El cableado de un chat sin terminal (copilot-session.js) con quien lo mira:
// wireNative engancha la sesión a la salida (out), con el texto en streaming
// por tandas, lo que lleva dicho (items, con tope) y lo que pregunta (asks);
// nativeSnapshot se lo cuenta a quien se engancha después. Un turno que acaba
// en error deja su motivo en la conversación; si es porque Copilot no tiene
// sesión iniciada, la tarjeta que lleva a iniciarla (auth.js), que luego dice
// si ya se puede seguir (native.authReady()).
//
// wireNative(native, { out, meta, onMeta, firstSay, authStatus }):
//   out(m)          → a quien mira el chat
//   meta            → { model, effort, modelVia… } de la sesión (se lee)
//   onMeta(patch)   → el modelo o el esfuerzo cambió: guardar y avisar
//   firstSay        → el primer mensaje (la pregunta de la portada, los datos de la issue), o null
//   authStatus()    → Promise de la cuenta de Copilot ({ ok, loggedIn }: providers/copilot-auth.js)
import { looksLikeAuth, authItem, authStateItem } from './auth.js';

export const NATIVE_ITEMS_CAP = 4000; // piezas de conversación que se guardan por chat
const TYPING_FLUSH_MS = 60;    // el texto en streaming se manda por tandas
const THINKING_EVERY_MS = 400;  // «está pensando»: un aviso como mucho cada tanto
const SAY_AFTER_INTERRUPT_MS = 2500; // escrito mientras preguntaba: va cuando acabe el turno, o pasado esto

// lo que la vista necesita al engancharse: la conversación que lleva y lo que está preguntando
export const nativeSnapshot = (native, send) => {
  send({ type: 'transcript', reset: true, items: native.items });
  for (const a of native.asks.values()) send(a);
};

export const wireNative = (n, { out, meta, onMeta, firstSay = null, authStatus = async () => null, flushMs = TYPING_FLUSH_MS, setTimer = setTimeout, clearTimer = clearTimeout, now = Date.now }) => {
  let typing = '';
  let typingT = null;
  let thoughtAt = 0;
  const flushTyping = () => { typingT = null; if (typing) { out({ type: 'typing', text: typing }); typing = ''; } };
  // ── sin sesión iniciada: su tarjeta en la conversación (auth.js) ──
  let lastSaid = null;    // lo último que se le mandó: si no llegó, la tarjeta ofrece reenviarlo
  let authIs = null;      // la tarjeta viva (n.auth): 'needed' | 'logged' | 'ready'
  const authState = (state) => { authIs = state; const it = authStateItem(n.auth, state); n.items.push(it); out({ type: 'transcript', items: [it] }); };
  const pushAuth = (detail) => {
    const item = authItem({ id: `auth-${now()}-${n.items.length}`, detail, retry: lastSaid });
    n.items.push(item);
    n.auth = item.id;
    authIs = 'needed';
    out({ type: 'transcript', items: [item] });
    // ¿y en el equipo sí hay sesión? Entonces no falta: este chat no la ha podido usar
    Promise.resolve(authStatus()).then((st) => { if (st?.loggedIn && n.auth === item.id && authIs === 'needed') authState('logged'); }, () => {});
  };
  // la sesión ya está (se inició en SIA, o se ha comprobado a petición): la tarjeta lo dice y ofrece seguir
  n.authReady = () => { if (!n.auth || authIs === 'ready') return false; authState('ready'); return true; };
  n.listeners.add((m) => {
    if (m.type === 'typing') { typing += m.text; if (!typingT) typingT = setTimer(flushTyping, flushMs); return; }
    if (m.type === 'thinking') { const t = now(); if (t - thoughtAt >= THINKING_EVERY_MS) { thoughtAt = t; out(m); } return; } // mientras piensa, el aviso (espaciado)
    flushTyping(); // lo que estaba escribiendo, antes de lo que venga
    if (m.type === 'transcript') {
      n.items.push(...m.items);
      if (n.items.length > NATIVE_ITEMS_CAP) n.items.splice(0, n.items.length - NATIVE_ITEMS_CAP);
    }
    else if (m.type === 'model') { if (m.model !== meta.model) onMeta({ model: m.model }); return; } // el modelo con el que va: a la sesión
    else if (m.type === 'model-via') { if (m.name !== meta.modelVia) onMeta({ modelVia: m.name }); return; } // con «Auto», el que ha contestado de verdad
    else if (m.type === 'ask') n.asks.set(m.requestId, m);
    else if (m.type === 'ask-off') n.asks.delete(m.requestId);
    else if (m.type === 'turn') { n.busy = false; n.asks.clear(); }
    out(m);
    if (m.type === 'turn' && m.error) {
      // falló por la sesión (lo dice su error): la tarjeta que lleva a iniciarla, no el error crudo
      if (looksLikeAuth(m.text)) pushAuth(m.text);
      else {
        // acabó en error: su motivo, a la conversación (si no lo ha dicho ya él), que la vista no pinta el aviso
        if (m.text && !n.items.slice(-3).some((i) => i.kind === 'text' && i.text.includes(m.text.slice(0, 60)))) {
          const note = { kind: 'text', id: `err-${now()}-${n.items.length}`, text: `⚠️ No se pudo completar: ${m.text}`, ts: null };
          n.items.push(note);
          out({ type: 'transcript', items: [note] });
        }
        // Copilot no marca el fallo de sesión: se le pregunta a su CLI si la tiene
        Promise.resolve(authStatus()).then((st) => { if (st?.ok && !st.loggedIn && !n.auth) pushAuth(m.text); }, () => {});
      }
    }
    if (m.type === 'turn' && afterTurn) flushSay(); // lo escrito mientras preguntaba, ya como turno nuevo
  });
  // escribir mientras pregunta con opciones o propone un plan y no admite
  // texto: la pregunta se descarta (interrupt) y lo escrito entra detrás,
  // cuando ese turno haya terminado
  let afterTurn = null;
  let afterTurnT = null;
  const sayNow = (text) => {
    n.busy = true;
    lastSaid = text;
    n.auth = null; // lo que se diga después de la tarjeta la deja atrás
    authIs = null;
    n.sendText(text);
  };
  const flushSay = () => { clearTimer(afterTurnT); afterTurnT = null; const text = afterTurn; afterTurn = null; if (text) sayNow(text); };
  n.say = (text) => {
    const cmd = n.command(text); // /model y /effort: los aplica SIA, sin turno que esperar
    if (cmd) { if (cmd.meta) onMeta(cmd.meta); if (!n.busy) out({ type: 'turn', error: false, text: '' }); return; }
    if (afterTurn) { afterTurn = `${afterTurn}\n${text}`; return; } // más de uno antes de que acabe: juntos
    // una pregunta que admite texto: lo escrito es su respuesta, sin mensaje nuevo
    const open = [...n.asks.values()].find((a) => a.freeform && !a.plan);
    if (open) { n.replyText(open, text); n.asks.delete(open.requestId); out({ type: 'ask-off', requestId: open.requestId }); n.busy = true; return; }
    if (n.asks.size) { afterTurn = text; n.interrupt(); afterTurnT = setTimer(flushSay, SAY_AFTER_INTERRUPT_MS); return; }
    sayNow(text);
  };
  n.answer = (requestId, { answers, allow }) => {
    const ask = n.asks.get(requestId);
    if (!ask) return;
    n.reply(ask, { answers: answers && typeof answers === 'object' ? answers : null, allow });
    n.asks.delete(requestId);
    out({ type: 'ask-off', requestId });
  };
  if (firstSay) n.say(firstSay);
};
