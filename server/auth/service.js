// Inicio de sesión: casos de uso sobre el dominio (users.js) y la config
// personal, que llega inyectada (readConfig/writeConfig) para no atarse al disco.
//
// Las sesiones con «Recordar» se guardan (solo su hash) en la config y
// sobreviven a reinicios; las demás viven en memoria. Cinco intentos fallidos
// seguidos imponen 30 s de espera.

import { normalizeUsers, checkLogin, newSession, liveSessions, userForToken, tokenHash } from './users.js';

const MAX_FAILS = 5;
const WAIT_MS = 30_000;

export const createAuth = ({ readConfig, writeConfig, now = Date.now }) => {
  const memSessions = [];
  const fails = { n: 0, until: 0 };
  const users = () => normalizeUsers(readConfig().users);
  const sessions = () => [...memSessions, ...(readConfig().sessions || [])];

  // Primer arranque sin usuarios: deja guardado el administrador inicial. → true si lo creó.
  const ensureUsers = () => {
    const cfg = readConfig();
    if (Array.isArray(cfg.users) && cfg.users.length) return false;
    writeConfig({ ...cfg, users: normalizeUsers(cfg.users) });
    return true;
  };

  const userOf = (token) => userForToken(sessions(), users(), token, now());

  // → { token, user } | { wait: segundos } | {} (credenciales incorrectas)
  const login = (name, password, remember) => {
    const t = now();
    if (t < fails.until) return { wait: Math.ceil((fails.until - t) / 1000) };
    const all = users();
    const user = checkLogin(all, name, password);
    if (!user) {
      if (++fails.n < MAX_FAILS) return {};
      fails.n = 0; fails.until = t + WAIT_MS;
      return { wait: WAIT_MS / 1000 };
    }
    fails.n = 0;
    const { token, session } = newSession(user.id, remember, t);
    if (remember) {
      const cfg = readConfig();
      writeConfig({ ...cfg, sessions: [...liveSessions(cfg.sessions, all, t), session] });
    } else memSessions.push(session);
    return { token, user };
  };

  const logout = (token) => {
    if (typeof token !== 'string' || !token) return;
    const h = tokenHash(token);
    const i = memSessions.findIndex((s) => s.hash === h);
    if (i >= 0) memSessions.splice(i, 1);
    const cfg = readConfig();
    if (cfg.sessions?.some((s) => s.hash === h)) writeConfig({ ...cfg, sessions: cfg.sessions.filter((s) => s.hash !== h) });
  };

  return { ensureUsers, userOf, login, logout };
};
