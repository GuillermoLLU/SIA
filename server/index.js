// sia — local PTY bridge
// Each WebSocket = one session. The browser picks WHAT to launch (a "launcher":
// free shell, Claude, etc.) and the bridge spawns it on demand. The pty is piped
// to/from the browser; control messages are small JSON frames.

import { WebSocketServer, WebSocket as WSClient } from 'ws';
import * as pty from 'node-pty';
import { createClient } from '@supabase/supabase-js';
import { fetch as undiciFetch, Agent as UndiciAgent } from 'undici';
import { headerValue, siaHeaders } from './access/credentials.js';
import { permsFromRow } from './access/perms.js';
import { schemaOk } from './base/diagnose.js';
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
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { randomUUID, randomBytes, timingSafeEqual, scryptSync } from 'node:crypto';

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

// ¿`a` es una versión posterior a `b`? (semver simple major.minor.patch)
const isNewer = (a, b) => {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { if ((pa[i] || 0) > (pb[i] || 0)) return true; if ((pa[i] || 0) < (pb[i] || 0)) return false; }
  return false;
};

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

// The CLIs run inside a per-mode workspace whose CLAUDE.md/AGENTS.md set the
// knowledge behavior: "auto" consults the RAG on its own, "demand" only via
// the knowledge-search skill. Each mode dir gets a symlink to the shared
// skills/ so the palette's relative paths keep working.
// Empaquetado (Electron): el .app es de solo lectura → todo lo escribible vive
// en un workspace aparte (SIA_WORKSPACE, p. ej. userData). En dev, FUERA del
// repo (~/.sia/workspace): así el cwd de los CLIs no cae dentro del código de
// SIA y claude no husmea el repo (README, package.json…) creyéndolo "el
// proyecto". El conocimiento del equipo llega solo por el RAG, no por el cwd.
const WORKSPACE = process.env.SIA_WORKSPACE || path.join(os.homedir(), '.sia', 'workspace');
const TEMPLATE_MODES = path.join(ROOT, 'workspace', 'modes'); // plantillas empaquetadas

// Imágenes adjuntadas desde la UI: temporales por arranque (se limpia al iniciar).
const UPLOADS_DIR = path.join(WORKSPACE, 'uploads');
fs.rmSync(UPLOADS_DIR, { recursive: true, force: true });
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

/* La base de conocimiento tiene su rincón del workspace: workspace/bases/<id>/skills
   (sus skills sincronizadas) y workspace/bases/<id>/modes/{auto,demand} (el cwd
   de los chats, con CLAUDE.md/AGENTS.md y un symlink skills → esas skills).
   Sin base (sin sesión) se usa workspace/modes/<modo>. */
const BASES_DIR = path.join(WORKSPACE, 'bases');
// Nombre con el que cada CLI ve el servidor MCP de conocimiento: es el que sale
// en pantalla cada vez que un chat busca o guarda («knowledge - search_knowledge»).
// Instrucciones ya sembradas en un equipo o skills guardadas en una base
// pueden nombrarlo con el nombre antiguo del servidor («ITX-knowledge»): al
// escribirlas en disco se les pone el nombre vigente (mcpRename).
const MCP_NAME = 'knowledge';
const mcpRename = (text) => (typeof text === 'string' ? text.replace(/ITX-knowledge/g, MCP_NAME) : text);
const skillsDirFor = (base) => path.join(BASES_DIR, base.id, 'skills');
const prepareModeDir = (dir, mode, skillsDir) => {
  try {
    fs.mkdirSync(dir, { recursive: true });
    // instrucciones del modo: sembrar desde la plantilla si aún no existen
    for (const f of ['CLAUDE.md', 'AGENTS.md']) {
      const dest = path.join(dir, f);
      const src = path.join(TEMPLATE_MODES, mode, f);
      if (!fs.existsSync(dest) && fs.existsSync(src) && dest !== src) fs.copyFileSync(src, dest);
      // las sembradas por una versión anterior: solo se corrige el nombre del
      // servidor MCP, sin tocar lo demás (el fichero puede estar retocado a mano)
      if (fs.existsSync(dest) && dest !== src) {
        const text = fs.readFileSync(dest, 'utf8');
        if (mcpRename(text) !== text) fs.writeFileSync(dest, mcpRename(text));
      }
    }
    // ojo: existsSync sigue el symlink (un enlace roto da false) → usar lstat
    const link = path.join(dir, 'skills');
    let linkExists = false;
    const norm = (p) => path.resolve(String(p).replace(/^\\\\\?\\/, '')).replace(/[\\/]+$/, '').toLowerCase();
    try { linkExists = norm(fs.readlinkSync(link)) === norm(skillsDir); if (!linkExists) fs.unlinkSync(link); } catch { /* no existe o no es enlace */ }
    if (!linkExists) {
      fs.mkdirSync(skillsDir, { recursive: true });
      fs.symlinkSync(skillsDir, link, os.platform() === 'win32' ? 'junction' : 'dir');
    }
  } catch (err) {
    console.error(`[sia] no se pudo preparar ${dir}: ${err.message}`);
  }
};
const MODE_DIRS = {
  auto: path.join(WORKSPACE, 'modes', 'auto'),
  demand: path.join(WORKSPACE, 'modes', 'demand'),
};
for (const [mode, dir] of Object.entries(MODE_DIRS)) prepareModeDir(dir, mode, path.join(WORKSPACE, 'skills'));
const modeDirFor = (mode, base) => {
  if (!base) return MODE_DIRS[mode];
  const dir = path.join(BASES_DIR, base.id, 'modes', mode);
  prepareModeDir(dir, mode, skillsDirFor(base));
  return dir;
};

