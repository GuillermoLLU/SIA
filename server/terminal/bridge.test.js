import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { createTerminalBridge } from './bridge.js';

// Un PTY de mentira: lo escrito se guarda y onExit se dispara con kill().
const fakePty = () => {
  const spawned = [];
  return {
    spawned,
    spawn(cmd, args, opts) {
      const t = { cmd, args, opts, pid: 42, written: [], data: null, exit: null, onData: (f) => { t.data = f; }, onExit: (f) => { t.exit = f; }, write: (d) => t.written.push(d), resize() {}, kill: () => t.exit() };
      spawned.push(t);
      return t;
    },
  };
};
const fakeWs = (url = '/', remote = '127.0.0.1') => {
  const ws = new EventEmitter();
  Object.assign(ws, { OPEN: 1, readyState: 1, sent: [], closed: null, send: (m) => ws.sent.push(JSON.parse(m)), close: (code, reason) => { ws.closed = [code, reason]; } });
  ws.req = { url, socket: { remoteAddress: remote }, headers: {} };
  ws.say = (msg) => ws.emit('message', Buffer.from(JSON.stringify(msg)));
  return ws;
};

// Una sesión de Copilot de mentira (chats/copilot-session.js): lo que se le dice y lo que avisa
const fakeCopilot = ({ loggedIn = true } = {}) => {
  const spawned = [];
  const spawnNative = (opts) => {
    const sent = [];
    const replies = [];
    const native = {
      opts, sent, replies, busy: false, items: [], asks: new Map(), listeners: new Set(), say: null, answer: null, models: [{ id: 'auto', label: 'Auto', hint: '', efforts: [], defaultEffort: null }], model: 'auto', effort: null,
      ready: loggedIn ? Promise.resolve({ model: 'auto' }) : Promise.reject(new Error('Copilot no tiene sesión iniciada')),
      sendText: (t) => sent.push(t), interrupt: () => sent.push('<esc>'), reply: (ask, r) => replies.push([ask.requestId, r]), replyText: (ask, t) => replies.push([ask.requestId, t]), command: () => null,
      emit: (m) => { for (const cb of native.listeners) cb(m); },
    };
    native.ready.catch(() => {});
    const exits = [];
    const term = { pid: 7, write: () => {}, resize() {}, kill: () => { for (const f of exits) f({ exitCode: 0 }); }, onData() {}, onExit: (f) => exits.push(f), killed: false };
    spawned.push({ term, native });
    return { term, native };
  };
  return { spawned, spawnNative };
};

