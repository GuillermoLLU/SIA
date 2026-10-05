// Sesiones de usuario (dominio, sin E/S). Una sesión es un token aleatorio;
// de él solo se guarda el hash, y solo si se marcó «Mantener la sesión» (las
// demás viven en memoria y caducan con el bridge). Una sesión de un usuario
// que ya no existe no vale.

import { randomBytes, createHash } from 'node:crypto';

// «Mantener la sesión»: 30 días; sin marcar, 12 horas.
export const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_MS = 12 * 60 * 60 * 1000;

export const tokenHash = (token) => createHash('sha256').update(String(token)).digest('hex');

// Nueva sesión. → { token (para el cliente), session (lo que se guarda) }
export const newSession = (userId, remember, now = Date.now()) => {
  const token = randomBytes(32).toString('base64url');
  return { token, session: { hash: tokenHash(token), userId, remember: !!remember, expires: now + (remember ? REMEMBER_MS : SESSION_MS) } };
};

// Quita las caducadas y las de usuarios que ya no existen.
export const liveSessions = (sessions, users, now = Date.now()) => (Array.isArray(sessions) ? sessions : [])
  .filter((s) => s && typeof s.hash === 'string' && s.expires > now && users.some((u) => u.id === s.userId));

// El usuario de un token, o null.
export const userForToken = (sessions, users, token, now = Date.now()) => {
  if (typeof token !== 'string' || !token) return null;
  const h = tokenHash(token);
  const s = liveSessions(sessions, users, now).find((x) => x.hash === h);
  return s ? users.find((u) => u.id === s.userId) || null : null;
};
