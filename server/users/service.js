// Gestión de usuarios contra la base de la instancia, siempre con el JWT de
// quien la pide: la autorización (solo admins, nadie cambia su rol…) la
// decide la base. Lista y edita con las funciones platform_*; alta, baja y
// contraseña, con la Edge Function sia-users (necesitan la clave secret, que
// SIA no tiene). El cliente de la plataforma llega inyectado.

export const createUserAdmin = ({ platform }) => ({
  list: (jwt) => platform.rpc(jwt, 'platform_list_users'),

  create: async (jwt, { email, name, password, role }) =>
    (await platform.users(jwt, { action: 'create', email, name, password, role })).user,

  // Solo cambia lo que venga: nombre, rol y activo en la base; la contraseña,
  // con la Edge Function.
  async update(jwt, id, { name, role, active, password }) {
    if (name !== undefined || role !== undefined || active !== undefined) {
      await platform.rpc(jwt, 'platform_update_user', {
        p_user: id,
        ...(name !== undefined ? { p_name: name } : {}),
        ...(role !== undefined ? { p_role: role } : {}),
        ...(active !== undefined ? { p_active: active } : {}),
      });
    }
    if (password) await platform.users(jwt, { action: 'set_password', id, password });
  },

  remove: (jwt, id) => platform.users(jwt, { action: 'delete', id }),
});
