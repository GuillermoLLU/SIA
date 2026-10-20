// SIA: el bridge local. Sirve la web, la API y, por WebSocket, los chats:
// cada conexión es una sesión y el bridge lanza el CLI elegido (Claude,
// Copilot o Codex) en un PTY que se vuelca al navegador; los mensajes de
// control son JSON pequeños.

import { WebSocketServer, WebSocket as WSClient } from 'ws';
import * as pty from 'node-pty';
import { createClient } from '@supabase/supabase-js';
import { fetch as undiciFetch, Agent as UndiciAgent } from 'undici';
import { createBaseAccess, noDbClient, fetchAll, NO_DB_MSG } from './base/client.js';
import { createBaseAccess as createKnowledgeBaseAccess } from './knowledge/base-access.js';
import { updatesRoutes } from './updates/routes.js';
import { json, readBody, sendFile } from './shared/http.js';
import { linksRoutes } from './links/routes.js';
import { uploadsRoutes } from './uploads/routes.js';
import { projectsRoutes } from './projects/routes.js';
import { createTunnel } from './remote/tunnel.js';
import { createRemote } from './remote/service.js';
import { lanRoutes } from './remote/routes.js';
import { isLoopback, lanToken, openWithoutSession, remoteReach, openWhileLocked } from './remote/remote.js';
import { createConfigStore } from './config/store.js';
import { cleanTheme, userEnv, cleanEnv } from './config/config.js';
import { configRoutes } from './config/routes.js';
import { createLock } from './lock/service.js';
import { lockRoutes } from './lock/routes.js';
import { isPin } from './lock/lock.js';
import { createWorkspace } from './workspace/workspace.js';
import { createLaunchers } from './launchers/service.js';
import { createSkillSync } from './skills/sync.js';
import { skillList, createDrafts } from './skills/catalog.js';
import { skillsRoutes } from './skills/routes.js';
import { createAuth } from './auth/service.js';
import { authRoutes } from './auth/routes.js';
import { liveSessions } from './auth/sessions.js';
import { allowed, can } from './auth/views.js';
import { createUserAdmin } from './users/service.js';
import { usersRoutes } from './users/routes.js';
import { loadPlatformConfig } from './platform/config.js';
import { createPlatformClient } from './platform/client.js';
import { toAssignedBase } from './knowledge/assigned.js';
import { createProjects } from './projects/service.js';
import { createKnowledge } from './knowledge/service.js';
import { knowledgeRoutes } from './knowledge/routes.js';
import { createIssuesSource } from './issues/source.js';
import { issuesRoutes } from './issues/routes.js';
import { issueContext } from './issues/context.js';
import { createMetricsStore } from './metrics/store.js';
import { metricsRoutes } from './metrics/routes.js';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { randomUUID, randomBytes } from 'node:crypto';

import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // sia/
const APP_VERSION = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch { return '0.0.0'; } })();

/* ── Puertos: pares poco comunes con fallback ───────────────────────
   [ws, api] candidatos en orden. Si en un par ya vive un SIA DE ESTA MISMA
   VERSIÓN, se adopta (la UI hablará con él); si es de otra versión o el par
   está ocupado por otra cosa, se salta al siguiente. SIA_PORT fuerza un par
   concreto.
   La versión importa: un bridge viejo que se quedó abierto (un `node dev.mjs`
   olvidado, una app sin cerrar) respondería a la app nueva con su código y su
   número de versión antiguos, y desde fuera parecería que la actualización no
   se ha instalado. */
const PORT_PAIRS = [[57413, 57414], [58527, 58528], [59641, 59642]];
const isFree = (port) => new Promise((resolve) => {
  const probe = net.createServer()
    .once('error', () => resolve(false))
    .once('listening', () => probe.close(() => resolve(true)));
  probe.listen(port, '0.0.0.0');
});
// ¿Vive un SIA en ese par? Devuelve su versión ('' si es tan antiguo que el
// ping aún no la decía) o null si ahí no hay ningún SIA.
const siaAt = async (apiPort) => {
  try {
    const r = await fetch(`http://127.0.0.1:${apiPort}/api/ping`, { signal: AbortSignal.timeout(800) });
    const p = await r.json();
    return p.sia === true ? String(p.version || '') : null;
  } catch { return null; }
};

