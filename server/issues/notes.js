// Las notas internas de una issue (dominio, sin E/S): quién puede editar qué.
// Una nota la edita solo quien la escribió y durante las 24 horas siguientes
// a escribirla; después queda como está. La base ya exige que sea propia;
// aquí se decide el plazo y el mensaje que ve la persona.

export const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

// note: { author_id, created_at } (como la devuelve platform_issue_notes).
// → null si se puede, o el motivo por el que no.
export const editProblem = (note, userId, now = new Date()) => {
  if (!note) return 'Esa nota ya no existe.';
  if (note.author_id !== userId) return 'Solo puedes editar tus propias notas.';
  if (now.getTime() - new Date(note.created_at).getTime() > EDIT_WINDOW_MS) return 'Una nota solo se puede editar durante las 24 horas siguientes a escribirla.';
  return null;
};
export const canEdit = (note, userId, now) => editProblem(note, userId, now) === null;
