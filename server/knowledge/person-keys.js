// Clave de poder de cada persona en la base de conocimiento (dominio, sin E/S).
//
// La instancia decide qué ve cada uno (sus vistas); la base solo entiende de
// claves de poder. Así que cada persona tiene en la base su propia clave con
// los permisos de sus vistas que la base sabe hacer cumplir: nada más (mínimo
// privilegio) y revocable persona a persona. La base la ve todo el mundo,
// tenga proyectos o no. Sin ninguna de esas
// vistas o desactivada: sin clave. Con Administración tampoco: usa la del
// dueño de la base (la instancia se la da; platform_my_knowledge).

import { cleanPerms } from '../access/perms.js';

// Vistas de SIA que son un permiso en la base (mismo nombre).
const KEY_VIEWS = ['lab', 'links'];

export const keyPerms = (person) => (person?.active && !person.views?.includes('admin') ? KEY_VIEWS.filter((v) => person.views?.includes(v)) : []);

const KEY_PREFIX = 'SIA · ';
export const keyName = (person) => `${KEY_PREFIX}${person.email}`;

// Claves de SIA en la base que la instancia ya no conoce (de una persona
// borrada a mano, de una sincronización que se cruzó con otra…): sobran.
//   inBase  [{ key, name }] de power_keys      known  Set de claves de la instancia
export const orphanKeys = (inBase, known) => inBase.filter((k) => k.name?.startsWith(KEY_PREFIX) && !known.has(k.key)).map((k) => k.key);

// Lo que se responde si poner al día las claves dejó problemas: { warning } o nada.
export const keysWarning = (problems) => (problems.length ? { warning: `Hecho, pero sin su clave de poder en la base: ${problems[0]}` } : {});

// Qué hacer en la base: crear, poner al día o quitar su clave.
//   person   fila de platform_list_users (views, active)
//   reachable  ids de las bases cuya clave del dueño tiene la instancia (la suya)
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