let PORT = null;
let API_PORT = null;
if (process.env.SIA_PORT) {
  PORT = Number(process.env.SIA_PORT);
  API_PORT = PORT + 1;
} else {
  for (const [w, a] of PORT_PAIRS) {
    const running = await siaAt(a);
    if (running === APP_VERSION) { PORT = w; API_PORT = a; console.log(`[sia] bridge v${running} ya activo en ${w}/${a} — esta instancia lo reutiliza`); break; }
    if (running !== null) {
      console.warn(`[sia] en ${w}/${a} hay un SIA de otra versión (${running ? `v${running}` : 'anterior'}) y esta es la v${APP_VERSION} — no se adopta; probando el siguiente par`);
      continue;
    }
    if (await isFree(w) && await isFree(a)) { PORT = w; API_PORT = a; break; }
    console.warn(`[sia] par ${w}/${a} ocupado por otro proceso — probando el siguiente`);
  }
  if (PORT === null) { [PORT, API_PORT] = PORT_PAIRS[0]; console.warn('[sia] sin pares libres — intentando el primero igualmente'); }
}
// la app Electron lee aquí los puertos elegidos para pasárselos a la UI
globalThis.__SIA_PORTS = { ws: PORT, api: API_PORT };

// Lo escribible (server/workspace/): en dev, ~/.sia/workspace; empaquetado, userData.
const workspace = createWorkspace({ root: ROOT, dir: process.env.SIA_WORKSPACE || path.join(os.homedir(), '.sia', 'workspace') });
// Imágenes adjuntadas desde la UI: temporales por arranque (se limpia al iniciar).
fs.rmSync(workspace.uploadsDir, { recursive: true, force: true });
fs.mkdirSync(workspace.uploadsDir, { recursive: true });
const isWin = os.platform() === 'win32';
// Los CLIs y sus ficheros de MCP por sesión (server/launchers/).
const launchers = createLaunchers({ workspace: workspace.dir, codexHome: process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), mcpServer: path.join(ROOT, 'mcp', 'index.js'), isWin });
// rutas de la API que no tocan la base de conocimiento
const DB_FREE_ROUTES = new Set(['version', 'lan', 'config', 'upload', 'uploads']);

// El Node embebido de Electron (v20) no trae WebSocket nativo y supabase-js lo
// exige al construir el cliente — le damos el de `ws`. En Node 21+ no hace nada.
if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = WSClient;
// Red corporativa con proxy MITM: su CA no está en el Node embebido y el fetch
// a Supabase falla ("self signed certificate"). Agente tolerante SOLO para
// el tráfico a Supabase (no afecta al resto del proceso).
const insecureAgent = new UndiciAgent({ connect: { rejectUnauthorized: false } });
const supaFetch = (url, opts = {}) => undiciFetch(url, { ...opts, dispatcher: insecureAgent });

/* ── La base de conocimiento ──────────────────────────────────────
   Una por instancia y la misma para todo el mundo: la asigna la plataforma a
   quien inicia sesión en este bridge (el último que entra), con sus tokens de
   grupo y su clave de poder ({ id, name, url, key, tokens, powerKey }). Solo
   en memoria, nunca en la config. El MCP recibe la conexión y los proyectos. */
let assigned = { base: null };
// Lo que puede el móvil emparejado (entra sin sesión, con su llave).
const currentBase = () => assigned.base;
// Hablar con la base de conocimiento (server/base/client.js).
const baseAccess = createBaseAccess({ createClient, fetch: supaFetch });
const { clientFor, needsSchema, permsFor } = baseAccess;
const accessibleProjects = (base = currentBase()) => baseAccess.accessibleProjects(base);

