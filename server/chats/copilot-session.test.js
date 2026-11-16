import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { spawnCopilot, NOT_LOGGED } from './copilot-session.js';
import { wireNative } from './session.js';
import { frame, createFrameReader, DISMISSED } from './copilot.js';

// un `copilot --headless --stdio` de mentira: apunta lo que se le pide y contesta con `answer(method, params)`
const fakeCopilot = (answer) => {
  const sent = [];
  const proc = new EventEmitter();
  proc.pid = 9;
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();
  proc.kill = () => proc.emit('exit', 0);
  const push = (o) => proc.stdout.emit('data', frame(o));
  const read = createFrameReader();
  proc.stdin = new EventEmitter();
  proc.stdin.end = () => {};
  proc.stdin.write = (buf) => {
    for (const m of read(buf)) {
      sent.push(m);
      if (m.method && m.id != null) {
        const r = answer(m.method, m.params);
        queueMicrotask(() => (r instanceof Error ? push({ id: m.id, error: { message: r.message } }) : push({ id: m.id, result: r ?? {} })));
      }
    }
  };
  let n = 0;
  return {
    proc, sent, push,
    event: (type, data = {}, extra = {}) => push({ method: 'session.event', params: { sessionId: 'S1', event: { id: `e${++n}`, type, timestamp: '2026-11-12T12:00:00.000Z', data, ...extra } } }),
    ask: (id, method, params) => push({ id, method, params: { sessionId: 'S1', ...params } }),
    replies: () => sent.filter((m) => m.id != null && !m.method),
    calls: (method) => sent.filter((m) => m.method === method),
  };
};
const GH = { id: 'copilot', kind: 'copilot', label: 'GitHub Copilot' };
const MODELS = { models: [{ id: 'auto', name: 'Auto' }, { id: 'sol', name: 'GPT Sol', supportedReasoningEfforts: ['low', 'high'], defaultReasoningEffort: 'low' }] };
// el catálogo de la sesión: los de la cuenta con su proveedor, y uno propio de la empresa
const CATALOG = { list: [...MODELS.models.map((m) => ({ ...m, provider: GH })), { id: 'acme/llama', name: 'Llama de Acme', provider: { id: 'acme', kind: 'byok', label: 'Acme' } }], providers: [GH] };
const base = (answers = {}) => (method, params) => {
  if (method in answers) return typeof answers[method] === 'function' ? answers[method](params) : answers[method];
  if (method === 'connect') return { ok: true, protocolVersion: 3, version: '1.0.109' };
  if (method === 'auth.getStatus') return { isAuthenticated: true, authType: 'user', login: 'ana' };
  if (method === 'session.model.list') return CATALOG;
  if (method === 'models.list') return MODELS;
  if (method === 'session.send') return { messageId: 'm' };
  return { success: true };
};
const start = (fake, opts = {}) => spawnCopilot({ cmd: 'copilot', cwd: '/ws', env: {}, sessionId: 'S1', spawnProcess: () => fake.proc, exists: () => true, log: () => {}, ...opts });
const tick = async (n = 3) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };
const wire = (native, extra = {}) => {
  const out = [];
  const metas = [];
  wireNative(native, { out: (m) => out.push(m), meta: { model: null, effort: null }, onMeta: (p) => metas.push(p), setTimer: () => 1, ...extra });
  return { out, metas, rows: () => out.filter((m) => m.type === 'transcript').flatMap((m) => m.items) };
};

