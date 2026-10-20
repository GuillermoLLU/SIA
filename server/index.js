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
import { json, readBody } from './shared/http.js';
import { createConfigStore } from './config/store.js';
import { cleanTheme, userEnv, cleanEnv } from './config/config.js';
import { configRoutes } from './config/routes.js';
import { createLock } from './lock/service.js';
import { lockRoutes } from './lock/routes.js';
import { isPin } from './lock/lock.js';
import { createWorkspace } from './workspace/workspace.js';
import { createLaunchers } from './launchers/service.js';
import { mcpRename } from './launchers/mcp.js';
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

/* ── Acceso desde otro dispositivo (móvil) ──────────────────────────
   El bridge ya escucha en todas las interfaces, así que por defecto
   DENEGAMOS todo lo que no venga de localhost. Un dispositivo solo entra
   si presenta una llave de sesión, que se obtiene emparejando con el QR
   (token de un solo uso) + el PIN que muestra el escritorio.
   Dos modos: 'lan' (misma WiFi, como siempre) y 'public' (túnel de
   Cloudflare con URL temporal — el estado del túnel vive en PUBLIC). */
const LAN = {
  pairing: null,        // { token, pin, expiresAt, mode } emparejamiento pendiente (el último QR)
  // sessionToken -> { id, name, since, ip, mode, locked, lastSeen, unlockAttempts }
  // (id: identificador corto para la lista de dispositivos; el token no sale nunca)
  sessions: new Map(),
};
const newToken = () => randomBytes(24).toString('base64url');
// Nombre reconocible de un dispositivo a partir de su navegador, para la lista
// de conectados («iPhone · Safari»). Es orientativo: un iPad se anuncia como Mac.
const deviceName = (ua = '') => {
  const dev = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad'
    : /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Android' : 'Tablet Android')
      : /Macintosh|Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Dispositivo';
  const br = /EdgA?\//.test(ua) ? 'Edge' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return br ? `${dev} · ${br}` : dev;
};
const clientIp = (req) => String(req.headers['cf-connecting-ip'] || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
const newPin = () => String(Math.floor(100000 + Math.random() * 900000)); // 6 dígitos
const lanActive = () => PUBLIC.phase !== 'off' || !!LAN.pairing || LAN.sessions.size > 0;
// OJO: el tráfico que entra por el túnel de Cloudflare llega al bridge DESDE
// localhost (cloudflared corre aquí), pero no es local: viene marcado con las
// cabeceras del proxy. Sin este matiz, cualquiera con la URL pública sería
// "loopback" y se saltaría el cortafuegos entero.
const isLoopback = (req) => {
  if (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']) return false;
  const a = req.socket?.remoteAddress || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
};
const lanIP = () => {
  for (const ifaces of Object.values(os.networkInterfaces()))
    for (const i of ifaces || []) if (i.family === 'IPv4' && !i.internal) return i.address;
  return null;
};
// Un QR caducado ya no empareja a nadie: se retira para que el estado no lo dé
// por pendiente (la pantalla seguía enseñándolo sin fin).
const dropExpiredPairing = () => { if (LAN.pairing && Date.now() > LAN.pairing.expiresAt) LAN.pairing = null; };
const lanStatus = () => (dropExpiredPairing(), {
  active: lanActive(), ip: lanIP(), port: API_PORT, devices: LAN.sessions.size,
  pendingPairing: !!LAN.pairing, pairExpiresAt: LAN.pairing?.expiresAt || null,
  mode: PUBLIC.phase !== 'off' ? 'public' : 'lan',
  publicPhase: ['preparing', 'download', 'starting'].includes(PUBLIC.phase) ? PUBLIC.phase : null,
  publicError: PUBLIC.error,
  cloudflared: !!cloudflaredPath(),
  qrUrl: LAN.pairing
    ? (LAN.pairing.mode === 'public'
      ? `${PUBLIC.url}/?p=${LAN.pairing.token}`
      : `http://${lanIP()}:${API_PORT}/?p=${LAN.pairing.token}`)
    : null,
  pin: LAN.pairing?.pin || null,
  // dispositivos emparejados, para verlos y cerrarlos uno a uno desde el ordenador
  list: [...LAN.sessions].map(([t, s]) => ({
    id: s.id, name: s.name || 'Dispositivo', ip: s.ip, mode: s.mode, locked: !!s.locked,
    since: s.since, lastSeen: s.lastSeen,
    online: allWsClients().some((c) => c._siaToken === t && c.readyState === 1),
  })),
});

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

const parseFrontmatter = (src) => {
  const fm = {};
  const m = src.match(/^---\n([\s\S]*?)\n---/);
  if (m) {
    for (const line of m[1].split('\n')) {
      const i = line.indexOf(':');
      if (i > 0) fm[line.slice(0, i).trim()] = line.slice(i + 1).trim().replace(/^["']|["']$/g, '');
    }
  }
  return fm;
};

// Skills dictionary: workspace/skills/<name>/SKILL.md (frontmatter YAML). Parsed
// fresh per connection so a fresh sync needs no restart.
const skillList = (base = null) => {
  const dir = base ? workspace.skillsDirFor(base) : workspace.skillsDir;
  try {
    return fs.readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const md = path.join(dir, d.name, 'SKILL.md');
        if (!fs.existsSync(md)) return null;
        const fm = parseFrontmatter(fs.readFileSync(md, 'utf8'));
        if (fm.enabled === 'false') return null;
        return {
          id: d.name,
          label: fm.commandLabel || fm.name || d.name,
          description: fm.commandDescription || fm.description || '',
          category: fm.category || '',
        };
      })
      .filter(Boolean);
  } catch {
    return [];
  }
};

/* ── Central skills: Supabase is the source of truth ───────────────
   The bridge pulls enabled skills and rebuilds workspace/skills/ (local
   edits there get overwritten — publishing is the way to change a skill).
   If Supabase is unreachable, the last synced copy keeps working. */
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

const syncSkills = async (base) => {
  if (!base) return;
  const dir = workspace.skillsDirFor(base);
  try {
    // sin el esquema blindado la base no se usa (ni para skills): aviso y fuera
    if (await needsSchema(base)) { console.warn(`[sia] «${base.name}» necesita el SQL del esquema nuevo: no se usa hasta entonces`); lastSyncByBase.set(base.id, Date.now()); return; }
    const db = clientFor(base);
    const { data: metas, error: e1 } = await db.from('skills').select('id, scope').eq('enabled', true);
    if (e1) throw new Error(e1.message);
    if (!metas?.length) { console.warn(`[sia] sync ${base.name}: 0 skills en Supabase — conservo la copia local`); lastSyncByBase.set(base.id, Date.now()); return; }
    const { data: files, error: e2 } = await fetchAll(() => db.from('skill_files').select('skill_id, path, content').order('skill_id').order('path'));
    if (e2) throw new Error(e2.message);
    // visibilidad: comunes (scope vacío) + las de los proyectos cuyo token tiene
    // la persona (los mismos tokens que el acceso al conocimiento).
    const myTokens = new Set(accessTokens(base));
    const enabled = new Set(metas.filter((m) => !m.scope || myTokens.has(m.scope)).map((m) => m.id));
    fs.rmSync(dir, { recursive: true, force: true });
    let written = 0;
    for (const f of files) {
      if (!enabled.has(f.skill_id)) continue;
      const rel = safeRelPath(f.path);
      if (!rel) continue;
      const dest = path.join(dir, f.skill_id, rel);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, mcpRename(f.content));
      written++;
    }
    lastSyncByBase.set(base.id, Date.now());
    console.log(`[sia] skills de «${base.name}» sincronizadas: ${enabled.size} skills, ${written} ficheros`);
  } catch (err) {
    console.error(`[sia] sync de skills de «${base.name}» falló (sigo con la copia local): ${err.message}`);
  }
};
const lastSyncByBase = new Map();
const syncAllSkills = async () => {
  // otra base (o ninguna): fuera el rincón del workspace de la anterior
  const b = currentBase();
  workspace.keepOnlyBase(b);
  await syncSkills(b);
};
const maybeSyncSkills = () => {
  const b = currentBase();
  if (b && Date.now() - (lastSyncByBase.get(b.id) || 0) > 60_000) syncSkills(b);
};
// Otra base asignada (o ninguna, al salir): fuera los permisos cacheados de la
// anterior y, como son otras skills, vaciar la copia local y volver a traerlas.
const applyBase = async () => {
  const b = currentBase();
  baseAccess.clearStatus();
  lastSyncByBase.clear();
  console.log(b ? `[sia] base de conocimiento en uso: ${b.name}` : '[sia] sin base de conocimiento en uso');
  await syncAllSkills();
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
// Validación de un enlace rápido. La imagen viaja como data URI para que viva
// en la base y no dependa de un servidor ajeno; se acota el tamaño porque es
// una miniatura, no una foto.
// La UI reescala a 256 px antes de enviar, así que una imagen normal llega en
// decenas de KB. Este tope no es un límite de uso: es una red por si alguien
// llama a la API a mano, para que una imagen suelta no lastre el listado —
// que devuelve las imágenes incrustadas.
const LINK_IMAGE_CAP = 3_000_000; // ~2,2 MB de imagen real una vez en base64
const linkFields = ({ title, url, image, notes }) => {
  const t = String(title ?? '').trim();
  const u = String(url ?? '').trim();
  if (!t) return { error: 'el título no puede estar vacío' };
  if (t.length > 120) return { error: 'el título no puede pasar de 120 caracteres' };
  if (!/^https?:\/\/./i.test(u)) return { error: 'la URL tiene que empezar por http:// o https://' };
  const img = image ? String(image) : null;
  if (img && !/^data:image\/(png|jpeg|gif|webp|svg\+xml);base64,/.test(img)) {
    return { error: 'la imagen no es válida' };
  }
  if (img && img.length > LINK_IMAGE_CAP) return { error: 'la imagen pesa demasiado (máx. ~2 MB)' };
  return { value: { title: t, url: u, image: img, notes: notes ? String(notes) : null } };
};

const walkDir = (dir, base = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walkDir(path.join(dir, e.name), path.join(base, e.name))
    : [{ path: path.join(base, e.name), content: fs.readFileSync(path.join(dir, e.name), 'utf8') }]);

const lockRoute = lockRoutes(lock, { json, readBody });
const updatesRoute = updatesRoutes(APP_VERSION, { json });
const configRoute = configRoutes(config, { json, readBody, version: APP_VERSION, onTheme: (theme) => {
  if (JSON.stringify(theme) !== JSON.stringify(UI_THEME)) { UI_THEME = theme; broadcastTheme(); }
} });
const authRoute = authRoutes(auth, { json, readBody, onSession: loadAssigned, onLogout: clearAssigned, platform });
const syncKeys = (jwt, userId, opts) => knowledge.syncPeople(jwt, userId ? [userId] : null, opts);
const usersRoute = usersRoutes(users, auth, { json, readBody, syncKeys, assignKnowledge: (jwt, userId, ids) => knowledge.setProjects(jwt, userId, ids) });
const knowledgeRoute = knowledgeRoutes(knowledge, auth, { json, readBody, syncKeys, onChange: loadAssigned });
// Issues: de momento, el CSV más reciente que se deje en <workspace>/issues.
const issuesSource = createIssuesSource(workspace.issuesDir);
const issuesRoute = issuesRoutes(issuesSource, auth, platform, { json, readBody });
// Métricas: calculadas desde el CSV completo de Remedy que carga cada persona; de momento, solo 2026.
const metricsRoute = metricsRoutes(createMetricsStore(workspace.metricsDir, { year: 2026 }), { json });
const validId = (s) => typeof s === 'string' && /^[a-z0-9][a-z0-9_-]{1,63}$/i.test(s);
let uploadSeq = 0;
const validFiles = (files) => Array.isArray(files) && files.length &&
  files.every((f) => safeRelPath(f.path || '') && typeof f.content === 'string');

/* ── Acceso público: quick tunnel de Cloudflare ─────────────────────
   `cloudflared tunnel --url` sin cuenta ni credenciales: da una URL
   https://xxx.trycloudflare.com aleatoria que muere con el proceso. Encima
   va el mismo emparejamiento QR+PIN de la red local, más un candado: al
   abrir en público el usuario elige una clave de desbloqueo, y la sesión
   del móvil se bloquea (aquí, en el bridge — no es solo una cortina en el
   cliente) al perder el foco o pasar un rato inactiva. */
const PUBLIC = {
  proc: null,     // proceso cloudflared vivo, o null
  url: null,      // https://xxx.trycloudflare.com
  phase: 'off',   // off | preparing | download | starting | ready
  error: null,    // último fallo, para enseñarlo en la UI
};

// Binario de cloudflared: el del PATH si existe; si no, uno descargado al
// workspace (escribible también en la app empaquetada) la primera vez.
const CF_DIR = workspace.binDir;
const CF_LOCAL = path.join(CF_DIR, isWin ? 'cloudflared.exe' : 'cloudflared');
const cloudflaredPath = () => launchers.resolve('cloudflared') || (fs.existsSync(CF_LOCAL) ? CF_LOCAL : null);
const cfAsset = () => {
  const arch = os.arch() === 'arm64' ? 'arm64' : 'amd64';
  if (isWin) return 'cloudflared-windows-amd64.exe'; // no hay build arm64 de Windows
  if (os.platform() === 'darwin') return `cloudflared-darwin-${arch}.tgz`;
  return `cloudflared-linux-${arch}`;
};
const ensureCloudflared = async () => {
  const found = cloudflaredPath();
  if (found) return found;
  PUBLIC.phase = 'download';
  console.log('[sia] descargando cloudflared (primera vez)…');
  fs.mkdirSync(CF_DIR, { recursive: true });
  const asset = cfAsset();
  const dlUrl = `https://github.com/cloudflare/cloudflared/releases/latest/download/${asset}`;
  // fetch normal (TLS validado); si la red corporativa lo rompe con su proxy
  // MITM, reintento con el agente tolerante que ya usamos para Supabase.
  let r;
  try { r = await undiciFetch(dlUrl); } catch { r = await supaFetch(dlUrl); }
  if (!r.ok) throw new Error(`no se pudo descargar cloudflared (HTTP ${r.status})`);
  const buf = Buffer.from(await r.arrayBuffer());
  if (asset.endsWith('.tgz')) { // macOS lo publica empaquetado: extraer con el tar del sistema
    const tmp = path.join(CF_DIR, asset);
    fs.writeFileSync(tmp, buf);
    await new Promise((resolve, reject) => {
      const p = spawn('tar', ['-xzf', tmp, '-C', CF_DIR]);
      p.on('exit', (c) => (c === 0 ? resolve() : reject(new Error('no se pudo extraer cloudflared'))));
      p.on('error', reject);
    });
    fs.rmSync(tmp, { force: true });
  } else {
    fs.writeFileSync(CF_LOCAL, buf);
  }
  if (!isWin) fs.chmodSync(CF_LOCAL, 0o755);
  console.log('[sia] cloudflared listo en', CF_LOCAL);
  return CF_LOCAL;
};
const startTunnel = (bin) => new Promise((resolve, reject) => {
  PUBLIC.phase = 'starting';
  const proc = spawn(bin, ['tunnel', '--url', `http://127.0.0.1:${API_PORT}`, '--no-autoupdate'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  PUBLIC.proc = proc;
  let out = '';
  const sniff = (d) => { // cloudflared imprime la URL asignada en su log de arranque
    out += d.toString();
    const m = out.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) { PUBLIC.url = m[0]; resolve(m[0]); }
  };
  proc.stdout.on('data', sniff);
  proc.stderr.on('data', sniff);
  proc.on('error', reject);
  proc.on('exit', () => {
    if (PUBLIC.proc === proc) { // muerte no pedida (red caída, kill externo…)
      PUBLIC.proc = null; PUBLIC.url = null;
      if (PUBLIC.phase === 'ready') { PUBLIC.phase = 'off'; PUBLIC.error = 'el túnel se cerró — vuelve a generar el acceso'; }
      console.warn('[sia] cloudflared terminó');
    }
    reject(new Error('cloudflared terminó sin dar URL'));
  });
  setTimeout(() => reject(new Error('el túnel tardó demasiado en arrancar')), 45_000);
});
// La URL de un túnel recién creado tarda unos segundos en resolver (DNS en
// propagación): si el QR sale antes, el primer escaneo puede dar error. Se
// sondea la URL pública hasta que responde — y si no llega, se sigue igual,
// que el QR vive 5 minutos y para entonces ya resolverá.
const warmTunnel = async (base) => {
  for (let i = 0; i < 6; i++) {
    try {
      const r = await undiciFetch(`${base}/api/ping`, { signal: AbortSignal.timeout(3000) });
      if (r.ok) return;
    } catch { /* aún propagando */ }
    await new Promise((r) => setTimeout(r, 2000));
  }
};
const stopTunnel = () => {
  const proc = PUBLIC.proc;
  PUBLIC.proc = null; PUBLIC.url = null; PUBLIC.phase = 'off'; PUBLIC.error = null;
  if (proc) { try { proc.kill(); } catch {} }
};
// que no quede un túnel huérfano apuntando a este equipo al salir
process.on('exit', () => { try { PUBLIC.proc?.kill(); } catch {} });
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => { try { PUBLIC.proc?.kill(); } catch {} process.exit(sig === 'SIGINT' ? 130 : 143); });
}

/* Candado: bloquear marca la sesión en el bridge y tira sus WebSockets — la
   API y la terminal quedan cerradas de verdad hasta la clave correcta. */
const closeWsFor = (token, code, reason) => {
  for (const c of allWsClients()) {
    if (c._siaToken === token) { try { c.close(code, reason); } catch {} }
  }
};
const lockSession = (token, sess) => {
  if (!sess || sess.locked) return;
  sess.locked = true;
  closeWsFor(token, 4423, 'bloqueado');
};
// Cinturón del servidor: aunque el móvil muera sin avisar, una sesión pública
// inactiva se bloquea sola pasado el plazo. (El env es para poder probarlo.)
const LOCK_IDLE_MS = Number(process.env.SIA_LOCK_IDLE_MS) || 5 * 60_000;
setInterval(() => {
  for (const [t, s] of LAN.sessions) {
    if (s.mode === 'public' && !s.locked && Date.now() - s.lastSeen > LOCK_IDLE_MS) {
      lockSession(t, s);
      console.log('[sia] sesión pública bloqueada por inactividad');
    }
  }
}, 15_000).unref();

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
    const lanToken = req.headers['x-sia-lan'] || url.searchParams.get('t');
    const sess = lanToken ? LAN.sessions.get(lanToken) : null;
    // La web estática (el shell del móvil/PWA) se sirve siempre: no expone
    // datos y permite que la PWA instalada arranque y muestre la pantalla de
    // PIN aunque el acceso aún no esté activo. La API solo abre ping y pair,
    // y únicamente mientras el emparejamiento/acceso está activo.
    const allowed = parts[0] !== 'api' || (lanActive() && (
      parts[1] === 'ping' ||                                 // comprobar que hay un SIA vivo
      (parts[1] === 'lan' && parts[2] === 'pair')            // emparejar (token+PIN o solo PIN)
    ));
    if (!sess && !allowed) return json(res, 403, { error: 'acceso no autorizado' });
    if (sess && parts[0] === 'api') {
      sess.lastSeen = Date.now();
      // Emparejado NO es local: un dispositivo remoto solo llega a lo que la
      // vista del móvil usa de verdad. Nada de config personal (ahí viven los
      // tokens de Jira/GitHub), skills, borradores ni administración.
      const reach = parts[1] === 'ping' || parts[1] === 'version'
        || parts[1] === 'upload' || parts[1] === 'uploads'
        || (parts[1] === 'lan' && ['pair', 'lock', 'unlock', 'pin'].includes(parts[2]));
      if (!reach) return json(res, 403, { error: 'no disponible en remoto' });
      // candado echado: solo desbloquear (y ping, que informa del estado)
      if (sess.locked && parts[1] !== 'ping' && !(parts[1] === 'lan' && ['lock', 'unlock'].includes(parts[2]))) {
        return json(res, 423, { error: 'sesión bloqueada', locked: true });
      }
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
      const t = req.headers['x-sia-lan'] || url.searchParams.get('t');
      const s = t ? LAN.sessions.get(t) : null;
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

    /* ── Acceso desde el móvil (red local o túnel público) ── */
    if (parts[1] === 'lan') {
      // emparejar: lo llama el MÓVIL con el token del QR + el PIN del escritorio.
      // La PWA instalada no tiene la URL del QR (almacenamiento aparte), así que
      // también vale SOLO el PIN mientras el emparejamiento esté activo; para
      // que 6 dígitos no sean fuerza-brutables, la ventana se invalida a los
      // 5 intentos fallidos.
      if (parts[2] === 'pair' && req.method === 'POST') {
        const { token, pin } = await readBody(req);
        const p = LAN.pairing;
        const ok = p && Date.now() <= p.expiresAt && p.pin === String(pin) && (!token || p.token === token);
        if (!ok) {
          if (p && (p.attempts = (p.attempts || 0) + 1) >= 5) {
            LAN.pairing = null;
            console.warn('[sia] emparejamiento invalidado: demasiados intentos fallidos');
          }
          return json(res, 403, { error: 'QR o PIN incorrecto o caducado' });
        }
        const mode = p.mode || 'lan';
        LAN.pairing = null; // de un solo uso: el QR/PIN dejan de valer
        const sessionToken = newToken();
        LAN.sessions.set(sessionToken, {
          id: randomBytes(5).toString('hex'), name: deviceName(req.headers['user-agent']),
          since: Date.now(), ip: clientIp(req),
          mode, locked: false, lastSeen: Date.now(), unlockAttempts: 0,
        });
        return json(res, 200, { sessionToken, mode });
      }
      // candado: lo echa el móvil, a mano (su botón) o solo al perder el foco en
      // el acceso público (sendBeacon → token en ?t=).
      if (parts[2] === 'lock' && req.method === 'POST') {
        const t = req.headers['x-sia-lan'] || url.searchParams.get('t');
        const s = t ? LAN.sessions.get(t) : null;
        // solo si hay PIN de bloqueo, que es con lo que se desbloquea: sin PIN
        // no se bloquea, porque no habría forma de volver a entrar
        if (s && lock.hasPin()) lockSession(t, s);
        return json(res, 200, { ok: true, locked: !!s?.locked });
      }
      // elegir el PIN de bloqueo desde el móvil emparejado: SOLO si aún no hay
      // ninguno (cambiarlo exige el actual y se hace en el ordenador)
      if (parts[2] === 'pin' && req.method === 'PUT') {
        const t = req.headers['x-sia-lan'] || url.searchParams.get('t');
        if (!t || !LAN.sessions.get(t)) return json(res, 403, { error: 'acceso no autorizado' });
        if (lock.hasPin()) return json(res, 409, { error: 'Ya hay un PIN de bloqueo: se cambia en el ordenador.' });
        const { key } = await readBody(req);
        if (!isPin(key)) return json(res, 400, { error: 'El PIN son 4 dígitos.' });
        lock.setPin(key);
        return json(res, 200, { ok: true });
      }
      // desbloquear: con el PIN de bloqueo, el mismo del candado del escritorio,
      // sea la sesión de red local o por túnel. A los 5 fallos la sesión se
      // revoca entera — quien tenga el token robado se
      // queda fuera y hace falta volver a emparejar con QR+PIN.
      if (parts[2] === 'unlock' && req.method === 'POST') {
        const t = req.headers['x-sia-lan'] || url.searchParams.get('t');
        const s = t ? LAN.sessions.get(t) : null;
        if (!s) return json(res, 410, { error: 'sesión revocada — vuelve a emparejar desde el ordenador' });
        const { key } = await readBody(req);
        const good = lock.matches(String(key || ''));
        if (!good) {
          s.unlockAttempts = (s.unlockAttempts || 0) + 1;
          if (s.unlockAttempts >= 5) {
            LAN.sessions.delete(t);
            closeWsFor(t, 4403, 'revocado');
            console.warn('[sia] sesión del móvil revocada: demasiados intentos de desbloqueo');
            return json(res, 410, { error: 'demasiados intentos — sesión revocada, vuelve a emparejar' });
          }
          return json(res, 401, { error: `clave incorrecta (quedan ${5 - s.unlockAttempts} intentos)` });
        }
        s.locked = false; s.unlockAttempts = 0; s.lastSeen = Date.now();
        return json(res, 200, { ok: true });
      }
      // gestión: SOLO desde el equipo (localhost)
      if (!isLoopback(req)) return json(res, 403, { error: 'solo desde el equipo' });
      if (parts[2] === 'status' && req.method === 'GET') return json(res, 200, lanStatus());
      // cerrar UN dispositivo: se le revoca la llave y se le cortan los sockets;
      // los demás siguen como estaban
      if (parts[2] === 'devices' && parts[3] && req.method === 'DELETE') {
        const hit = [...LAN.sessions].find(([, s]) => s.id === decodeURIComponent(parts[3]));
        if (!hit) return json(res, 404, { error: 'Ese dispositivo ya no está conectado.' });
        LAN.sessions.delete(hit[0]);
        closeWsFor(hit[0], 4403, 'revocado');
        return json(res, 200, lanStatus());
      }
      if (parts[2] === 'enable' && req.method === 'POST') {
        const { mode = 'lan' } = await readBody(req);
        if (mode === 'public') {
          // el móvil por túnel se bloquea solo y se desbloquea con el PIN de
          // bloqueo: sin PIN no se abre nada a internet
          if (!lock.hasPin()) return json(res, 409, { error: 'Antes de abrir el acceso público elige tu PIN de bloqueo.', needsPin: true });
          PUBLIC.error = null;
          if (PUBLIC.proc && PUBLIC.url) { // túnel ya vivo: solo un QR nuevo
            LAN.pairing = { token: newToken(), pin: newPin(), expiresAt: Date.now() + 5 * 60 * 1000, mode: 'public' };
            PUBLIC.phase = 'ready';
            return json(res, 200, lanStatus());
          }
          // arranque asíncrono (la descarga puede tardar): la UI sigue las
          // fases por /lan/status y pinta el QR cuando phase pasa a ready
          PUBLIC.phase = 'preparing';
          (async () => {
            try {
              const bin = await ensureCloudflared();
              await startTunnel(bin);
              await warmTunnel(PUBLIC.url); // que el QR no salga antes de que la URL resuelva
              LAN.pairing = { token: newToken(), pin: newPin(), expiresAt: Date.now() + 5 * 60 * 1000, mode: 'public' };
              PUBLIC.phase = 'ready';
              console.log(`[sia] acceso público listo: ${PUBLIC.url}`);
            } catch (err) {
              const proc = PUBLIC.proc;
              PUBLIC.proc = null; PUBLIC.url = null; PUBLIC.phase = 'off';
              PUBLIC.error = err.message;
              if (proc) { try { proc.kill(); } catch {} }
              console.warn('[sia] acceso público fallido:', err.message);
            }
          })();
          return json(res, 200, lanStatus());
        }
        const ip = lanIP();
        if (!ip) return json(res, 503, { error: 'no se detecta una red local (¿WiFi?)' });
        LAN.pairing = { token: newToken(), pin: newPin(), expiresAt: Date.now() + 5 * 60 * 1000, mode: 'lan' };
        return json(res, 200, lanStatus());
      }
      if (parts[2] === 'disable' && req.method === 'POST') {
        LAN.pairing = null; LAN.sessions.clear();
        stopTunnel();
        for (const c of allWsClients()) { if (c._siaLan) { try { c.close(4403, 'acceso revocado'); } catch {} } }
        return json(res, 200, lanStatus());
      }
      return json(res, 404, { error: 'no encontrado' });
    }
    if (parts[1] === 'admin' && parts[2] === 'check') {
      // qué abre en la base la clave de poder de quien ha iniciado sesión
      return json(res, 200, { base: { perms } });
    }

    if (parts[1] === 'admin' && parts[2] && parts[2] !== 'check') {
      if (!perms?.admin) return json(res, 403, { error: 'Tu clave de poder no abre la Administración.' });
      // proyectos: lo único que se gestiona (server/projects/)
      if (parts[2] === 'projects') {
        try {
          if (!parts[3] && req.method === 'GET') return json(res, 200, await projects.list(db));
          if (!parts[3] && req.method === 'POST') return json(res, 200, await projects.create(db, (await readBody(req)).name));
          if (parts[3] && req.method === 'DELETE') {
            await projects.remove(db, Number(parts[3]));
            await syncSkills(knowledgeBase); // las skills de su token se van con él: fuera de la copia local
            return json(res, 200, { ok: true });
          }
        } catch (e) { return json(res, e.status || 500, { error: e.message }); }
      }
      // entradas (entries) de un proyecto — capa de contextos oculta para la UI
      if (parts[2] === 'entries' && req.method === 'GET') {
        const pid = Number(new URL(req.url, 'http://localhost').searchParams.get('project'));
        const { data: ctxs } = await db.from('contexts').select('id').eq('project_id', pid);
        const ids = (ctxs || []).map((c) => c.id);
        if (!ids.length) return json(res, 200, []);
        const { data, error } = await fetchAll(() => db.from('context_entries').select('id, content, source_type, created_at').in('context_id', ids).order('id'));
        if (error) return json(res, 500, { error: error.message });
        return json(res, 200, data || []);
      }
      if (parts[2] === 'entries' && req.method === 'DELETE' && parts[3]) {
        const id = Number(parts[3]);
        await db.from('context_chunks').delete().eq('entry_id', id);
        const { error } = await db.from('context_entries').delete().eq('id', id);
        if (error) return json(res, 500, { error: error.message });
        return json(res, 200, { ok: true });
      }
      return json(res, 404, { error: 'no encontrado' });
    }

    if (parts[1] === 'config') return configRoute(req, res);
    // proyectos accesibles para los tokens del usuario (selector de fuentes,
    // siempre fresco — no depende del WS)
    if (parts[1] === 'access' && parts[2] === 'projects' && req.method === 'GET') {
      return json(res, 200, await accessibleProjects(knowledgeBase));
    }
    /* ── Enlaces rápidos por proyecto ────────────────────────────────
       Compartidos con todo el equipo. LEER puede cualquiera, acotado a los
       proyectos que dan sus tokens (mismo techo que el conocimiento, y misma
       regla de default-deny). CREAR / EDITAR / BORRAR exige rol admin — el
       mismo gate que publicar skills. */
    if (parts[1] === 'links') {
      const allowed = (await accessibleProjects(knowledgeBase)).map((p) => p.id);

      if (req.method === 'GET' && !parts[2]) {
        if (!allowed.length) return json(res, 200, []);
        const { data, error } = await db
          .from('project_links')
          .select('id, project_id, title, url, image, notes, created_at')
          .in('project_id', allowed)
          .order('title');
        if (error) return json(res, 500, { error: error.message });
        return json(res, 200, data || []);
      }

      // a partir de aquí se escribe: permiso «links»
      if (!perms?.links) return json(res, 403, { error: 'Tu clave de poder no permite editar enlaces.' });

      // el proyecto destino tiene que estar dentro del techo del token
      const inReach = (id) => allowed.includes(Number(id));

      if (req.method === 'POST' && !parts[2]) {
        const { project_id, title, url, image, notes } = await readBody(req);
        if (!inReach(project_id)) return json(res, 403, { error: 'Sin acceso a ese conocimiento.' });
        const clean = linkFields({ title, url, image, notes });
        if (clean.error) return json(res, 400, { error: clean.error });
        const { data, error } = await db
          .from('project_links')
          .insert({ project_id: Number(project_id), ...clean.value })
          .select('id, project_id, title, url, image, notes, created_at')
          .single();
        if (error) return json(res, 500, { error: error.message });
        return json(res, 200, data);
      }

      if (req.method === 'PUT' && parts[2]) {
        const body = await readBody(req);
        const { project_id } = body;
        const { data: cur } = await db
          .from('project_links').select('project_id, title, url, image, notes').eq('id', parts[2]).maybeSingle();
        if (!cur || !inReach(cur.project_id)) return json(res, 403, { error: 'Sin acceso a ese enlace.' });
        if (project_id !== undefined && !inReach(project_id)) return json(res, 403, { error: 'Sin acceso a ese conocimiento.' });
        // fusión: lo que no venga en el cuerpo se conserva. Un PUT parcial no
        // debe borrar las notas ni la imagen de un enlace que ya existía.
        const merged = { title: cur.title, url: cur.url, image: cur.image, notes: cur.notes };
        for (const k of ['title', 'url', 'image', 'notes']) if (body[k] !== undefined) merged[k] = body[k];
        const clean = linkFields(merged);
        if (clean.error) return json(res, 400, { error: clean.error });
        const patch = { ...clean.value, updated_at: new Date().toISOString() };
        if (project_id !== undefined) patch.project_id = Number(project_id);
        const { data, error } = await db
          .from('project_links')
          .update(patch)
          .eq('id', parts[2])
          .select('id, project_id, title, url, image, notes, created_at')
          .single();
        if (error) return json(res, 500, { error: error.message });
        return json(res, 200, data);
      }

      if (req.method === 'DELETE' && parts[2]) {
        const { data: cur } = await db.from('project_links').select('project_id').eq('id', parts[2]).maybeSingle();
        if (!cur) return json(res, 404, { error: 'ese enlace ya no existe' });
        if (!inReach(cur.project_id)) return json(res, 403, { error: 'Sin acceso a ese enlace.' });
        const { error } = await db.from('project_links').delete().eq('id', parts[2]);
        if (error) return json(res, 500, { error: error.message });
        return json(res, 200, { ok: true });
      }

      return json(res, 404, { error: 'no encontrado' });
    }

    // ── imágenes adjuntas (subir + servir; sin gate) ──
    if (parts[1] === 'upload' && req.method === 'POST') {
      const { name, data } = await readBody(req);
      if (typeof data !== 'string' || !data) return json(res, 400, { error: 'payload inválido' });
      const ext = ((path.extname(name || '') || '.png').toLowerCase().replace(/[^.a-z0-9]/g, '')) || '.png';
      const base = path.basename(name || 'imagen', path.extname(name || '')).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 40) || 'imagen';
      const fname = `${++uploadSeq}-${base}${ext}`;
      fs.writeFileSync(path.join(workspace.uploadsDir, fname), Buffer.from(data, 'base64'));
      return json(res, 200, { ok: true, name: fname, absPath: path.join(workspace.uploadsDir, fname) });
    }
    if (parts[1] === 'uploads' && req.method === 'GET' && parts[2]) {
      const fname = path.basename(decodeURIComponent(parts[2]));
      const fp = path.join(workspace.uploadsDir, fname);
      if (!fs.existsSync(fp)) return json(res, 404, { error: 'no encontrado' });
      const MIME = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml', '.pdf': 'application/pdf', '.txt': 'text/plain; charset=utf-8', '.md': 'text/plain; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.json': 'application/json' };
      res.writeHead(200, { 'Content-Type': MIME[path.extname(fname).toLowerCase()] || 'application/octet-stream' });
      return res.end(fs.readFileSync(fp));
    }

    // gate del Laboratorio: permiso «lab» en la base (el dueño lo tiene)
    const labOp = parts[1] === 'drafts' || parts[1] === 'groups'
      || (parts[1] === 'skills' && (req.method === 'DELETE' || parts[2] === 'publish'));
    if (labOp && !perms?.lab) return json(res, 403, { error: 'Sin acceso al Laboratorio.' });

    // proyectos para el selector de visibilidad del Laboratorio: solo los que
    // la persona ve (una skill de proyecto solo se publica donde uno tiene acceso)
    if (parts[1] === 'groups' && req.method === 'GET') {
      const { data, error } = await db.from('access_groups').select('token, name').order('name');
      if (error) return json(res, 500, { error: error.message });
      const mine = new Set(accessTokens(knowledgeBase));
      return json(res, 200, (data || []).filter((g) => mine.has(g.token)));
    }

    // ── skills publicadas (Supabase) — solo las que el rol puede gestionar ──
    if (parts[1] === 'skills' && req.method === 'GET' && !parts[2]) {
      const { data, error } = await db.from('skills').select('*').order('id');
      if (error) return json(res, 500, { error: error.message });
      // el dueño: todas. Los demás: solo las de SUS proyectos (no comunes, no de otros).
      const list = perms?.owner
        ? data
        : data.filter((s) => s.scope && accessTokens(knowledgeBase).includes(s.scope));
      // nombre del proyecto de cada skill: el dueño ve skills de proyectos de
      // los que no tiene token, y sin el nombre la UI solo podría pintar el
      // token (una credencial de acceso, no algo que enseñar en una tarjeta)
      const { data: grps } = await db.from('access_groups').select('token, name');
      const names = new Map((grps || []).map((g) => [g.token, g.name]));
      return json(res, 200, list.map((s) => ({ ...s, scopeName: s.scope ? names.get(s.scope) || null : null })));
    }
    if (parts[1] === 'skills' && req.method === 'POST' && parts[2] === 'refresh') {
      await syncSkills(knowledgeBase); // Supa → workspace/bases/<id>/skills (la paleta lo ve al momento)
      return json(res, 200, { ok: true, skills: skillList(knowledgeBase) });
    }
    if (parts[1] === 'skills' && req.method === 'POST' && parts[2] === 'publish') {
      const { id, files, scope } = await readBody(req);
      if (!validId(id) || !validFiles(files)) return json(res, 400, { error: 'payload inválido' });
      const newScope = scope || null; // '' / undefined → común
      // las COMUNES (scope vacío) solo las toca el owner; idem si la skill
      // que se sobrescribe ya era común.
      const { data: existing } = await db.from('skills').select('scope').eq('id', id).maybeSingle();
      const touchesCommon = !newScope || (existing && !existing.scope);
      if (touchesCommon && !perms?.owner) {
        return json(res, 403, { error: 'Las skills comunes solo las crea o edita quien tiene Administración. Elige un proyecto en «Visibilidad».' });
      }
      const skillMd = files.find((f) => f.path === 'SKILL.md');
      if (!skillMd) return json(res, 400, { error: 'falta SKILL.md' });
      const fm = parseFrontmatter(skillMd.content);
      const { error: e1 } = await db.from('skills').upsert({
        id,
        label: fm.commandLabel || fm.name || id,
        description: fm.commandDescription || fm.description || '',
        category: fm.category || '',
        version: fm.version || '1.0.0',
        enabled: fm.enabled !== 'false',
        scope: newScope,
        updated_at: new Date().toISOString(),
      });
      if (e1) return json(res, 500, { error: e1.message });
      const { error: e2 } = await db.from('skill_files').delete().eq('skill_id', id);
      if (e2) return json(res, 500, { error: e2.message });
      const { error: e3 } = await db.from('skill_files').insert(files.map((f) => ({ skill_id: id, path: safeRelPath(f.path), content: f.content })));
      if (e3) return json(res, 500, { error: e3.message });
      await syncSkills(knowledgeBase);
      return json(res, 200, { ok: true, id, files: files.length });
    }
    if (parts[1] === 'skills' && req.method === 'DELETE' && parts[2]) {
      const id = decodeURIComponent(parts[2]);
      if (!validId(id)) return json(res, 400, { error: 'id inválido' });
      const { data: existing } = await db.from('skills').select('scope').eq('id', id).maybeSingle();
      if (existing && !existing.scope && !perms?.owner) {
        return json(res, 403, { error: 'Las skills comunes solo las borra quien tiene Administración.' });
      }
      const { error } = await db.from('skills').delete().eq('id', id); // skill_files cae por cascade
      if (error) return json(res, 500, { error: error.message });
      fs.rmSync(path.join(workspace.skillsDirFor(knowledgeBase), id), { recursive: true, force: true });
      await syncSkills(knowledgeBase);
      return json(res, 200, { ok: true, deleted: id });
    }
    if (parts[1] === 'skills' && req.method === 'GET' && parts[2]) {
      const id = decodeURIComponent(parts[2]);
      const [meta, files] = await Promise.all([
        db.from('skills').select('*').eq('id', id).single(),
        db.from('skill_files').select('path, content').eq('skill_id', id).order('path'),
      ]);
      if (meta.error || files.error) return json(res, 404, { error: (meta.error || files.error).message });
      return json(res, 200, { ...meta.data, files: files.data });
    }

    // ── borradores (locales, no salen en la paleta) ──
    if (parts[1] === 'drafts' && req.method === 'GET' && !parts[2]) {
      const ids = fs.existsSync(workspace.draftsDir)
        ? fs.readdirSync(workspace.draftsDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
        : [];
      return json(res, 200, ids);
    }
    if (parts[1] === 'drafts' && parts[2]) {
      const id = decodeURIComponent(parts[2]);
      if (!validId(id)) return json(res, 400, { error: 'id inválido' });
      const dir = path.join(workspace.draftsDir, id);
      if (req.method === 'GET') {
        if (!fs.existsSync(dir)) return json(res, 404, { error: 'borrador no encontrado' });
        return json(res, 200, { id, files: walkDir(dir) });
      }
      if (req.method === 'PUT') {
        const { files } = await readBody(req);
        if (!validFiles(files)) return json(res, 400, { error: 'payload inválido' });
        fs.rmSync(dir, { recursive: true, force: true });
        for (const f of files) {
          const dest = path.join(dir, safeRelPath(f.path));
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(dest, f.content);
        }
        return json(res, 200, { ok: true });
      }
      if (req.method === 'DELETE') {
        fs.rmSync(dir, { recursive: true, force: true });
        return json(res, 200, { ok: true });
      }
    }
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
    const s = t ? LAN.sessions.get(t) : null;
    if (!s) { try { ws.close(4403, 'no autorizado'); } catch {} return; }
    if (s.locked) { try { ws.close(4423, 'bloqueado'); } catch {} return; } // candado echado
    ws._siaLan = true;   // marcado para poder revocarlo al apagar el acceso
    ws._siaToken = t;    // y para tirar sus sockets al echar el candado
    s.lastSeen = Date.now();
  } else if (lock.locked()) {
    // pantalla bloqueada: nada de sockets NUEVOS desde esta máquina (una ventana
    // recargada no puede engancharse a los chats hasta dar la clave); los que
    // ya estaban abiertos siguen, que es lo que mantiene los chats a la vista
    // al desbloquear
    try { ws.close(4423, 'bloqueado'); } catch {}
    return;
  }
  let sess = null; // sesión enganchada a ESTE socket
  maybeSyncSkills(); // refresh the catalog in the background (next chat sees it)

  accessibleProjects().then((projects) =>
    send(ws, { type: 'launchers', list: launchers.list(), skills: skillList(currentBase()), sessions: sessionList(), accessProjects: projects }));

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
    if (ws._siaToken) { // actividad real del móvil: pospone el candado por inactividad
      const s = LAN.sessions.get(ws._siaToken);
      if (s) s.lastSeen = Date.now();
    }
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