const projects = createProjects({ newId: randomUUID, fetchAll });

// Las skills publicadas en la base, bajadas a su copia local (server/skills/).
const skillSync = createSkillSync({ clientFor, needsSchema, workspace });
const skillsOf = (base) => skillList(base ? workspace.skillsDirFor(base) : workspace.skillsDir);
// Otra base asignada (o ninguna, al salir): fuera los permisos cacheados de la
// anterior y, como son otras skills, la copia local se rehace.
const applyBase = async () => {
  const b = currentBase();
  baseAccess.clearStatus();
  console.log(b ? `[sia] base de conocimiento en uso: ${b.name}` : '[sia] sin base de conocimiento en uso');
  await skillSync.switchTo(b);
};

// La config personal (server/config/): Jira, claves de GitHub, tema, sesiones
// guardadas y candado, en ~/.sia/config.json.
const config = createConfigStore(path.join(os.homedir(), '.sia', 'config.json'));

/* ── Tema compartido ─────────────────────────────────────────────────
   El tema se elige en el ordenador y un móvil emparejado es otro navegador:
   sin esto arrancaba siempre con el tema por defecto. La web del escritorio
   deja aquí su tema (id + colores de la interfaz) y el bridge se lo da a los
   móviles: en el ping —también antes de emparejar, para que la pantalla del
   PIN ya salga con él— y por el socket cuando cambia. */
let UI_THEME = cleanTheme(config.read().theme);

// El candado del escritorio (server/lock/): PIN y estado en la config personal.
const lock = createLock({ config });

/* ── Base de la instancia (server/platform/), inicio de sesión (server/auth/)
   y usuarios (server/users/). Se entra con la cuenta de Supabase Auth de la
   instancia; el fetch de Node verifica TLS (a diferencia de supaFetch). ── */
const platform = createPlatformClient({ ...(loadPlatformConfig(ROOT) || { url: '', key: '' }), fetch });
const auth = createAuth({ platform, readConfig: config.read, writeConfig: config.write });
const users = createUserAdmin({ platform });
// Lo que el conocimiento lee y escribe en la base de conocimiento con la clave del dueño.
const { readGroups, baseKeys } = createKnowledgeBaseAccess({ createClient, fetch, newId: randomUUID });
const knowledge = createKnowledge({ platform, readGroups, baseKeys });
// Lo asignado a quien inicia sesión (o abre la app con la sesión guardada).
// Si cambia, se reconecta y se resincronizan las skills.
const loadAssigned = async (token) => {
  try {
    const ctx = await auth.context(token);
    if (!ctx) return;
    // quien gestiona Personas deja al día las claves de todos (por si algo
    // cambió fuera de SIA o quedó a medias); sin esperar
    if (can(ctx.user, 'people')) {
      knowledge.syncPeople(ctx.accessToken, null)
        .then((problems) => problems.forEach((p) => console.warn(`[sia] clave de poder de una persona: ${p}`)))
        .catch((e) => console.warn(`[sia] no se pudieron revisar las claves de las personas: ${e.message}`));
    }
    const next = { base: toAssignedBase(await knowledge.mine(ctx.accessToken)) };
    if (JSON.stringify(next) === JSON.stringify(assigned)) return;
    assigned = next;
    await applyBase();
  } catch (e) { console.warn(`[sia] no se pudo cargar el conocimiento asignado: ${e.message}`); }
};
const clearAssigned = async () => {
  assigned = { base: null };
  await applyBase();
};
const accessTokens = (base = currentBase()) => (base ? base.tokens : []);

/* ── Lab HTTP API (skills editor) ───────────────────────────────────
   Claves de poder: viven EN LA BASE (tabla power_keys) y es la base quien las
   comprueba (cabecera x-sia-power; sia_status() dice qué abre). La de cada
   persona se la da la instancia según sus vistas (server/knowledge/
   person-keys.js; con Administración, la del dueño). permisos:
   server/shared/perms.js */