test('arranca: saludo, cuenta, modelos y una sesión nueva con su id, su carpeta y su MCP; sin confirmaciones', async () => {
  const f = fakeCopilot(base());
  const native = start(f, { mcp: { knowledge: { command: 'k', args: ['a'], env: { X: '1' } } } });
  assert.deepEqual(await native.ready, { model: 'auto' });
  assert.deepEqual(f.sent.filter((m) => m.method).map((m) => m.method), ['connect', 'auth.getStatus', 'session.create', 'session.permissions.setApproveAll', 'session.model.list', 'session.model.switchTo']);
  const create = f.calls('session.create')[0].params;
  assert.deepEqual([create.sessionId, create.workingDirectory, create.model, create.clientName], ['S1', '/ws', undefined, 'sia']);
  assert.deepEqual(create.mcpServers, { knowledge: { type: 'local', command: 'k', args: ['a'], env: { X: '1' }, tools: ['*'] } });
  assert.deepEqual(f.calls('session.permissions.setApproveAll')[0].params, { sessionId: 'S1', enabled: true });
  // el catálogo de la sesión: también los modelos propios de la empresa, cada uno con su proveedor
  assert.deepEqual(native.models.map((m) => `${m.id}@${m.provider?.id}`), ['auto@copilot', 'sol@copilot', 'acme/llama@acme']);
  assert.deepEqual(f.calls('session.model.switchTo')[0].params, { sessionId: 'S1', modelId: 'auto', providerId: 'copilot' }); // se abre con «auto», fijado
  assert.equal(native.pid, 9);
  assert.equal(native.model, 'auto'); // con cuál va: lo lee el bridge al montar la sesión
});

test('sin catálogo por sesión (runtime anterior), los modelos de la cuenta', async () => {
  const f = fakeCopilot(base({ 'session.model.list': () => new Error('Unhandled method session.model.list') }));
  const native = start(f);
  await native.ready;
  assert.deepEqual(native.models.map((m) => `${m.id}@${m.provider}`), ['auto@null', 'sol@null']);
  assert.deepEqual(f.calls('session.model.switchTo')[0].params, { sessionId: 'S1', modelId: 'auto' });
});

test('sin sesión de Copilot, lo dice y no abre nada', async () => {
  const f = fakeCopilot(base({ 'auth.getStatus': { isAuthenticated: false } }));
  const native = start(f);
  await assert.rejects(native.ready, new RegExp(NOT_LOGGED));
  assert.equal(f.calls('session.create').length, 0);
});

test('el primer mensaje va nada más estar lista; lo escrito se manda en cola y, con un turno en marcha, entra en él', async () => {
  const f = fakeCopilot(base());
  const native = start(f);
  wire(native, { firstSay: 'hola' });
  await native.ready;
  await tick();
  assert.deepEqual(f.calls('session.send')[0].params, { sessionId: 'S1', prompt: 'hola', mode: 'enqueue' });
  native.say('y otra cosa');
  await tick();
  assert.equal(f.calls('session.send')[1].params.mode, 'immediate');
  f.event('session.idle');
  await tick();
  native.say('ya parado');
  await tick();
  assert.equal(f.calls('session.send')[2].params.mode, 'enqueue');
});

test('lo que hace, en piezas: texto en directo, «pensando», herramientas, el modelo que contesta y el fin', async () => {
  const f = fakeCopilot(base());
  const native = start(f);
  await native.ready;
  const { out, metas } = wire(native);
  f.event('user.message', { content: 'haz ls' });
  f.event('assistant.reasoning_delta', { deltaContent: '…' });
  f.event('tool.execution_start', { toolCallId: 'c1', toolName: 'bash', arguments: { command: 'ls' } });
  f.event('tool.execution_complete', { toolCallId: 'c1', success: true, result: { content: 'a.md' } });
  f.event('assistant.usage', { model: 'gpt-6-luna', modelDisplayName: 'GPT-6 Luna' });
  f.event('assistant.message_delta', { messageId: 'm1', deltaContent: 'Hay' });
  f.event('assistant.message_delta', { messageId: 'x', deltaContent: 'de un subagente', parentToolCallId: 'c9' });
  f.event('assistant.message', { messageId: 'm1', content: 'Hay un fichero.' });
  f.event('session.idle');
  f.push({ method: 'session.event', params: { sessionId: 'OTRA', event: { id: 'z', type: 'assistant.message', data: { messageId: 'z', content: 'de otra sesión' } } } });
  await tick();
  const kinds = out.flatMap((m) => (m.type === 'transcript' ? m.items.map((i) => `${i.kind}:${i.id}`) : [m.type]));
  assert.deepEqual(kinds, ['user:e1', 'thinking', 'tool:c1', 'result:c1', 'typing', 'text:m1', 'turn']);
  assert.deepEqual(metas, [{ modelVia: 'GPT-6 Luna' }]);
  assert.equal(native.busy, false);
});

