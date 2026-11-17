// El histórico de una issue en SIA (dominio, sin E/S): sus movimientos (cogida,
// devuelta a la cola, traspasada) y las notas del equipo, en una sola
// lista por orden de tiempo. Lo que la base devuelve en platform_issue_events y
// platform_issue_notes, unido para que la pantalla lo pinte de una vez.
//
//   movimiento → { at, type: 'claimed' | 'released' | 'transferred', by, from, to, text? }
//   nota       → { at, type: 'note', id, kind: 'note' | 'transfer', by, byId, text, edited,
//                  visibility: 'private' | 'internal' | 'public', tag (ANALISIS, CALLOK… o null) }
// El motivo de un traspaso (la nota 'transfer' escrita en el mismo instante por
// la misma persona) va dentro del movimiento como `text`: una sola entrada.

const event = (e) => ({ at: e.happened_at, type: e.action, by: e.actor_name ?? null, from: e.from_name ?? null, to: e.to_name ?? null });
const note = (n) => ({ at: n.created_at, type: 'note', id: n.id, kind: n.kind || 'note', by: n.author_name ?? null, byId: n.author_id ?? null, text: n.body, edited: n.edited_at ?? null, visibility: n.visibility || 'internal', tag: n.tag ?? null });
const moment = (x) => `${x.by}|${new Date(x.at).getTime()}`;

export const timeline = (events = [], notes = []) => {
  const all = notes.map(note);
  const motives = new Map(); // quién|instante → el motivo de su traspaso (el primero)
  const loose = [];
  for (const n of all) (n.kind === 'transfer' && !motives.has(moment(n)) ? motives.set(moment(n), n) : loose.push(n));
  const moves = events.map(event).map((m) => {
    const motive = m.type === 'transferred' ? motives.get(moment(m)) : undefined;
    if (!motive) return m;
    motives.delete(moment(m));
    return { ...m, text: motive.text };
  });
  // un motivo sin su movimiento (otra hora u otra persona) se queda como nota
  return [...moves, ...loose, ...motives.values()].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
};
