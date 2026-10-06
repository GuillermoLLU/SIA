// La mesa de cada persona: sus issues. Son suyas si es la responsable en
// Remedy (el asignado lleva su nombre) o si la ha cogido desde SIA.

const words = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().split(/[^A-Z0-9]+/).filter((w) => w.length > 1);

// «Ana López» es «ANA LOPEZ GARCIA»: todas las palabras de su nombre están en el asignado.
export const sameName = (assignee, name) => {
  const mine = words(name), theirs = new Set(words(assignee));
  return mine.length >= 2 && mine.every((w) => theirs.has(w));
};

export const deskOf = (issues, { id, name }, claims) => {
  const claimedByMe = new Set(claims.filter((c) => c.user_id === id).map((c) => c.issue_id));
  return issues.filter((i) => claimedByMe.has(i.id) || sameName(i.assignee, name))
    .map((i) => ({ ...i, claimed: claimedByMe.has(i.id) }));
};

// Lo que va en una fila (el detalle completo se pide aparte).
export const brief = ({ id, center, text, priority, status, reason, prio, sisu, reported, modified, resolved, claimed }) =>
  ({ id, center, text, priority, status, reason, prio, sisu, reported, modified, resolved, ...(claimed !== undefined ? { claimed } : {}) });
