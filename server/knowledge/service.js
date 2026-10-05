// Conocimiento en la base de la instancia, siempre con el JWT de quien actúa
// (la base decide: asignar es cosa de admins). Llegan inyectados el cliente
// de la plataforma y readGroups({ url, key, powerKey }), que lee los grupos
// (access_groups) de una base de conocimiento con su clave de poder.
//
// Los grupos de cada base se guardan en memoria (con sus tokens) al listar
// las bases; la web solo recibe { id, name } y, al asignar, manda ids.
//
// Configuración → Conocimiento manda: las bases que un admin tiene ahí con su
// clave de poder son las de la instancia (las que se asignan en Personas).
// syncFromConfig da de alta las que falten y las renombra; quitar una base en
// Configuración la quita de la instancia (removeByUrl).
//
// Cada persona tiene en cada base que ve su clave de poder con los permisos
// de sus vistas (person-keys.js). syncPeople la crea, la pone al día o la
// quita en la base con baseKeys (inyectado: create / update / remove sobre
// power_keys, con la clave de la instancia) y la guarda en la instancia.

import { PlatformError } from '../platform/client.js';
import { toGroups, publicGroups, pickGroups } from './groups.js';
import { planKeys, keyName } from './person-keys.js';

export const createKnowledge = ({ platform, readGroups, baseKeys }) => {
  const groupsByBase = new Map(); // baseId → [{ id, name, token }]

  // Prueba una clave de poder antes de guardarla: tiene que abrir los grupos.
  const tryPowerKey = async (url, key, powerKey) => {
    try { return toGroups(await readGroups({ url, key, powerKey })); }
    catch { throw new PlatformError(400, 'Esa clave de poder no abre los grupos de la base (tiene que tener permiso de Administración).'); }
  };

  // Bases de la instancia con sus grupos (los que se pueden leer).
  const bases = async (jwt) => {
    const [list, access] = await Promise.all([platform.rpc(jwt, 'platform_list_bases'), platform.rpc(jwt, 'platform_base_access')]);
    const accessById = new Map(access.map((a) => [a.id, a]));
    return Promise.all(list.map(async (b) => {
      const a = accessById.get(b.id);
      let groups = null, groupsError = null;
      if (a) {
        try { groups = toGroups(await readGroups({ url: a.url, key: a.publishable_key, powerKey: a.power_key })); groupsByBase.set(b.id, groups); }
        catch { groupsError = 'No se pudieron leer sus grupos: revisa su clave de poder.'; }
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

    // local: las bases de Configuración ({ name, url, key, powerKey }).
    // changedPowerKey: url cuya clave de poder acaba de cambiar.
    // → [problemas] (una base que no se pudo llevar a la instancia, con el motivo)
    async syncFromConfig(jwt, local, { changedPowerKey = null } = {}) {
      const byUrl = new Map((await platform.rpc(jwt, 'platform_list_bases')).map((b) => [b.url, b]));
      const problems = [];
      for (const l of local) {
        if (!l.key || !l.powerKey) continue; // sin clave de poder no se leen sus grupos: no se puede asignar
        const inst = byUrl.get(l.url);
        try {
          if (!inst) {
            await tryPowerKey(l.url, l.key, l.powerKey);
            await platform.rpc(jwt, 'platform_add_base', { p_name: l.name, p_url: l.url, p_publishable_key: l.key, p_power_key: l.powerKey });
            continue;
          }
          if (inst.name !== l.name) await platform.rpc(jwt, 'platform_rename_base', { p_base: inst.id, p_name: l.name });
          if (!inst.has_power_key || changedPowerKey === l.url) {
            await tryPowerKey(l.url, l.key, l.powerKey);
            await platform.rpc(jwt, 'platform_set_base_power', { p_base: inst.id, p_power_key: l.powerKey });
            groupsByBase.delete(inst.id);
          }
        } catch (e) { problems.push(`«${l.name}»: ${e.message}`); }
      }
      return problems;
    },
    async removeByUrl(jwt, url) {
      const inst = (await platform.rpc(jwt, 'platform_list_bases')).find((b) => b.url === url);
      if (!inst) return;
      // fuera de la base las claves que SIA dio en ella; en la instancia se van con la base
      const c = (await connections(jwt)).get(inst.id);
      if (c) {
        for (const k of await platform.rpc(jwt, 'platform_person_keys', { p_base: inst.id })) await baseKeys.remove(c, k.power_key).catch(() => {});
      }
      await platform.rpc(jwt, 'platform_remove_base', { p_base: inst.id });
      groupsByBase.delete(inst.id);
    },

    // Qué grupos de una base ve alguien (ids de la web; vacío: no la ve).
    async setGroups(jwt, userId, baseId, ids) {
      if (!groupsByBase.has(baseId)) await bases(jwt);
      const groups = groupsByBase.get(baseId);
      if (!groups) throw new PlatformError(400, 'No se pueden leer los grupos de esa base: ponle su clave de poder.');
      const picked = pickGroups(groups, ids);
      if (picked.error) throw new PlatformError(409, picked.error);
      await platform.rpc(jwt, 'platform_set_knowledge', { p_user: userId, p_base: baseId, p_groups: picked.groups });
    },
    copy: (jwt, userId, fromId) => platform.rpc(jwt, 'platform_copy_knowledge', { p_user: userId, p_from: fromId }),
  };
};
