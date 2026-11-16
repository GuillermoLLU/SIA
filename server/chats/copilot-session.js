// La sesión de Copilot en el bridge: `copilot --headless --stdio` (el protocolo
// de su SDK: copilot.js). spawnCopilot lanza el proceso y devuelve el chat:
//   ready                  promesa: la sesión lista → { model }; rechaza si no
//                          hay sesión de Copilot (NOT_LOGGED) o no arranca
//   sendText(text)         lo que escribe la persona (con un turno en marcha, entra en él)
//   interrupt()            parar: lo que preguntaba, descartado; el turno, abortado
//   reply(ask, result)     contestar en la tarjeta: una opción, o aprobar/rechazar un plan
//   replyText(ask, text)   contestar a su pregunta escribiendo en la caja
//   command(text)          /model y /effort: los aplica SIA → { meta } o null
//   kill() · onExit(cb) · pid
//   models, model, effort, via · busy, items, asks, listeners (los cablea session.js)
// La conversación es la sesión de Copilot y vive lo que el proceso: SIA no
// guarda históricos.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import {
  RUNTIME_ARGS, PROTOCOL_VERSION, frame, createFrameReader, sessionCreateParams, sendParams, commandOf,
  modelsOf, defaultModel, createTranslator, signalOfEvent, askOf, askMessage, planRow, planMessage, DISMISSED,
} from './copilot.js';

const COPILOT_READY_MS = 45_000; // lo que se espera a que la sesión esté lista
export const NOT_LOGGED = 'Copilot no tiene sesión iniciada';
const REJECTED = 'The plan was rejected by the user.'; // la tarjeta lo enseña como «Descartada»