// Acceso desde el móvil (server/remote/): emparejamiento QR+PIN, su candado
// y el túnel público.
const tunnel = createTunnel({ binDir: workspace.binDir, apiPort: API_PORT, resolve: launchers.resolve, fetch: undiciFetch, insecureFetch: supaFetch, isWin });
const remote = createRemote({ lock, tunnel, apiPort: API_PORT, wsClients: () => allWsClients(), idleMs: Number(process.env.SIA_LOCK_IDLE_MS) || undefined });
const lanRoute = lanRoutes(remote, lock, { json, readBody });
setInterval(() => remote.lockIdle(), 15_000).unref();
// que no quede un túnel huérfano apuntando a este equipo al salir
process.on('exit', () => tunnel.kill());
for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { tunnel.kill(); process.exit(sig === 'SIGINT' ? 130 : 143); });

const apiServer = http.createServer(async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-SIA-LAN, X-SIA-Auth');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);
  // la base de conocimiento (la de la instancia) y lo que abre en ella la
  // clave de poder de quien ha iniciado sesión
  const knowledgeBase = currentBase();
  const db = knowledgeBase ? clientFor(knowledgeBase) : noDbClient;
  const perms = await permsFor(knowledgeBase);

  // ── Cortafuegos: solo localhost entra sin llave ──
  if (!isLoopback(req)) {
    const token = lanToken(req, url);
    const sess = remote.session(token);
    if (!sess && !openWithoutSession(parts, remote.active())) return json(res, 403, { error: 'acceso no autorizado' });
    if (sess && parts[0] === 'api') {
      remote.touch(token);
      if (!remoteReach(parts)) return json(res, 403, { error: 'no disponible en remoto' });
      if (sess.locked && !openWhileLocked(parts)) return json(res, 423, { error: 'sesión bloqueada', locked: true });
    }
  }

  try {
    // ── Servir la web (para el móvil); el escritorio la carga por file:// ──
    if (parts[0] !== 'api') {
      const WEB_DIST = path.join(ROOT, 'web', 'dist');
      let rel = path.normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, '');
      if (rel === '/' || rel === '\\' || rel === '.') rel = 'index.html';
      const fp = path.join(WEB_DIST, rel);
      const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.ico': 'image/x-icon', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json' };
      if (fp.startsWith(WEB_DIST) && fs.existsSync(fp) && fs.statSync(fp).isFile()) {
        res.writeHead(200, { 'Content-Type': MIME[path.extname(fp).toLowerCase()] || 'application/octet-stream' });
        return res.end(fs.readFileSync(fp));
      }
      const idx = path.join(WEB_DIST, 'index.html'); // fallback SPA
      if (fs.existsSync(idx)) { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); return res.end(fs.readFileSync(idx)); }
      return json(res, 404, { error: 'web no compilada' });
    }
    if (parts[1] === 'ping') {
      const s = remote.session(lanToken(req, url));
      // a una sesión bloqueada no se le dan los puertos: primero la clave
      if (s?.locked) return json(res, 200, { sia: true, locked: true, mode: s.mode, theme: UI_THEME });
      // dev: este bridge corre con node (node dev.mjs), no dentro de la app. La web
      // de desarrollo lo usa para preferirlo frente al de una app instalada abierta.
      // pin: si hay PIN de bloqueo, para que el candado del móvil sepa si puede
      // bloquear ya o tiene que pedir antes que se elija uno
      return json(res, 200, { sia: true, version: APP_VERSION, dev: !process.versions.electron, ws: PORT, api: API_PORT, theme: UI_THEME, ...(s ? { mode: s.mode, pin: lock.hasPin() } : {}) });
    }

    if (parts[1] === 'auth') return authRoute(req, res, parts[2]);

    // el candado del escritorio: solo desde esta máquina
    if (parts[1] === 'lock') {
      if (!isLoopback(req)) return json(res, 403, { error: 'no disponible en remoto' });
      return lockRoute(req, res, parts[2]);
    }
    // con el candado echado, esta máquina no ve nada más (el móvil emparejado
    // va por su propio candado, arriba, en el cortafuegos)
    if (lock.locked() && isLoopback(req)) return json(res, 423, { error: 'pantalla bloqueada', locked: true });

    // ── Sesión: desde esta máquina, toda la API exige haber iniciado sesión
    // (el móvil entra con su llave de emparejamiento: cortafuegos de arriba).
    // Quedan fuera solo ping, versión, inicio de sesión y candado (van antes)
    // y ver un adjunto (un <img> no lleva cabeceras; es un fichero de aquí).
    let who = null;
    if (isLoopback(req) && !(parts[1] === 'uploads' && req.method === 'GET') && parts[1] !== 'version') {
      try { who = await auth.context(req.headers['x-sia-auth']); }
      catch (e) { return json(res, 503, { error: e.message }); }
      if (!who) return json(res, 401, { error: 'Inicia sesión.', auth: true });
      // contraseña puesta por un admin: nada más hasta que elija la suya
      if (who.user.must_change_password) return json(res, 401, { error: 'Elige tu contraseña para seguir.', auth: true });
    }
    // Cada vista (Laboratorio, Administración, Personas, Enlaces, Issues, Métricas) solo para quien la tiene, aunque una clave de poder lo abriera:
    // segunda capa, además de la de la base (server/auth/views.js). El móvil
    // emparejado no inicia sesión y solo llega a lo que deja pasar el cortafuegos.
    if (!allowed(who?.user, parts, req.method)) return json(res, 403, { error: 'No tienes acceso a esto.' });
    if (parts[1] === 'users') return usersRoute(req, res, parts.slice(2));
    if (parts[1] === 'knowledge') return knowledgeRoute(req, res, parts.slice(2));
    if (parts[1] === 'issues') return issuesRoute(req, res, parts.slice(2));
    if (parts[1] === 'metrics') return metricsRoute(req, res, parts.slice(2), url.searchParams);

    // Sin base de conocimiento solo funciona lo que no la necesita (terminal,
    // móvil, config personal, adjuntos). Lo demás: 503 con aviso claro.
    if (!knowledgeBase && !DB_FREE_ROUTES.has(parts[1])) return json(res, 503, { error: NO_DB_MSG, noDb: true });
    if (parts[1] === 'version') return updatesRoute(req, res, db);

    if (parts[1] === 'lan') return lanRoute(req, res, url, parts.slice(2));
    if (parts[1] === 'admin') return projectsRoute(req, res, parts.slice(2), url.searchParams, { db, perms });
    if (parts[1] === 'config') return configRoute(req, res);
    // proyectos accesibles para los tokens del usuario (selector de fuentes,
    // siempre fresco — no depende del WS)
    if (parts[1] === 'access' && parts[2] === 'projects' && req.method === 'GET') {
      return json(res, 200, await accessibleProjects(knowledgeBase));
    }
    if (parts[1] === 'links') return linksRoute(req, res, parts.slice(2), { db, perms, projects: await accessibleProjects(knowledgeBase) });
    if (parts[1] === 'upload' || parts[1] === 'uploads') return uploadsRoute(req, res, parts.slice(1));
    if (['skills', 'drafts', 'groups'].includes(parts[1])) return skillsRoute(req, res, parts.slice(1), { db, base: knowledgeBase, perms });
    return json(res, 404, { error: 'no encontrado' });
  } catch (err) {
    return json(res, 500, { error: err.message });
  }
});
apiServer.on('error', (err) => {
  // puerto ocupado (otra instancia de SIA / modo dev): no es fatal — la UI
  // hablará con el bridge que ya está escuchando
  if (err.code === 'EADDRINUSE') console.warn(`[sia] puerto ${API_PORT} en uso — usando la instancia existente`);
  else throw err;
});
apiServer.listen(API_PORT, () => console.log(`[sia] lab API en http://localhost:${API_PORT}`));

