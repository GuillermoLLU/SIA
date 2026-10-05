// Conocimiento en la base de la instancia, siempre con el JWT de quien actúa
// (la base decide: asignar es de quien gestiona Personas). Llegan inyectados
// el cliente de la plataforma y readGroups({ url, key, powerKey }), que lee
// los grupos (access_groups) de la base de conocimiento con la clave del dueño.
//
// Los proyectos (un grupo de acceso por proyecto, con su token) se guardan en
// memoria al leer la base; la web solo recibe { id, name } y, al asignar, ids.
//
// Cada persona tiene en la base su clave de poder con los permisos
// de sus vistas (person-keys.js). syncPeople la crea, la pone al día o la
// quita en la base con baseKeys (inyectado: list / create / update / remove
// sobre power_keys, con la clave del dueño) y la guarda en la instancia. Las
// sincronizaciones van de una en una (si se cruzaran, crearían dos claves para
// la misma persona) y la revisión completa barre las claves huérfanas.

import { PlatformError } from '../platform/client.js';
import { toGroups, publicGroups, pickGroups } from './groups.js';
import { planKeys, keyName, orphanKeys } from './person-keys.js';

export const createKnowledge = ({ platform, readGroups, baseKeys }) => {
  let known = { baseId: null, groups: null }; // los proyectos leídos, con sus tokens

  // La base de la instancia y sus proyectos: { id, name, groups: [{ id, name }]
  // | null, groupsError }, o null si la instancia aún no tiene base.
  const base = async (jwt) => {
    const [[b], access] = await Promise.all([platform.rpc(jwt, 'platform_list_bases'), platform.rpc(jwt, 'platform_base_access')]);
    if (!b) return null;
    const a = access.find((x) => x.id === b.id);
    let groups = null, groupsError = null;
    if (a) {
      try { groups = toGroups(await readGroups({ url: a.url, key: a.publishable_key, powerKey: a.power_key })); known = { baseId: b.id, groups }; }
      catch { groupsError = 'No se pudieron leer sus proyectos: revisa la clave del dueño en la instancia.'; }
    }
    return { id: b.id, name: b.name, groups: groups && publicGroups(groups), groupsError };
  };

  // Conexión a la base con la clave de la instancia: baseId → { url, key, powerKey }.
  const connections = async (jwt) => new Map((await platform.rpc(jwt, 'platform_base_access'))
    .map((a) => [a.id, { url: a.url, key: a.publishable_key, powerKey: a.power_key }]));

  // Claves de unas personas (ids; null: todas, y fuera las huérfanas) al día
  // con sus vistas. drop: quitárselas todas (antes de borrarlas). → [problemas]
  const sync = async (jwt, ids, { drop = false } = {}) => {
    const [people, conn, keys] = await Promise.all([
      platform.rpc(jwt, 'platform_list_users'), connections(jwt), platform.rpc(jwt, 'platform_person_keys', {})]);
    const targets = ids ? ids.map((id) => people.find((p) => p.id === id) || { id }) : people;
    const problems = [];
    for (const person of targets) {
      const current = new Map(keys.filter((k) => k.user_id === person.id).map((k) => [k.base_id, k.power_key]));
      for (const step of planKeys(drop ? null : person, new Set(conn.keys()), current)) {
        const c = conn.get(step.baseId);
        const save = (key) => platform.rpc(jwt, 'platform_set_person_key', { p_user: person.id, p_base: step.baseId, p_power_key: key });
        try {
          if (step.action === 'remove') {
            if (c) await baseKeys.remove(c, step.key).catch(() => {}); // ya no estaba: da igual
            await save(null);
            continue;
          }
          const fields = { name: keyName(person), perms: step.perms };
          if (step.action === 'update' && await baseKeys.update(c, step.key, fields)) continue;
          await save(await baseKeys.create(c, fields)); // nueva, o la anterior ya no estaba en la base
        } catch (e) { problems.push(e.message); }
      }
    }
    if (!ids) {
      const known = new Set((await platform.rpc(jwt, 'platform_person_keys', {})).map((k) => k.power_key));
      for (const c of conn.values()) {
        try { for (const key of orphanKeys(await baseKeys.list(c), known)) await baseKeys.remove(c, key); }
        catch (e) { problems.push(e.message); }
      }
    }
    return problems;
  };
  let queue = Promise.resolve();
  const syncPeople = (...args) => (queue = queue.then(() => sync(...args), () => sync(...args)));

  return {
    syncPeople,
    // lo asignado a quien llama (filas de platform_my_knowledge)
    mine: (jwt) => platform.rpc(jwt, 'platform_my_knowledge'),
    base,

    // Qué proyectos ve alguien (ids de la web; vacío: ninguno).
    async setProjects(jwt, userId, ids) {
      if (!known.groups) await base(jwt);
      if (!known.groups) throw new PlatformError(400, 'No se pueden leer los proyectos de la base: revisa la clave del dueño en la instancia.');
      const picked = pickGroups(known.groups, ids);
      if (picked.error) throw new PlatformError(409, picked.error);
      await platform.rpc(jwt, 'platform_set_knowledge', { p_user: userId, p_base: known.baseId, p_groups: picked.groups });
    },
    copy: (jwt, userId, fromId) => platform.rpc(jwt, 'platform_copy_knowledge', { p_user: userId, p_from: fromId }),
  };
};
