// Las reglas del chat (sin DOM): qué chats del bridge cuentan aquí y cómo se
// reconcilian con los de esta vista cuando el bridge reemite su lista
// (multidispositivo).

// Los chats de una issue viven en su pantalla de trabajo, no en el Chat.
export const chatSessions = (list) => (list || []).filter((r) => !r.issue);

// Al cerrar la activa, la última que quede.
export const nextActive = (ids) => ids.at(-1) ?? null;

// La URL de un adjunto subido al bridge, por su nombre.
export const uploadUrl = (apiBase, name) => `${apiBase}/uploads/${encodeURIComponent(name)}`;

/* El bridge reemite la lista de chats en cada cambio (nuevo chat, muerte,
   handoff…). Reconciliar las sesiones de aquí con ella: para cada sesión con
   chat, qué hacer; y qué chats remotos nuevos crear como pasivos.
   Idempotente, y sin tocar las sesiones activas de ESTE dispositivo (su ciclo
   de vida lo llevan sus propios mensajes exit/gone).
   Acciones: remove (pasiva cuyo chat murió en otro lado), dead (perdimos el
   socket y el chat ya no está: muerte real), passive (perdimos el socket y lo
   tiene otro), reattach (perdimos el socket y está libre: volver solo), keep.
   hold: un chat lanzado AQUÍ cuyo `started` aún no llegó (viaja por otro
   socket que el broadcast): no se crean pasivas hasta resolverlo, o el propio
   chat recién creado aparecería como sesión fantasma.
   killed: los chats cerrados AQUÍ («Nuevo chat») que el bridge aún lista
   mientras muere su sesión: tampoco se recrean como pasivos; se devuelve podado
   a los que el bridge aún lista (los demás ya murieron del todo). */
export const reconcile = (locals, all, killed = new Set()) => {
  const list = chatSessions(all);
  const remote = new Map(list.map((r) => [r.id, r]));
  const actions = [];
  for (const s of locals) {
    if (!s.remoteId) continue; // la portada: no representa un chat
    const r = remote.get(s.remoteId);
    remote.delete(s.remoteId);
    if (!r) { actions.push({ id: s.id, do: s.passive ? 'remove' : s.linkLost ? 'dead' : 'keep' }); continue; }
    actions.push({ id: s.id, do: s.linkLost ? (r.attached ? 'passive' : 'reattach') : 'keep' });
  }
  const hold = locals.some((s) => s.launched && !s.remoteId && !s.passive);
  const create = hold ? [] : [...remote.values()].filter((r) => !killed.has(r.id));
  return { list, actions, create, hold, killed: new Set([...killed].filter((id) => list.some((r) => r.id === id))) };
};
