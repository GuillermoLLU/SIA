// Conocimiento en la base de la instancia, siempre con el JWT de quien actúa
// (la base decide: asignar es de quien gestiona Personas). Llegan inyectados
// el cliente de la plataforma y readGroups({ url, key, powerKey }), que lee
// los grupos (access_groups) de la base de conocimiento con la clave del dueño.
//
// Los grupos de cada base se guardan en memoria (con sus tokens) al listar
// las bases; la web solo recibe { id, name } y, al asignar, manda ids.
//
// Cada persona tiene en la base su clave de poder con los permisos
// de sus vistas (person-keys.js). syncPeople la crea, la pone al día o la
// quita en la base con baseKeys (inyectado: create / update / remove sobre
// power_keys, con la clave de la instancia) y la guarda en la instancia.

import { PlatformError } from '../platform/client.js';
import { toGroups, publicGroups, pickGroups } from './groups.js';
import { planKeys, keyName } from './person-keys.js';

export const createKnowledge = ({ platform, readGroups, baseKeys }) => {
  const groupsByBase = new Map(); // baseId → [{ id, name, token }]

  // La base de la instancia con sus grupos de acceso, uno por proyecto (server/projects/).
  const bases = async (jwt) => {
    const [list, access] = await Promise.all([platform.rpc(jwt, 'platform_list_bases'), platform.rpc(jwt, 'platform_base_access')]);
    const accessById = new Map(access.map((a) => [a.id, a]));
    return Promise.all(list.map(async (b) => {
      const a = accessById.get(b.id);
      let groups = null, groupsError = null;
      if (a) {
        try { groups = toGroups(await readGroups({ url: a.url, key: a.publishable_key, powerKey: a.power_key })); groupsByBase.set(b.id, groups); }
        catch { groupsError = 'No se pudieron leer sus proyectos: revisa la clave del dueño en la instancia.'; }
      }
      return { id: b.id, name: b.name, url: b.url, hasPowerKey: b.has_power_key, people: Number(b.people), groups: groups && publicGroups(groups), groupsError };
    }));
  };

  // Conexión a cada base con la clave de la instancia: baseId → { url, key, powerKey }.
  const connections = async (jwt) => new Map((await platform.rpc(jwt, 'platform_base_access'))
    .map((a) => [a.id, { url: a.url, key: a.publishable_key, powerKey: a.power_key }]));

  // Claves de unas personas (ids; null: todas) al día con sus vistas y lo que
  // ven. drop: quitárselas todas (antes de borrarlas). → [problemas]
  const syncPeople = async (jwt, ids, { drop = false } = {}) => {
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
    return problems;
  };

  return {
    syncPeople,
    // lo asignado a quien llama (filas de platform_my_knowledge)
    mine: (jwt) => platform.rpc(jwt, 'platform_my_knowledge'),
    bases,

    // Qué grupos de una base ve alguien (ids de la web; vacío: no la ve).
    async setGroups(jwt, userId, baseId, ids) {
      if (!groupsByBase.has(baseId)) await bases(jwt);
      const groups = groupsByBase.get(baseId);
      if (!groups) throw new PlatformError(400, 'No se pueden leer los grupos de la base: revisa su clave del dueño en la instancia.');
      const picked = pickGroups(groups, ids);
      if (picked.error) throw new PlatformError(409, picked.error);
      await platform.rpc(jwt, 'platform_set_knowledge', { p_user: userId, p_base: baseId, p_groups: picked.groups });
    },
    copy: (jwt, userId, fromId) => platform.rpc(jwt, 'platform_copy_knowledge', { p_user: userId, p_from: fromId }),
  };
};
