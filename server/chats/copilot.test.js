import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  frame, createFrameReader, sessionCreateParams, sendParams, imagePathsOf, commandOf, modelsOf, defaultModel, toolSummary,
  toolRowOf, createTranslator, signalOfEvent, askMessage, planRow, planMessage, RUNTIME_ARGS, DISMISSED, IMAGE_MAX_BYTES,
} from './copilot.js';

const ev = (type, data = {}, extra = {}) => ({ id: `e-${type}`, type, timestamp: '2026-11-12T12:00:00.000Z', data, ...extra });

test('el formato: cabecera Content-Length con los bytes reales, y se lee aunque llegue a trozos', () => {
  const buf = frame({ id: 1, method: 'ping', params: { message: 'ñ' } });
  const text = buf.toString('utf8');
  const body = text.slice(text.indexOf('\r\n\r\n') + 4);
  assert.match(text, /^Content-Length: \d+\r\n\r\n\{/);
  assert.equal(Number(/Content-Length: (\d+)/.exec(text)[1]), Buffer.byteLength(body)); // «ñ» son dos bytes
  assert.deepEqual(JSON.parse(body), { jsonrpc: '2.0', id: 1, method: 'ping', params: { message: 'ñ' } });
  const feed = createFrameReader();
  const two = Buffer.concat([frame({ id: 1, result: { a: 'ñ' } }), frame({ method: 'session.event', params: {} })]);
  assert.deepEqual(feed(two.subarray(0, 10)), []);
  assert.deepEqual(feed(two.subarray(10, 60)).length + feed(two.subarray(60)).length, 2);
  assert.deepEqual(createFrameReader()(two).map((m) => m.id ?? m.method), [1, 'session.event']);
});

test('la sesión: su carpeta, sin confirmaciones propias, sus preguntas y el MCP de la sesión', () => {
  const mcp = { knowledge: { command: '/app/node', args: ['/app/mcp/index.js'], env: { A: '1' } } };
  const p = sessionCreateParams({ sessionId: 's1', cwd: '/ws/modes/auto', model: 'auto', mcp });
  assert.equal(p.sessionId, 's1');
  assert.equal(p.clientName, 'sia');
  assert.equal(p.workingDirectory, '/ws/modes/auto');
  assert.deepEqual([p.streaming, p.requestPermission, p.requestUserInput, p.requestExitPlanMode, p.envValueMode], [true, true, true, true, 'direct']);
  assert.equal(p.model, 'auto');
  assert.deepEqual(p.mcpServers, { knowledge: { type: 'local', command: '/app/node', args: ['/app/mcp/index.js'], env: { A: '1' }, tools: ['*'] } });
  const bare = sessionCreateParams({ sessionId: 's2', cwd: '/x' });
  assert.equal('model' in bare || 'mcpServers' in bare || 'reasoningEffort' in bare, false); // sin base, sin MCP
  assert.ok(RUNTIME_ARGS.includes('--headless') && RUNTIME_ARGS.includes('--stdio') && RUNTIME_ARGS.includes('--disable-builtin-mcps'));
});

test('lo escrito: en cola o dentro del turno en marcha; sus imágenes, además, adjuntas', () => {
  assert.deepEqual(sendParams({ sessionId: 's', text: 'hola' }), { sessionId: 's', prompt: 'hola', mode: 'enqueue' });
  assert.equal(sendParams({ sessionId: 's', text: 'y esto', busy: true }).mode, 'immediate');
  const img = '/Users/g/Library/Application Support/SIA/uploads/3-foto.png';
  const read = (p) => (p === img ? Buffer.from('PNG!') : null);
  const sent = sendParams({ sessionId: 's', text: `mira ${img} y dime`, exists: (p) => p === img, read });
  assert.deepEqual(sent.attachments, [{ type: 'blob', data: Buffer.from('PNG!').toString('base64'), mimeType: 'image/png', displayName: '3-foto.png' }]);
  assert.equal(sent.prompt, 'mira [imagen adjunta: 3-foto.png] y dime'); // al modelo, sin la ruta (que no se ponga a abrirla)
  assert.equal(sent.displayPrompt, `mira ${img} y dime`);                 // en la conversación, lo que se escribió
  assert.equal('displayPrompt' in sendParams({ sessionId: 's', text: 'hola' }), false);
  // la que no se puede leer, pesa demasiado o no admite (bmp) se queda en su ruta del texto
  assert.equal('attachments' in sendParams({ sessionId: 's', text: `mira ${img}`, exists: () => true }), false);
  assert.equal('attachments' in sendParams({ sessionId: 's', text: `mira ${img}`, exists: () => true, read: () => Buffer.alloc(IMAGE_MAX_BYTES + 1) }), false);
  assert.equal('attachments' in sendParams({ sessionId: 's', text: 'mira /a/b.bmp', exists: () => true, read: () => Buffer.from('x') }), false);
});

test('las rutas de imagen de un texto, también con espacios en la ruta; sin ruta, nada', () => {
  assert.deepEqual(imagePathsOf('mira /ws/uploads/1-foto.png y dime'), ['/ws/uploads/1-foto.png']);
  const mac = '/Users/g/Library/Application Support/SIA/uploads/3-foto.png';
  assert.deepEqual(imagePathsOf(`¿qué color? y/o ${mac}`, (p) => p === mac), [mac]);
  assert.deepEqual(imagePathsOf(`${mac}\notra C:\\Users\\g\\a.jpg`, () => true), [mac, 'C:\\Users\\g\\a.jpg']);
  assert.deepEqual(imagePathsOf('nada.png suelto', () => true), []);
});

test('los comandos del menú de modelo los aplica SIA', () => {
  assert.deepEqual(commandOf('/model gpt-6.1-sol'), { model: 'gpt-6.1-sol' });
  assert.deepEqual(commandOf(' /effort high '), { effort: 'high' });
  assert.deepEqual(commandOf('/compact'), { compact: true });
  assert.equal(commandOf('/model'), null);
  assert.equal(commandOf('/modelo raro'), null);
  assert.equal(commandOf('hola /model x'), null);
});

test('los modelos de la cuenta; para abrir, «auto» o el primero', () => {
  const models = modelsOf([
    { id: 'auto', name: 'Auto', capabilities: {} },
    { id: 'gpt-6-sol', name: 'GPT-6 Sol', supportedReasoningEfforts: ['low', 'high'], defaultReasoningEffort: 'low', billing: { multiplier: 3 } },
    { id: 'vetado', name: 'X', policy: { state: 'disabled' } },
  ]);
  assert.deepEqual(models, [
    { id: 'auto', label: 'Auto', hint: 'elige Copilot por ti', efforts: [], defaultEffort: null },
    { id: 'gpt-6-sol', label: 'GPT-6 Sol', hint: '×3', efforts: ['low', 'high'], defaultEffort: 'low' },
  ]);
  assert.equal(defaultModel(models), 'auto');
  assert.equal(defaultModel(models.slice(1)), 'gpt-6-sol');
  assert.equal(defaultModel([]), null);
});

test('una frase por herramienta, y las de Copilot con sus nombres comunes', () => {
  assert.equal(toolSummary('Read', { file_path: 'web/src/main.js' }), 'Leyó web/src/main.js');
  assert.equal(toolSummary('mcp__knowledge__search_knowledge', { query: 'teclado' }), 'Consultó el conocimiento: «teclado»');
  assert.equal(toolSummary('mcp__github__create_pr', {}), 'Usó github · create_pr');
  assert.equal(toolSummary('Raro', {}), 'Usó Raro');
  assert.deepEqual(toolRowOf({ toolName: 'bash', arguments: { command: 'ls -la', description: 'x' } }), { name: 'Bash', summary: 'Ejecutó ls -la', detail: 'ls -la' });
  assert.equal(toolRowOf({ toolName: 'view', arguments: { path: '/a/b.md' } }).summary, 'Leyó /a/b.md');
  assert.equal(toolRowOf({ toolName: 'create', arguments: { path: 'a.js', file_text: 'x' } }).summary, 'Escribió a.js');
  const edit = toolRowOf({ toolName: 'edit', arguments: { path: 'a.js', old_str: 'a', new_str: 'b' } });
  assert.deepEqual([edit.summary, edit.detail], ['Editó a.js', '- a\n+ b']);
  assert.equal(toolRowOf({ toolName: 'grep', arguments: { pattern: 'TODO' } }).summary, 'Buscó «TODO»');
  assert.equal(toolRowOf({ toolName: 'web_fetch', arguments: { url: 'https://x.dev' } }).summary, 'Consultó https://x.dev');
  assert.equal(toolRowOf({ toolName: 'knowledge-search_knowledge', mcpServerName: 'knowledge', mcpToolName: 'search_knowledge', arguments: { query: 'wifi' } }).summary, 'Consultó el conocimiento: «wifi»');
  assert.equal(toolRowOf({ toolName: 'skill', arguments: { skill: 'jira-access' } }).summary, 'Usó la skill jira-access');
  assert.equal(toolRowOf({ toolName: 'rara', toolTitle: 'Cosa rara', arguments: {} }).summary, 'Usó Cosa rara');
});

test('cada evento, en piezas: lo de la persona, lo que dice, herramientas y resultados; lo de un subagente, no', () => {
  const rows = createTranslator();
  assert.deepEqual(rows(ev('user.message', { content: 'hola' })), [{ kind: 'user', id: 'e-user.message', text: 'hola', ts: '2026-11-12T12:00:00.000Z' }]);
  assert.deepEqual(rows(ev('user.message', { content: 'aviso', source: 'system' })), []);
  assert.deepEqual(rows(ev('assistant.message', { messageId: 'm1', content: 'Hecho.' })), [{ kind: 'text', id: 'm1', text: 'Hecho.', ts: '2026-11-12T12:00:00.000Z' }]);
  assert.deepEqual(rows(ev('assistant.message', { messageId: 'm2', content: '', toolRequests: [{}] })), []);
  assert.deepEqual(rows(ev('assistant.message', { messageId: 'm3', content: 'de un subagente', parentToolCallId: 't9' })), []);
  assert.deepEqual(rows(ev('assistant.message', { messageId: 'm4', content: 'otro' }, { agentId: 'sub1' })), []);
  const start = rows(ev('tool.execution_start', { toolCallId: 'c1', toolName: 'bash', arguments: { command: 'echo hola' } }));
  assert.deepEqual(start.map((r) => [r.kind, r.id, r.name, r.summary, r.detail]), [['tool', 'c1', 'Bash', 'Ejecutó echo hola', 'echo hola']]);
  assert.deepEqual(rows(ev('tool.execution_complete', { toolCallId: 'c1', success: true, result: { content: 'hola\n<shellId: 0 completed with exit code 0>' } })), [{ kind: 'result', id: 'c1', text: 'hola', error: false }]);
  assert.deepEqual(rows(ev('tool.execution_complete', { toolCallId: 'c2', success: false, error: { message: 'no existe' } })), [{ kind: 'result', id: 'c2', text: 'no existe', error: true }]);
  // su intención es ruido: ni fila ni resultado
  assert.deepEqual(rows(ev('tool.execution_start', { toolCallId: 'i1', toolName: 'report_intent', arguments: { intent: 'x' } })), []);
  assert.deepEqual(rows(ev('tool.execution_complete', { toolCallId: 'i1', success: true, result: { content: 'ok' } })), []);
  assert.deepEqual(rows(ev('assistant.message_delta', { deltaContent: 'x' })), []);
});

test('su pregunta (ask_user): la tarjeta de opciones, y contestada con lo que se eligió; sin opciones, su texto', () => {
  const rows = createTranslator();
  const [card] = rows(ev('tool.execution_start', { toolCallId: 'q1', toolName: 'ask_user', arguments: { question: '¿Qué color prefieres?', choices: ['Rojo', 'Verde'] } }));
  assert.deepEqual([card.kind, card.id, card.name], ['tool', 'q1', 'AskUserQuestion']);
  assert.deepEqual(card.ask, [{ question: '¿Qué color prefieres?', header: '', multi: false, options: [{ label: 'Rojo', description: '' }, { label: 'Verde', description: '' }] }]);
  assert.deepEqual(rows(ev('tool.execution_complete', { toolCallId: 'q1', success: true, result: { content: 'User selected: Verde' } })), [{ kind: 'result', id: 'q1', text: '"¿Qué color prefieres?"="Verde"', error: false }]);
  rows(ev('tool.execution_start', { toolCallId: 'q2', toolName: 'ask_user', arguments: { question: '¿Otra?', choices: ['Sí'] } }));
  assert.equal(rows(ev('tool.execution_complete', { toolCallId: 'q2', success: false, error: { message: 'cancelled' } }))[0].text, DISMISSED);
  // sin opciones: la pregunta como texto, y su resultado no pinta nada (lo contestado ya es un mensaje de la persona)
  assert.deepEqual(rows(ev('tool.execution_start', { toolCallId: 'q3', toolName: 'ask_user', arguments: { question: '¿Cómo te llamas?' } })).map((r) => [r.kind, r.text]), [['text', '¿Cómo te llamas?']]);
  assert.deepEqual(rows(ev('tool.execution_complete', { toolCallId: 'q3', success: true, result: { content: 'User responded: Guille' } })), []);
});

test('los avisos: lo que escribe, que piensa, con qué modelo va de verdad y el fin', () => {
  assert.deepEqual(signalOfEvent(ev('assistant.message_delta', { deltaContent: 'Ho' })), { typing: 'Ho' });
  assert.equal(signalOfEvent(ev('assistant.message_delta', { deltaContent: 'x', parentToolCallId: 't' })), null);
  assert.deepEqual(signalOfEvent(ev('assistant.reasoning_delta', { deltaContent: '…' })), { thinking: true });
  assert.deepEqual(signalOfEvent(ev('assistant.usage', { model: 'gpt-6-luna', modelDisplayName: 'GPT-6 Luna' })), { via: 'GPT-6 Luna' });
  assert.deepEqual(signalOfEvent(ev('session.model_change', { newModel: 'gpt-6-sol', reasoningEffort: 'high' })), { model: 'gpt-6-sol', effort: 'high' });
  assert.deepEqual(signalOfEvent(ev('session.idle', {})), { turn: { type: 'turn', error: false, text: '' } });
  assert.deepEqual(signalOfEvent(ev('session.error', { message: 'Model "x" is not available.' })).turn, { type: 'turn', error: true, text: 'Model "x" is not available.' });
  assert.equal(signalOfEvent(ev('model.telemetry', {})), null);
});

test('la pregunta viva y el plan, como avisos para la vista', () => {
  const ask = [{ question: '¿Color?', header: '', multi: false, options: [{ label: 'Rojo', description: '' }] }];
  assert.deepEqual(askMessage({ requestId: 'u:r1', rowId: 'q1', ask, rpcId: 7 }), {
    type: 'ask', requestId: 'u:r1', toolUseId: 'q1', name: 'AskUserQuestion', input: { questions: [{ question: '¿Color?', header: '', multiSelect: false, options: ask[0].options }] }, rpcId: 7, freeform: true,
  });
  const req = { summary: 'Resumen', planContent: '# Plan\n1. Uno', actions: ['interactive', 'exit_only'], recommendedAction: 'interactive' };
  assert.deepEqual(planRow('plan-9', req), { kind: 'tool', id: 'plan-9', name: 'ExitPlanMode', summary: 'Te propone un plan', detail: '', plan: '# Plan\n1. Uno' });
  assert.deepEqual(planMessage({ requestId: 'p:9', rowId: 'plan-9', rpcId: 9, request: req }), { type: 'ask', requestId: 'p:9', toolUseId: 'plan-9', name: 'ExitPlanMode', input: { plan: '# Plan\n1. Uno' }, rpcId: 9, plan: true, action: 'interactive' });
});