const setup = ({ locked = false, allowed = async () => true, copilot = fakeCopilot(), copilotStatus = async () => ({ ok: true, loggedIn: true }) } = {}) => {
  const pty = fakePty();
  const cleaned = [];
  let diskFull = false;
  const bridge = createTerminalBridge({
    pty,
    launchers: {
      byId: (id) => (id === 'copilot' ? { id: 'copilot', label: 'Copilot', cmd: 'copilot', native: true } : { id: id || 'claude', label: 'Claude', cmd: 'claude' }),
      installed: (d) => d.id !== 'codex', list: () => [],
      prepare: (def, id, picked, base, prompt) => { if (diskFull) throw new Error('ENOSPC: no queda espacio'); return def.native ? { cmd: 'copilot', args: ['--headless'], mcp: { knowledge: { command: 'node', args: ['mcp'], env: { P: picked.join(',') } } } } : { cmd: def.cmd, args: [id, picked.join(','), prompt || ''] }; },
      envFor: (def, e) => (def.native ? { env: { ...e, SIA_GH_TOKEN: 'k' }, args: ['--bash-env', 'on'] } : { env: e, args: [] }),
      cleanup: (id) => cleaned.push(id),
    },
    spawnNative: copilot.spawnNative,
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
  return { bridge, pty, cleaned, connect, copilot, fillDisk: () => { diskFull = true; }, done: () => { console.log = quiet; } };
};
const tick = () => new Promise((r) => setImmediate(r));

test('start: lanza el CLI con sus argumentos, engancha y avisa; data y history', async () => {
  const x = setup();
  const ws = x.connect(fakeWs());
  await tick();
  assert.equal(ws.sent[0].type, 'launchers');
  ws.say({ type: 'start', launcher: 'claude', knowledge: 'demand', projects: [2], cols: 100, rows: 30 });
  await tick(); await tick();
  const t = x.pty.spawned[0];
  assert.deepEqual([t.cmd, t.args, t.opts.cwd, t.opts.cols, t.opts.env], ['claude', ['s1', '2', ''], '/ws/demand', 100, { A: '1' }]);
  assert.deepEqual(ws.sent.find((m) => m.type === 'started'), { type: 'started', sessionId: 's1' });
  assert.equal(ws.sent.find((m) => m.type === 'sessions').sessions[0].attached, true);
  t.data('hola ');
  t.data('mundo');
  assert.deepEqual(ws.sent.filter((m) => m.type === 'data').map((m) => m.data), ['hola ', 'mundo']);
  ws.say({ type: 'input', data: 'ls' });
  assert.deepEqual(t.written, ['ls']);
  // otro socket se engancha: el primero recibe 4409 y el nuevo, el scrollback
  const ws2 = x.connect(fakeWs());
  ws2.say({ type: 'attach', sessionId: 's1' });
  await tick();   // engancharse espera a comprobar que puede abrir ese chat
  assert.deepEqual(ws.closed, [4409, 'handoff']);
  assert.deepEqual(ws2.sent.find((m) => m.type === 'history'), { type: 'history', data: 'hola mundo' });
  ws2.say({ type: 'attach', sessionId: 'nope' });
  assert.ok(ws2.sent.some((m) => m.type === 'gone'));
  x.done();
});

test('start con pregunta: va como primer mensaje del CLI; en blanco, nada', async () => {
  const x = setup();
  const ws = x.connect(fakeWs());
  ws.say({ type: 'start', launcher: 'claude', prompt: '  ¿Qué hace la PDA?  ' });
  await tick(); await tick();
  assert.equal(x.pty.spawned[0].args[2], '¿Qué hace la PDA?');
  const ws2 = x.connect(fakeWs());
  ws2.say({ type: 'start', launcher: 'claude', prompt: '   ' });
  await tick(); await tick();
  assert.equal(x.pty.spawned[1].args[2], '');
  // con issue y prompt a la vez, mandan los datos de la issue
  const ws3 = x.connect(fakeWs());
  ws3.say({ type: 'start', launcher: 'claude', issue: 'INC1', prompt: 'otra cosa' });
  await tick(); await tick();
  assert.match(x.pty.spawned[2].args[2], /incidencia INC1/);
  x.done();
});

test('asset y kill: se difunden y al morir el PTY se limpia la sesión', async () => {
  const x = setup();
  const ws = x.connect(fakeWs());
  ws.say({ type: 'start', launcher: 'claude' });
  await tick(); await tick();
  ws.say({ type: 'asset', asset: { name: 'foto.png', absPath: '/u/foto.png' } });
  const last = ws.sent.filter((m) => m.type === 'sessions').at(-1).sessions[0];
  assert.deepEqual(last.assets, [{ name: 'foto.png', absPath: '/u/foto.png' }]);
  ws.say({ type: 'kill' });
  assert.deepEqual(x.cleaned, ['s1']);
  assert.ok(ws.sent.some((m) => m.type === 'exit'));
  assert.deepEqual(ws.sent.filter((m) => m.type === 'sessions').at(-1).sessions, []);
  x.done();
});

test('el chat de una issue: uno por issue, con su contexto como primer mensaje; sin issue, error', async () => {
  const x = setup();
  const ws = x.connect(fakeWs());
  ws.say({ type: 'start', launcher: 'claude', issue: 'INC1' });
  await tick(); await tick();
  assert.match(x.pty.spawned[0].args[2], /incidencia INC1/);
  const ws2 = x.connect(fakeWs());
  ws2.say({ type: 'start', launcher: 'claude', issue: 'INC1' });
  await tick();
  assert.equal(x.pty.spawned.length, 1, 'reutiliza la sesión abierta');
  assert.equal(ws2.sent.find((m) => m.type === 'started').sessionId, 's1');
  const ws3 = x.connect(fakeWs());
  ws3.say({ type: 'start', launcher: 'claude', issue: 'INC9' });
  await tick();
  assert.match(ws3.sent.find((m) => m.type === 'error').message, /ya no está/);
  x.done();
});

test('CLI no instalado: error; con el candado echado se cierra el socket', async () => {
  const x = setup();
  const ws = x.connect(fakeWs());
  ws.say({ type: 'start', launcher: 'codex' });
  await tick();
  assert.match(ws.sent.find((m) => m.type === 'error').message, /no está instalado/);
  x.done();
  const y = setup({ locked: true });
  assert.deepEqual(y.connect(fakeWs()).closed, [4423, 'bloqueado']);
  y.done();
});

test('sin la vista Chat no se abre ni se reengancha un chat; el de una issue va con Issues', async () => {
  const x = setup({ allowed: async (req, { issue }) => issue });   // tiene Issues, no el Chat
  const ws = x.connect(fakeWs());
  await tick();
  ws.say({ type: 'start', launcher: 'claude', knowledge: 'demand', projects: [], cols: 80, rows: 24 });
  await tick(); await tick();
  assert.equal(x.pty.spawned.length, 0);
  assert.equal(ws.sent.find((m) => m.type === 'error').message, 'No tienes el Chat.');
  ws.say({ type: 'start', launcher: 'claude', knowledge: 'demand', projects: [], cols: 80, rows: 24, issue: 'INC1' });
  await tick(); await tick(); await tick();
  assert.equal(x.pty.spawned.length, 1);   // el de la issue, sí
  x.done();
});

test('reenganchar un chat del Chat sin su vista: error, no se engancha y quien lo tenía lo conserva', async () => {
  let ok = true;
  const x = setup({ allowed: async () => ok });
  const a = x.connect(fakeWs());
  await tick();
  a.say({ type: 'start', launcher: 'claude', knowledge: 'demand', projects: [], cols: 80, rows: 24 });
  await tick(); await tick();
  const sid = a.sent.find((m) => m.type === 'started').sessionId;
  ok = false;   // desde otro dispositivo, alguien sin el Chat
  const b = x.connect(fakeWs());
  await tick();
  b.say({ type: 'attach', sessionId: sid });
  await tick(); await tick();
  assert.equal(b.sent.find((m) => m.type === 'error').message, 'No tienes acceso a este chat.');
  assert.ok(!b.sent.some((m) => m.type === 'history'));
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
  a.say({ type: 'start', launcher: 'claude', knowledge: 'demand', projects: [], cols: 80, rows: 24 });
  await tick(); await tick();
  const sid = a.sent.find((m) => m.type === 'started').sessionId;
  slow = true;
  const b = x.connect(fakeWs());
  b.say({ type: 'attach', sessionId: sid });
  b.readyState = 3;   // se recarga la pestaña antes de que llegue la respuesta
  open();
  await tick(); await tick();
  assert.equal(a.closed, null);
  assert.ok(!b.sent.some((m) => m.type === 'history'));
  x.done();
});

test('un fallo al abrir el chat (no se puede escribir su configuración) se cuenta en el socket y no tumba el bridge', async () => {
  const x = setup();
  const ws = x.connect(fakeWs());
  await tick();
  x.fillDisk();
  ws.say({ type: 'start', launcher: 'claude', knowledge: 'demand', projects: [], cols: 80, rows: 24 });
  await tick(); await tick();
  assert.equal(ws.sent.find((m) => m.type === 'error').message, 'No se pudo abrir el chat: ENOSPC: no queda espacio');
  x.done();
});

// ── Copilot sin terminal ──
test('Copilot: la sesión con su carpeta, su MCP y la clave de repos aparte; el primer mensaje va por la sesión y la vista recibe lo que lleva', async () => {
  const x = setup();
  const ws = x.connect(fakeWs());
  await tick();
  ws.say({ type: 'start', launcher: 'copilot', knowledge: 'auto', projects: [2], prompt: '¿Qué hace la PDA?' });
  await tick(); await tick(); await tick();
  const { native } = x.copilot.spawned[0];
  assert.deepEqual([native.opts.cmd, native.opts.args, native.opts.cwd, native.opts.sessionId], ['copilot', ['--headless', '--bash-env', 'on'], '/ws/auto', 'U-1']);
  assert.deepEqual(native.opts.env, { A: '1', SIA_GH_TOKEN: 'k' });
  assert.equal(native.opts.mcp.knowledge.env.P, '2');
  assert.equal(x.pty.spawned.length, 0);
  assert.deepEqual(native.sent, ['¿Qué hace la PDA?']);
  const types = ws.sent.map((m) => m.type).filter((t) => t !== 'sessions' && t !== 'launchers');
  assert.deepEqual(types, ['started', 'history', 'transcript', 'meta']); // la vista recibe lo que lleva (el primer mensaje puede haber llegado ya)
  assert.deepEqual(ws.sent.find((m) => m.type === 'meta'), { type: 'meta', model: 'auto', effort: null, modelVia: null, models: native.models });
  const listed = ws.sent.filter((m) => m.type === 'sessions').at(-1).sessions[0];
  assert.deepEqual([listed.launcher, listed.native, listed.model], ['copilot', true, 'auto']);
  // lo que dice llega a quien tiene el chat; lo escrito, parar y contestar van a la sesión
  native.emit({ type: 'transcript', items: [{ kind: 'text', id: 't1', text: 'Hola' }] });
  assert.deepEqual(ws.sent.at(-1), { type: 'transcript', items: [{ kind: 'text', id: 't1', text: 'Hola' }] });
  ws.say({ type: 'say', text: '  dime más  ' });
  ws.say({ type: 'stop' });
  native.emit({ type: 'ask', requestId: 'r1', toolUseId: 'q1', input: {}, freeform: false });
  ws.say({ type: 'answer', requestId: 'r1', answers: { q: 'sí' } });
  assert.deepEqual(native.sent, ['¿Qué hace la PDA?', 'dime más', '<esc>']);
  assert.deepEqual(native.replies, [['r1', { answers: { q: 'sí' }, allow: undefined }]]);
  // el modelo cambia: a quien lo mira y a la lista de chats
  native.emit({ type: 'model-via', name: 'GPT-6 Luna' });
  assert.equal(ws.sent.at(-2).type, 'meta');
  assert.equal(ws.sent.at(-2).modelVia, 'GPT-6 Luna');
  assert.equal(ws.sent.at(-1).sessions[0].modelVia, 'GPT-6 Luna');
  // otro socket se engancha: la conversación entera y lo que pregunta
  const ws2 = x.connect(fakeWs());
  ws2.say({ type: 'attach', sessionId: 's1' });
  await tick();
  assert.deepEqual(ws2.sent.find((m) => m.type === 'transcript'), { type: 'transcript', reset: true, items: native.items });
  assert.equal(ws2.sent.some((m) => m.type === 'meta'), true);
  x.done();
});

test('Copilot sin sesión iniciada: el error lo dice (auth) y no queda chat; con la sesión iniciada después, los chats siguen', async () => {
  const x = setup({ copilot: fakeCopilot({ loggedIn: false }) });
  const ws = x.connect(fakeWs());
  await tick();
  ws.say({ type: 'start', launcher: 'copilot' });
  await tick(); await tick(); await tick();
  const err = ws.sent.find((m) => m.type === 'error');
  assert.equal(err.auth, 'copilot');
  assert.match(err.message, /Proveedores IA/);
  assert.equal(ws.sent.some((m) => m.type === 'started'), false);
  x.done();
  const y = setup({ copilotStatus: async () => ({ ok: true, loggedIn: false }) });
  const w = y.connect(fakeWs());
  w.say({ type: 'start', launcher: 'copilot' });
  await tick(); await tick(); await tick();
  const { native } = y.copilot.spawned[0];
  native.emit({ type: 'turn', error: true, text: 'Not logged in · Please run /login' }); // la tarjeta de «sin sesión»
  assert.equal(native.items.at(-1).kind, 'auth');
  w.say({ type: 'auth-check' });
  await tick(); await tick();
  assert.deepEqual(w.sent.at(-1), { type: 'auth-check', ok: false }); // sigue sin ella
  y.bridge.authRestored(); // iniciada en Configuración
  assert.equal(native.items.at(-1).state, 'ready');
  y.done();
});

test('el chat de una issue con Copilot: sus datos como primer mensaje y, al volver, la conversación', async () => {
  const x = setup();
  const ws = x.connect(fakeWs());
  ws.say({ type: 'start', launcher: 'copilot', issue: 'INC1' });
  await tick(); await tick(); await tick();
  const { native } = x.copilot.spawned[0];
  assert.match(native.sent[0], /incidencia INC1/);
  const ws2 = x.connect(fakeWs());
  ws2.say({ type: 'start', launcher: 'copilot', issue: 'INC1' });
  await tick();
  assert.equal(x.copilot.spawned.length, 1, 'reutiliza la sesión abierta');
  assert.deepEqual(ws2.sent.filter((m) => m.type !== 'sessions' && m.type !== 'launchers').map((m) => m.type), ['started', 'history', 'transcript', 'meta']);
  ws2.say({ type: 'kill' });
  assert.deepEqual(x.cleaned, ['s1']);
  assert.ok(ws2.sent.some((m) => m.type === 'exit'));
  x.done();
});
