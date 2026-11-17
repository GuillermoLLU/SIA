// SIA: el bridge local. Sirve la API y, por WebSocket, los chats: cada
// conexión es una sesión y el bridge lanza Copilot por el protocolo de su SDK
// (chats/) y le vuelca la conversación al navegador. Aquí solo se montan
// las piezas (cada funcionalidad vive en su carpeta) y se arrancan los
// servidores; nada ocurre al importar: startBridge() lo pone todo en marcha.
//
//   node server/index.js            (o `node dev.mjs` desde la raíz)
//   import { startBridge } ...      (la app Electron: electron/main.js)

import { WebSocketServer, WebSocket as WSClient } from 'ws';
import { createClient } from '@supabase/supabase-js';
import { fetch as undiciFetch, Agent as UndiciAgent } from 'undici';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import tls from 'node:tls';
import { lookup } from 'node:dns/promises';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isLoopback, json, readBody, sendFile } from './shared/http.js';
import { choosePair } from './shared/ports.js';
import { trustSystemCerts, readSystemCerts } from './shared/certs.js';
import { onVpn } from './shared/vpn.js';
import { createRouter } from './router.js';
import { createConfigStore } from './config/store.js';
import { userEnv, cleanEnv, cleanSnowflake } from './config/config.js';
import { configRoutes } from './config/routes.js';
import { createLock } from './lock/service.js';
import { lockRoutes } from './lock/routes.js';
import { createWorkspace } from './workspace/workspace.js';
import { createLaunchers } from './launchers/service.js';
import { loadPlatformConfig, loadCertsConfig, loadVpnConfig } from './platform/config.js';
import { createPlatformClient } from './platform/client.js';
import { createAuth } from './auth/service.js';
import { authRoutes } from './auth/routes.js';
import { createPreflight } from './auth/preflight.js';
import { createUserAdmin } from './users/service.js';
import { usersRoutes } from './users/routes.js';
import { createBaseAccess, fetchAll } from './base/client.js';
import { createBaseAccess as createKnowledgeBaseAccess } from './knowledge/base-access.js';
import { createAssignedBase } from './knowledge/assigned-base.js';
import { createKnowledge } from './knowledge/service.js';
import { knowledgeRoutes } from './knowledge/routes.js';
import { createProjects } from './projects/service.js';
import { projectsRoutes } from './projects/routes.js';
import { createSkillSync } from './skills/sync.js';
import { skillList, createDrafts } from './skills/catalog.js';
import { createResolveDrafts } from './issues/drafts.js';
import { skillsRoutes } from './skills/routes.js';
import { linksRoutes } from './links/routes.js';
import { uploadsRoutes } from './uploads/routes.js';
import { updatesRoutes } from './updates/routes.js';
import { createIssuesSource } from './issues/source.js';
import { createIssuesService } from './issues/service.js';
import { issuesRoutes } from './issues/routes.js';
import { createJiraWatch } from './issues/jira-watch.js';
import { createJiraMock } from './issues/jira-mock.js';
import { createBacklogService } from './backlog/service.js';
import { createWsAuth } from './chats/ws-auth.js';
import { backlogRoutes } from './backlog/routes.js';
import { DatabaseSync } from 'node:sqlite';
import { createMetricsStore } from './metrics/store.js';
import { createRepository } from './metrics/repository.js';
import { metricsRoutes } from './metrics/routes.js';
import { createSnowflake } from './metrics/snowflake.js';
import { createChatBridge } from './chats/bridge.js';
import { createCopilotAuth } from './providers/copilot-auth.js';
import { providersRoutes } from './providers/routes.js';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url))); // sia/

