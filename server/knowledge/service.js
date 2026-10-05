// Conocimiento en la base de la instancia, siempre con el JWT de quien actúa
// (la base decide: asignar es cosa de admins). Llegan inyectados el cliente
// de la plataforma y readGroups({ url, key, powerKey }), que lee los grupos
// (access_groups) de una base de conocimiento con su clave de poder.
//
// Los grupos de cada base se guardan en memoria (con sus tokens) al listar
// las bases; la web solo recibe { id, name } y, al asignar, manda ids.

import { PlatformError } from '../platform/client.js';
import { toGroups, publicGroups, pickGroups } from './groups.js';

export const createKnowledge = ({ platform, readGroups }) => {
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

  return {
    // lo asignado a quien llama (filas de platform_my_knowledge)
    mine: (jwt) => platform.rpc(jwt, 'platform_my_knowledge'),
    bases,

    async addBase(jwt, { name, url, key, powerKey }) {
      if (powerKey) await tryPowerKey(url, key, powerKey);
      return platform.rpc(jwt, 'platform_add_base', { p_name: name, p_url: url, p_publishable_key: key, p_power_key: powerKey || null });
    },
    async setPowerKey(jwt, baseId, powerKey) {
      const base = (await platform.rpc(jwt, 'platform_list_bases')).find((b) => b.id === baseId);
      if (!base) throw new PlatformError(404, 'Esa base no existe.');
      await tryPowerKey(base.url, base.publishable_key, powerKey);
      await platform.rpc(jwt, 'platform_set_base_power', { p_base: baseId, p_power_key: powerKey });
    },
    async removeBase(jwt, baseId) {
      await platform.rpc(jwt, 'platform_remove_base', { p_base: baseId });
      groupsByBase.delete(baseId);
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
