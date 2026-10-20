// SIA: el bridge local. Sirve la web, la API y, por WebSocket, los chats:
// cada conexión es una sesión y el bridge lanza el CLI elegido (Claude,
// Copilot o Codex) en un PTY que se vuelca al navegador. Aquí solo se montan
// las piezas (cada funcionalidad vive en su carpeta) y se arrancan los
// servidores; nada ocurre al importar: startBridge() lo pone todo en marcha.
//
//   node server/index.js            (o `node dev.mjs` desde la raíz)
//   import { startBridge } ...      (la app Electron: electron/main.js)

import { WebSocketServer, WebSocket as WSClient } from 'ws';
import * as pty from 'node-pty';
import { createClient } from '@supabase/supabase-js';
import { fetch as undiciFetch, Agent as UndiciAgent } from 'undici';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { json, readBody, sendFile } from './shared/http.js';
import { choosePair } from './shared/ports.js';
import { createRouter } from './router.js';
import { createConfigStore } from './config/store.js';
import { cleanTheme, userEnv, cleanEnv } from './config/config.js';
import { configRoutes } from './config/routes.js';
import { createLock } from './lock/service.js';
import { lockRoutes } from './lock/routes.js';
import { createWorkspace } from './workspace/workspace.js';
import { createLaunchers } from './launchers/service.js';
import { loadPlatformConfig } from './platform/config.js';
import { createPlatformClient } from './platform/client.js';
import { createAuth } from './auth/service.js';
import { authRoutes } from './auth/routes.js';
import { can } from './auth/views.js';
import { createUserAdmin } from './users/service.js';
import { usersRoutes } from './users/routes.js';
import { createBaseAccess } from './base/client.js';
import { createBaseAccess as createKnowledgeBaseAccess } from './knowledge/base-access.js';
import { toAssignedBase } from './knowledge/assigned.js';
import { createKnowledge } from './knowledge/service.js';
import { knowledgeRoutes } from './knowledge/routes.js';
import { createProjects } from './projects/service.js';
import { projectsRoutes } from './projects/routes.js';
import { createSkillSync } from './skills/sync.js';
import { skillList, createDrafts } from './skills/catalog.js';
import { skillsRoutes } from './skills/routes.js';
import { linksRoutes } from './links/routes.js';
import { uploadsRoutes } from './uploads/routes.js';
import { updatesRoutes } from './updates/routes.js';
import { createIssuesSource } from './issues/source.js';
import { createIssuesService } from './issues/service.js';
import { issuesRoutes } from './issues/routes.js';
import { createMetricsStore } from './metrics/store.js';
import { metricsRoutes } from './metrics/routes.js';
import { createTunnel } from './remote/tunnel.js';
import { createRemote } from './remote/service.js';
import { lanRoutes } from './remote/routes.js';
import { isLoopback } from './remote/remote.js';
import { createTerminalBridge } from './terminal/bridge.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // sia/

