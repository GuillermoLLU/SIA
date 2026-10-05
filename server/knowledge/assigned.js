// Conocimiento asignado por la plataforma (dominio, sin E/S).
//
// La base de la instancia dice qué grupos (tokens) de qué bases de
// conocimiento tiene cada persona (platform_my_knowledge). Aquí se convierte
// eso en bases como las que usa el bridge ({ id, name, url, key, tokens,
// powerKey, enabled }) y se junta con las bases propias de la config local:
//   - un agente usa SOLO lo asignado;
//   - un admin usa lo asignado y, además, sus bases propias. Si una propia
//     apunta a la misma base que una asignada, se juntan: lo asignado manda en
//     nombre y conexión, y de la propia se añaden su clave de poder y sus
//     tokens extra (así un admin guarda la clave de poder de una base
//     asignada sin tocar la asignación).
// Las asignadas llevan managed: true y su id es «p-<id en la plataforma>».

export const assignedId = (baseId) => `p-${baseId}`;

// Filas de platform_my_knowledge → una base por base, con todos sus tokens.
export const toAssignedBases = (rows) => {
  const byId = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r?.base_id || !r.url || !r.publishable_key || !r.group_token) continue;
    const b = byId.get(r.base_id) || {
      id: assignedId(r.base_id), name: r.base_name, url: r.url, key: r.publishable_key,
      tokens: [], groups: [], powerKey: '', enabled: true, managed: true,
    };
    if (!b.tokens.includes(r.group_token)) { b.tokens.push(r.group_token); b.groups.push(r.group_name); }
    byId.set(r.base_id, b);
  }
  return [...byId.values()];
};

export const mergeBases = (assigned, local, { allowLocal }) => {
  const out = assigned.map((a) => ({ ...a, tokens: [...a.tokens], groups: [...a.groups] }));
  if (!allowLocal) return out;
  for (const l of local) {
    const a = out.find((x) => x.url === l.url);
    if (!a) { out.push({ ...l, managed: false }); continue; }
    a.powerKey = l.powerKey || a.powerKey;
    for (const t of l.tokens) if (!a.tokens.includes(t)) a.tokens.push(t);
  }
  return out;
};

// Lo que ve en la web quien no administra: nombres, sin tokens ni claves.
export const publicBase = (b) => ({ id: b.id, name: b.name, managed: !!b.managed, groups: b.groups || [], enabled: b.enabled !== false });
