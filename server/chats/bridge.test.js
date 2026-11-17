import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createChatBridge } from './bridge.js';

// Una sesión de Copilot de mentira (copilot-session.js): lo que se le dice y lo que avisa
const fakeCopilot = ({ loggedIn = true } = {}) => {
  const spawned = [];
  const spawnChat = (opts) => {
    const sent = [];
    const replies = [];
    const exits = [];
    const chat = {
      opts, sent, replies, pid: 7, busy: false, items: [], asks: new Map(), listeners: new Set(), say: null, answer: null,
      models: [{ id: 'auto', label: 'Auto', hint: '', efforts: [], defaultEffort: null }], model: 'auto', effort: null,
      ready: loggedIn ? Promise.resolve({ model: 'auto' }) : Promise.reject(new Error('Copilot no tiene sesión iniciada')),
      sendText: (t) => sent.push(t), interrupt: () => sent.push('<esc>'), reply: (ask, r) => replies.push([ask.requestId, r]), replyText: (ask, t) => replies.push([ask.requestId, t]), command: () => null,
      kill: () => { chat.killed = true; for (const f of exits) f({ exitCode: 0 }); }, onExit: (f) => exits.push(f), killed: false,
      emit: (m) => { for (const cb of chat.listeners) cb(m); },
    };
    chat.ready.catch(() => {});
    spawned.push(chat);
    return chat;
  };
  return { spawned, spawnChat };
};
const fakeWs = (url = '/', remote = '127.0.0.1') => {
  const ws = new EventEmitter();
  Object.assign(ws, { OPEN: 1, readyState: 1, sent: [], closed: null, send: (m) => ws.sent.push(JSON.parse(m)), close: (code, reason) => { ws.closed = [code, reason]; } });
  ws.req = { url, socket: { remoteAddress: remote }, headers: {} };
  ws.say = (msg) => ws.emit('message', Buffer.from(JSON.stringify(msg)));
  ws.types = () => ws.sent.map((m) => m.type).filter((t) => t !== 'sessions' && t !== 'hello');
  return ws;
};

const setup = ({ locked = false, allowed = async () => true, installed = true, copilot = fakeCopilot(), copilotStatus = async () => ({ ok: true, loggedIn: true }) } = {}) => {
  let diskFull = false;
  const bridge = createChatBridge({
    launchers: {
      installed: () => installed,
      prepare: (picked, base) => { if (diskFull) throw new Error('ENOSPC: no queda espacio'); return { cmd: 'copilot', args: ['--headless'], mcp: base ? { knowledge: { command: 'node', args: ['mcp'], env: { P: picked.join(',') } } } : null }; },
      envFor: (e) => ({ env: { ...e, SIA_GH_TOKEN: 'k' }, args: ['--bash-env', 'on'] }),
    },
    spawnChat: copilot.spawnChat,
    newId: () => 'U-1',
    copilotStatus,
    workspace: { modeDirFor: (mode) => `/ws/${mode}` },
    env: () => ({ A: '1' }),
    issues: { find: (id) => (id === 'INC1' ? { id: 'INC1', text: 'PDA', notes: '' } : null) },
    accessibleProjects: async () => [{ id: 1 }, { id: 2 }],
    currentBase: () => ({ id: 'p-1', name: 'Base' }),
    skillsOf: () => [],
    skillSync: { maybe() {} },
    lock: { locked: () => locked },
    allowed,
  });
  const server = new EventEmitter(); server.clients = new Set();
  bridge.attach(server);
  const connect = (ws) => { server.clients.add(ws); server.emit('connection', ws, ws.req); return ws; };
  const quiet = console.log; console.log = () => {};
  return { bridge, copilot, connect, fillDisk: () => { diskFull = true; }, done: () => { console.log = quiet; } };
};
const tick = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise((r) => setImmediate(r)); };

