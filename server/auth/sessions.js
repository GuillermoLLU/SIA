// Sesiones locales de SIA (dominio, sin E/S). Quien inicia sesión lo hace en
// Supabase Auth; SIA guarda su refresh token y le da a la web un token propio,
// opaco: el JWT de Supabase nunca sale del bridge. Del token local solo se
// guarda el hash; con «Mantener la sesión», la sesión (con su refresh token)
// se escribe en la config personal y sobrevive a reinicios; sin marcar, vive
// en memoria.

import { randomBytes, createHash } from 'node:crypto';

// «Mantener la sesión»: 30 días; sin marcar, 12 horas.
export const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_MS = 12 * 60 * 60 * 1000;

export const tokenHash = (token) => createHash('sha256').update(String(token)).digest('hex');

// Nueva sesión. → { token (para la web), session (lo que se guarda) }
export const newSession = ({ userId, refreshToken, remember }, now = Date.now()) => {
  const token = randomBytes(32).toString('base64url');
  return { token, session: { hash: tokenHash(token), userId, refreshToken, remember: !!remember, expires: now + (remember ? REMEMBER_MS : SESSION_MS) } };
};

// Sesiones válidas: bien formadas y sin caducar (las del inicio de sesión
// local anterior, sin refresh token, ya no valen).
export const liveSessions = (sessions, now = Date.now()) => (Array.isArray(sessions) ? sessions : [])
  .filter((s) => s && typeof s.hash === 'string' && typeof s.refreshToken === 'string' && s.refreshToken && s.expires > now);

// La sesión de un token, o null.
export const sessionFor = (sessions, token, now = Date.now()) => {
  if (typeof token !== 'string' || !token) return null;
  const h = tokenHash(token);
  return liveSessions(sessions, now).find((s) => s.hash === h) || null;
};