test('un turno que falla deja su motivo en la conversación, una vez; el «listo» de detrás sobra', async () => {
  const f = fakeCopilot(base());
  const native = start(f);
  await native.ready;
  const { out, rows } = wire(native, { authStatus: async () => ({ ok: true, loggedIn: true }) });
  f.event('user.message', { content: 'hola' });
  f.event('session.error', { errorType: 'query', message: 'Model "x" is not available.' });
  f.event('session.idle');
  await tick();
  assert.equal(out.filter((m) => m.type === 'turn').length, 1);
  assert.equal(out.find((m) => m.type === 'turn').error, true);
  assert.deepEqual(rows().filter((r) => r.kind === 'text').map((r) => r.text), ['⚠️ No se pudo completar: Model "x" is not available.']);
});

test('su pregunta: la tarjeta, viva al unir la petición con su herramienta; elegir contesta a la petición', async () => {
  const f = fakeCopilot(base());
  const native = start(f);
  await native.ready;
  const { out, rows } = wire(native);
  f.ask(70, 'userInput.request', { requestId: 'R1', question: '¿Color?', choices: ['Rojo', 'Verde'], allowFreeform: true });
  await tick();
  assert.equal(out.some((m) => m.type === 'ask'), false); // aún no se sabe de qué herramienta es
  f.event('tool.execution_start', { toolCallId: 'q1', toolName: 'ask_user', arguments: { question: '¿Color?', choices: ['Rojo', 'Verde'] } });
  f.event('user_input.requested', { requestId: 'R1', toolCallId: 'q1', question: '¿Color?', choices: ['Rojo', 'Verde'], allowFreeform: true });
  await tick();
  const ask = out.find((m) => m.type === 'ask');
  assert.deepEqual([ask.requestId, ask.toolUseId, ask.freeform], ['u:R1', 'q1', true]);
  assert.deepEqual(rows().map((r) => [r.kind, r.id, r.name]), [['tool', 'q1', 'AskUserQuestion']]);
  native.answer('u:R1', { answers: { '¿Color?': 'Verde' } });
  assert.deepEqual(f.replies().find((m) => m.id === 70).result, { answer: 'Verde', wasFreeform: false });
  f.event('tool.execution_complete', { toolCallId: 'q1', success: true, result: { content: 'User selected: Verde' } });
  await tick();
  assert.deepEqual(rows().at(-1), { kind: 'result', id: 'q1', text: '"¿Color?"="Verde"', error: false });
  assert.equal(native.asks.size, 0);
});

test('escribir con su pregunta pendiente es la respuesta (sin mensaje nuevo); «Ninguna» la descarta y para', async () => {
  const f = fakeCopilot(base());
  const native = start(f);
  await native.ready;
  const { out, rows } = wire(native);
  const askNow = async (rpc, req, tool) => {
    f.event('tool.execution_start', { toolCallId: tool, toolName: 'ask_user', arguments: { question: '¿Color?', choices: ['Rojo'] } });
    f.event('user_input.requested', { requestId: req, toolCallId: tool, question: '¿Color?', choices: ['Rojo'] });
    f.ask(rpc, 'userInput.request', { requestId: req, question: '¿Color?', choices: ['Rojo'] });
    await tick();
  };
  await askNow(80, 'R2', 'q2');
  native.say('prefiero el morado');
  await tick();
  assert.deepEqual(f.replies().find((m) => m.id === 80).result, { answer: 'prefiero el morado', wasFreeform: true });
  assert.equal(f.calls('session.send').length, 0);
  assert.deepEqual(rows().at(-1).kind, 'user'); // lo escrito se ve como un mensaje suyo
  assert.equal(rows().at(-1).text, 'prefiero el morado');
  assert.ok(out.some((m) => m.type === 'ask-off' && m.requestId === 'u:R2'));

  await askNow(81, 'R3', 'q3');
  native.interrupt();
  await tick();
  assert.match(f.replies().find((m) => m.id === 81).error.message, /descartado/);
  assert.deepEqual(f.calls('session.abort').at(-1).params, { sessionId: 'S1' });
  assert.deepEqual(rows().at(-1), { kind: 'result', id: 'q3', text: DISMISSED, error: false }); // la tarjeta, «Descartada», sin esperar a que su herramienta avise
  f.event('tool.execution_complete', { toolCallId: 'q3', success: false, error: { message: 'cancelled' } });
  await tick();
  assert.equal(rows().at(-1).text, DISMISSED);
});