// → { ws, api }: los puertos elegidos, para que la app se los pase a la UI.
export const startBridge = async ({ env = process.env } = {}) => {
  const version = (() => { try { return JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version; } catch { return '0.0.0'; } })();
  const ports = await choosePair(version, { forced: env.SIA_PORT });
  const isWin = os.platform() === 'win32';
  const home = os.homedir();

  // El Node embebido de Electron (v20) no trae WebSocket nativo y supabase-js lo
  // exige al construir el cliente: le damos el de `ws` (en Node 21+ no hace nada).
  if (typeof globalThis.WebSocket === 'undefined') globalThis.WebSocket = WSClient;
  // Red corporativa con proxy MITM: su CA no está en el Node embebido y el fetch
  // a la base de conocimiento falla («self signed certificate»). Agente tolerante
  // SOLO para ese tráfico; la base de la instancia va con el fetch de Node (TLS verificado).
  const insecureAgent = new UndiciAgent({ connect: { rejectUnauthorized: false } });
  const supaFetch = (url, opts = {}) => undiciFetch(url, { ...opts, dispatcher: insecureAgent });

  // lo escribible: en dev, ~/.sia/workspace; empaquetado, userData (SIA_WORKSPACE)
  const workspace = createWorkspace({ root: ROOT, dir: env.SIA_WORKSPACE || path.join(home, '.sia', 'workspace') });
  fs.rmSync(workspace.uploadsDir, { recursive: true, force: true }); // los adjuntos son por arranque
  fs.mkdirSync(workspace.uploadsDir, { recursive: true });
  const launchers = createLaunchers({ workspace: workspace.dir, codexHome: env.CODEX_HOME || path.join(home, '.codex'), mcpServer: path.join(ROOT, 'mcp', 'index.js'), isWin, env });
  const config = createConfigStore(path.join(home, '.sia', 'config.json'));
  const lock = createLock({ config });

  // El tema se elige en el ordenador y un móvil emparejado es otro navegador:
  // el bridge se lo da en el ping (también antes de emparejar) y por el socket
  // cuando cambia.
  let theme = cleanTheme(config.read().theme);

  // La base de la instancia (quién entra, con qué vistas y qué conocimiento ve)
  const platform = createPlatformClient({ ...(loadPlatformConfig(ROOT, env) || { url: '', key: '' }), fetch });
  const auth = createAuth({ platform, readConfig: config.read, writeConfig: config.write });
  const users = createUserAdmin({ platform });
  const knowledge = createKnowledge({ platform, ...createKnowledgeBaseAccess({ createClient, fetch, newId: randomUUID }) });

  // La base de conocimiento: una por instancia, la asigna la plataforma a quien
  // inicia sesión en este bridge (el último que entra). Solo en memoria.
  let assigned = null; // { id, name, url, key, tokens, powerKey } | null
  const baseAccess = createBaseAccess({ createClient, fetch: supaFetch });
  const base = { ...baseAccess, current: () => assigned };
  const skillSync = createSkillSync({ clientFor: base.clientFor, needsSchema: base.needsSchema, workspace });
  const skillsOf = (b) => skillList(b ? workspace.skillsDirFor(b) : workspace.skillsDir);
  // otra base (o ninguna): fuera lo cacheado de la anterior y la copia local de skills se rehace
  const applyBase = async () => {
    base.clearStatus();
    console.log(assigned ? `[sia] base de conocimiento en uso: ${assigned.name}` : '[sia] sin base de conocimiento en uso');
    await skillSync.switchTo(assigned);
  };
  // lo asignado a quien inicia sesión (o abre la app con la sesión guardada)
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
      const next = toAssignedBase(await knowledge.mine(ctx.accessToken));
      if (JSON.stringify(next) === JSON.stringify(assigned)) return;
      assigned = next;
      await applyBase();
    } catch (e) { console.warn(`[sia] no se pudo cargar el conocimiento asignado: ${e.message}`); }
  };
  const clearAssigned = async () => { assigned = null; await applyBase(); };
  const syncKeys = (jwt, userId, opts) => knowledge.syncPeople(jwt, userId ? [userId] : null, opts);

  const issues = createIssuesService({ source: createIssuesSource(workspace.issuesDir), platform });
  const tunnel = createTunnel({ binDir: workspace.binDir, apiPort: ports.api, resolve: launchers.resolve, fetch: undiciFetch, insecureFetch: supaFetch, isWin });
  const remote = createRemote({ lock, tunnel, apiPort: ports.api, wsClients: () => bridge.clients(), idleMs: Number(env.SIA_LOCK_IDLE_MS) || undefined });
  const bridge = createTerminalBridge({
    pty, launchers, workspace, remote, lock, isLoopback, skillSync, issues, skillsOf,
    // SHELL_SESSIONS_DISABLE quita el aviso «Restored session…» de macOS. cleanEnv
    // poda el entorno heredado y userEnv pone encima las credenciales personales,
    // leídas frescas en cada sesión: ese orden importa.
    env: () => ({ ...cleanEnv({ ...env, SHELL_SESSIONS_DISABLE: '1' }), ...userEnv(config.read()) }),
    accessibleProjects: base.accessibleProjects, currentBase: base.current, theme: () => theme,
  });

  const http_ = { json, readBody };
  const routes = {
    auth: authRoutes(auth, { ...http_, onSession: loadAssigned, onLogout: clearAssigned, platform }),
    lock: lockRoutes(lock, http_),
    config: configRoutes(config, { ...http_, version, onTheme: (t) => { if (JSON.stringify(t) !== JSON.stringify(theme)) { theme = t; bridge.broadcastTheme(); } } }),
    users: usersRoutes(users, { ...http_, syncKeys, assignKnowledge: (jwt, userId, ids) => knowledge.setProjects(jwt, userId, ids), refreshProfile: (token) => auth.refreshProfile(token) }),
    knowledge: knowledgeRoutes(knowledge, { ...http_, syncKeys, onChange: () => loadAssigned() }),
    issues: issuesRoutes(issues, http_),
    metrics: metricsRoutes(createMetricsStore(workspace.metricsDir, { year: 2026 }), { json }), // de momento, solo 2026
    lan: lanRoutes(remote, lock, http_),
    projects: projectsRoutes(createProjects({ newId: randomUUID, fetchAll: baseAccess.fetchAll }), { ...http_, onProjectRemoved: () => skillSync.sync(assigned) }),
    skills: skillsRoutes({ ...http_, sync: skillSync, drafts: createDrafts(workspace.draftsDir), workspace }),
    links: linksRoutes(http_),
    uploads: uploadsRoutes(workspace.uploadsDir, { ...http_, sendFile }),
    updates: updatesRoutes(version, { json }),
  };
  // el ping: hay un SIA, sus puertos y el tema; a una sesión del móvil bloqueada
  // no se le dan los puertos (primero la clave). dev: corre con node, no en la
  // app; pin: si hay PIN de bloqueo, para que el candado del móvil sepa si
  // puede bloquear ya o tiene que pedir antes que se elija uno
  const ping = (s) => (s?.locked ? { sia: true, locked: true, mode: s.mode, theme }
    : { sia: true, version, dev: !process.versions.electron, ws: ports.ws, api: ports.api, theme, ...(s ? { mode: s.mode, pin: lock.hasPin() } : {}) });

  const apiServer = http.createServer(createRouter({ webDist: path.join(ROOT, 'web', 'dist'), ping, base, auth, lock, remote, routes }));
  // puerto ocupado por otro SIA: no es fatal, la UI hablará con el que ya escucha
  const inUse = (port) => (err) => { if (err.code === 'EADDRINUSE') console.warn(`[sia] puerto ${port} en uso — usando la instancia existente`); else throw err; };
  apiServer.on('error', inUse(ports.api));
  apiServer.listen(ports.api, () => console.log(`[sia] lab API en http://localhost:${ports.api}`));
  await applyBase(); // sin sesión aún: sin base (llega al iniciar sesión)

  // Dos puertas al MISMO bridge: el puerto dedicado (escritorio, dev) y /ws en
  // el servidor HTTP. La segunda existe por el túnel: por Cloudflare solo sale
  // un hostname por el 443, así que la web, la API y el WebSocket del móvil
  // viajan por el mismo origen (el móvil en la LAN también la usa). Un socket
  // desde esta máquina exige sesión iniciada (?a=<token>), comprobada al
  // aceptar la conexión; el del móvil va con su llave (terminal/bridge.js).
  const wsSessionOk = async (req) => !isLoopback(req) || !!(await auth.context(new URL(req.url, 'http://localhost').searchParams.get('a')).catch(() => null));
  const wss = new WebSocketServer({ port: ports.ws, verifyClient: (info, cb) => { wsSessionOk(info.req).then((ok) => cb(ok, 401, 'Inicia sesión.')); } });
  wss.on('error', inUse(ports.ws));
  const wssPath = new WebSocketServer({ noServer: true });
  apiServer.on('upgrade', (req, socket, head) => {
    if (new URL(req.url, 'http://localhost').pathname !== '/ws') return socket.destroy();
    wsSessionOk(req).then((ok) => {
      if (!ok) return socket.end('HTTP/1.1 401 Unauthorized\r\n\r\n');
      wssPath.handleUpgrade(req, socket, head, (ws) => wssPath.emit('connection', ws, req));
    });
  });
  bridge.attach(wss);
  bridge.attach(wssPath);
  console.log(`[sia] terminal bridge listening on ws://localhost:${ports.ws} (y /ws en la API)`);

  setInterval(() => remote.lockIdle(), 15_000).unref();
  // que no quede un túnel huérfano apuntando a este equipo al salir
  process.on('exit', () => tunnel.kill());
  for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { tunnel.kill(); process.exit(sig === 'SIGINT' ? 130 : 143); });
  return ports;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await startBridge();
