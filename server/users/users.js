// Usuarios de SIA (dominio, sin E/S: service.js lee y escribe la config).
//
// Viven en la config personal (~/.sia/config.json, bloque "users") con la
// contraseña derivada (scrypt + sal), nunca en claro. Reglas:
//   - nombre de 1 a 40 caracteres, único sin distinguir mayúsculas;
//   - contraseña de 4 caracteres o más;
//   - rol: admin (gestiona la herramienta) o agent (agente de soporte);
//   - siempre queda al menos un admin, y nadie se borra a sí mismo.

import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';

export const ROLES = ['admin', 'agent'];
const NAME_MAX = 40;
const PASSWORD_MIN = 4;

// Primer arranque sin usuarios: el administrador inicial.
export const SEED_ADMIN = { name: 'Guille', password: '5555', role: 'admin' };

const derive = (password, salt) => scryptSync(String(password), Buffer.from(salt, 'hex'), 32);
const withPassword = (user, password) => {
  const salt = randomBytes(16).toString('hex');
  return { ...user, salt, hash: derive(password, salt).toString('hex') };
};

// Los nombres se comparan sin mayúsculas ni espacios a los lados.
const sameName = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
const admins = (users) => users.filter((u) => u.role === 'admin');

export const makeUser = ({ name, password, role }) =>
  withPassword({ id: randomUUID(), name: String(name).trim(), role: ROLES.includes(role) ? role : 'agent' }, password);

// Usuarios bien formados; si no queda ninguno, el administrador inicial.
export const normalizeUsers = (list) => {
  const users = (Array.isArray(list) ? list : [])
    .filter((u) => u && typeof u.id === 'string' && typeof u.name === 'string' && u.name.trim()
      && ROLES.includes(u.role) && typeof u.salt === 'string' && typeof u.hash === 'string');
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

// ¿Qué falla en estos datos? → texto del problema o null. `id`: el usuario que
// se edita (su propio nombre no choca consigo mismo); sin él, es un alta y la
// contraseña es obligatoria.
const problem = (users, { name, password, role }, id = null) => {
  if (name !== undefined) {
    const n = typeof name === 'string' ? name.trim() : '';
    if (!n) return 'Falta el nombre.';
    if (n.length > NAME_MAX) return `El nombre admite ${NAME_MAX} caracteres como mucho.`;
    if (users.some((u) => u.id !== id && sameName(u.name, n))) return `Ya hay un usuario «${n}».`;
  }
  if (role !== undefined && !ROLES.includes(role)) return 'Rol desconocido.';
  if (password !== undefined || !id) {
    if (typeof password !== 'string' || password.length < PASSWORD_MIN) return `La contraseña necesita ${PASSWORD_MIN} caracteres o más.`;
  }
  return null;
};

// → { users, user } | { error }
export const createUser = (users, { name, password, role }) => {
  const error = problem(users, { name, password, role: role ?? 'agent' });
  if (error) return { error };
  const user = makeUser({ name, password, role });
  return { users: [...users, user], user };
};

// Cambia nombre, rol y/o contraseña (los que vengan). → { users, user } | { error }
export const updateUser = (users, id, { name, password, role }) => {
  const current = users.find((u) => u.id === id);
  if (!current) return { error: 'Ese usuario no existe.' };
  const error = problem(users, { name, password, role }, id);
  if (error) return { error };
  if (current.role === 'admin' && role === 'agent' && admins(users).length === 1) return { error: 'Es el único administrador: no puede dejar de serlo.' };
  let user = { ...current, ...(name !== undefined ? { name: name.trim() } : {}), ...(role !== undefined ? { role } : {}) };
  if (password !== undefined) user = withPassword(user, password);
  return { users: users.map((u) => (u.id === id ? user : u)), user };
};

// `actorId`: quien borra. → { users } | { error }
export const removeUser = (users, id, actorId) => {
  const target = users.find((u) => u.id === id);
  if (!target) return { error: 'Ese usuario no existe.' };
  if (id === actorId) return { error: 'No puedes borrar tu propio usuario.' };
  if (target.role === 'admin' && admins(users).length === 1) return { error: 'Es el único administrador: no se puede borrar.' };
  return { users: users.filter((u) => u.id !== id) };
};
