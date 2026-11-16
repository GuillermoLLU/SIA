import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wireNative, nativeSnapshot, NATIVE_ITEMS_CAP } from './session.js';

// una sesión de mentira con la cara de copilot-session.js
const fakeNative = () => {
  const sent = [];
  const replies = [];
  const n = {
    busy: false, items: [], asks: new Map(), listeners: new Set(), say: null, answer: null,
    sendText: (t) => sent.push(t), interrupt: () => {}, reply: (ask, r) => replies.push([ask.requestId, r]), replyText: (ask, t) => replies.push([ask.requestId, t]), command: () => null,
  };
  return { n, sent, replies, emit: (m) => { for (const cb of n.listeners) cb(m); } };
};
const wire = (n, extra = {}) => {
  const out = [];
  const metas = [];
  const timers = [];
  wireNative(n, { out: (m) => out.push(m), meta: { model: 'm0', effort: null }, onMeta: (p) => metas.push(p), setTimer: (fn) => { timers.push(fn); return 1; }, clearTimer: () => {}, ...extra });
  return { out, metas, flush: () => { for (const t of timers.splice(0)) t(); } };
};
const settle = () => new Promise((r) => setTimeout(r, 0));

test('el texto en streaming va por tandas y sale antes de lo siguiente', () => {
  const { n, emit } = fakeNative();
  const { out, flush } = wire(n);
  emit({ type: 'typing', text: 'Ho' });
  emit({ type: 'typing', text: 'la' });
  assert.deepEqual(out, []);
  flush();
  assert.deepEqual(out, [{ type: 'typing', text: 'Hola' }]);
  emit({ type: 'typing', text: '!' });
  emit({ type: 'turn', error: false, text: '' });
  assert.deepEqual(out.slice(1), [{ type: 'typing', text: '!' }, { type: 'turn', error: false, text: '' }]);
});

test('lo dicho se guarda (con tope), lo preguntado se recuerda y se contesta en la sesión', () => {
  const { n, emit, replies } = fakeNative();
  const { out } = wire(n);
  emit({ type: 'transcript', items: [{ kind: 'text', text: 'a' }] });
  assert.equal(n.items.length, 1);
  emit({ type: 'transcript', items: Array.from({ length: NATIVE_ITEMS_CAP + 5 }, (_, i) => ({ kind: 'text', text: String(i) })) });
  assert.equal(n.items.length, NATIVE_ITEMS_CAP);
  emit({ type: 'ask', requestId: 'r1', toolUseId: 't1', input: { q: 1 } });
  assert.ok(n.asks.has('r1'));
  n.answer('r1', { allow: true });
  assert.equal(n.asks.has('r1'), false);
  assert.deepEqual(replies, [['r1', { answers: null, allow: true }]]);
  assert.deepEqual(out.at(-1), { type: 'ask-off', requestId: 'r1' });
  n.answer('nope', { allow: true }); // desconocida: nada
  assert.equal(replies.length, 1);
  const snap = [];
  nativeSnapshot(n, (m) => snap.push(m));
  assert.deepEqual(snap, [{ type: 'transcript', reset: true, items: n.items }]);
});

test('«está pensando» sale espaciado, no por cada trozo', () => {
  const { n, emit } = fakeNative();
  let t = 1000;
  const { out } = wire(n, { now: () => t });
  emit({ type: 'thinking' }); emit({ type: 'thinking' });
  t += 100; emit({ type: 'thinking' });
  t += 400; emit({ type: 'thinking' });
  assert.deepEqual(out, [{ type: 'thinking' }, { type: 'thinking' }]);
});

test('escribir mientras pregunta con opciones: se descarta la pregunta y lo escrito va al acabar el turno', () => {
  const { n, emit, sent } = fakeNative();
  let interrupted = 0;
  n.interrupt = () => { interrupted++; };
  const { out, flush } = wire(n);
  emit({ type: 'ask', requestId: 'r1', toolUseId: 't1', input: {}, freeform: false });
  n.say('ninguna, mejor verde');
  n.say('y en una frase');
  assert.equal(interrupted, 1);
  assert.deepEqual(sent, []); // todavía no: Copilot está terminando
  emit({ type: 'ask-off', requestId: 'r1' });
  emit({ type: 'turn', error: false, text: '' });
  assert.deepEqual(sent, ['ninguna, mejor verde\ny en una frase']);
  assert.equal(n.busy, true);
  assert.deepEqual(out.at(-1), { type: 'turn', error: false, text: '' });
  flush(); // el plazo de seguridad ya no manda nada
  assert.equal(sent.length, 1);
});

test('si el turno no acaba, lo escrito sale igualmente pasado el plazo', () => {
  const { n, emit, sent } = fakeNative();
  const { flush } = wire(n);
  emit({ type: 'ask', requestId: 'r1', toolUseId: 't1', input: {}, freeform: false });
  n.say('hola');
  assert.deepEqual(sent, []);
  flush();
  assert.deepEqual(sent, ['hola']);
});

test('una pregunta que admite texto: lo escrito la contesta, sin mensaje nuevo', () => {
  const { n, emit, sent, replies } = fakeNative();
  const { out } = wire(n);
  emit({ type: 'ask', requestId: 'r1', toolUseId: 't1', input: {}, freeform: true });
  n.say('el morado');
  assert.deepEqual(replies, [['r1', 'el morado']]);
  assert.deepEqual(sent, []);
  assert.equal(n.asks.size, 0);
  assert.deepEqual(out.at(-1), { type: 'ask-off', requestId: 'r1' });
  assert.equal(n.busy, true);
});