// Knowledge MCP: configs con rutas absolutas para que los CLIs arranquen
// nuestro servidor MCP local. ELECTRON_RUN_AS_NODE: bajo Electron,
// process.execPath es el binario de la app y con esa variable actúa como Node
// puro (bajo node normal es inocua). Van al WORKSPACE porque el directorio de
// la app empaquetada puede ser de solo lectura.
const MCP_SERVER = path.join(ROOT, 'mcp', 'index.js');
// rutas de la API que no tocan la base de conocimiento
const DB_FREE_ROUTES = new Set(['ping', 'version', 'lan', 'lock', 'config', 'upload', 'uploads']);
// La config MCP se escribe POR SESIÓN con los proyectos elegidos para ese chat
// (SIA_ALLOWED_PROJECTS: la selección del usuario dentro de su techo). La
// conexión viaja al MCP por entorno (nunca por la conversación): la clave
// publishable de la base y los tokens de los proyectos, que es lo que la base exige
// para dejar ver algo (ver supabase-schema.sql). Sin base configurada no se
// registra el MCP: el chat arranca igual, solo que sin conocimiento.
const sessionMcpEnv = (allowedProjects, base) => ({
  ELECTRON_RUN_AS_NODE: '1', SIA_ALLOWED_PROJECTS: allowedProjects.join(','),
  ...(base ? { SIA_SUPABASE_URL: base.url, SIA_SUPABASE_KEY: base.key, SIA_ACCESS_TOKENS: headerValue(base.tokens) } : {}),
});
// Codex (OpenAI) no lee un fichero de MCP por sesión: se le escribe un PERFIL
// (`$CODEX_HOME/sia-<sesión>.config.toml`, que se apila sobre su config.toml
// sin tocarlo) y se lanza con -p sia-<sesión>. Un perfil en vez de -c porque
// así los argumentos no llevan comillas ni llaves, que en Windows pasan por
// cmd.exe y se rompen. El fichero se borra al terminar la sesión.
const CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), '.codex');
const tomlStr = (v) => `"${String(v).replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
const codexProfile = (sessionId) => `sia-${sessionId}`;
const writeCodexProfile = (sessionId, allowedProjects, base) => {
  const env = sessionMcpEnv(allowedProjects, base);
  const toml = [
    '# perfil temporal de SIA para esta sesión (se borra al cerrarla)',
    `[mcp_servers.${MCP_NAME}]`,
    `command = ${tomlStr(process.execPath)}`,
    `args = [${tomlStr(MCP_SERVER)}]`,
    `[mcp_servers.${MCP_NAME}.env]`,
    ...Object.entries(env).map(([k, v]) => `${k} = ${tomlStr(v)}`),
    '',
  ].join('\n');
  fs.mkdirSync(CODEX_HOME, { recursive: true });
  fs.writeFileSync(path.join(CODEX_HOME, `${codexProfile(sessionId)}.config.toml`), toml, { mode: 0o600 });
};
const removeCodexProfile = (sessionId) => { try { fs.unlinkSync(path.join(CODEX_HOME, `${codexProfile(sessionId)}.config.toml`)); } catch {} };
// perfiles huérfanos de arranques anteriores (cierres bruscos)
try { for (const f of fs.readdirSync(CODEX_HOME)) if (/^sia-s\d+\.config\.toml$/.test(f)) fs.unlinkSync(path.join(CODEX_HOME, f)); } catch {}
const writeSessionMcpConfig = (sessionId, kind, allowedProjects, base) => {
  const conn = base ? { url: base.url, key: base.key } : null;
  const env = sessionMcpEnv(allowedProjects, base);
  const server = !conn ? {} : kind === 'copilot'
    ? { [MCP_NAME]: { type: 'local', command: process.execPath, args: [MCP_SERVER], tools: ['*'], env } }
    : { [MCP_NAME]: { command: process.execPath, args: [MCP_SERVER], env } };
  const file = path.join(WORKSPACE, `.mcp-${kind}-${sessionId}.json`);
  fs.writeFileSync(file, JSON.stringify({ mcpServers: server }, null, 2));
  return file;
};

// Available launchers. The client renders these; unavailable ones are disabled.
// `modes: true` → the client asks for the knowledge mode (auto/demand).
const LAUNCHERS = [
  { id: 'claude', label: 'Claude', cmd: 'claude', modes: true },
  { id: 'copilot', label: 'Copilot', cmd: 'copilot', modes: true },
  { id: 'codex', label: 'Codex', cmd: 'codex', modes: true }, // el CLI de OpenAI
];

// Resuelve un comando a su ruta ejecutable REAL. En Windows los CLIs instalados
// por npm (claude, copilot) son shims `.cmd`; `which('claude')` con el nombre
// pelado encontraba el wrapper sh sin extensión (existe también) y el guard
// pasaba, pero luego pty.spawn('claude') fallaba con "File not found" porque
// ConPTY/CreateProcess NO aplica PATHEXT. Aquí probamos las extensiones de
// PATHEXT y devolvemos la ruta completa (o null si no se encuentra).
const isWin = os.platform() === 'win32';
const PATHEXT = isWin ? (process.env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean) : [];
const resolveCmd = (cmd) => {
  // En Windows las extensiones de PATHEXT tienen PRIORIDAD sobre un archivo sin
  // extensión: npm deja un wrapper sh `claude` (sin ext, no ejecutable por
  // Windows) junto al `claude.cmd` que sí queremos. Fuera de Windows solo la
  // forma literal ('') tiene sentido.
  const exts = isWin ? [...PATHEXT, ''] : [''];
  const firstFile = (base) => {
    for (const ext of exts) {
      const full = base + ext;
      try { if (fs.statSync(full).isFile()) return full; } catch { /* siguiente */ }
    }
    return null;
  };
  if (cmd.includes('/') || cmd.includes('\\') || path.isAbsolute(cmd)) return firstFile(cmd);
  for (const d of (process.env.PATH || '').split(path.delimiter)) {
    if (!d) continue;
    const hit = firstFile(path.join(d, cmd));
    if (hit) return hit;
  }
  return null;
};
// ¿Es un comando lanzable? (ruta absoluta o localizable en el PATH)
const which = (cmd) => !!resolveCmd(cmd);

const launcherList = () => LAUNCHERS.map((l) => ({
  id: l.id, label: l.label, available: which(l.cmd), modes: !!l.modes,
}));

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
const SKILLS_DIR = path.join(WORKSPACE, 'skills'); // legado: sin base
const skillList = (base = null) => {
  const dir = base ? skillsDirFor(base) : SKILLS_DIR;
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

/* ── La base de conocimiento es DE LA INSTANCIA ─────────────────────
   Una sola, la misma para todo el mundo, y la fija la instancia
   (platform.set_knowledge_base): ahí viven el RAG, las skills, los proyectos
   y los enlaces. Nada de conexiones en la config ni valores en el código.

   QUIÉN VE QUÉ lo decide la base, no este bridge: todas sus tablas están
   cerradas con Row Level Security y las políticas leen dos cabeceras que
   SIA manda en cada petición — x-sia-tokens (los tokens de sus proyectos) y
   x-sia-power (clave de poder). Con la clave publishable a secas no se ve
   nada. Las comprobaciones que quedan aquí (techo de proyectos, permisos de
   cada vista) son para dar mensajes claros, no la barrera. La clave secret
   del proyecto nunca entra en SIA. */
const NO_DB_MSG = 'Sin base de conocimiento: la instancia aún no tiene la suya o no has iniciado sesión.';

/* ── La base de conocimiento ──────────────────────────────────────
   Una por instancia y la misma para todo el mundo: la asigna la plataforma a
   quien inicia sesión en este bridge (el último que entra), con sus tokens de
   grupo y su clave de poder ({ id, name, url, key, tokens, powerKey }). Solo
   en memoria, nunca en la config. El MCP recibe la conexión y los proyectos. */
let assigned = { base: null };
// Lo que puede el móvil emparejado (entra sin sesión, con su llave).
const PHONE_USER = { views: ['links'] };
const currentBase = () => assigned.base;
// Un cliente por base (se reutiliza mientras no cambien conexión, tokens ni
// clave de poder): lleva en cada petición las cabeceras con las que la base
// decide qué dejar ver. `powerKey` fuerza otra clave de poder (dev/pruebas).
const clientCache = new Map();
const clientFor = (base, powerKey = base.powerKey) => {
  const headers = siaHeaders(base.tokens, powerKey);
  const k = `${base.url}|${base.key}|${JSON.stringify(headers)}`;
  if (!clientCache.has(k)) clientCache.set(k, createClient(base.url, base.key, { global: { fetch: supaFetch, headers } }));
  return clientCache.get(k);
};
// Sin conexión: un cliente "hueco" que acepta cualquier cadena de llamadas
// (from().select().eq()…, rpc()…) y resuelve siempre con el mismo error. Los
// puntos que usan supabase ya tratan `error`, así que no necesitan comprobar
// nada; la API además corta antes (guard NO_DB) con un 503 claro para la UI.
const noDbClient = (() => {
  const result = { data: null, error: { message: NO_DB_MSG, code: 'NO_DB' }, count: null };
  const chain = new Proxy(() => {}, {
    get: (_, p) => (p === 'then' ? (res, rej) => Promise.resolve(result).then(res, rej) : () => chain),
    apply: () => chain,
  });
  return chain;
})();

const safeRelPath = (p) => {
  const n = path.normalize(p);
  return n && !n.startsWith('..') && !path.isAbsolute(n) ? n : null;
};

// Supabase (PostgREST) devuelve como mucho 1000 filas por consulta, sin avisar:
// una lectura que pueda pasar de ahí se pide por tandas hasta agotarla. `build`
// crea la consulta cada vez y debe llevar un orden estable (sin él, las tandas
// podrían solaparse o saltarse filas). Devuelve {data, error} como supabase-js.
const PAGE_ROWS = 1000;
const fetchAll = async (build) => {
  const out = [];
  for (let from = 0; ; from += PAGE_ROWS) {
    const { data, error } = await build().range(from, from + PAGE_ROWS - 1);
    if (error) return { data: null, error };
    out.push(...(data || []));
    if (!data || data.length < PAGE_ROWS) return { data: out, error: null };
  }
};

const projects = createProjects({ newId: randomUUID, fetchAll });

const syncSkills = async (base) => {
  if (!base) return;
  const dir = skillsDirFor(base);
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
  try { for (const d of fs.readdirSync(BASES_DIR)) if (d !== b?.id) fs.rmSync(path.join(BASES_DIR, d), { recursive: true, force: true }); } catch {}
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
  statusCache.clear();
  lastSyncByBase.clear();
  console.log(b ? `[sia] base de conocimiento en uso: ${b.name}` : '[sia] sin base de conocimiento en uso');
  await syncAllSkills();
};

/* ── Per-user config (~/.sia/config.json) ─────────────────────────
   Personal credentials (e.g. Jira token) live OUTSIDE the project, per
   machine. They are injected as env vars into new PTY sessions so the
   CLIs can use them without the secret ever entering the conversation. */
const USER_CONFIG = path.join(os.homedir(), '.sia', 'config.json');
const readUserConfig = () => {
  try { return JSON.parse(fs.readFileSync(USER_CONFIG, 'utf8')); } catch { return {}; }
};
const writeUserConfig = (cfg) => {
  fs.mkdirSync(path.dirname(USER_CONFIG), { recursive: true });
  fs.writeFileSync(USER_CONFIG, JSON.stringify(cfg, null, 2), { mode: 0o600 });
};

/* ── Tema compartido ─────────────────────────────────────────────────
   El tema se elige en el ordenador y un móvil emparejado es otro navegador:
   sin esto arrancaba siempre con el tema por defecto. La web del escritorio
   deja aquí su tema (id + colores de la interfaz) y el bridge se lo da a los
   móviles: en el ping —también antes de emparejar, para que la pantalla del
   PIN ya salga con él— y por el socket cuando cambia. Solo se aceptan
   colores hexadecimales: acaban como variables CSS en otro dispositivo. */
const cleanTheme = (t) => {
  if (!t || typeof t.id !== 'string' || !/^[a-z0-9-]{1,40}$/i.test(t.id) || typeof t.ui !== 'object' || !t.ui) return null;
  const ui = {};
  for (const k of ['bg', 'surface', 'border', 'text', 'textLow', 'accent', 'scrollbar']) {
    if (typeof t.ui[k] !== 'string' || !/^#[0-9a-f]{3,8}$/i.test(t.ui[k])) return null;
    ui[k] = t.ui[k];
  }
  return { id: t.id, ui };
};
let UI_THEME = cleanTheme(readUserConfig().theme);

/* ── Bloqueo de pantalla (escritorio) ────────────────────────────────
   Un candado para dejar SIA abierto y trabajando sin que nadie curiosee: la
   ventana queda tapada hasta dar el PIN, y los chats siguen corriendo porque
   viven aquí, en el bridge, no en la ventana.
   - El PIN se guarda derivado (scrypt + sal) en la config personal, nunca en
     claro, y se comprueba aquí: la web no lo tiene.
   - El estado «bloqueado» también se guarda, para que recargar la ventana o
     cerrar y reabrir la app no lo salte.
   - Mientras está echado, la API local solo responde a ping y a lo del propio
     candado (423 a lo demás) y no se aceptan sockets nuevos desde esta
     máquina; los que ya estaban abiertos siguen, que son los chats.
   - Cinco PIN fallados seguidos imponen 30 s de espera.
   No es una barrera frente a quien tenga tu sesión del sistema (puede leer
   ~/.sia o matar la app): es una cortina. Si se olvida el PIN, se borra
   el bloque "lock" de ~/.sia/config.json. */
// El PIN son siempre 4 dígitos: la puerta pinta cuatro casillas y comprueba
// sola al llenar la última.
const LOCK_PIN_LEN = 4;
const LOCK_PIN = /^\d{4}$/;
const lockCfg = () => readUserConfig().lock || {};
const lockDerive = (key, salt) => scryptSync(String(key), Buffer.from(salt, 'hex'), 32);
// Hay PIN si están la derivada, la sal y el largo es el de la puerta. Cualquier
// otra cosa (una clave de texto o un PIN de otro largo, de versiones de
// desarrollo anteriores) se trata como si no hubiera, y el candado pide elegir uno.
const lockHasKey = () => { const l = lockCfg(); return !!(l.hash && l.salt && l.len === LOCK_PIN_LEN); };
const lockMatches = (key) => {
  const l = lockCfg();
  if (!l.hash || !l.salt || typeof key !== 'string' || !key) return false;
  const a = lockDerive(key, l.salt), b = Buffer.from(l.hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
};
const lockSave = (patch) => writeUserConfig({ ...readUserConfig(), lock: { ...lockCfg(), ...patch } });
let SCREEN_LOCKED = lockHasKey() && lockCfg().locked === true; // en memoria: se consulta en cada petición
const lockSet = (on) => { SCREEN_LOCKED = on; lockSave({ locked: on }); };
const lockFails = { n: 0, until: 0 };
// Comprueba una clave con el freno anti fuerza bruta. → { ok } | { wait: segundos }
const lockTry = (key) => {
  const now = Date.now();
  if (now < lockFails.until) return { ok: false, wait: Math.ceil((lockFails.until - now) / 1000) };
  if (lockMatches(key)) { lockFails.n = 0; return { ok: true }; }
  if (++lockFails.n >= 5) { lockFails.n = 0; lockFails.until = now + 30_000; return { ok: false, wait: 30 }; }
  return { ok: false };
};

/* ── Base de la instancia (server/platform/), inicio de sesión (server/auth/)
   y usuarios (server/users/). Se entra con la cuenta de Supabase Auth de la
   instancia; el fetch de Node verifica TLS (a diferencia de supaFetch). ── */
const platform = createPlatformClient({ ...(loadPlatformConfig(ROOT) || { url: '', key: '' }), fetch });
const auth = createAuth({ platform, readConfig: readUserConfig, writeConfig: writeUserConfig });
const users = createUserAdmin({ platform });
// Los grupos de acceso de la base (access_groups: uno por proyecto) con la
// clave del dueño; fetch de Node, con TLS verificado (viaja una clave de
// poder). Antes, la base dice qué abre esa clave (sia_status): tiene que
// abrir la Administración. Si no, la base no da error, solo una lista vacía.
const readGroups = async ({ url, key, powerKey }) => {
  const db = createClient(url, key, { global: { fetch, headers: siaHeaders([], powerKey) }, auth: { persistSession: false } });
  const { data: status, error: e1 } = await db.rpc('sia_status');
  if (e1 || !permsFromRow(status?.me)?.admin) throw new Error('esa clave de poder no abre la Administración de la base');
  const { data, error } = await db.from('access_groups').select('token, name').order('name');
  if (error) throw new Error(error.message);
  return data || [];
};
// Claves de poder de las personas en una base (power_keys), con la clave de
// la instancia en ella: solo el dueño las gestiona, así que tiene que ser la suya.
const baseKeys = (() => {
  const keys = ({ url, key, powerKey }) => createClient(url, key, { global: { fetch, headers: siaHeaders([], powerKey) }, auth: { persistSession: false } }).from('power_keys');
  const ok = (error) => { if (error) throw new Error(`La base no deja crear claves de poder (${error.message}): en Configuración tiene que tener la clave del dueño.`); };
  return {
    async create(c, { name, perms }) { const key = randomUUID(); const { error } = await keys(c).insert({ key, name, owner: false, perms }); ok(error); return key; },
    async update(c, key, { name, perms }) { const { data, error } = await keys(c).update({ name, perms }).eq('key', key).select('key'); ok(error); return data.length > 0; },
    async remove(c, key) { const { error } = await keys(c).delete().eq('key', key); ok(error); },
  };
})();
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
// Del inicio de sesión local anterior: fuera los usuarios y sus sesiones.
{
  const cfg = readUserConfig();
  if (cfg.users || (cfg.sessions || []).some((s) => !s?.refreshToken)) {
    delete cfg.users;
    cfg.sessions = liveSessions(cfg.sessions);
    writeUserConfig(cfg);
    console.log('[sia] usuarios locales retirados: se entra con la cuenta de la instancia');
  }
}

/* Claves de GitHub: se guardan varias (trabajo, personal…) y solo UNA está
   activa; es la que viaja a los chats que se abran a partir de ese momento.
   `GH_TOKEN` es una variable de entorno, así que un chat solo puede llevar
   una — cambiar la activa no toca los chats ya abiertos. */
// Formato antiguo ({ github: { token } }) → una entrada «Principal», activa.
{
  const cfg = readUserConfig();
  const g = cfg.github;
  if (g?.token && !Array.isArray(g.keys)) {
    cfg.github = { keys: [{ id: 'gh1', name: 'Principal', token: g.token }], activeId: 'gh1' };
    writeUserConfig(cfg);
    console.log('[sia] clave de GitHub migrada a la lista de claves («Principal»)');
  }
}
const activeGithubToken = () => {
  const g = readUserConfig().github || {};
  const keys = Array.isArray(g.keys) ? g.keys : [];
  return keys.find((k) => k.id === g.activeId)?.token || '';
};
// Saneado de lo que llega de la UI: entradas completas y acotadas, y la activa
// tiene que existir de verdad (si no, ninguna).
const cleanGithub = (g) => {
  const keys = (Array.isArray(g?.keys) ? g.keys : [])
    .filter((k) => k && typeof k.token === 'string' && k.token.trim())
    .slice(0, 20)
    .map((k, i) => ({
      id: String(k.id || `gh${i + 1}`).slice(0, 40),
      name: String(k.name || '').trim().slice(0, 24) || `Clave ${i + 1}`,
      token: k.token.trim(),
    }));
  return { keys, activeId: keys.some((k) => k.id === g?.activeId) ? g.activeId : null };
};

const userEnv = () => {
  const env = {};
  const { jira } = readUserConfig();
  if (jira?.baseUrl) env.JIRA_BASE_URL = jira.baseUrl;
  if (jira?.token) env.JIRA_API_TOKEN = jira.token;
  const gh = activeGithubToken();
  if (gh) { env.GH_TOKEN = gh; env.GITHUB_TOKEN = gh; }
  return env;
};

// Limpia del entorno heredado las marcas de "estoy dentro de Claude Code", para
// que el CLI lanzado por SIA no se niegue por sesión anidada, y los tokens de
// GitHub: quién manda ahí es la clave activa (userEnv), no lo que llevara puesto
// el proceso que arrancó el bridge — si no hay ninguna marcada, el chat va sin.
const cleanEnv = (env) => {
  const e = { ...env };
  for (const k of ['CLAUDECODE', 'CLAUDE_CODE_ENTRYPOINT', 'CLAUDE_CODE_SSE_PORT', 'GH_TOKEN', 'GITHUB_TOKEN']) delete e[k];
  return e;
};

// Acceso al conocimiento: los tokens de la persona → proyectos
// permitidos (unión de lo que concede cada token). Default-deny: sin tokens
// válidos, no se ve nada. La base aplica la misma regla por su cuenta (los
// tokens van en la cabecera): esta lectura solo devuelve lo que ella deja ver.
const accessTokens = (base = currentBase()) => (base ? base.tokens : []);
const accessibleProjects = async (base = currentBase()) => {
  const tokens = accessTokens(base);
  if (!base || !base.key || !tokens.length) return [];
  // base sin el esquema blindado: no se usa hasta que su dueño ejecute el SQL
  if (await needsSchema(base)) return [];
  const { data, error } = await clientFor(base)
    .from('access_grants')
    .select('project_id, projects(id, name)')
    .in('token', tokens);
  if (error || !data) return [];
  const byId = new Map();
  for (const g of data) if (g.projects) byId.set(g.projects.id, g.projects.name);
  return [...byId].map(([id, name]) => ({ id, name }));
};

/* ── Lab HTTP API (skills editor) ───────────────────────────────────
   Claves de poder: viven EN LA BASE (tabla power_keys) y es la base quien las
   comprueba (cabecera x-sia-power; sia_status() dice qué abre). La de cada
   persona se la da la instancia según sus vistas (server/knowledge/
   person-keys.js; con Administración, la del dueño). permisos:
   server/access/perms.js */
const statusCache = new Map(); // `${baseId}|${powerKey}` → { at, status }
// sia_status() de una base con una clave de poder dada: { version, owner,
// me: {name, owner, perms} | null, projects } o null si la base no responde
// o no tiene el esquema blindado (needsSchema). Cacheado 15 s.
const baseStatus = async (base, powerKey = base?.powerKey) => {
  if (!base) return null;
  const k = `${base.id}|${powerKey || ''}`;
  const cached = statusCache.get(k);
  if (cached && Date.now() - cached.at < 15_000) return cached.status;
  const { data, error } = await clientFor(base, powerKey).rpc('sia_status');
  const status = !error && data && typeof data === 'object' ? data : null;
  statusCache.set(k, { at: Date.now(), status });
  return status;
};
// ¿la base aún no tiene el esquema blindado? (sin sia_status o versión vieja)
const needsSchema = async (base) => !schemaOk(await baseStatus(base));
// permisos en UNA base: { name, owner, lab, admin, links } o null, según la
// clave de poder que la instancia dio a quien ha iniciado sesión.
const permsFor = async (base) => (base?.powerKey ? permsFromRow((await baseStatus(base))?.me) : null);
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

const DRAFTS_DIR = path.join(WORKSPACE, 'lab-drafts');

const walkDir = (dir, base = '') => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? walkDir(path.join(dir, e.name), path.join(base, e.name))
    : [{ path: path.join(base, e.name), content: fs.readFileSync(path.join(dir, e.name), 'utf8') }]);

const json = (res, code, obj) => {
  res.writeHead(code, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(obj));
};
const readBody = (req) => new Promise((resolve, reject) => {
  let b = '';
  req.on('data', (c) => { b += c; if (b.length > 40_000_000) req.destroy(); });
  req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
});
const authRoute = authRoutes(auth, { json, readBody, onSession: loadAssigned, onLogout: clearAssigned, platform });
const syncKeys = (jwt, userId, opts) => knowledge.syncPeople(jwt, userId ? [userId] : null, opts);
const usersRoute = usersRoutes(users, auth, { json, readBody, syncKeys, assignKnowledge: (jwt, userId, ids) => knowledge.setProjects(jwt, userId, ids) });
const knowledgeRoute = knowledgeRoutes(knowledge, auth, { json, readBody, syncKeys, onChange: loadAssigned });
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
const CF_DIR = path.join(WORKSPACE, 'bin');
const CF_LOCAL = path.join(CF_DIR, isWin ? 'cloudflared.exe' : 'cloudflared');
const cloudflaredPath = () => resolveCmd('cloudflared') || (fs.existsSync(CF_LOCAL) ? CF_LOCAL : null);
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
      return json(res, 200, { sia: true, version: APP_VERSION, dev: !process.versions.electron, ws: PORT, api: API_PORT, theme: UI_THEME, ...(s ? { mode: s.mode, pin: lockHasKey() } : {}) });
    }

    if (parts[1] === 'auth') return authRoute(req, res, parts[2]);

    /* ── Bloqueo de pantalla (solo desde esta máquina) ── */
    if (parts[1] === 'lock') {
      if (!isLoopback(req)) return json(res, 403, { error: 'no disponible en remoto' });
      if (!parts[2] && req.method === 'GET') return json(res, 200, { hasKey: lockHasKey(), locked: SCREEN_LOCKED, len: LOCK_PIN_LEN });
      // poner o cambiar el PIN; si ya hay uno, hace falta el actual
      if (parts[2] === 'key' && req.method === 'PUT') {
        if (SCREEN_LOCKED) return json(res, 423, { error: 'pantalla bloqueada', locked: true });
        const { key, current } = await readBody(req);
        if (lockHasKey()) {
          const t = lockTry(current);
          if (t.wait) return json(res, 429, { error: `Demasiados intentos. Espera ${t.wait} s.`, wait: t.wait });
          if (!t.ok) return json(res, 403, { error: 'El PIN actual no es correcto.' });
        }
        if (typeof key !== 'string' || !LOCK_PIN.test(key)) return json(res, 400, { error: 'El PIN son 4 dígitos.' });
        const salt = randomBytes(16).toString('hex');
        lockSave({ salt, hash: lockDerive(key, salt).toString('hex'), len: key.length, locked: false });
        return json(res, 200, { ok: true, hasKey: true, len: key.length });
      }
      if (parts[2] === 'on' && req.method === 'POST') {
        if (!lockHasKey()) return json(res, 409, { error: 'Aún no hay PIN de bloqueo.', hasKey: false });
        lockSet(true);
        return json(res, 200, { locked: true });
      }
      if (parts[2] === 'off' && req.method === 'POST') {
        if (!SCREEN_LOCKED) return json(res, 200, { locked: false });
        const { key } = await readBody(req);
        const t = lockTry(key);
        if (t.wait) return json(res, 429, { error: `Demasiados intentos. Espera ${t.wait} s.`, wait: t.wait });
        if (!t.ok) return json(res, 403, { error: 'PIN incorrecto.' });
        lockSet(false);
        return json(res, 200, { locked: false });
      }
      return json(res, 404, { error: 'no encontrado' });
    }
    // con el candado echado, esta máquina no ve nada más (el móvil emparejado
    // va por su propio candado, arriba, en el cortafuegos)
    if (SCREEN_LOCKED && isLoopback(req)) return json(res, 423, { error: 'pantalla bloqueada', locked: true });

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
    // Cada vista (Laboratorio, Administración, Personas, Enlaces) solo para quien la tiene, aunque una clave de poder lo abriera:
    // segunda capa, además de la de la base (server/auth/views.js). El móvil
    // emparejado no inicia sesión: ve los Enlaces y nada de gestión.
    if (!allowed(who?.user ?? PHONE_USER, parts, req.method)) return json(res, 403, { error: 'No tienes acceso a esto.' });
    if (parts[1] === 'users') return usersRoute(req, res, parts.slice(2));
    if (parts[1] === 'knowledge') return knowledgeRoute(req, res, parts.slice(2));

    // Sin base de conocimiento solo funciona lo que no la necesita (terminal,
    // móvil, config personal, adjuntos). Lo demás: 503 con aviso claro.
    if (!knowledgeBase && !DB_FREE_ROUTES.has(parts[1])) return json(res, 503, { error: NO_DB_MSG, noDb: true });
    // versión instalada vs. última publicada (para avisar de actualizaciones)
    if (parts[1] === 'version' && req.method === 'GET') {
      let latest = null;
      try {
        const { data } = await db.from('app_version').select('version, url, notes').eq('id', 1).single();
        if (data) latest = data;
      } catch { /* tabla ausente / sin red: sin aviso */ }
      const newer = latest && isNewer(latest.version, APP_VERSION);
      return json(res, 200, { current: APP_VERSION, latest: latest?.version || null, url: latest?.url || null, notes: latest?.notes || '', updateAvailable: !!newer });
    }

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
        if (s && lockHasKey()) lockSession(t, s);
        return json(res, 200, { ok: true, locked: !!s?.locked });
      }
      // elegir el PIN de bloqueo desde el móvil emparejado: SOLO si aún no hay
      // ninguno (cambiarlo exige el actual y se hace en el ordenador)
      if (parts[2] === 'pin' && req.method === 'PUT') {
        const t = req.headers['x-sia-lan'] || url.searchParams.get('t');
        if (!t || !LAN.sessions.get(t)) return json(res, 403, { error: 'acceso no autorizado' });
        if (lockHasKey()) return json(res, 409, { error: 'Ya hay un PIN de bloqueo: se cambia en el ordenador.' });
        const { key } = await readBody(req);
        if (typeof key !== 'string' || !LOCK_PIN.test(key)) return json(res, 400, { error: 'El PIN son 4 dígitos.' });
        const salt = randomBytes(16).toString('hex');
        lockSave({ salt, hash: lockDerive(key, salt).toString('hex'), len: key.length });
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
        const good = lockMatches(String(key || ''));
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
          if (!lockHasKey()) return json(res, 409, { error: 'Antes de abrir el acceso público elige tu PIN de bloqueo.', needsPin: true });
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

    // ── config personal (sin gate: es de cada usuario, no de admin) ──
    // la clave del bloqueo de pantalla (derivada) no sale ni entra por aquí: va por /api/lock
    // La config personal por la API: solo lo que la web lee y escribe (Jira,
    // claves de GitHub y tema). Sesiones, bases, candado… no salen ni entran
    // por aquí: cada cosa tiene su ruta.
    if (parts[1] === 'config' && req.method === 'GET') {
      const { jira, github } = readUserConfig();
      return json(res, 200, { jira, github, version: APP_VERSION });
    }
    if (parts[1] === 'config' && req.method === 'PUT') {
      const body = await readBody(req);
      const patch = {};
      if (body.jira !== undefined) patch.jira = { baseUrl: String(body.jira?.baseUrl || '').trim(), token: String(body.jira?.token || '').trim() };
      if (body.github !== undefined) patch.github = cleanGithub(body.github);
      // el tema del escritorio: se guarda y se avisa a los móviles conectados
      const theme = body.theme !== undefined ? cleanTheme(body.theme) : null;
      if (theme) {
        patch.theme = theme;
        if (JSON.stringify(theme) !== JSON.stringify(UI_THEME)) { UI_THEME = theme; broadcastTheme(); }
      }
      writeUserConfig({ ...readUserConfig(), ...patch });
      return json(res, 200, { ok: true });
    }
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
      fs.writeFileSync(path.join(UPLOADS_DIR, fname), Buffer.from(data, 'base64'));
      return json(res, 200, { ok: true, name: fname, absPath: path.join(UPLOADS_DIR, fname) });
    }
    if (parts[1] === 'uploads' && req.method === 'GET' && parts[2]) {
      const fname = path.basename(decodeURIComponent(parts[2]));
      const fp = path.join(UPLOADS_DIR, fname);
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
      fs.rmSync(path.join(skillsDirFor(knowledgeBase), id), { recursive: true, force: true });
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
      const ids = fs.existsSync(DRAFTS_DIR)
        ? fs.readdirSync(DRAFTS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
        : [];
      return json(res, 200, ids);
    }
    if (parts[1] === 'drafts' && parts[2]) {
      const id = decodeURIComponent(parts[2]);
      if (!validId(id)) return json(res, 400, { error: 'id inválido' });
      const dir = path.join(DRAFTS_DIR, id);
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
  } else if (SCREEN_LOCKED) {
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
    send(ws, { type: 'launchers', list: launcherList(), skills: skillList(currentBase()), sessions: sessionList(), accessProjects: projects }));

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
  const start = async (launcherId, knowledge, projects, cols, rows) => {
    if (sess || starting) return;
    starting = true;
    try {
      const def = LAUNCHERS.find((l) => l.id === launcherId) || LAUNCHERS[0];
      if (!which(def.cmd)) {
        send(ws, { type: 'error', message: `"${def.cmd}" no está instalado.` });
        return;
      }
      const mode = knowledge === 'demand' ? 'demand' : 'auto';
      const sessionId = `s${++sessionSeq}`;

      // acceso: techo del token ∩ selección del chat
      let args = def.args || [];
      let allowedProjects = [];
      let base = null;
      if (def.modes) {
        base = currentBase();
        const ceiling = (await accessibleProjects(base)).map((p) => p.id);
        const picked = Array.isArray(projects) && projects.length
          ? ceiling.filter((id) => projects.includes(id))
          : ceiling;
        allowedProjects = picked;
        if (def.id === 'codex') {
          // sin sandbox ni confirmaciones, como bypassPermissions en Claude; el MCP por perfil
          if (base) { writeCodexProfile(sessionId, picked, base); args = ['--dangerously-bypass-approvals-and-sandbox', '-p', codexProfile(sessionId)]; }
          else args = ['--dangerously-bypass-approvals-and-sandbox'];
        } else {
        const cfg = writeSessionMcpConfig(sessionId, def.id, picked, base);
        args = def.id === 'copilot'
          ? ['--allow-all', '--additional-mcp-config', `@${cfg}`]
          // bypassPermissions = bypass sin el prompt de "¿seguro?"; setting-sources ''
          // ignora el settings.json global del usuario (hooks de otra versión que
          // rompen el 2.1.47) sin tocar el login (vive en el Keychain de macOS).
          : ['--permission-mode', 'bypassPermissions', '--setting-sources', '', '--mcp-config', cfg];
        }
      }

      // Resolvemos la ruta real del ejecutable. En Windows un shim .cmd/.bat no
      // lo ejecuta ConPTY por sí solo (CreateProcess no corre batch), así que lo
      // lanzamos a través de cmd.exe /c — igual que hace la terminal de VS Code.
      const exe = resolveCmd(def.cmd) || def.cmd;
      let spawnCmd = exe;
      let spawnArgs = args;
      if (isWin && /\.(cmd|bat)$/i.test(exe)) {
        spawnCmd = process.env.COMSPEC || 'cmd.exe';
        spawnArgs = ['/c', exe, ...args];
      }

      let term;
      try {
        term = pty.spawn(spawnCmd, spawnArgs, {
          name: 'xterm-color',
          cols: cols > 0 ? cols : 80,
          rows: rows > 0 ? rows : 24,
          cwd: def.modes ? modeDirFor(mode, base) : process.env.HOME,
          // SHELL_SESSIONS_DISABLE removes macOS's "Restored session…" banner.
          // cleanEnv poda el entorno heredado (CLAUDECODE/*, tokens de GitHub) y
          // userEnv() pone encima las credenciales personales (Jira, la clave de
          // GitHub activa), leídas frescas en cada sesión — ese orden importa.
          env: { ...cleanEnv({ ...process.env, SHELL_SESSIONS_DISABLE: '1' }), ...userEnv() },
        });
      } catch (err) {
        send(ws, { type: 'error', message: `No se pudo lanzar: ${err.message}` });
        return;
      }

      const s = {
        id: sessionId,
        term,
        buffer: '',
        meta: { launcher: def.id, knowledge: def.modes ? mode : null, label: def.label, color: null },
        assets: [], // adjuntos compartidos en esta sesión (persisten con ella)
        ws: null,
      };
      SESSIONS.set(s.id, s);
      bind(s);
      send(ws, { type: 'started', sessionId: s.id });
      console.log(`[sia] session open (${def.id}${def.modes ? `, conocimiento ${mode}, base ${base?.name || '-'}, proyectos [${allowedProjects.join(',')}]` : ''}, id ${s.id}, pid ${term.pid})`);

      term.onData((data) => {
        s.buffer += data;
        if (s.buffer.length > BUFFER_CAP) s.buffer = s.buffer.slice(-Math.floor(BUFFER_CAP * 0.75));
        send(s.ws, { type: 'data', data });
      });
      term.onExit(() => {
        console.log(`[sia] session ended (id ${s.id})`);
        SESSIONS.delete(s.id);
        for (const k of ['claude', 'copilot']) { try { fs.rmSync(path.join(WORKSPACE, `.mcp-${k}-${s.id}.json`)); } catch {} }
        removeCodexProfile(s.id);
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
      start(msg.launcher, msg.knowledge, msg.projects, msg.cols, msg.rows);
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
