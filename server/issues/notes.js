// Las notas de una issue (dominio, sin E/S): qué se puede escribir y quién
// puede editar qué. Una nota la edita solo quien la escribió y durante las 24
// horas siguientes a escribirla; después queda como está. La base ya exige que
// sea propia (y esconde las privadas de los demás); aquí se decide el plazo y
// el mensaje que ve la persona.

export const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;

// Quién ve una nota: privada (solo quien la escribió), interna (el equipo) o
// pública (también el centro, cuando SIA envíe por SIGLO; hasta entonces se
// queda en SIA). Sin decirlo, interna.
const VISIBILITIES = ['private', 'internal', 'public'];
// Las etiquetas del método del equipo, las mismas que pone en Remedy delante de
// la nota («[ANALISIS] …»). Opcionales.
const NOTE_TAGS = ['SITUACION INICIAL', 'ANTECEDENTES', 'ANALISIS', 'DIAGNOSTICO', 'ACT', 'INF', 'ESCALADO', 'CALLOK', 'CALLKO', 'SERVREST', 'RESOLUCION'];

// Lo que llega para añadir una nota → { body, visibility, tag } o { error }.
export const noteInput = ({ body, visibility = 'internal', tag = null } = {}) => {
  if (typeof body !== 'string' || !body.trim()) return { error: 'Escribe la nota.' };
  if (!VISIBILITIES.includes(visibility)) return { error: 'Una nota es privada, interna o pública.' };
  if (tag && !NOTE_TAGS.includes(tag)) return { error: 'Esa etiqueta no existe.' };
  return { body: body.trim(), visibility, tag: tag || null };
};

// note: { author_id, created_at } (como la devuelve platform_issue_notes).
// → null si se puede, o el motivo por el que no.
export const editProblem = (note, userId, now = new Date()) => {
  if (!note) return 'Esa nota ya no existe.';
  if (note.author_id !== userId) return 'Solo puedes editar tus propias notas.';
  if (now.getTime() - new Date(note.created_at).getTime() > EDIT_WINDOW_MS) return 'Una nota solo se puede editar durante las 24 horas siguientes a escribirla.';
  return null;
};
export const canEdit = (note, userId, now) => editProblem(note, userId, now) === null;