test('decir algo marca ocupado y va a la sesión; un comando lo aplica SIA sin turno; el modelo nuevo se avisa una vez', () => {
  const { n, emit, sent } = fakeNative();
  n.command = (t) => (t === '/effort high' ? { meta: { effort: 'high' } } : null);
  const { metas, out } = wire(n);
  n.say('/effort high');
  assert.equal(n.busy, false);
  assert.deepEqual(metas, [{ effort: 'high' }]);
  assert.deepEqual(out, [{ type: 'turn', error: false, text: '' }]); // la vista deja de esperar respuesta
  n.say('hola');
  assert.equal(n.busy, true);
  assert.deepEqual(sent, ['hola']);
  emit({ type: 'model', model: 'm0' });
  emit({ type: 'model', model: 'm1' });
  emit({ type: 'model-via', name: 'GPT-6 Luna' });
  assert.deepEqual(metas, [{ effort: 'high' }, { model: 'm1' }, { modelVia: 'GPT-6 Luna' }]);
  assert.equal(out.length, 1); // el modelo no va a la vista como mensaje
  emit({ type: 'turn', error: false, text: '' });
  assert.equal(n.busy, false);
});

test('el primer mensaje se manda al cablear', () => {
  const { n, sent } = fakeNative();
  wire(n, { firstSay: 'Incidencia INC1…' });
  assert.deepEqual(sent, ['Incidencia INC1…']);
  assert.equal(n.busy, true);
});

test('el primer mensaje de una issue: sus datos al modelo y, en la conversación, su línea', () => {
  const { n, sent } = fakeNative();
  n.sendText = (t, display) => sent.push([t, display]);
  wire(n, { firstSay: { text: 'Datos de INC1…', display: 'Vamos a trabajar la incidencia INC1' } });
  assert.deepEqual(sent, [['Datos de INC1…', 'Vamos a trabajar la incidencia INC1']]);
  assert.equal(n.busy, true);
});

test('un turno que acaba en error deja su motivo en la conversación, salvo que ya lo haya dicho él', () => {
  const { n, emit } = fakeNative();
  const { out } = wire(n, { authStatus: async () => ({ ok: true, loggedIn: true }) });
  emit({ type: 'turn', error: true, text: 'Sin cupo hasta mañana' });
  assert.equal(out.at(-1).type, 'transcript');
  assert.equal(out.at(-1).items[0].text, '⚠️ No se pudo completar: Sin cupo hasta mañana');
  assert.equal(n.items.at(-1).kind, 'text'); // y queda para quien se enganche después
  emit({ type: 'transcript', items: [{ kind: 'text', id: 'a', text: 'API Error: 529 overloaded' }] });
  const before = out.length;
  emit({ type: 'turn', error: true, text: 'API Error: 529 overloaded' });
  assert.equal(out.length, before + 1);
});

// ── sin sesión iniciada: la tarjeta que lleva a Proveedores IA ──
const kinds = (n) => n.items.map((i) => (i.kind === 'auth-state' ? `state:${i.state}` : i.kind));

test('un mensaje que falla por la sesión: la tarjeta (con lo que no llegó) y no el error crudo', async () => {
  const { n, emit } = fakeNative();
  const { out } = wire(n, { authStatus: async () => ({ ok: true, loggedIn: false }) });
  n.say('hola');
  emit({ type: 'transcript', items: [{ kind: 'user', id: 'u1', text: 'hola' }] });
  emit({ type: 'turn', error: true, text: 'Not logged in · Please run /login' });
  await settle();
  assert.deepEqual(kinds(n), ['user', 'auth']);
  assert.equal(n.items[1].retry, 'hola');
  assert.equal(n.items[1].detail, 'Not logged in');
  assert.equal(out.some((m) => m.type === 'transcript' && m.items.some((i) => i.kind === 'text')), false); // sin «No se pudo completar»
});

test('si en el equipo sí hay sesión, la tarjeta lo dice: el chat no la ha podido usar', async () => {
  const { n, emit } = fakeNative();
  wire(n, { authStatus: async () => ({ ok: true, loggedIn: true }) });
  n.say('hola');
  emit({ type: 'turn', error: true, text: 'API Error: 401 Unauthorized' });
  await settle();
  assert.deepEqual(kinds(n), ['auth', 'state:logged']);
  assert.equal(n.items[1].id, n.items[0].id);
});

test('la sesión vuelve: la tarjeta pasa a «ya puedes seguir», una sola vez; lo que se escriba después la deja atrás', async () => {
  const { n, emit, sent } = fakeNative();
  wire(n, { authStatus: async () => ({ ok: true, loggedIn: false }) });
  assert.equal(n.authReady(), false); // sin tarjeta, nada
  n.say('hola');
  emit({ type: 'turn', error: true, text: 'not logged in' });
  await settle();
  assert.equal(n.authReady(), true);
  assert.equal(n.authReady(), false);
  assert.deepEqual(kinds(n), ['auth', 'state:ready']);
  n.say('hola'); // reenviado
  assert.equal(n.auth, null);
  assert.equal(n.authReady(), false);
  assert.equal(sent.length, 2);
});

test('Copilot no marca el fallo de sesión: tras un error cualquiera se le pregunta a su CLI', async () => {
  const run = async (st) => {
    const { n, emit } = fakeNative();
    wire(n, { authStatus: async () => st });
    n.say('hola');
    emit({ type: 'turn', error: true, text: 'stream disconnected' });
    await settle();
    return n.items;
  };
  const off = await run({ ok: true, loggedIn: false });
  assert.deepEqual(off.map((i) => i.kind), ['text', 'auth']); // su error y, debajo, la tarjeta
  assert.deepEqual((await run({ ok: true, loggedIn: true })).map((i) => i.kind), ['text']); // con sesión: un error cualquiera
  assert.deepEqual((await run({ ok: false, loggedIn: false })).map((i) => i.kind), ['text']); // no se pudo comprobar: no se supone
});
