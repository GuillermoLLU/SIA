// Grupos de acceso de la base de conocimiento (dominio, sin E/S). Hay uno por
// proyecto (server/projects/): ante la persona, son sus proyectos.
//
// Ante la web, un grupo es { id, name }: el id es la huella sha256 del token
// (la misma que platform.token_id en la base de la instancia), así la web
// puede marcar y desmarcar grupos sin ver nunca un token. El bridge guarda la
// correspondencia id → token para mandar a la base lo que toca.

import { createHash } from 'node:crypto';

export const groupId = (token) => createHash('sha256').update(String(token), 'utf8').digest('hex');

// Filas de access_groups ({ token, name }) → grupos con su id, por nombre.
export const toGroups = (rows) => (Array.isArray(rows) ? rows : [])
  .filter((r) => r && typeof r.token === 'string' && r.token && typeof r.name === 'string')
  .map((r) => ({ id: groupId(r.token), name: r.name, token: r.token }))
  .sort((a, b) => a.name.localeCompare(b.name, 'es'));

// Lo que se manda a la web: sin tokens.
export const publicGroups = (groups) => groups.map(({ id, name }) => ({ id, name }));

// ids marcados en la web → { name, token } para platform_set_knowledge.
// → { groups } | { error } si algún id no es de la base.
export const pickGroups = (groups, ids) => {
  const byId = new Map(groups.map((g) => [g.id, g]));
  const list = Array.isArray(ids) ? [...new Set(ids)] : [];
  const unknown = list.filter((id) => !byId.has(id));
  if (unknown.length) return { error: 'Algún grupo ya no existe en la base: vuelve a abrirla.' };
  return { groups: list.map((id) => ({ name: byId.get(id).name, token: byId.get(id).token })) };
};
