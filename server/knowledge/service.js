// Conocimiento en la base de la instancia, siempre con el JWT de quien actúa
// (la base decide: asignar es cosa de admins). El cliente de la plataforma
// llega inyectado.

export const createKnowledge = ({ platform }) => ({
  // lo asignado a quien llama (filas de platform_my_knowledge)
  mine: (jwt) => platform.rpc(jwt, 'platform_my_knowledge'),

  listBases: (jwt) => platform.rpc(jwt, 'platform_list_bases'),
  addBase: (jwt, { name, url, key }) => platform.rpc(jwt, 'platform_add_base', { p_name: name, p_url: url, p_publishable_key: key }),
  removeBase: (jwt, id) => platform.rpc(jwt, 'platform_remove_base', { p_base: id }),

  listGrants: (jwt, userId) => platform.rpc(jwt, 'platform_list_grants', { p_user: userId }),
  grant: (jwt, { user, base, groupName, token }) =>
    platform.rpc(jwt, 'platform_grant_knowledge', { p_user: user, p_base: base, p_group_name: groupName, p_group_token: token }),
  revoke: (jwt, id) => platform.rpc(jwt, 'platform_revoke_knowledge', { p_grant: id }),
});
