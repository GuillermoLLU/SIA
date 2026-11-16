// El chat de Copilot sin terminal: el CLI de GitHub en su modo programable
// (`copilot --headless --stdio`), que es el protocolo de su SDK oficial
// (@github/copilot-sdk): JSON-RPC 2.0 con cabecera Content-Length, como LSP.
// SIA le habla así:
//   → connect                                     el saludo (versión del protocolo)
//   → auth.getStatus · models.list                la cuenta y sus modelos
//   → session.create                              la conversación (su id lo pone SIA), con el MCP de conocimiento
//   → session.send                                lo que escribe la persona
//   → session.abort                               parar
//   → session.model.switchTo / setReasoningEffort cambiar de modelo o de esfuerzo
//   ← session.event (notificación)                todo lo que pasa, evento a evento:
//        user.message · assistant.message(_delta) · assistant.reasoning_delta ·
//        tool.execution_start/complete · session.idle · session.error…
//   ← userInput.request (petición)                pregunta (ask_user) y espera; el evento
//        user_input.requested dice de qué herramienta es (su tarjeta)
//   ← exitPlanMode.request (petición)             propone un plan y espera
// Aquí, lo puro: el formato, lo que se manda y cómo cada evento se convierte en
// las piezas de la conversación que pinta la web (web/src/chat/conversation/):
//   { kind: 'user', id, text, ts }                   lo que escribió la persona
//   { kind: 'text', id, text, ts }                   lo que responde (Markdown)
//   { kind: 'tool', id, name, summary, detail, ts }  una herramienta; si pregunta, ask:
//     [{ question, header, options: [{ label, description }], multi }]; si propone
//     un plan, plan: Markdown
//   { kind: 'result', id, text, error }              lo que devolvió (id = el de su tool)
// El proceso lo lleva copilot-session.js.
import path from 'node:path';

export const PROTOCOL_VERSION = 3; // la del SDK con el que se hizo esto (connect la devuelve)
// --disable-builtin-mcps: sus herramientas de GitHub integradas actúan con la
// cuenta de Copilot; en SIA los repos van con la clave de GitHub de la persona (git, gh)
export const RUNTIME_ARGS = ['--headless', '--no-auto-update', '--log-level', 'error', '--stdio', '--disable-builtin-mcps'];

const MAX_RESULT = 1500; // lo que se guarda de un resultado (puede ser un fichero entero)
const MAX_DETAIL = 600;
const cut = (t, n) => { const s = String(t ?? ''); return s.length > n ? `${s.slice(0, n)}…` : s; };
const short = (v, n = 80) => cut(String(v ?? '').split('\n')[0], n);

// ── el formato: «Content-Length: N\r\n\r\n» y el JSON ──
export const frame = (o) => {
  const body = Buffer.from(JSON.stringify({ jsonrpc: '2.0', ...o }), 'utf8');
  return Buffer.concat([Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, 'ascii'), body]);
};
// lo leído puede venir a trozos: → feed(trozo) devuelve los mensajes completos
export const createFrameReader = () => {
  let buf = Buffer.alloc(0);
  return (chunk) => {
    buf = Buffer.concat([buf, Buffer.from(chunk)]);
    const out = [];
    for (;;) {
      const head = buf.indexOf('\r\n\r\n');
      if (head < 0) break;
      const m = /content-length: *(\d+)/i.exec(buf.subarray(0, head).toString('ascii'));
      if (!m) { buf = buf.subarray(head + 4); continue; } // cabecera rara: se salta
      const n = Number(m[1]);
      if (buf.length < head + 4 + n) break;
      try { out.push(JSON.parse(buf.subarray(head + 4, head + 4 + n).toString('utf8'))); } catch { /* cuerpo roto: fuera */ }
      buf = buf.subarray(head + 4 + n);
    }
    return out;
  };
};

// ── lo que se manda ──
// mcp: { nombre: { command, args, env } } (el de conocimiento de la sesión; null sin base).
// requestPermission: los permisos se nos piden (y se aprueban: va sin
// confirmaciones, como iba en terminal); requestUserInput/ExitPlanMode: sus
// preguntas y sus planes vienen a la tarjeta
export const sessionCreateParams = ({ sessionId, cwd, model = null, effort = null, mcp = null }) => ({
  sessionId, clientName: 'sia', workingDirectory: cwd, streaming: true, includeSubAgentStreamingEvents: false,
  requestPermission: true, requestUserInput: true, requestExitPlanMode: true, envValueMode: 'direct',
  ...(model ? { model } : {}), ...(effort ? { reasoningEffort: effort } : {}),
  ...(mcp ? { mcpServers: Object.fromEntries(Object.entries(mcp).map(([name, s]) => [name, { type: 'local', command: s.command, args: s.args || [], env: s.env || {}, tools: ['*'] }])) } : {}),
});

