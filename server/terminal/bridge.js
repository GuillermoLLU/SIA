// El bridge de los chats: cada WebSocket es un cliente, cada sesión un CLI
// (Copilot sin terminal, por el protocolo de su SDK: chats/; Claude y Codex en
// un PTY), y las sesiones sobreviven a las conexiones (sessions.js). Todo lo
// demás llega inyectado: pty, los CLIs (launchers/), el workspace, el entorno
// personal, las issues (para el chat de una issue), el acceso a la base y el
// candado.
//   deps: pty, launchers, workspace, env() → entorno de los chats,
//         issues.find(id), accessibleProjects(base), currentBase(), skillsOf(base),
//         skillSync, lock, allowed(req, { issue }) → si quien conecta puede abrir ese chat,
//         copilotStatus() → la cuenta de Copilot ({ ok, loggedIn }), para la tarjeta de «sin sesión»,
//         spawnNative (chats/copilot-session.js) y newId (el id de la sesión de Copilot)
import { randomUUID } from 'node:crypto';
import { CLOSE, MAX_ASSETS, appendBuffer, sessionList, pickMode, pickProjects, isIssueId, assetFrom, firstPrompt, metaOf } from './sessions.js';
import { issueContext } from '../issues/context.js';
import { spawnCopilot, NOT_LOGGED } from '../chats/copilot-session.js';
import { wireNative, nativeSnapshot } from '../chats/session.js';

