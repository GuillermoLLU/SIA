// Usuarios y sesiones de SIA (dominio, sin E/S: service.js lee y escribe la
// config).
//
// Los usuarios viven en la config personal (~/.sia/config.json, bloque
// "users") con la contraseña derivada (scrypt + sal), nunca en claro. Una
// sesión es un token aleatorio; en la config solo se guarda su hash, y solo si
// se marcó «Recordar» (las demás viven en memoria y caducan con el bridge).

import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';

const ROLES = ['admin', 'agent'];
// «Recordar»: la sesión dura 30 días; sin marcar, 12 horas.
export const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;
export const SESSION_MS = 12 * 60 * 60 * 1000;

// Primer arranque sin usuarios: el administrador inicial.
export const SEED_ADMIN = { name: 'Guille', password: '5555', role: 'admin' };

const derive = (password, salt) => scryptSync(String(password), Buffer.from(salt, 'hex'), 32);
export const tokenHash = (token) => createHash('sha256').update(String(token)).digest('hex');

// Los nombres se comparan sin mayúsculas ni espacios a los lados.
const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();

export const makeUser = ({ name, password, role = 'agent' }) => {
  const salt = randomBytes(16).toString('hex');
  return {
    id: randomUUID(),
    name: String(name).trim(),
    role: ROLES.includes(role) ? role : 'agent',
    salt,
    hash: derive(password, salt).toString('hex'),
  };
};

// Usuarios bien formados; si no queda ninguno, el administrador inicial.
export const normalizeUsers = (list) => {
  const users = (Array.isArray(list) ? list : [])
    .filter((u) => u && typeof u.id === 'string' && typeof u.name === 'string' && u.name.trim()
      && typeof u.salt === 'string' && typeof u.hash === 'string');
  return users.length ? users : [makeUser(SEED_ADMIN)];
};

// Comprueba usuario + contraseña. → el usuario o null.
export const checkLogin = (users, name, password) => {
  const u = users.find((x) => sameName(x.name, name));
  if (!u || typeof password !== 'string' || !password) return null;
  const a = derive(password, u.salt), b = Buffer.from(u.hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b) ? u : null;
};

// Lo que la web puede ver de un usuario.
export const publicUser = (u) => (u ? { id: u.id, name: u.name, role: u.role } : null);

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
