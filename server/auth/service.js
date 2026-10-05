// Inicio de sesión: casos de uso sobre las sesiones (sessions.js). Llegan
// inyectados la config personal (readConfig/writeConfig, para no atarse al
// disco) y la lista de usuarios (users, del slice server/users).
//
// Las sesiones con «Mantener la sesión» se guardan (solo su hash) en la config y
// sobreviven a reinicios; las demás viven en memoria. Cinco intentos fallidos
// seguidos imponen 30 s de espera.

import { checkLogin } from '../users/users.js';
import { newSession, liveSessions, userForToken, tokenHash } from './sessions.js';

const MAX_FAILS = 5;
const WAIT_MS = 30_000;

export const createAuth = ({ readConfig, writeConfig, users, now = Date.now }) => {
  const memSessions = [];
  const fails = { n: 0, until: 0 };
  const sessions = () => [...memSessions, ...(readConfig().sessions || [])];

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

  return { userOf, login, logout };
};
