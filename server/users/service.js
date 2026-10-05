// Gestión de usuarios: casos de uso sobre el dominio (users.js) y la config
// personal, que llega inyectada (readConfig/writeConfig).

import { normalizeUsers, createUser, updateUser, removeUser } from './users.js';

export const createUserAdmin = ({ readConfig, writeConfig }) => {
  const all = () => normalizeUsers(readConfig().users);
  // Aplica un cambio del dominio y, si sale bien, lo guarda.
  const commit = (result) => {
    if (result.error) return result;
    writeConfig({ ...readConfig(), users: result.users });
    return result;
  };

  return {
    all,
    // Primer arranque sin usuarios: deja guardado el administrador inicial. → true si lo creó.
    ensureSeed() {
      const cfg = readConfig();
      if (Array.isArray(cfg.users) && cfg.users.length) return false;
      writeConfig({ ...cfg, users: all() });
      return true;
    },
    create: (input) => commit(createUser(all(), input)),
    update: (id, patch) => commit(updateUser(all(), id, patch)),
    remove: (id, actorId) => commit(removeUser(all(), id, actorId)),
  };
};
