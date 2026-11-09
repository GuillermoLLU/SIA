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

const setup = ({ locked = false, remoteSession = null } = {}) => {
  const pty = fakePty();
  const cleaned = [];
  const bridge = createTerminalBridge({
    pty,
    launchers: { byId: (id) => ({ id: id || 'claude', label: 'Claude', cmd: 'claude' }), installed: (d) => d.id !== 'codex', list: () => [], prepare: (def, id, picked, base, prompt) => ({ cmd: def.cmd, args: [id, picked.join(','), prompt || ''] }), cleanup: (id) => cleaned.push(id) },
    workspace: { modeDirFor: (mode) => `/ws/${mode}` },
    env: () => ({ A: '1' }),
    issues: { find: (id) => (id === 'INC1' ? { id: 'INC1', text: 'PDA', notes: '' } : null) },
    accessibleProjects: async () => [{ id: 1 }, { id: 2 }],
    currentBase: () => ({ id: 'p-1', name: 'Base' }),
    skillsOf: () => [],
    skillSync: { maybe() {} },
    remote: { session: () => remoteSession, touch() {} },
    lock: { locked: () => locked },
    theme: () => ({ id: 'light' }),
    isLoopback: (req) => req.socket.remoteAddress === '127.0.0.1',
  });
  const server = new EventEmitter(); server.clients = new Set();
  bridge.attach(server);
  const connect = (ws) => { server.clients.add(ws); server.emit('connection', ws, ws.req); return ws; };
  const quiet = console.log; console.log = () => {};
  return { bridge, pty, cleaned, connect, done: () => { console.log = quiet; } };
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

test('el chat de una incidencia: uno por incidencia, con su contexto como primer mensaje; sin incidencia, error', async () => {
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

test('CLI no instalado: error; candado y remoto sin llave: se cierra el socket', async () => {
  const x = setup();
  const ws = x.connect(fakeWs());
  ws.say({ type: 'start', launcher: 'codex' });
  await tick();
  assert.match(ws.sent.find((m) => m.type === 'error').message, /no está instalado/);
  x.done();
  const y = setup({ locked: true });
  assert.deepEqual(y.connect(fakeWs()).closed, [4423, 'bloqueado']);
  assert.deepEqual(y.connect(fakeWs('/ws?t=x', '10.0.0.5')).closed, [4403, 'no autorizado']);
  y.done();
  const z = setup({ remoteSession: { locked: false } });
  const r = z.connect(fakeWs('/ws?t=ok', '10.0.0.5'));
  assert.equal(r.closed, null);
  assert.equal(r._siaToken, 'ok');
  z.bridge.broadcastTheme();
  assert.deepEqual(r.sent.at(-1), { type: 'theme', theme: { id: 'light' } });
  z.done();
});