test('start: la sesión con su carpeta, su MCP y la clave de repos aparte; el primer mensaje va por la sesión y la vista recibe lo que lleva', async () => {
  const x = setup();
  const ws = x.connect(fakeWs());
  await tick();
  assert.deepEqual(ws.sent[0].copilot, { available: true });
  ws.say({ type: 'start', knowledge: 'demand', projects: [2], prompt: '  ¿Qué hace la PDA?  ' });
  await tick();
  const chat = x.copilot.spawned[0];
  assert.deepEqual([chat.opts.cmd, chat.opts.args, chat.opts.cwd, chat.opts.sessionId], ['copilot', ['--headless', '--bash-env', 'on'], '/ws/demand', 'U-1']);
  assert.deepEqual(chat.opts.env, { A: '1', SIA_GH_TOKEN: 'k' });
  assert.equal(chat.opts.mcp.knowledge.env.P, '2');
  assert.deepEqual(chat.sent, ['¿Qué hace la PDA?']);
  assert.deepEqual(ws.types(), ['started', 'transcript', 'meta']);
  assert.deepEqual(ws.sent.find((m) => m.type === 'started'), { type: 'started', sessionId: 's1' });
  assert.deepEqual(ws.sent.find((m) => m.type === 'meta'), { type: 'meta', model: 'auto', effort: null, modelVia: null, models: chat.models });
  const listed = ws.sent.filter((m) => m.type === 'sessions').at(-1).sessions[0];
  assert.deepEqual([listed.id, listed.knowledge, listed.model, listed.attached], ['s1', 'demand', 'auto', true]);
  // lo que dice llega a quien tiene el chat; lo escrito, parar y contestar van a la sesión
  chat.emit({ type: 'transcript', items: [{ kind: 'text', id: 't1', text: 'Hola' }] });
  assert.deepEqual(ws.sent.at(-1), { type: 'transcript', items: [{ kind: 'text', id: 't1', text: 'Hola' }] });
  ws.say({ type: 'say', text: '  dime más  ' });
  ws.say({ type: 'stop' });
  chat.emit({ type: 'ask', requestId: 'r1', toolUseId: 'q1', input: {}, freeform: false });
  ws.say({ type: 'answer', requestId: 'r1', answers: { q: 'sí' } });
  assert.deepEqual(chat.sent, ['¿Qué hace la PDA?', 'dime más', '<esc>']);
  assert.deepEqual(chat.replies, [['r1', { answers: { q: 'sí' }, allow: undefined }]]);
  // el modelo cambia: a quien lo mira y a la lista de chats
  chat.emit({ type: 'model-via', name: 'GPT-6 Luna' });
  assert.equal(ws.sent.at(-2).type, 'meta');
  assert.equal(ws.sent.at(-2).modelVia, 'GPT-6 Luna');
  assert.equal(ws.sent.at(-1).sessions[0].modelVia, 'GPT-6 Luna');
  // otro socket se engancha: el primero recibe 4409 y el nuevo, la conversación entera y lo que pregunta
  const ws2 = x.connect(fakeWs());
  ws2.say({ type: 'attach', sessionId: 's1' });
  await tick();   // engancharse espera a comprobar que puede abrir ese chat
  assert.deepEqual(ws.closed, [4409, 'handoff']);
  assert.deepEqual(ws2.sent.find((m) => m.type === 'transcript'), { type: 'transcript', reset: true, items: chat.items });
  assert.equal(ws2.sent.some((m) => m.type === 'meta'), true);
  ws2.say({ type: 'attach', sessionId: 'nope' });
  assert.ok(ws2.sent.some((m) => m.type === 'gone'));
  x.done();
});

test('sin pregunta, sin primer mensaje; con issue y pregunta a la vez, mandan los datos de la issue', async () => {
  const x = setup();
  const ws = x.connect(fakeWs());
  ws.say({ type: 'start', prompt: '   ' });
  await tick();
  assert.deepEqual(x.copilot.spawned[0].sent, []);
  const ws2 = x.connect(fakeWs());
  ws2.say({ type: 'start', issue: 'INC1', prompt: 'otra cosa' });
  await tick();
  assert.match(x.copilot.spawned[1].sent[0], /incidencia INC1/);
  x.done();
});

test('kill: al morir el chat se limpia la sesión y se avisa a todos', async () => {
  const x = setup();
  const ws = x.connect(fakeWs());
  ws.say({ type: 'start' });
  await tick();
  ws.say({ type: 'kill' });
  assert.equal(x.copilot.spawned[0].killed, true);
  assert.ok(ws.sent.some((m) => m.type === 'exit'));
  assert.deepEqual(ws.sent.filter((m) => m.type === 'sessions').at(-1).sessions, []);
  x.done();
});

test('el chat de una issue: uno por issue, con sus datos como primer mensaje y, al volver, la conversación; sin issue, error', async () => {
  const x = setup();
  const ws = x.connect(fakeWs());
  ws.say({ type: 'start', issue: 'INC1' });
  await tick();
  assert.match(x.copilot.spawned[0].sent[0], /incidencia INC1/);
  const ws2 = x.connect(fakeWs());
  ws2.say({ type: 'start', issue: 'INC1' });
  await tick();
  assert.equal(x.copilot.spawned.length, 1, 'reutiliza la sesión abierta');
  assert.deepEqual(ws2.types(), ['started', 'transcript', 'meta']);
  assert.equal(ws2.sent.find((m) => m.type === 'started').sessionId, 's1');
  const ws3 = x.connect(fakeWs());
  ws3.say({ type: 'start', issue: 'INC9' });
  await tick();
  assert.match(ws3.sent.find((m) => m.type === 'error').message, /ya no está/);
  x.done();
});

