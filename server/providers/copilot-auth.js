// La cuenta de Copilot con la que corre su CLI, manejada desde SIA
// (Configuración → Proveedores IA). Es la cuenta de quien usa la IA: no tiene
// nada que ver con la clave de GitHub de los repos (Conexiones → GitHub), que
// Copilot nunca debe ver como suya (launchers/repo-key.js). Por eso todo lo de
// aquí corre sin claves de GitHub en el entorno.
//   status()   → por el protocolo de su SDK (chats/copilot.js): auth.getStatus
//                (si hay sesión, con qué usuario y por qué vía) y
//                account.getQuota (lo gastado del plan)
//   login()    → `copilot login --device-code`: da un código y una dirección;
//                la persona lo mete en github.com/login/device y el CLI, que
//                se queda esperando, guarda la sesión. Sin terminal
//   progress() → cómo va: { running, ok, error, url, code }
//   cancel()   → dejarlo (mata el proceso del login; la sesión que hubiera sigue)
//   logout()   → por su servidor ACP (`copilot --acp`): el método `logout`
// El login lo guarda el propio CLI (en el llavero del sistema); SIA no ve ni
// guarda credenciales.
//
// deps: spec(args) → { cmd, args } (qué ejecutar: en Windows, a través de cmd.exe) ·
//   env() (entorno limpio, sin claves de GitHub) · spawn · onLogin() (un login ha terminado bien)
import { spawn as nodeSpawn } from 'node:child_process';
import { RUNTIME_ARGS, frame, createFrameReader } from '../chats/copilot.js';

export const LOGIN_MAX_MS = 15 * 60_000; // lo que vale un código de dispositivo
const VIA = { 'gh-cli': 'la sesión de gh', env: 'una variable de entorno', token: 'un token', 'api-key': 'una clave de API' };

// lo gastado: el cupo que tenga tope (el de peticiones premium en los planes de pago, el de chat en el gratuito)
export const usageOf = (quota, now = Date.now()) => {
  const snaps = quota?.quotaSnapshots || {};
  const q = [snaps.premium_interactions, snaps.chat].find((s) => s && !s.isUnlimitedEntitlement && s.entitlementRequests > 0);
  if (!q) return null;
  const reset = Date.parse(q.resetDate || '');
  return {
    usedPercent: Math.max(0, Math.min(100, Math.round(100 - (Number(q.remainingPercentage) || 0)))),
    used: Number(q.usedRequests) || 0, total: Number(q.entitlementRequests),
    resetsAt: Number.isFinite(reset) && reset > now ? reset : null,
  };
};
// de auth.getStatus y account.getQuota, lo que enseña la tarjeta
export const statusOf = (auth, quota, now) => (auth?.isAuthenticated
  ? { ok: true, loggedIn: true, login: auth.login || null, via: VIA[auth.authType] || null, usage: usageOf(quota, now) }
  : { ok: true, loggedIn: false, login: null, via: null, usage: null });

// «To authenticate, visit https://github.com/login/device and enter code ABCD-1234»
export const parseLogin = (text) => ({
  url: /https?:\/\/[^\s"')]+/.exec(String(text))?.[0] || null,
  code: /\b([A-Z0-9]{4}-[A-Z0-9]{4})\b/.exec(String(text))?.[1] || null,
});

const within = (promise, ms, what) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`${what}: Copilot no ha respondido a tiempo.`)), ms))]);
const missing = (e) => new Error(/ENOENT/.test(e.message) ? 'Copilot no está instalado en este ordenador.' : e.message);

