// El recorrido de una issue en SIA (dominio, sin E/S): sus movimientos (cogida,
// devuelta a la cola, traspasada) y las notas internas del equipo, en una sola
// lista por orden de tiempo. Lo que la base devuelve en platform_issue_events y
// platform_issue_notes, unido para que la pantalla lo pinte de una vez.
//
//   movimiento → { at, type: 'claimed' | 'released' | 'transferred', by, from, to }
//   nota       → { at, type: 'note', id, kind: 'note' | 'transfer', by, text, edited }

const event = (e) => ({ at: e.happened_at, type: e.action, by: e.actor_name ?? null, from: e.from_name ?? null, to: e.to_name ?? null });
const note = (n) => ({ at: n.created_at, type: 'note', id: n.id, kind: n.kind || 'note', by: n.author_name ?? null, text: n.body, edited: n.edited_at ?? null });

export const timeline = (events = [], notes = []) =>
  [...events.map(event), ...notes.map(note)].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