// → { ws, api }: los puertos elegidos, para que la app se los pase a la UI.
export const startBridge = async ({ env = process.env } = {}) => {
  // antes de cualquier conexión: detrás de la VPN, la base de la instancia solo se verifica con los del sistema
  if (!trustSystemCerts(tls)) console.log('[sia] sin los certificados del sistema: detrás de la VPN hace falta Node 22.19 o superior');
  const certsCfg = loadCertsConfig(ROOT);
  const vpnCfg = loadVpnConfig(ROOT);
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
  const launchers = createLaunchers({ workspace: workspace.dir, mcpServer: path.join(ROOT, 'mcp', 'index.js'), isWin, env });
  const config = createConfigStore(path.join(home, '.sia', 'config.json'));
  const lock = createLock({ config });


  // La base de la instancia (quién entra, con qué vistas y qué conocimiento ve)
  const platform = createPlatformClient({ ...(loadPlatformConfig(ROOT, env) || { url: '', key: '' }), fetch, certsHelpUrl: certsCfg.helpUrl });
  const auth = createAuth({ platform, readConfig: config.read, writeConfig: config.write });
  // la S, «Reintentar» y Snowflake: los certificados recién instalados valen sin reiniciar SIA
  const refreshCerts = async () => trustSystemCerts(tls, await readSystemCerts(execFile, process.execPath).catch(() => undefined));
  const preflight = createPreflight({
    platform,
    refreshCerts,
    onVpn: (host) => onVpn(lookup, host),
    vpnHost: vpnCfg.probeHost,
  });
  const users = createUserAdmin({ platform });
  const knowledge = createKnowledge({ platform, ...createKnowledgeBaseAccess({ createClient, fetch, newId: randomUUID }) });

  // La base de conocimiento en uso: la que la plataforma asigna a quien inicia sesión (knowledge/assigned-base.js)
  const assigned = createAssignedBase({ auth, knowledge, onSwitch: (b) => applyBase(b) });
  const baseAccess = createBaseAccess({ createClient, fetch: supaFetch });
  const base = { ...baseAccess, current: assigned.current };
  const skillSync = createSkillSync({ clientFor: base.clientFor, needsSchema: base.needsSchema, workspace });
  const skillsOf = (b) => skillList(b ? workspace.skillsDirFor(b) : workspace.skillsDir);
  // otra base (o ninguna): fuera lo cacheado de la anterior y la copia local de skills se rehace
  const applyBase = async (b) => {
    base.clearStatus();
    console.log(b ? `[sia] base de conocimiento en uso: ${b.name}` : '[sia] sin base de conocimiento en uso');
    await skillSync.switchTo(b);
  };
  const syncKeys = (jwt, userId, opts) => knowledge.syncPeople(jwt, userId ? [userId] : null, opts);

  // Sin la BBDD de borradores el bridge arranca igual: Resolver va sin borrador.
  let drafts = null;
  try { drafts = createResolveDrafts({ DatabaseSync, file: path.join(workspace.issuesDir, 'borradores.sqlite'), fs }); }
  catch (e) { console.warn(`[sia] no se pudo abrir la BBDD de borradores de Resolver: ${e.message}`); }
  const issuesSource = createIssuesSource(workspace.issuesDir); // la foto, una sola para Issues y Backlog
  // los Jira de los escalados del equipo, cada media hora (de momento, un Jira de prueba)
  const jiraWatch = createJiraWatch({ source: issuesSource, jira: createJiraMock({ file: path.join(workspace.issuesDir, 'jira-prueba.json'), fs }), log: console.warn });
  jiraWatch.start();
  const issues = createIssuesService({ source: issuesSource, platform, drafts, jira: jiraWatch, jiraUrl: () => config.read().jira?.baseUrl || '' });
  const backlog = createBacklogService({ source: issuesSource, platform });
  const wsAuth = createWsAuth({ auth, isLoopback });   // quién entra por el socket de los chats
  // la cuenta de Copilot (Configuración → Proveedores IA): la suya, sin ninguna clave de GitHub en el entorno;
  // al iniciarla, los chats que la esperaban siguen
  const copilotAuth = createCopilotAuth({ spec: launchers.spec, env: () => cleanEnv({ ...env }), onLogin: () => bridge.authRestored() });
  const bridge = createChatBridge({
    launchers, workspace, lock, skillSync, issues, skillsOf, allowed: wsAuth.allowed,
    // cleanEnv poda el entorno heredado y userEnv pone encima las credenciales
    // personales, leídas frescas en cada sesión: ese orden importa.
    env: () => ({ ...cleanEnv({ ...env }), ...userEnv(config.read()) }),
    accessibleProjects: base.accessibleProjects, currentBase: base.current,
    copilotStatus: () => copilotAuth.status(),
  });

  const http_ = { json, readBody };
  // El conector de Snowflake pesa: se carga al arrancar, en segundo plano, para que el primer clic en Métricas
  // no espere. Si falla, se reintenta al actualizar.
  let snowflakeSdk = null;
  const loadSdk = async () => (snowflakeSdk ??= (await import('snowflake-sdk')).default);
  loadSdk().catch((e) => console.error(`[sia] conector de Snowflake sin cargar (se reintenta al actualizar): ${e.message}`));
  const routes = {
    auth: authRoutes(auth, { ...http_, onSession: assigned.login, onLogout: assigned.clear, platform, preflight }),
    lock: lockRoutes(lock, http_),
    config: configRoutes(config, { ...http_, version }),
    providers: providersRoutes(copilotAuth, http_),
    users: usersRoutes(users, { ...http_, syncKeys, assignKnowledge: (jwt, userId, ids) => knowledge.setProjects(jwt, userId, ids), refreshProfile: (token) => auth.refreshProfile(token) }),
    knowledge: knowledgeRoutes(knowledge, { ...http_, syncKeys, onChange: (who) => assigned.reload(who.token) }),
    issues: issuesRoutes(issues, http_),
    backlog: backlogRoutes(backlog, http_),
    metrics: metricsRoutes(createMetricsStore(workspace.metricsDir, {
      repo: createRepository({ DatabaseSync, file: path.join(workspace.metricsDir, 'incidencias.sqlite'), fs }),
      source: createSnowflake({ loadSdk, config: () => cleanSnowflake(config.read().snowflake), certsHelpUrl: certsCfg.helpUrl, refreshCerts,
        onVpn: async () => !vpnCfg.probeHost || onVpn(lookup, vpnCfg.probeHost) }),
      fs,
      log: console.log,
    }), { json, readBody }),
    projects: projectsRoutes(createProjects({ newId: randomUUID, fetchAll }), { ...http_, onProjectRemoved: () => skillSync.sync(assigned.current()) }),
    skills: skillsRoutes({ ...http_, sync: skillSync, drafts: createDrafts(workspace.draftsDir), workspace }),
    links: linksRoutes(http_),
    uploads: uploadsRoutes(workspace.uploadsDir, { ...http_, sendFile }),
    updates: updatesRoutes(version, { json }),
  };
  // el ping: hay un SIA y sus puertos. dev: corre con node, no en la app
  const ping = () => ({ sia: true, version, dev: !process.versions.electron, ws: ports.ws, api: ports.api });

  // Solo escucha en esta máquina: la web llega por file:// (app) o por Vite (dev).
  const HOST = '127.0.0.1';
  const apiServer = http.createServer(createRouter({ ping, base, auth, lock, routes, ensureBase: assigned.ensure }));
  // puerto ocupado por otro SIA: no es fatal, la UI hablará con el que ya escucha
  const inUse = (port) => (err) => { if (err.code === 'EADDRINUSE') console.warn(`[sia] puerto ${port} en uso — usando la instancia existente`); else throw err; };
  apiServer.on('error', inUse(ports.api));
  apiServer.listen(ports.api, HOST, () => console.log(`[sia] lab API en http://localhost:${ports.api}`));
  await applyBase(null); // sin sesión aún: sin base (llega al iniciar sesión)

  // El socket de los chats: solo desde esta máquina y con sesión iniciada, comprobada al aceptar la conexión
  const wss = new WebSocketServer({ host: HOST, port: ports.ws, verifyClient: (info, cb) => { wsAuth.sessionOk(info.req).then((ok) => cb(ok, 401, 'Inicia sesión.')); } });
  wss.on('error', inUse(ports.ws));
  bridge.attach(wss);
  console.log(`[sia] chats en ws://localhost:${ports.ws}`);
  return ports;
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await startBridge();