test('un plan: su tarjeta; aprobar o rechazar contesta a la petición', async () => {
  const f = fakeCopilot(base());
  const native = start(f);
  await native.ready;
  const { out, rows } = wire(native);
  f.ask(90, 'exitPlanMode.request', { summary: 'S', planContent: '# Plan', actions: ['interactive'], recommendedAction: 'interactive' });
  await tick();
  const ask = out.find((m) => m.type === 'ask');
  assert.deepEqual([ask.name, ask.requestId, ask.input.plan], ['ExitPlanMode', 'p:90', '# Plan']);
  assert.equal(rows()[0].plan, '# Plan');
  native.answer('p:90', { allow: true });
  assert.deepEqual(f.replies().find((m) => m.id === 90).result, { approved: true, selectedAction: 'interactive' });
  f.ask(91, 'exitPlanMode.request', { summary: 'S2', actions: [], recommendedAction: 'exit_only' });
  await tick();
  native.answer('p:91', { allow: false });
  assert.deepEqual(f.replies().find((m) => m.id === 91).result, { approved: false });
  assert.match(rows().at(-1).text, /rejected/);
});

test('va sin confirmaciones: un permiso que llegue se aprueba; cambiar a Auto, sí; lo demás no se atiende', async () => {
  const f = fakeCopilot(base());
  const native = start(f);
  await native.ready;
  wire(native);
  f.event('permission.requested', { requestId: 'P1', permissionRequest: { kind: 'shell' } });
  f.ask(95, 'autoModeSwitch.request', {});
  f.ask(96, 'hooks.invoke', {});
  await tick();
  assert.deepEqual(f.calls('session.permissions.handlePendingPermissionRequest')[0].params, { sessionId: 'S1', requestId: 'P1', result: { kind: 'approve-once' } });
  assert.equal(f.replies().find((m) => m.id === 95).result, 'yes');
  assert.equal(f.replies().find((m) => m.id === 96).error.code, -32601);
});

test('los comandos del menú: modelo y esfuerzo válidos de la cuenta; lo que no vale se ignora', async () => {
  const f = fakeCopilot(base());
  const native = start(f);
  await native.ready;
  const { metas } = wire(native);
  native.say('/effort high');      // «auto» no tiene esfuerzos
  native.say('/model inexistente');
  native.say('/model sol');
  native.say('/effort high');
  native.say('/model auto');       // el esfuerzo no vale en auto: vuelve al de serie
  native.say('/model acme/llama'); // el de la empresa: con su proveedor
  await tick();
  assert.deepEqual(metas, [{ model: 'sol', effort: null, modelVia: null }, { effort: 'high' }, { model: 'auto', effort: null, modelVia: null }, { model: 'acme/llama', effort: null, modelVia: null }]);
  assert.deepEqual(f.calls('session.model.switchTo').slice(1).map((m) => m.params), [{ sessionId: 'S1', modelId: 'sol', providerId: 'copilot' }, { sessionId: 'S1', modelId: 'auto', providerId: 'copilot' }, { sessionId: 'S1', modelId: 'acme/llama', providerId: 'acme' }]);
  assert.deepEqual(f.calls('session.model.setReasoningEffort')[0].params, { sessionId: 'S1', reasoningEffort: 'high' });
  assert.equal(f.calls('session.send').length, 0); // ninguno llegó al modelo
});

test('matar cierra el proceso y avisa a quien escuche', async () => {
  const f = fakeCopilot(base());
  const native = start(f);
  await native.ready;
  let exited = null;
  native.onExit((e) => { exited = e; });
  native.kill();
  assert.deepEqual(exited, { exitCode: 0 });
});