export const spawnCopilot = ({
  cmd, args = RUNTIME_ARGS, cwd, env, sessionId, mcp = null,
  spawnProcess = spawn, exists = (p) => fs.existsSync(p), read = (p) => { try { return fs.readFileSync(p); } catch { return null; } },
  log = (t) => console.warn(t), setTimer = setTimeout, clearTimer = clearTimeout,
}) => {
  const proc = spawnProcess(cmd, args, { cwd, env, stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  const exitCbs = [];
  const write = (o) => { try { proc.stdin.write(frame(o)); } catch { /* ya cerrado */ } };
  let seq = 0;
  const pending = new Map();
  const request = (method, params) => new Promise((resolve, reject) => { const id = ++seq; pending.set(id, { resolve, reject }); write({ id, method, params }); });
  const respond = (id, result) => write({ id, result });
  const refuse = (id, message) => write({ id, error: { code: -32000, message } });

  const chat = {
    pid: proc.pid, busy: false, items: [], asks: new Map(), listeners: new Set(),
    say: null, answer: null, models: [], model: null, effort: null, via: null,
    kill: () => { try { proc.stdin.end(); } catch {} try { proc.kill(); } catch {} },
    onExit: (cb) => exitCbs.push(cb),
  };
  const emit = (m) => { for (const cb of chat.listeners) cb(m); };
  const transcript = (items) => { if (items.length) emit({ type: 'transcript', items }); };

  const rowsOf = createTranslator();
  let active = false;  // hay un turno en marcha (lo escrito entra en él)
  let failed = false;  // el turno acabó en error: el «listo» que venga detrás sobra
  // su pregunta llega por dos sitios: la petición (a la que se contesta) y el
  // evento (que dice de qué herramienta es: su tarjeta). Se une al tener los dos
  const askRpc = new Map();    // requestId → { rpcId, params }
  const askEvent = new Map();  // requestId → datos del evento
  const linkAsk = (requestId) => {
    const rpc = askRpc.get(requestId);
    const ev = askEvent.get(requestId);
    if (!rpc || !ev) return;
    askRpc.delete(requestId); askEvent.delete(requestId);
    const ask = askOf(rpc.params);
    let rowId = ev.toolCallId;
    if (!rowId) { rowId = `ask-${requestId}`; if (ask[0].options.length) transcript([{ kind: 'tool', id: rowId, name: 'AskUserQuestion', summary: 'Te pregunta', detail: '', ask }]); }
    emit(askMessage({ requestId: `u:${requestId}`, rowId, ask, rpcId: rpc.rpcId, freeform: rpc.params.allowFreeform !== false }));
  };

  const onEvent = (ev) => {
    const d = ev.data || {};
    const rows = rowsOf(ev);
    if (ev.type === 'user.message' && rows.length) { active = true; failed = false; }
    transcript(rows);
    if (ev.type === 'user_input.requested') { askEvent.set(d.requestId, d); linkAsk(d.requestId); return; }
    if (ev.type === 'permission.requested') { // va sin confirmaciones: se aprueba
      if (!d.resolvedByHook) request('session.permissions.handlePendingPermissionRequest', { sessionId, requestId: d.requestId, result: { kind: 'approve-once' } }).catch(() => {});
      return;
    }
    const sig = signalOfEvent(ev);
    if (!sig) return;
    if (sig.typing) emit({ type: 'typing', text: sig.typing });
    else if (sig.thinking) emit({ type: 'thinking' });
    else if (sig.busy) active = true;
    else if (sig.via) { if (sig.via !== chat.via) { chat.via = sig.via; emit({ type: 'model-via', name: sig.via }); } }
    else if (sig.model) { chat.model = sig.model; if (sig.effort !== undefined) chat.effort = sig.effort || null; emit({ type: 'model', model: sig.model }); }
    else if (sig.turn) {
      active = false;
      if (sig.turn.error) { failed = true; emit(sig.turn); } else if (failed) failed = false; else emit(sig.turn);
    }
  };

  // lo que Copilot pide al cliente: preguntar y proponer un plan (se enseñan);
  // cambiar a «Auto» si su modelo se queda sin cupo (sí); lo demás no se ofrece
  const onRequest = (id, method, p = {}) => {
    if (p.sessionId && p.sessionId !== sessionId) return refuse(id, 'otra sesión');
    if (method === 'userInput.request') { const requestId = p.requestId || `r${id}`; askRpc.set(requestId, { rpcId: id, params: p }); if (!p.requestId) askEvent.set(requestId, {}); return linkAsk(requestId); }
    if (method === 'exitPlanMode.request') {
      const rowId = `plan-${id}`;
      transcript([planRow(rowId, p)]);
      return emit(planMessage({ requestId: `p:${id}`, rowId, rpcId: id, request: p }));
    }
    if (method === 'autoModeSwitch.request') return respond(id, 'yes');
    write({ id, error: { code: -32601, message: `SIA no atiende ${method}` } });
  };

  const feed = createFrameReader();
  proc.stdout.on('data', (chunk) => {
    for (const m of feed(chunk)) {
      if (m.method && m.id != null) onRequest(m.id, m.method, m.params);
      else if (m.method === 'session.event') { if (m.params?.sessionId === sessionId && m.params.event) onEvent(m.params.event); }
      else if (m.method) { /* session.lifecycle, host.event…: nada que enseñar */ }
      else if (m.id != null && pending.has(m.id)) {
        const { resolve, reject } = pending.get(m.id);
        pending.delete(m.id);
        if (m.error) reject(new Error(m.error.message || 'error de Copilot')); else resolve(m.result);
      }
    }
  });
  proc.stdin.on('error', () => {}); // EPIPE con el proceso muerto: sin oyente tiraría el bridge
  proc.stderr.on('data', (d) => { const t = String(d).trim(); if (t && /error|fatal|panic/i.test(t)) log(`[sia] copilot: ${t.slice(0, 300)}`); });
  let gone = false;
  const exited = (code) => {
    if (gone) return;
    gone = true;
    for (const { reject } of pending.values()) reject(new Error('Copilot se ha cerrado'));
    pending.clear();
    for (const cb of exitCbs) cb({ exitCode: code });
  };
  proc.on('exit', exited);
  proc.on('error', (err) => { log(`[sia] chat de Copilot: ${err.message}`); exited(-1); });

  const modelInfo = (id) => chat.models.find((m) => m.id === id) || null;
  // el arranque: saludo, cuenta, modelos y la sesión nueva
  const start = async () => {
    let hello = null;
    try { hello = await request('connect', {}); } catch { hello = await request('ping', {}); } // runtimes anteriores a «connect»
    if (hello?.protocolVersion && hello.protocolVersion !== PROTOCOL_VERSION) log(`[sia] copilot: su protocolo es el ${hello.protocolVersion} y SIA habla el ${PROTOCOL_VERSION}; si algo falla, actualiza SIA`);
    const auth = await request('auth.getStatus', {});
    if (!auth?.isAuthenticated) throw new Error(NOT_LOGGED);
    try { chat.models = modelsOf((await request('models.list', {}))?.models); } catch { chat.models = []; }
    chat.model = defaultModel(chat.models);
    await request('session.create', sessionCreateParams({ sessionId, cwd, model: chat.model, mcp }));
    await request('session.permissions.setApproveAll', { sessionId, enabled: true }).catch(() => {});
    return { model: chat.model };
  };
  chat.ready = new Promise((resolve, reject) => {
    const t = setTimer(() => reject(new Error('Copilot no ha respondido a tiempo')), COPILOT_READY_MS);
    start().then((r) => { clearTimer(t); resolve(r); }, (e) => { clearTimer(t); reject(e); });
  });
  chat.ready.catch(() => {}); // quien lanza la sesión decide; aquí no queda una promesa sin atender

  const failTurn = (e) => emit({ type: 'turn', error: true, text: `Copilot: ${e.message}` });
  chat.sendText = (text) => {
    chat.ready.then(() => request('session.send', sendParams({ sessionId, text, busy: active, exists, read }))).then(() => { active = true; }, failTurn);
  };

  // parar (o «Ninguna» en una tarjeta): lo que preguntaba, descartado; el turno, abortado
  chat.interrupt = () => {
    for (const a of [...chat.asks.values()]) {
      if (a.plan) { respond(a.rpcId, { approved: false }); transcript([{ kind: 'result', id: a.toolUseId, text: REJECTED, error: false }]); }
      else { refuse(a.rpcId, 'La persona ha descartado la pregunta.'); transcript([{ kind: 'result', id: a.toolUseId, text: DISMISSED, error: false }]); } // al abortar, su herramienta no siempre avisa
      emit({ type: 'ask-off', requestId: a.requestId });
    }
    chat.ready.then(() => request('session.abort', { sessionId })).catch(() => {});
  };

  // contestar en la tarjeta: la opción elegida, o el plan aprobado o no
  chat.reply = (ask, { answers, allow } = {}) => {
    if (ask.plan) {
      respond(ask.rpcId, allow ? { approved: true, ...(ask.action ? { selectedAction: ask.action } : {}) } : { approved: false });
      transcript([{ kind: 'result', id: ask.toolUseId, text: allow ? 'Aprobado.' : REJECTED, error: false }]);
      return;
    }
    const q = ask.input?.questions?.[0]?.question;
    respond(ask.rpcId, { answer: String(answers?.[q] ?? ''), wasFreeform: false }); // su resultado («contestado») lo trae el evento de la herramienta
  };
  // contestar escribiendo: lo escrito es la respuesta (y se ve como un mensaje de la persona)
  chat.replyText = (ask, text) => {
    respond(ask.rpcId, { answer: text, wasFreeform: true });
    transcript([{ kind: 'user', id: `ans-${ask.requestId}`, text, ts: new Date().toISOString() }]);
  };

  // /model y /effort → { meta } (lo que cambia del chat) o null (no es un comando)
  chat.command = (text) => {
    const c = commandOf(text);
    if (!c) return null;
    const call = (method, params) => chat.ready.then(() => request(method, { sessionId, ...params })).catch((e) => log(`[sia] copilot: ${method}: ${e.message}`));
    if (c.model) {
      if (!modelInfo(c.model)) return { meta: null };
      chat.model = c.model;
      chat.via = null;
      if (chat.effort && !modelInfo(c.model).efforts.includes(chat.effort)) chat.effort = null;
      call('session.model.switchTo', { modelId: c.model, ...(chat.effort ? { reasoningEffort: chat.effort } : {}) });
      return { meta: { model: c.model, effort: chat.effort, modelVia: null } };
    }
    if (!modelInfo(chat.model)?.efforts.includes(c.effort)) return { meta: null };
    chat.effort = c.effort;
    call('session.model.setReasoningEffort', { reasoningEffort: c.effort });
    return { meta: { effort: c.effort } };
  };

  return chat;
};