await applyBase(); // sin sesión aún: sin base (llega al iniciar sesión)

// Dos puertas al MISMO bridge: el puerto dedicado (escritorio, dev) y la ruta
// /ws colgada del servidor HTTP. La segunda existe por el túnel: por Cloudflare
// solo sale un hostname por el 443, así que la web, la API y el WebSocket del
// móvil tienen que viajar por el mismo origen. De paso, el móvil en la LAN
// también la usa y deja de depender de un segundo puerto.
// Un socket nuevo desde esta máquina exige sesión iniciada (?a=<token>); se
// comprueba al aceptar la conexión, antes de que llegue ningún mensaje. El
// del móvil va con su llave de emparejamiento (handleConnection).
const wsSessionOk = async (req) => {
  if (!isLoopback(req)) return true;
  const a = new URL(req.url, 'http://localhost').searchParams.get('a');
  return !!(await auth.context(a).catch(() => null));
};
const wss = new WebSocketServer({ port: PORT, verifyClient: (info, cb) => { wsSessionOk(info.req).then((ok) => cb(ok, 401, 'Inicia sesión.')); } });
wss.on('error', (err) => {
  if (err.code === 'EADDRINUSE') console.warn(`[sia] puerto ${PORT} en uso — usando la instancia existente`);
  else throw err;
});
const wssPath = new WebSocketServer({ noServer: true });
apiServer.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname !== '/ws') { socket.destroy(); return; }
  wsSessionOk(req).then((ok) => {
    if (!ok) { socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n'); return; }
    wssPath.handleUpgrade(req, socket, head, (ws) => wssPath.emit('connection', ws, req));
  });
});
const allWsClients = () => [...wss.clients, ...wssPath.clients];
console.log(`[sia] terminal bridge listening on ws://localhost:${PORT} (y /ws en la API)`);

