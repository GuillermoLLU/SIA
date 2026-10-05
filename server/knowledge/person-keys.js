// Clave de poder de cada persona en cada base (dominio, sin E/S).
//
// La instancia decide qué ve cada uno (sus vistas); la base solo entiende de
// claves de poder. Así que cada persona tiene, en cada base que ve, su propia
// clave con los permisos de sus vistas que la base sabe hacer cumplir: nada
// más (mínimo privilegio) y revocable persona a persona. La base de la
// instancia la ve todo el mundo, tenga grupos o no. Sin ninguna de esas
// vistas o desactivada: sin clave.

import { cleanPerms } from '../access/perms.js';

// Vistas de SIA que son un permiso en la base (mismo nombre).
export const KEY_VIEWS = ['lab', 'admin', 'links'];

export const keyPerms = (person) => (person?.active ? KEY_VIEWS.filter((v) => person.views?.includes(v)) : []);

export const keyName = (person) => `SIA · ${person.email}`;

// Qué hacer en cada base: crear, poner al día o quitar su clave.
//   person   fila de platform_list_users (views, active)
//   reachable  ids de las bases cuya clave de poder tiene la instancia
//   current    Map baseId → clave que ya tiene
// → [{ baseId, action: 'create' | 'update' | 'remove', key?, perms }]
export const planKeys = (person, reachable, current) => {
  const perms = keyPerms(person);
  const wanted = new Set(perms.length ? reachable : []);
  const plan = [];
  for (const baseId of wanted) {
    plan.push(current.has(baseId)
      ? { baseId, action: 'update', key: current.get(baseId), perms: cleanPerms(Object.fromEntries(perms.map((p) => [p, true]))) }
      : { baseId, action: 'create', perms: cleanPerms(Object.fromEntries(perms.map((p) => [p, true]))) });
  }
  for (const [baseId, key] of current) if (!wanted.has(baseId)) plan.push({ baseId, action: 'remove', key });
  return plan;
};
