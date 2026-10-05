// Inicio de sesión contra la base de la instancia (Supabase Auth). Llegan
// inyectados el cliente de la plataforma (server/platform) y la config
// personal (readConfig/writeConfig), para no atarse ni a la red ni al disco.
//
// - login: email + contraseña en Supabase Auth y, con ese JWT, quién es y su
//   rol (platform_whoami; un usuario desactivado no entra). La web recibe un
//   token local opaco (sessions.js).
// - context: el usuario y su JWT para actuar como él. El JWT vive solo en
//   memoria y se renueva con el refresh token antes de caducar (Supabase lo
//   rota: se guarda siempre el nuevo, y dos peticiones a la vez renuevan una
//   sola vez). El perfil se pide siempre al abrir la app y, después, como
//   mucho cada minuto: si lo desactivan, le cambian el rol o lo borran, se
//   nota enseguida.
// - Cinco intentos fallidos seguidos imponen 30 s de espera.

import { newSession, liveSessions, sessionFor } from './sessions.js';

const MAX_FAILS = 5;
const WAIT_MS = 30_000;
const RENEW_BEFORE_MS = 60_000;   // renovar el JWT si le queda menos de esto
const RECHECK_MS = 60_000;        // volver a pedir el perfil pasado esto
const TRANSIENT = new Set([502, 503]);

export const createAuth = ({ platform, readConfig, writeConfig, now = Date.now }) => {
  const memSessions = [];
  const live = new Map();      // hash → { accessToken, expiresAt, user, checkedAt }
  const inflight = new Map();  // hash → promesa de context en curso
  const fails = { n: 0, until: 0 };

  const sessions = () => [...memSessions, ...liveSessions(readConfig().sessions, now())];
  const storeRefresh = (session, refreshToken) => {
    session.refreshToken = refreshToken;
    if (!session.remember) return;
    const cfg = readConfig();
    writeConfig({ ...cfg, sessions: liveSessions(cfg.sessions, now()).map((s) => (s.hash === session.hash ? { ...s, refreshToken } : s)) });
  };
  const drop = (hash) => {
    live.delete(hash);
    const i = memSessions.findIndex((s) => s.hash === hash);
    if (i >= 0) memSessions.splice(i, 1);
    const cfg = readConfig();
    if (cfg.sessions?.some((s) => s.hash === hash)) writeConfig({ ...cfg, sessions: liveSessions(cfg.sessions, now()).filter((s) => s.hash !== hash) });
  };

  // → { token, user } | { wait: segundos } | { error }
  const login = async (email, password, remember) => {
    const t = now();
    if (t < fails.until) return { wait: Math.ceil((fails.until - t) / 1000) };
    const failed = (error) => {
      if (++fails.n < MAX_FAILS) return { error };
      fails.n = 0; fails.until = t + WAIT_MS;
      return { wait: WAIT_MS / 1000 };
    };
    if (typeof email !== 'string' || !email.trim() || typeof password !== 'string' || !password) return failed('Escribe email y contraseña.');
    let tokens;
    try { tokens = await platform.signIn(email.trim().toLowerCase(), password); }
    catch (e) { if (TRANSIENT.has(e.status)) throw e; return failed(e.message); }
    let user;
    try { user = await platform.rpc(tokens.accessToken, 'platform_whoami'); }
    catch (e) {
      await platform.signOut(tokens.accessToken).catch(() => {});
      if (TRANSIENT.has(e.status)) throw e;
      return failed('Tu cuenta está desactivada o no tiene acceso a SIA.');
    }
    fails.n = 0;
    const { token, session } = newSession({ userId: user.id, refreshToken: tokens.refreshToken, remember }, t);
    if (remember) {
      const cfg = readConfig();
      writeConfig({ ...cfg, sessions: [...liveSessions(cfg.sessions, t), session] });
    } else memSessions.push(session);
    live.set(session.hash, { accessToken: tokens.accessToken, expiresAt: tokens.expiresAt, user, checkedAt: t });
    return { token, user };
  };

  // → { user, accessToken } | null. Si la base no responde, lanza (503).
  // fresh: preguntar el perfil a la base sí o sí (al abrir la app).
  const context = (token, { fresh = false } = {}) => {
    const session = sessionFor(sessions(), token, now());
    if (!session) return Promise.resolve(null);
    const c = live.get(session.hash);
    if (!fresh && c && c.expiresAt - now() > RENEW_BEFORE_MS && now() - c.checkedAt < RECHECK_MS) {
      return Promise.resolve({ user: c.user, accessToken: c.accessToken });
    }
    if (inflight.has(session.hash)) return inflight.get(session.hash);
    const p = (async () => {
      try {
        let { accessToken, expiresAt } = c || {};
        if (!c || expiresAt - now() <= RENEW_BEFORE_MS) {
          const t = await platform.refresh(session.refreshToken);
          ({ accessToken, expiresAt } = t);
          storeRefresh(session, t.refreshToken);
        }
        const user = await platform.rpc(accessToken, 'platform_whoami');
        live.set(session.hash, { accessToken, expiresAt, user, checkedAt: now() });
        return { user, accessToken };
      } catch (e) {
        if (!TRANSIENT.has(e.status)) { drop(session.hash); return null; } // revocada, borrado o desactivado
        if (c && c.expiresAt > now()) return { user: c.user, accessToken: c.accessToken }; // la base no responde: lo último conocido
        throw e;
      } finally { inflight.delete(session.hash); }
    })();
    inflight.set(session.hash, p);
    return p;
  };

  // Tras cambiar uno sus propios datos: que el siguiente context los vuelva a pedir.
  const refreshProfile = (token) => {
    const s = sessionFor(sessions(), token, now());
    const c = s && live.get(s.hash);
    if (c) c.checkedAt = 0;
  };

  const logout = async (token) => {
    const s = sessionFor(sessions(), token, now());
    if (!s) return;
    const c = live.get(s.hash);
    drop(s.hash);
    if (c) await platform.signOut(c.accessToken).catch(() => {});
  };

  return { login, context, refreshProfile, logout };
};
