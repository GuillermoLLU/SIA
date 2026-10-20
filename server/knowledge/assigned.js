// Conocimiento asignado por la plataforma (dominio, sin E/S).
//
// La instancia tiene UNA base de conocimiento, que ve todo el mundo, y dice
// qué tokens (uno por proyecto) tiene en ella cada persona y su clave de
// poder (platform_my_knowledge: una fila por token; sin proyectos, una fila
// sin token). Aquí se convierte en la base que usa el bridge
// ({ id, name, url, key, tokens, powerKey }); su id es «p-<id en la instancia>».

const assignedId = (baseId) => `p-${baseId}`;

// Filas de platform_my_knowledge → la base con todos sus tokens, o null.
export const toAssignedBase = (rows) => {
  let base = null;
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r?.base_id || !r.url || !r.publishable_key) continue;
    base ||= { id: assignedId(r.base_id), name: r.base_name, url: r.url, key: r.publishable_key, tokens: [], powerKey: r.power_key || '' };
    if (r.group_token && !base.tokens.includes(r.group_token)) base.tokens.push(r.group_token);
  }
  return base;
};