/* ── Sesiones PERSISTENTES ──────────────────────────────────────────
   El PTY vive en el bridge: si el navegador se recarga o se cae el
   WebSocket, la sesión sigue; el cliente se re-engancha con `attach` y
   recibe el scrollback. Cerrar la pestaña manda `kill` explícito.
   Protocolo (todo JSON): bridge→cliente: launchers/started/history/data/
   exit/gone/error · cliente→bridge: start/attach/input/resize/meta/kill */
const SESSIONS = new Map(); // id -> { id, term, buffer, meta, ws }
let sessionSeq = 0;
const BUFFER_CAP = 400_000; // ~400 KB de scrollback por sesión

// `attached`: algún dispositivo tiene esta sesión enganchada ahora mismo. Los
// clientes lo usan para ofrecer "usar los chats aquí" en vez de robarla.
const sessionList = () => [...SESSIONS.values()].map((s) => ({ id: s.id, ...s.meta, assets: s.assets, attached: !!s.ws }));
const send = (ws, obj) => { if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(obj)); };
// Sincroniza la lista de chats en TODOS los dispositivos conectados (escritorio
// y móviles): se emite en cada cambio (crear, matar, renombrar, engancharse…).
const broadcastTheme = () => {
  const msg = JSON.stringify({ type: 'theme', theme: UI_THEME });
  for (const c of allWsClients()) { if (c.readyState === c.OPEN) c.send(msg); }
};
const broadcastSessions = () => {
  const msg = JSON.stringify({ type: 'sessions', sessions: sessionList() });
  for (const c of allWsClients()) { if (c.readyState === c.OPEN) c.send(msg); }
};

