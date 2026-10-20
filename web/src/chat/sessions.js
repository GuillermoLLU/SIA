// Las reglas de las pestañas de chat (sin DOM): qué chats del bridge van en
// pestañas, cómo se reconcilian con las de aquí cuando el bridge reemite su
// lista (multidispositivo), los adjuntos y el arrastre de pestañas.

// Los chats de una issue viven en su pantalla de trabajo, no en las pestañas.
export const chatSessions = (list) => (list || []).filter((r) => !r.issue);

export const defaultLabel = (id) => `Chat ${id}`;

// El chrome del chat (pestañas, "+", Skills) solo con un chat de verdad: en el
// arranque solo se ve el selector, invitando a abrir el primero.
export const chromeVisible = (sessions) => sessions.some((s) => s.launched || s.passive) || sessions.length > 1;

// Al cerrar la activa, la última que quede.
export const nextActive = (ids) => ids.at(-1) ?? null;

export const isImageName = (n) => /\.(png|jpe?g|gif|webp|svg|bmp|ico)$/i.test(n || '');
export const fileExt = (name) => (name.split('.').pop() || 'file').toUpperCase().slice(0, 5);
// Un adjunto tal como lo da el bridge → con su URL y si es imagen.
export const toAsset = (a, apiBase) => ({ ...a, url: `${apiBase}/uploads/${encodeURIComponent(a.name)}`, isImage: isImageName(a.name) });
// Los adjuntos que el bridge conoce y aquí faltan (los subió otro dispositivo).
// Nunca se quita ninguno: un adjunto no se borra.
export const missingAssets = (have, list) => (list || []).filter((a) => !have.some((x) => x.name === a.name));

/* El bridge reemite la lista de chats en cada cambio (nuevo chat, muerte,
   rename, handoff…). Reconciliar las pestañas de aquí con ella: para cada
   pestaña con chat, qué hacer; y qué chats remotos nuevos crear como pasivos.
   Idempotente, y sin tocar las sesiones activas de ESTE dispositivo (su ciclo
   de vida lo llevan sus propios mensajes exit/gone).
   Acciones: remove (pasiva cuyo chat murió en otro lado), dead (perdimos el
   socket y el chat ya no está: muerte real), passive (perdimos el socket y lo
   tiene otro), reattach (perdimos el socket y está libre: volver solo), keep.
   Además, label/color si en el otro dispositivo se renombró una pasiva, y
   assets si hay adjuntos nuevos.
   hold: un chat lanzado AQUÍ cuyo `started` aún no llegó (viaja por otro
   socket que el broadcast): no se crean pasivas hasta resolverlo, o el propio
   chat recién creado aparecería como pestaña fantasma. */
export const reconcile = (locals, all) => {
  const list = chatSessions(all);
  const remote = new Map(list.map((r) => [r.id, r]));
  const actions = [];
  for (const s of locals) {
    if (!s.remoteId) continue; // selector inicial: no representa un chat
    const r = remote.get(s.remoteId);
    remote.delete(s.remoteId);
    if (!r) { actions.push({ id: s.id, do: s.passive ? 'remove' : s.linkLost ? 'dead' : 'keep' }); continue; }
    const act = { id: s.id, do: s.linkLost ? (r.attached ? 'passive' : 'reattach') : 'keep', assets: missingAssets(s.assets, r.assets) };
    if (s.passive && !s.linkLost) { // reflejar rename/color hechos en el otro dispositivo
      if (r.label && r.label !== s.label) act.label = r.label;
      if ((r.color || null) !== s.color) act.color = r.color || null;
    }
    actions.push(act);
  }
  const hold = locals.some((s) => s.launched && !s.remoteId && !s.passive);
  return { list, actions, create: hold ? [] : [...remote.values()], hold };
};

// Arrastrar una pestaña: delante de la primera cuyo centro queda a la derecha
// del cursor; null, al final. `boxes`: [{ el, left, width }] de las demás.
export const dropBefore = (x, boxes) => {
  let closest = { offset: Number.NEGATIVE_INFINITY, el: null };
  for (const b of boxes) {
    const offset = x - b.left - b.width / 2;
    if (offset < 0 && offset > closest.offset) closest = { offset, el: b.el };
  }
  return closest.el;
};
