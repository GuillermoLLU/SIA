// El bridge de los chats: cada WebSocket es un cliente, cada sesión un chat de
// Copilot (copilot-session.js, cableado por session.js), y las sesiones
// sobreviven a las conexiones (sessions.js): si la ventana se recarga o el
// chat se abre desde otro dispositivo, sigue en el bridge y la vista recibe lo
// que lleva. Todo lo demás llega inyectado.
//   deps: launchers (launchers/service.js), workspace, env() → entorno de los chats,
//         issues.find(id), accessibleProjects(base), currentBase(), skillsOf(base),
//         skillSync, lock, allowed(req, { issue }) → si quien conecta puede abrir ese chat,
//         copilotStatus() → la cuenta de Copilot ({ ok, loggedIn }), para la tarjeta de «sin sesión»,
//         spawnChat (copilot-session.js) y newId (el id de la sesión de Copilot)
import { randomUUID } from 'node:crypto';
import { CLOSE, MAX_ASSETS, sessionList, pickMode, pickProjects, isIssueId, assetFrom, firstPrompt, metaOf } from './sessions.js';
import { issueContext } from '../issues/context.js';
import { spawnCopilot, NOT_LOGGED } from './copilot-session.js';
import { wireNative, nativeSnapshot } from './session.js';

const SAY_MAX = 200_000; // lo que se le dice a un chat por el socket: con tope