test('Copilot no instalado: error; con el candado echado se cierra el socket', async () => {
  const x = setup({ installed: false });
  const ws = x.connect(fakeWs());
  await tick();
  assert.deepEqual(ws.sent[0].copilot, { available: false });
  ws.say({ type: 'start' });
  await tick();
  assert.match(ws.sent.find((m) => m.type === 'error').message, /no está instalado/);
  x.done();
  const y = setup({ locked: true });
  assert.deepEqual(y.connect(fakeWs()).closed, [4423, 'bloqueado']);
  y.done();
});

test('Copilot sin sesión iniciada: el error lo dice (auth) y no queda chat; con la sesión iniciada después, los chats siguen', async () => {
  const x = setup({ copilot: fakeCopilot({ loggedIn: false }) });
  const ws = x.connect(fakeWs());
  ws.say({ type: 'start' });
  await tick();
  const err = ws.sent.find((m) => m.type === 'error');
  assert.equal(err.auth, 'copilot');
  assert.match(err.message, /Proveedores IA/);
  assert.equal(ws.sent.some((m) => m.type === 'started'), false);
  assert.equal(x.copilot.spawned[0].killed, true);
  x.done();
  const y = setup({ copilotStatus: async () => ({ ok: true, loggedIn: false }) });
  const w = y.connect(fakeWs());
  w.say({ type: 'start' });
  await tick();
  const chat = y.copilot.spawned[0];
  chat.emit({ type: 'turn', error: true, text: 'Not logged in · Please run /login' }); // la tarjeta de «sin sesión»
  assert.equal(chat.items.at(-1).kind, 'auth');
  w.say({ type: 'auth-check' });
  await tick();
  assert.deepEqual(w.sent.at(-1), { type: 'auth-check', ok: false }); // sigue sin ella
  y.bridge.authRestored(); // iniciada en Configuración
  assert.equal(chat.items.at(-1).state, 'ready');
  y.done();
});

test('sin la vista Chat no se abre ni se reengancha un chat; el de una issue va con Issues', async () => {
  const x = setup({ allowed: async (req, { issue }) => issue });   // tiene Issues, no el Chat
  const ws = x.connect(fakeWs());
  await tick();
  ws.say({ type: 'start', knowledge: 'demand', projects: [] });
  await tick();
  assert.equal(x.copilot.spawned.length, 0);
  assert.equal(ws.sent.find((m) => m.type === 'error').message, 'No tienes el Chat.');
  ws.say({ type: 'start', knowledge: 'demand', projects: [], issue: 'INC1' });
  await tick();
  assert.equal(x.copilot.spawned.length, 1);   // el de la issue, sí
  x.done();
});

test('reenganchar un chat del Chat sin su vista: error, no se engancha y quien lo tenía lo conserva', async () => {
  let ok = true;
  const x = setup({ allowed: async () => ok });
  const a = x.connect(fakeWs());
  await tick();
  a.say({ type: 'start' });
  await tick();
  const sid = a.sent.find((m) => m.type === 'started').sessionId;
  ok = false;   // desde otro dispositivo, alguien sin el Chat
  const b = x.connect(fakeWs());
  await tick();
  b.say({ type: 'attach', sessionId: sid });
  await tick();
  assert.equal(b.sent.find((m) => m.type === 'error').message, 'No tienes acceso a este chat.');
  assert.ok(!b.sent.some((m) => m.type === 'transcript'));
  assert.equal(a.closed, null, 'el primero no pasa a pasivo');
  x.done();
});

test('reenganchar: si el socket se cierra mientras se comprueba el permiso, no le quita el chat a nadie', async () => {
  let open;
  const gate = new Promise((r) => { open = r; });
  let slow = false;
  const x = setup({ allowed: async () => { if (slow) await gate; return true; } });
  const a = x.connect(fakeWs());
  await tick();
  a.say({ type: 'start' });
  await tick();
  const sid = a.sent.find((m) => m.type === 'started').sessionId;
  slow = true;
  const b = x.connect(fakeWs());
  b.say({ type: 'attach', sessionId: sid });
  b.readyState = 3;   // se recarga la pestaña antes de que llegue la respuesta
  open();
  await tick();
  assert.equal(a.closed, null);
  assert.ok(!b.sent.some((m) => m.type === 'transcript'));
  x.done();
});

test('un fallo al abrir el chat (no se puede escribir en el workspace) se cuenta en el socket y no tumba el bridge', async () => {
  const x = setup();
  const ws = x.connect(fakeWs());
  await tick();
  x.fillDisk();
  ws.say({ type: 'start' });
  await tick();
  assert.equal(ws.sent.find((m) => m.type === 'error').message, 'No se pudo abrir el chat: ENOSPC: no queda espacio');
  x.done();
});