// Las rutas de imagen que lleva un texto (los adjuntos, que la web escribe como
// su ruta). Pueden llevar espacios («…/Application Support/SIA/…/uploads/1-foto.png»):
// de cada final de imagen hacia atrás, el principio de ruta más largo (tras un
// espacio o a principio de línea) que exista de verdad.
const IMAGE_END = /\.(png|jpe?g|gif|webp|bmp)(?=\s|$)/gi;
const STARTS = /(?:^|\s)(\/|[A-Za-z]:\\)/g;
export const imagePathsOf = (text, exists = () => true) => {
  const found = [];
  for (const line of String(text).split('\n')) {
    const starts = [...line.matchAll(STARTS)].map((m) => m.index + m[0].length - m[1].length);
    for (const end of line.matchAll(IMAGE_END)) {
      const stop = end.index + end[0].length;
      const p = starts.filter((s) => s < stop).map((s) => line.slice(s, stop)).find((c) => exists(c));
      if (p && !found.includes(p)) found.push(p);
    }
  }
  return found;
};

// Las imágenes adjuntas van en el texto como rutas (así se ven en la burbuja
// de la persona) y, además, dentro del mensaje (blob: su contenido en base64),
// que es como el modelo las ve de verdad. Y a él, en vez de la ruta, se le
// dice «[imagen adjunta: nombre]»: viendo una ruta se pone a abrirla con
// herramientas aunque ya la tenga delante. En la conversación sigue saliendo
// lo que se escribió (displayPrompt). Las que no admite (bmp…) o pesan
// demasiado se quedan en su ruta.
// busy: con un turno en marcha, lo escrito entra en él (immediate) en vez de esperar
const IMAGE_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
export const IMAGE_MAX_BYTES = 3 * 1024 * 1024; // el tope de imagen de sus modelos
export const sendParams = ({ sessionId, text, busy = false, exists, read = () => null }) => {
  let prompt = text;
  const attachments = imagePathsOf(text, exists).flatMap((p) => {
    const mimeType = IMAGE_MIME[path.extname(p).slice(1).toLowerCase()];
    const data = mimeType ? read(p) : null;
    if (!data || data.length > IMAGE_MAX_BYTES) return [];
    const displayName = path.basename(p);
    prompt = prompt.split(p).join(`[imagen adjunta: ${displayName}]`);
    return [{ type: 'blob', data: Buffer.from(data).toString('base64'), mimeType, displayName }];
  });
  return { sessionId, prompt, mode: busy ? 'immediate' : 'enqueue', ...(attachments.length ? { displayPrompt: text, attachments } : {}) };
};

// «/model x», «/effort x», «/compact» (los manda el menú del chat, o se
// escriben): los aplica SIA, no van al modelo → { model } | { effort } | { compact } | null
export const commandOf = (text) => {
  const m = /^\/(model|effort|compact)(?:\s+(\S+))?\s*$/.exec(String(text || '').trim());
  if (!m) return null;
  if (m[1] === 'compact') return { compact: true };
  return m[2] ? { [m[1]]: m[2] } : null;
};

// ── los modelos (models.list): con su nombre y los esfuerzos que admite cada uno ──
export const modelsOf = (list) => (Array.isArray(list) ? list : [])
  .filter((m) => m && m.id && m.policy?.state !== 'disabled')
  .map((m) => ({
    id: String(m.id),
    label: String(m.name || m.id),
    hint: m.id === 'auto' ? 'elige Copilot por ti' : (m.billing?.multiplier != null && m.billing.multiplier !== 1 ? `×${m.billing.multiplier}` : ''),
    efforts: (m.supportedReasoningEfforts || []).map(String),
    defaultEffort: m.defaultReasoningEffort ? String(m.defaultReasoningEffort) : null,
  }));
// el modelo con el que abrir: «auto» (elige Copilot) o, si la cuenta no lo tiene, el primero
export const defaultModel = (models) => (models.find((m) => m.id === 'auto') || models[0])?.id || null;

