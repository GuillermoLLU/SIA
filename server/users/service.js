// Gestión de usuarios contra la base de la instancia, siempre con el JWT de
// quien la pide: la autorización (vista Personas, nadie cambia su rol…) la
// decide la base. Lista y edita con las funciones platform_*; alta, baja y
// contraseña, con la Edge Function sia-users (necesitan la clave secret, que
// SIA no tiene). El cliente de la plataforma llega inyectado.
import { loadRules } from '../issues/rules.js';

export const createUserAdmin = ({ platform }) => ({
  list: (jwt) => platform.rpc(jwt, 'platform_list_users'),

  create: async (jwt, { email, name, password, role }) =>
    (await platform.users(jwt, { action: 'create', email, name, password, role })).user,

  // Solo cambia lo que venga: nombre, rol, vistas, regla de priorización y activo en la base
  // (una vista o una regla sueltas la dejan personalizada); la contraseña, con la Edge Function.
  async update(jwt, id, { name, role, views, rule, active, password }) {
    if (name !== undefined || role !== undefined || views !== undefined || rule !== undefined || active !== undefined) {
      await platform.rpc(jwt, 'platform_update_user', {
        p_user: id,
        ...(name !== undefined ? { p_name: name } : {}),
        ...(role !== undefined ? { p_role: role } : {}),
        ...(views !== undefined ? { p_views: views } : {}),
        ...(rule !== undefined ? { p_rule: rule } : {}),
        ...(active !== undefined ? { p_active: active } : {}),
      });
    }
    if (password) await platform.users(jwt, { action: 'set_password', id, password });
  },

  remove: (jwt, id) => platform.users(jwt, { action: 'delete', id }),

  // Roles: nombre, vistas y regla de priorización (null: la básica). Guardar uno cambia las
  // vistas y la regla de quien lo tiene.
  roles: (jwt) => platform.rpc(jwt, 'platform_list_roles'),
  saveRole: (jwt, id, { name, views, rule = null }) => platform.rpc(jwt, 'platform_save_role', { p_role: id, p_name: name, p_views: views, p_rule: rule }),
  removeRole: (jwt, id) => platform.rpc(jwt, 'platform_delete_role', { p_role: id }),

  // Las reglas de priorización, para elegir la de cada rol y cada persona (se editan en el Backlog)
  rules: async (jwt) => (await loadRules(platform, jwt)).map(({ id, label, builtin }) => ({ id, label, builtin })),
});