export const createTerminalBridge = ({ pty, launchers, workspace, env, issues, accessibleProjects, currentBase, skillsOf, skillSync, lock, allowed, copilotStatus = async () => null, spawnNative = spawnCopilot, newId = randomUUID }) => {
  const sessions = new Map(); // id → { id, term, native, buffer, meta, assets, ws }
  const servers = [];         // los WebSocketServer que entran por aquí
  let seq = 0;

  const clients = () => servers.flatMap((s) => [...s.clients]);
  const send = (ws, obj) => { if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj)); };
  const broadcast = (obj) => { const msg = JSON.stringify(obj); for (const c of clients()) if (c.readyState === c.OPEN) c.send(msg); };
  // la lista de chats en TODOS los dispositivos: en cada cambio (crear, matar, engancharse, adjuntar…)
  const broadcastSessions = () => broadcast({ type: 'sessions', sessions: sessionList(sessions) });
  const closeQuietly = (ws, code, reason) => { try { ws.close(code, reason); } catch { /* ya cerrado */ } };

  // Copilot sin terminal: la sesión, lista antes de seguir (su cuenta, sus
  // modelos). Sin sesión de Copilot, el error lo dice (auth) para llevar a
  // iniciarla. → { term, native } o { error, auth? }
  const spawnCopilotSession = async (spawn, { cwd, cols, rows }) => {
    const { env: e, args } = launchers.envFor(launchers.byId('copilot'), env());
    const { term, native } = spawnNative({ cmd: spawn.cmd, args: [...spawn.args, ...args], cwd, env: e, cols, rows, sessionId: newId(), mcp: spawn.mcp });
    try { await native.ready; } catch (err) {
      term.kill();
      if (err.message === NOT_LOGGED) return { error: 'Copilot no tiene sesión iniciada. Entra con tu cuenta en Configuración → Proveedores IA.', auth: 'copilot' };
      return { error: `Copilot no arrancó: ${err.message}. Comprueba su sesión en Configuración → Proveedores IA y, si es una versión antigua, actualízalo con «copilot update».` };
    }
    return { term, native };
  };

  // issue: el chat de una issue arranca con sus datos; prompt: el Chat, con la pregunta escrita
  const spawnSession = async (ws, { launcherId, knowledge, projects, cols, rows, issue, prompt }) => {
    const def = launchers.byId(launcherId);
    if (!launchers.installed(def)) return send(ws, { type: 'error', message: `"${def.cmd}" no está instalado.` });
    const mode = pickMode(knowledge);
    const id = `s${++seq}`;
    const base = currentBase();
    const picked = pickProjects((await accessibleProjects(base)).map((p) => p.id), projects);
    const first = issue ? issueContext(issue) : prompt;
    const spawn = launchers.prepare(def, id, picked, base, def.native ? null : first);
    const cwd = workspace.modeDirFor(mode, base);
    let term;
    let native = null;
    if (def.native) {
      const r = await spawnCopilotSession(spawn, { cwd, cols, rows });
      if (r.error) return send(ws, { type: 'error', message: r.error, ...(r.auth ? { auth: r.auth } : {}) });
      ({ term, native } = r);
    } else {
      try {
        term = pty.spawn(spawn.cmd, spawn.args, { name: 'xterm-color', cols: cols > 0 ? cols : 80, rows: rows > 0 ? rows : 24, cwd, env: env() });
      } catch (err) {
        return send(ws, { type: 'error', message: `No se pudo lanzar: ${err.message}` });
      }
    }
    const meta = { launcher: def.id, knowledge: mode, ...(issue ? { issue: issue.id } : {}), ...(native ? { native: true, model: native.model, effort: native.effort, modelVia: null, models: native.models } : {}) };
    const s = { id, term, native, buffer: '', meta, assets: [], ws: null };
    sessions.set(id, s);
    console.log(`[sia] session open (${def.id}${issue ? `, issue ${issue.id}` : ''}, conocimiento ${mode}, base ${base?.name || '-'}, proyectos [${picked.join(',')}], id ${id}, pid ${term.pid})`);
    term.onData((data) => { s.buffer = appendBuffer(s.buffer, data); send(s.ws, { type: 'data', data }); });
    term.onExit(() => {
      console.log(`[sia] session ended (id ${id})`);
      sessions.delete(id);
      launchers.cleanup(id);
      send(s.ws, { type: 'exit' });
      if (s.ws) closeQuietly(s.ws);
      broadcastSessions(); // el chat desaparece en todos los dispositivos
    });
    // sin terminal: lo que dice va en JSON a quien tenga el chat; el modelo y
    // el esfuerzo, en la sesión (y en la lista de chats, para quien se enganche)
    if (native) {
      wireNative(native, {
        out: (m) => send(s.ws, m),
        meta: s.meta,
        onMeta: (patch) => { Object.assign(s.meta, patch); send(s.ws, { type: 'meta', ...metaOf(s.meta) }); broadcastSessions(); },
        firstSay: first,
        authStatus: copilotStatus,
      });
    }
    return s;
  };
  // engancharse a un chat: lo que lleva (el scrollback o, sin terminal, la conversación y lo que pregunta)
  const hello = (ws, s) => {
    send(ws, { type: 'history', data: s.buffer });
    if (s.native) { nativeSnapshot(s.native, (m) => send(ws, m)); send(ws, { type: 'meta', ...metaOf(s.meta) }); }
  };

  const handleConnection = (ws, req) => {
    // pantalla bloqueada: nada de sockets NUEVOS (una ventana recargada no puede
    // engancharse a los chats hasta dar la clave); los que ya estaban abiertos
    // siguen, que es lo que mantiene los chats a la vista
    if (lock.locked()) {
      return closeQuietly(ws, CLOSE.LOCKED, 'bloqueado');
    }
    let sess = null; // la sesión enganchada a ESTE socket
    skillSync.maybe(currentBase()); // la copia local al día en segundo plano (el siguiente chat lo ve)
    accessibleProjects(currentBase()).then((projects) =>
      send(ws, { type: 'launchers', list: launchers.list(), skills: skillsOf(currentBase()), sessions: sessionList(sessions), accessProjects: projects }));

    // Un socket por sesión: el que la tenía recibe 4409 y pasa a pasivo.
    const bind = (s) => {
      if (s.ws && s.ws !== ws) closeQuietly(s.ws, CLOSE.HANDOFF, 'handoff');
      s.ws = ws;
      sess = s;
      broadcastSessions();
    };

    let starting = false;
    // El chat de una issue es uno por issue y vive hasta que se cierre: arranca
    // con sus datos como primer mensaje y no cuenta como el chat del Chat.
    const start = async (msg) => {
      if (sess || starting) return;
      starting = true;
      try {
        const forIssue = msg.issue !== undefined && msg.issue !== null;
        if (!(await allowed(req, { issue: forIssue }))) return send(ws, { type: 'error', message: forIssue ? 'Sin la vista Issues no se abre el chat de una issue.' : 'No tienes el Chat.' });
        let issue = null;
        if (forIssue) {
          issue = isIssueId(msg.issue) ? issues.find(msg.issue) : null;
          if (!issue) return send(ws, { type: 'error', message: 'Esa issue ya no está en la foto.' });
          const open = [...sessions.values()].find((x) => x.meta.issue === issue.id);
          if (open) { bind(open); send(ws, { type: 'started', sessionId: open.id }); return hello(ws, open); }
        }
        const s = await spawnSession(ws, { launcherId: msg.launcher, knowledge: msg.knowledge, projects: msg.projects, cols: msg.cols, rows: msg.rows, issue, prompt: firstPrompt(msg.prompt) });
        if (!s) return;
        bind(s);
        send(ws, { type: 'started', sessionId: s.id });
        if (s.native) hello(ws, s); // lo dicho mientras arrancaba (el primer mensaje), por si llegó antes de engancharse
      } finally {
        starting = false;
      }
    };

    // Reengancharse a un chat vivo (otra pestaña, una recarga): con permiso y solo si, mientras se
    // comprobaba, ni este socket se cerró ni el chat terminó.
    const reattach = async (id) => {
      const s = sessions.get(id);
      if (!s) return send(ws, { type: 'gone' });
      if (!(await allowed(req, { issue: !!s.meta.issue }))) return send(ws, { type: 'error', message: 'No tienes acceso a este chat.' });
      if (ws.readyState !== ws.OPEN || sessions.get(id) !== s) return;
      bind(s);
      hello(ws, s);
    };
    // un fallo al abrir o reenganchar (p. ej. no se puede escribir la configuración del chat) se cuenta
    // en este socket; sin recogerlo, la promesa rechazada tumbaría el bridge
    const failed = (e) => send(ws, { type: 'error', message: `No se pudo abrir el chat: ${e.message}` });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.type === 'start') start(msg).catch(failed);
      else if (msg.type === 'attach') reattach(msg.sessionId).catch(failed);
      else if (msg.type === 'input' && sess) sess.term.write(msg.data);
      else if (msg.type === 'resize' && sess && msg.cols > 0 && msg.rows > 0) { try { sess.term.resize(msg.cols, msg.rows); } catch { /* cambio de tamaño a destiempo */ } }
      // sin terminal: lo escrito, parar, contestar a lo que pregunta y «ya he iniciado sesión»
      else if (msg.type === 'say' && sess?.native && typeof msg.text === 'string' && msg.text.trim() && msg.text.length <= SAY_MAX) sess.native.say(msg.text.trim());
      else if (msg.type === 'stop' && sess?.native) sess.native.interrupt();
      else if (msg.type === 'answer' && sess?.native && typeof msg.requestId === 'string') sess.native.answer(msg.requestId, msg);
      else if (msg.type === 'auth-check' && sess?.native) {
        // «Ya la he iniciado» en la tarjeta de «sin sesión» (iniciada fuera de SIA): se le pregunta a su CLI
        const cur = sess;
        Promise.resolve(copilotStatus()).then((st) => { if (st?.loggedIn) cur.native.authReady(); else send(ws, { type: 'auth-check', ok: false }); }, () => send(ws, { type: 'auth-check', ok: false }));
      }
      else if (msg.type === 'asset' && sess) {
        const asset = assetFrom(msg.asset);
        if (asset && sess.assets.length < MAX_ASSETS) { sess.assets.push(asset); broadcastSessions(); }
      } else if (msg.type === 'kill') {
        // con sessionId se puede matar un chat aunque lo tenga otro dispositivo
        // («Cerrar chat» sobre una sesión pasiva); sin él, el enganchado a este socket
        const target = sess || sessions.get(msg.sessionId);
        if (target) { try { target.term.kill(); } catch { /* ya muerto */ } } // onExit limpia y notifica
      }
    });

    // recarga o pérdida de conexión: la sesión queda viva, solo se desengancha,
    // y el resto de dispositivos sabe que quedó libre
    const detach = () => { if (sess && sess.ws === ws) { sess.ws = null; broadcastSessions(); } };
    ws.on('close', detach);
    ws.on('error', detach);
  };

  return {
    handleConnection,
    // un WebSocketServer más por el que entran clientes
    attach(server) { servers.push(server); server.on('connection', handleConnection); },
    // la sesión de Copilot se ha iniciado (Configuración → Proveedores IA): los chats que la esperaban pueden seguir
    authRestored() { for (const s of sessions.values()) s.native?.authReady(); },
  };
};
const SAY_MAX = 200_000; // lo que se le dice a un chat por el socket: con tope