// ── las herramientas: una frase para cada una, sin abrirla ──
export const toolSummary = (name, input = {}) => {
  const i = input || {};
  switch (name) {
    case 'Read': return `Leyó ${short(i.file_path)}`;
    case 'Write': return `Escribió ${short(i.file_path)}`;
    case 'Edit': return `Editó ${short(i.file_path)}`;
    case 'Bash': return `Ejecutó ${short(i.command)}`;
    case 'Grep': return `Buscó «${short(i.pattern, 50)}»`;
    case 'Glob': return `Buscó ficheros ${short(i.pattern, 50)}`;
    case 'WebFetch': return `Consultó ${short(i.url)}`;
    case 'WebSearch': return `Buscó en internet «${short(i.query, 60)}»`;
    case 'Task': return `Encargó una tarea: ${short(i.description, 60)}`;
    case 'mcp__knowledge__search_knowledge': return `Consultó el conocimiento: «${short(i.query, 60)}»`;
    case 'mcp__knowledge__ingest_knowledge': return 'Guardó conocimiento';
    default: return name.startsWith('mcp__') ? `Usó ${name.split('__').slice(1).join(' · ')}` : `Usó ${name}`;
  }
};
// el nombre y los argumentos de una herramienta de Copilot, con nombres comunes (toolSummary los resume)
const TOOL_AS = {
  bash: (a) => ['Bash', { command: a.command }],
  view: (a) => ['Read', { file_path: a.path }],
  create: (a) => ['Write', { file_path: a.path }],
  edit: (a) => ['Edit', { file_path: a.path, old_string: a.old_str, new_string: a.new_str }],
  grep: (a) => ['Grep', { pattern: a.pattern }],
  glob: (a) => ['Glob', { pattern: a.pattern }],
  web_fetch: (a) => ['WebFetch', { url: a.url }],
  web_search: (a) => ['WebSearch', { query: a.query }],
  task: (a) => ['Task', { description: a.description || a.name }],
};
const OWN_SUMMARY = {
  skill: (a) => `Usó la skill ${short(a.skill, 40)}`,
  read_bash: () => 'Leyó la salida de un comando',
  stop_bash: () => 'Paró un comando',
  list_bash: () => 'Miró los comandos en marcha',
  read_agent: () => 'Leyó lo que lleva un subagente',
  write_agent: () => 'Habló con un subagente',
  list_agents: () => 'Miró sus subagentes',
};
export const toolRowOf = (data) => {
  const a = data.arguments || {};
  if (data.mcpServerName && data.mcpToolName) {
    const name = `mcp__${data.mcpServerName}__${data.mcpToolName}`;
    return { name, summary: toolSummary(name, a), detail: JSON.stringify(a, null, 2) };
  }
  const as = TOOL_AS[data.toolName]?.(a);
  if (as) {
    const [name, input] = as;
    const detail = name === 'Bash' ? String(a.command || '') : name === 'Edit' && a.old_str != null ? `- ${a.old_str}\n+ ${a.new_str}` : JSON.stringify(a, null, 2);
    return { name, summary: toolSummary(name, input), detail };
  }
  return { name: data.toolName, summary: OWN_SUMMARY[data.toolName]?.(a) || `Usó ${data.toolTitle || data.toolName}`, detail: JSON.stringify(a, null, 2) };
};

// ── lo que llega: cada evento, en piezas ──
// no son del agente principal (un subagente) o no los escribió la persona
const nested = (ev) => !!ev.agentId || !!ev.data?.parentToolCallId;
export const ASK_TOOL = 'ask_user';
const QUIET_TOOLS = new Set(['report_intent', ASK_TOOL]); // su intención (ruido) y su pregunta (va en tarjeta)
const tsOf = (ev) => ev.timestamp || null;

// la pregunta de ask_user, con la forma de la tarjeta de opciones
export const askOf = ({ question, choices }) => [{
  question: String(question || ''), header: '', multi: false,
  options: (Array.isArray(choices) ? choices : []).map((c) => ({ label: String(c), description: '' })),
}];
export const askInputOf = (ask) => ({ questions: ask.map((q) => ({ question: q.question, header: q.header, multiSelect: q.multi, options: q.options })) });
const shellTail = /\n?<shellId: \d+ completed with exit code \d+>\s*$/; // lo que el runtime añade a la salida de un comando

// lo contestado, como lo anota la tarjeta («"¿pregunta?"="respuesta"»); y la descartada
export const ANSWERED = (pairs) => pairs.map(([q, a]) => `"${q}"="${a}"`).join(' ');
export const DISMISSED = '[Request interrupted by user]';
const ANSWER_PREFIX = /^User (selected|responded|answered|input)[^:]*:\s*/i; // «User selected: Verde»