export const createChatBridge = ({ launchers, workspace, env, issues, accessibleProjects, currentBase, skillsOf, skillSync, lock, allowed, copilotStatus = async () => null, spawnChat = spawnCopilot, newId = randomUUID }) => {
  const sessions = new Map(); // id → { id, chat, meta, assets, ws }
  const servers = [];         // los WebSocketServer que entran por aquí
  let seq = 0;

  const clients = () => servers.flatMap((s) => [...s.clients]);
  const send = (ws, obj) => { if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj)); };
  const broadcast = (obj) => { const msg = JSON.stringify(obj); for (const c of clients()) if (c.readyState === c.OPEN) c.send(msg); };
  // la lista de chats en TODOS los dispositivos: en cada cambio (crear, matar, engancharse, adjuntar…)
  const broadcastSessions = () => broadcast({ type: 'sessions', sessions: sessionList(sessions) });
  const closeQuietly = (ws, code, reason) => { try { ws.close(code, reason); } catch { /* ya cerrado */ } };
  // engancharse a un chat: la conversación que lleva, lo que pregunta y su modelo
  const catchUp = (ws, s) => { nativeSnapshot(s.chat, (m) => send(ws, m)); send(ws, { type: 'meta', ...metaOf(s.meta) }); };

  // issue: el chat de una issue arranca con sus datos; prompt: el Chat, con la pregunta escrita
  const open = async (ws, { knowledge, projects, issue, prompt }) => {
    if (!launchers.installed()) return send(ws, { type: 'error', message: 'Copilot no está instalado en este equipo.' });
    const mode = pickMode(knowledge);
    const id = `s${++seq}`;
    const base = currentBase();
    const picked = pickProjects((await accessibleProjects(base)).map((p) => p.id), projects);
    const first = issue ? issueContext(issue) : prompt;
    const { cmd, args, mcp } = launchers.prepare(picked, base);
    const { env: chatEnv, args: more } = launchers.envFor(env());
    const chat = spawnChat({ cmd, args: [...args, ...more], cwd: workspace.modeDirFor(mode, base), env: chatEnv, sessionId: newId(), mcp });
    // la sesión, lista antes de seguir (su cuenta, sus modelos); sin sesión de
    // Copilot, el error lo dice (auth) para llevar a iniciarla
    try { await chat.ready; } catch (err) {
      chat.kill();
      if (err.message === NOT_LOGGED) return send(ws, { type: 'error', message: 'Copilot no tiene sesión iniciada. Entra con tu cuenta en Configuración → Proveedores IA.', auth: 'copilot' });
      return send(ws, { type: 'error', message: `Copilot no arrancó: ${err.message}. Comprueba su sesión en Configuración → Proveedores IA y, si es una versión antigua, actualízalo con «copilot update».` });
    }
    const s = { id, chat, meta: { knowledge: mode, ...(issue ? { issue: issue.id } : {}), model: chat.model, effort: chat.effort, modelVia: null, models: chat.models }, assets: [], ws: null };
    sessions.set(id, s);
    console.log(`[sia] chat abierto (${issue ? `issue ${issue.id}, ` : ''}conocimiento ${mode}, base ${base?.name || '-'}, proyectos [${picked.join(',')}], id ${id}, pid ${chat.pid})`);
    chat.onExit(() => {
      console.log(`[sia] chat cerrado (id ${id})`);
      sessions.delete(id);
      send(s.ws, { type: 'exit' });
      if (s.ws) closeQuietly(s.ws);
      broadcastSessions(); // el chat desaparece en todos los dispositivos
    });
    // lo que dice va a quien tenga el chat; el modelo y el esfuerzo, a la
    // sesión (y a la lista de chats, para quien se enganche)
    wireNative(chat, {
      out: (m) => send(s.ws, m),
      meta: s.meta,
      onMeta: (patch) => { Object.assign(s.meta, patch); send(s.ws, { type: 'meta', ...metaOf(s.meta) }); broadcastSessions(); },
      firstSay: first,
      authStatus: copilotStatus,
    });
    return s;
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
      send(ws, { type: 'hello', copilot: { available: launchers.installed() }, skills: skillsOf(currentBase()), sessions: sessionList(sessions), accessProjects: projects }));

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
          const already = [...sessions.values()].find((x) => x.meta.issue === issue.id);
          if (already) { bind(already); send(ws, { type: 'started', sessionId: already.id }); return catchUp(ws, already); }
        }
        const s = await open(ws, { knowledge: msg.knowledge, projects: msg.projects, issue, prompt: firstPrompt(msg.prompt) });
        if (!s) return;
        bind(s);
        send(ws, { type: 'started', sessionId: s.id });
        catchUp(ws, s); // lo dicho mientras arrancaba (el primer mensaje), por si llegó antes de engancharse
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
      catchUp(ws, s);
    };
    // un fallo al abrir o reenganchar (p. ej. no se puede escribir la configuración del chat) se cuenta
    // en este socket; sin recogerlo, la promesa rechazada tumbaría el bridge
    const failed = (e) => send(ws, { type: 'error', message: `No se pudo abrir el chat: ${e.message}` });

    ws.on('message', (raw) => {
      let msg;
      try { msg = JSON.parse(raw.toString()); } catch { return; }
      if (msg.type === 'start') start(msg).catch(failed);
      else if (msg.type === 'attach') reattach(msg.sessionId).catch(failed);
      // lo escrito, parar, contestar a lo que pregunta y «ya he iniciado sesión»
      else if (msg.type === 'say' && sess && typeof msg.text === 'string' && msg.text.trim() && msg.text.length <= SAY_MAX) sess.chat.say(msg.text.trim());
      else if (msg.type === 'stop' && sess) sess.chat.interrupt();
      else if (msg.type === 'answer' && sess && typeof msg.requestId === 'string') sess.chat.answer(msg.requestId, msg);
      else if (msg.type === 'auth-check' && sess) {
        // «Ya la he iniciado» en la tarjeta de «sin sesión» (iniciada fuera de SIA): se le pregunta a su CLI
        const cur = sess;
        Promise.resolve(copilotStatus()).then((st) => { if (st?.loggedIn) cur.chat.authReady(); else send(ws, { type: 'auth-check', ok: false }); }, () => send(ws, { type: 'auth-check', ok: false }));
      }
      else if (msg.type === 'asset' && sess) {
        const asset = assetFrom(msg.asset);
        if (asset && sess.assets.length < MAX_ASSETS) { sess.assets.push(asset); broadcastSessions(); }
      } else if (msg.type === 'kill') {
        // con sessionId se puede matar un chat aunque lo tenga otro dispositivo
        // («Cerrar chat» sobre una sesión pasiva); sin él, el enganchado a este socket
        const target = sess || sessions.get(msg.sessionId);
        if (target) target.chat.kill(); // onExit limpia y notifica
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
    authRestored() { for (const s of sessions.values()) s.chat.authReady(); },
  };
};
