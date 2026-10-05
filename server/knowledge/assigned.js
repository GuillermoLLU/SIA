// Conocimiento asignado por la plataforma (dominio, sin E/S).
//
// La base de la instancia dice cuál es su base de conocimiento (la ve todo
// el mundo) y qué grupos (tokens) tiene en ella cada persona
// (platform_my_knowledge; sin grupos, una fila sin token). Aquí se convierte
// eso en la base que usa el bridge ({ id, name, url, key, tokens, groups,
// powerKey, enabled }); su id es «p-<id en la plataforma>».

export const assignedId = (baseId) => `p-${baseId}`;

// Filas de platform_my_knowledge → una base por base, con todos sus tokens y
// la clave de poder que la instancia le dio en ella (la de sus vistas).
export const toAssignedBases = (rows) => {
  const byId = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r?.base_id || !r.url || !r.publishable_key) continue;
    const b = byId.get(r.base_id) || {
      id: assignedId(r.base_id), name: r.base_name, url: r.url, key: r.publishable_key,
      tokens: [], groups: [], powerKey: r.power_key || '', enabled: true,
    };
    if (r.group_token && !b.tokens.includes(r.group_token)) { b.tokens.push(r.group_token); b.groups.push(r.group_name); }
    byId.set(r.base_id, b);
  }
  return [...byId.values()];
};