// Las piezas de cada evento (0 o más), con memoria de lo que no lleva fila: los
// resultados de su intención sobran, y el de una pregunta sale como
// «contestada» con lo que se le dijo (o descartada).
export const createTranslator = () => {
  const quiet = new Set();  // toolCallId de lo que no lleva fila
  const asked = new Map();  // toolCallId de una pregunta → su texto
  return (ev) => {
    const d = ev?.data || {};
    if (!ev || nested(ev)) return [];
    switch (ev.type) {
      case 'user.message': {
        if (d.source && d.source !== 'user') return []; // avisos del sistema o de otros agentes
        const text = String(d.content || '').trim();
        return text ? [{ kind: 'user', id: ev.id, text, ts: tsOf(ev) }] : [];
      }
      case 'assistant.message':
        return String(d.content || '').trim() ? [{ kind: 'text', id: d.messageId || ev.id, text: d.content, ts: tsOf(ev) }] : [];
      case 'tool.execution_start': {
        if (d.toolName === ASK_TOOL) { // su pregunta: la tarjeta (con opciones) o, sin ellas, su texto
          const ask = askOf(d.arguments || {});
          if (!ask[0].question) { quiet.add(d.toolCallId); return []; }
          if (!ask[0].options.length) { quiet.add(d.toolCallId); return [{ kind: 'text', id: d.toolCallId, text: ask[0].question, ts: tsOf(ev) }]; }
          asked.set(d.toolCallId, ask[0].question);
          return [{ kind: 'tool', id: d.toolCallId, name: 'AskUserQuestion', summary: 'Te pregunta', detail: '', ask, ts: tsOf(ev) }];
        }
        if (QUIET_TOOLS.has(d.toolName)) { quiet.add(d.toolCallId); return []; }
        const t = toolRowOf(d);
        return [{ kind: 'tool', id: d.toolCallId, name: t.name, summary: t.summary, detail: cut(t.detail, MAX_DETAIL), ts: tsOf(ev) }];
      }
      case 'tool.execution_complete': {
        if (quiet.has(d.toolCallId)) return [];
        if (asked.has(d.toolCallId)) {
          const answer = String(d.result?.content ?? '').replace(ANSWER_PREFIX, '').trim();
          return [{ kind: 'result', id: d.toolCallId, text: d.success === false ? DISMISSED : ANSWERED([[asked.get(d.toolCallId), answer]]), error: false }];
        }
        const text = d.success === false ? (d.error?.message || 'No se pudo.') : String(d.result?.content ?? '').replace(shellTail, '');
        return [{ kind: 'result', id: d.toolCallId, text: cut(text, MAX_RESULT), error: d.success === false }];
      }
      default: return [];
    }
  };
};

// ── los avisos (no son piezas): lo que escribe, que piensa, con qué modelo va, que acabó ──
//   { typing }  { thinking }  { busy }  { via }  { model, effort }  { turn }
export const signalOfEvent = (ev) => {
  const d = ev?.data || {};
  if (!ev) return null;
  switch (ev.type) {
    case 'assistant.message_delta': return !nested(ev) && d.deltaContent ? { typing: d.deltaContent } : null;
    case 'assistant.reasoning_delta': return nested(ev) ? null : { thinking: true };
    case 'assistant.turn_start': return nested(ev) ? null : { busy: true };
    // con qué modelo ha contestado de verdad (con «Auto» lo elige Copilot en cada turno)
    case 'assistant.usage': return !nested(ev) && (d.modelDisplayName || d.model) ? { via: String(d.modelDisplayName || d.model) } : null;
    case 'session.model_change': return d.newModel ? { model: String(d.newModel), effort: d.reasoningEffort ?? undefined } : null;
    case 'session.error': return { turn: { type: 'turn', error: true, text: String(d.message || 'Copilot no pudo terminar.') } };
    case 'session.idle': return { turn: { type: 'turn', error: false, text: '' } };
    default: return null;
  }
};

// el aviso de una pregunta viva, para la vista: { type: 'ask', requestId, toolUseId, name, input, rpcId, freeform }
// freeform: escribir en la caja también la contesta (sin elegir opción)
export const askMessage = ({ requestId, rowId, ask, rpcId, freeform = true }) => ({
  type: 'ask', requestId, toolUseId: rowId, name: 'AskUserQuestion', input: askInputOf(ask), rpcId, freeform,
});
// el plan que propone (exitPlanMode.request): su fila y el aviso para aprobarlo o rechazarlo
export const planRow = (id, { summary, planContent }) => ({ kind: 'tool', id, name: 'ExitPlanMode', summary: 'Te propone un plan', detail: '', plan: String(planContent || summary || '') });
export const planMessage = ({ requestId, rowId, rpcId, request }) => ({
  type: 'ask', requestId, toolUseId: rowId, name: 'ExitPlanMode', input: { plan: String(request.planContent || request.summary || '') }, rpcId, plan: true, action: request.recommendedAction || null,
});