const handleConnection = (ws, req) => {
  // ── Cortafuegos: un socket remoto exige llave de sesión válida ──
  if (!isLoopback(req)) {
    const t = new URL(req.url, 'http://localhost').searchParams.get('t');
    const s = remote.session(t);
    if (!s) { try { ws.close(4403, 'no autorizado'); } catch {} return; }
    if (s.locked) { try { ws.close(4423, 'bloqueado'); } catch {} return; } // candado echado
    ws._siaLan = true;   // marcado para poder revocarlo al apagar el acceso
    ws._siaToken = t;    // y para tirar sus sockets al echar el candado
    remote.touch(t);
  } else if (lock.locked()) {
    // pantalla bloqueada: nada de sockets NUEVOS desde esta máquina (una ventana
    // recargada no puede engancharse a los chats hasta dar la clave); los que
    // ya estaban abiertos siguen, que es lo que mantiene los chats a la vista
    // al desbloquear
    try { ws.close(4423, 'bloqueado'); } catch {}
    return;
  }
  let sess = null; // sesión enganchada a ESTE socket
  skillSync.maybe(currentBase()); // la copia local al día en segundo plano (el siguiente chat lo ve)

  accessibleProjects().then((projects) =>
    send(ws, { type: 'launchers', list: launchers.list(), skills: skillsOf(currentBase()), sessions: sessionList(), accessProjects: projects }));

  const bind = (s) => {
    // Un socket por sesión. 4409 = "otro dispositivo tomó los chats": el cliente
    // saliente lo distingue de una caída de red y pasa a modo pasivo (con botón
    // de recuperarlos) en vez de marcar la pestaña como muerta.
    if (s.ws && s.ws !== ws) { try { s.ws.close(4409, 'handoff'); } catch {} }
    s.ws = ws;
    sess = s;
    broadcastSessions();
  };

  let starting = false;
  // `issueId`: el chat de una issue (uno por issue, vive hasta que se cierre).
  // Arranca con sus datos como primer mensaje y no sale en las pestañas del Chat.
  const start = async (launcherId, knowledge, projects, cols, rows, issueId) => {
    if (sess || starting) return;
    starting = true;
    try {
      let issue = null;
      if (issueId !== undefined && issueId !== null) {
        issue = /^INC\d+$/.test(String(issueId)) ? issuesSource.load().issues.find((i) => i.id === issueId) : null;
        if (!issue) { send(ws, { type: 'error', message: 'Esa issue ya no está en la foto.' }); return; }
        const open = [...SESSIONS.values()].find((x) => x.meta.issue === issue.id);
        if (open) { bind(open); send(ws, { type: 'started', sessionId: open.id }); send(ws, { type: 'history', data: open.buffer }); return; }
      }
      const def = launchers.byId(launcherId);
      if (!launchers.installed(def)) {
        send(ws, { type: 'error', message: `"${def.cmd}" no está instalado.` });
        return;
      }
      const mode = knowledge === 'demand' ? 'demand' : 'auto';
      const sessionId = `s${++sessionSeq}`;

      // acceso: techo del token ∩ selección del chat
      const base = currentBase();
      const ceiling = (await accessibleProjects(base)).map((p) => p.id);
      const picked = Array.isArray(projects) && projects.length ? ceiling.filter((id) => projects.includes(id)) : ceiling;
      const spawn = launchers.prepare(def, sessionId, picked, base, issue ? issueContext(issue) : null);

      let term;
      try {
        term = pty.spawn(spawn.cmd, spawn.args, {
          name: 'xterm-color',
          cols: cols > 0 ? cols : 80,
          rows: rows > 0 ? rows : 24,
          cwd: workspace.modeDirFor(mode, base),
          // SHELL_SESSIONS_DISABLE removes macOS's "Restored session…" banner.
          // cleanEnv poda el entorno heredado (CLAUDECODE/*, tokens de GitHub) y
          // userEnv() pone encima las credenciales personales (Jira, la clave de
          // GitHub activa), leídas frescas en cada sesión — ese orden importa.
          env: { ...cleanEnv({ ...process.env, SHELL_SESSIONS_DISABLE: '1' }), ...userEnv(config.read()) },
        });
      } catch (err) {
        send(ws, { type: 'error', message: `No se pudo lanzar: ${err.message}` });
        return;
      }

      const s = {
        id: sessionId,
        term,
        buffer: '',
        meta: { launcher: def.id, knowledge: mode, label: issue ? issue.id : def.label, color: null, ...(issue ? { issue: issue.id } : {}) },
        assets: [], // adjuntos compartidos en esta sesión (persisten con ella)
        ws: null,
      };
      SESSIONS.set(s.id, s);
      bind(s);
      send(ws, { type: 'started', sessionId: s.id });
      console.log(`[sia] session open (${def.id}${issue ? `, issue ${issue.id}` : ''}, conocimiento ${mode}, base ${base?.name || '-'}, proyectos [${picked.join(',')}], id ${s.id}, pid ${term.pid})`);

      term.onData((data) => {
        s.buffer += data;
        if (s.buffer.length > BUFFER_CAP) s.buffer = s.buffer.slice(-Math.floor(BUFFER_CAP * 0.75));
        send(s.ws, { type: 'data', data });
      });
      term.onExit(() => {
        console.log(`[sia] session ended (id ${s.id})`);
        SESSIONS.delete(s.id);
        launchers.cleanup(s.id);
        send(s.ws, { type: 'exit' });
        if (s.ws) { try { s.ws.close(); } catch {} }
        broadcastSessions(); // el chat desaparece en todos los dispositivos
      });
    } finally {
      starting = false;
    }
  };

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw.toString()); } catch { return; }
    if (ws._siaToken) remote.touch(ws._siaToken); // actividad real del móvil: pospone el candado por inactividad
    if (msg.type === 'start') {
      start(msg.launcher, msg.knowledge, msg.projects, msg.cols, msg.rows, msg.issue);
    } else if (msg.type === 'attach') {
      const s = SESSIONS.get(msg.sessionId);
      if (!s) { send(ws, { type: 'gone' }); return; }
      bind(s);
      send(ws, { type: 'history', data: s.buffer });
    } else if (msg.type === 'input' && sess) {
      sess.term.write(msg.data);
    } else if (msg.type === 'resize' && sess && msg.cols > 0 && msg.rows > 0) {
      try { sess.term.resize(msg.cols, msg.rows); } catch { /* ignore transient resize errors */ }
    } else if (msg.type === 'asset' && sess && msg.asset?.name && msg.asset?.absPath) {
      if (sess.assets.length < 100) {
        sess.assets.push({ name: String(msg.asset.name).slice(0, 80), absPath: String(msg.asset.absPath) });
        broadcastSessions(); // el adjunto aparece en el resto de dispositivos (p. ej. una foto subida desde el móvil)
      }
    } else if (msg.type === 'meta' && sess) {
      if (typeof msg.label === 'string' && msg.label.trim()) sess.meta.label = msg.label.trim().slice(0, 40);
      sess.meta.color = typeof msg.color === 'string' ? msg.color : null;
      broadcastSessions(); // nombre/color visibles en el resto de dispositivos
    } else if (msg.type === 'kill') {
      // Con sessionId se puede matar un chat aunque lo tenga otro dispositivo
      // (la X de una pestaña pasiva); sin él, el enganchado a este socket.
      const target = sess || SESSIONS.get(msg.sessionId);
      if (target) { try { target.term.kill(); } catch {} } // onExit limpia y notifica
    }
  });

  // recarga / pérdida de conexión: la sesión queda viva, solo se desengancha.
  // El broadcast avisa al resto de dispositivos de que quedó libre (podrán
  // ofrecer "usar los chats aquí" para recuperarla).
  ws.on('close', () => {
    if (sess && sess.ws === ws) {
      sess.ws = null;
      console.log(`[sia] detached (id ${sess.id}, la sesión sigue viva)`);
      broadcastSessions();
    }
  });
  ws.on('error', () => { if (sess && sess.ws === ws) { sess.ws = null; broadcastSessions(); } });
};
wss.on('connection', handleConnection);
wssPath.on('connection', handleConnection);