export const createCopilotAuth = ({ spec, env, spawn = nodeSpawn, onLogin = () => {} }) => {
  const run = (args) => { const s = spec(args); return spawn(s.cmd, s.args, { env: env(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true }); };
  // un proceso con el que hablar: request(método, params) → Promise de su respuesta
  const open = (args, { framed }) => {
    const p = run(args);
    let seq = 0; let dead = null; let rest = '';
    const pending = new Map();
    const fail = (e) => { dead = e; for (const { reject } of pending.values()) reject(e); pending.clear(); };
    const got = (m) => { if (m.id != null && !m.method && pending.has(m.id)) { const { resolve, reject } = pending.get(m.id); pending.delete(m.id); if (m.error) reject(new Error(m.error.message || 'error de Copilot')); else resolve(m.result); } };
    const feed = framed ? createFrameReader() : null;
    p.stdin.on('error', () => {});
    p.on('error', (e) => fail(missing(e)));
    p.on('exit', () => fail(new Error('Copilot se ha cerrado.')));
    p.stdout.on('data', (d) => {
      if (feed) { for (const m of feed(d)) got(m); return; }
      rest += d; // ACP: un JSON por línea
      let i;
      while ((i = rest.indexOf('\n')) >= 0) { const line = rest.slice(0, i); rest = rest.slice(i + 1); try { got(JSON.parse(line)); } catch { /* no es JSON */ } }
    });
    const request = (method, params) => (dead ? Promise.reject(dead) : new Promise((resolve, reject) => {
      const id = ++seq; pending.set(id, { resolve, reject });
      try { p.stdin.write(framed ? frame({ id, method, params }) : `${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`); } catch (e) { reject(e); }
    }));
    return { request, close: () => { try { p.kill(); } catch {} } };
  };

  const status = async () => {
    let srv = null;
    try {
      srv = open(RUNTIME_ARGS, { framed: true });
      await within(srv.request('connect', {}).catch(() => srv.request('ping', {})), 20_000, 'La cuenta');
      const auth = await within(srv.request('auth.getStatus', {}), 20_000, 'La cuenta');
      const quota = auth?.isAuthenticated ? await srv.request('account.getQuota', {}).catch(() => null) : null;
      return statusOf(auth, quota);
    } catch (e) {
      return { ok: false, loggedIn: false, error: String(e.message || e).slice(0, 300) };
    } finally { srv?.close(); }
  };

  let login = null; // { proc, out, url, code, ok, error, running, timer }
  const progress = () => (login ? { running: login.running, ok: login.ok, error: login.error, url: login.url, code: login.code } : { running: false, ok: false, error: null, url: null, code: null });
  const startLogin = () => {
    if (login?.running) return login;
    let p;
    try { p = run(['login', '--device-code']); }
    catch (e) { login = { running: false, ok: false, error: missing(e).message, url: null, code: null }; return login; }
    const l = { proc: p, out: '', url: null, code: null, ok: false, error: null, running: true, timer: null };
    login = l;
    const read = (d) => { l.out += d; const found = parseLogin(l.out); l.url ||= found.url; l.code ||= found.code; };
    p.stdin.on('error', () => {});
    p.stdout.on('data', read);
    p.stderr.on('data', read);
    p.on('error', (e) => { l.running = false; l.error = missing(e).message; clearTimeout(l.timer); });
    p.on('exit', (code) => {
      clearTimeout(l.timer);
      if (!l.running) return; // cancelado
      l.running = false;
      l.ok = code === 0;
      if (l.ok) onLogin();
      if (!l.ok) l.error = (l.out.split('\n').map((x) => x.trim()).filter((x) => /error|fail|denied|expired|invalid/i.test(x)).pop() || `El login terminó con código ${code}.`).slice(0, 300);
    });
    l.timer = setTimeout(() => cancel('Se acabó el tiempo para meter el código.'), LOGIN_MAX_MS);
    return l;
  };
  // arranca el login y espera (un poco) a que el CLI diga el código
  const loginNow = async () => {
    const l = startLogin();
    for (let i = 0; i < 80 && l.running && !l.code; i++) await new Promise((r) => setTimeout(r, 100));
    return progress();
  };
  // dejarlo: se mata el proceso del login (la sesión que hubiera no se toca)
  const cancel = (why = 'Cancelado.') => {
    const l = login;
    if (l?.running) { l.running = false; l.error = why; clearTimeout(l.timer); try { l.proc.kill(); } catch {} }
    return progress();
  };

  const logout = async () => {
    let srv = null;
    try {
      srv = open(['--acp', '--stdio'], { framed: false });
      await within(srv.request('initialize', { protocolVersion: 1, clientCapabilities: {}, clientInfo: { name: 'sia', version: '1' } }), 20_000, 'Cerrar sesión');
      await within(srv.request('logout', {}), 20_000, 'Cerrar sesión');
      return { ok: true };
    } catch (e) {
      return { ok: false, error: String(e.message || e).slice(0, 300) };
    } finally { srv?.close(); }
  };

  return { status, login: loginNow, progress, cancel: () => cancel(), logout };
};
