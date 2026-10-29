// Editar una regla de priorización (sin DOM): su nombre y sus criterios en
// orden, como chips que se añaden del catálogo, se quitan y se suben o bajan.
// Nada se muta: cada cambio devuelve una regla nueva.

export const NEW_RULE = { id: null, name: '', criteria: [] };

export const addCriterion = (rule, id) => (rule.criteria.includes(id) ? rule : { ...rule, criteria: [...rule.criteria, id] });
export const removeCriterion = (rule, id) => ({ ...rule, criteria: rule.criteria.filter((c) => c !== id) });
// delta: -1 sube, +1 baja; en el borde se queda como está
export const moveCriterion = (rule, id, delta) => {
  const i = rule.criteria.indexOf(id), j = i + delta;
  if (i < 0 || j < 0 || j >= rule.criteria.length) return rule;
  const c = [...rule.criteria];
  [c[i], c[j]] = [c[j], c[i]];
  return { ...rule, criteria: c };
};
// del catálogo, lo que aún no está en la regla
export const available = (catalog, rule) => catalog.filter((c) => !rule.criteria.includes(c.id));
export const labelOf = (catalog, id) => catalog.find((c) => c.id === id)?.label || id;
// una regla de la base, lista para editarla
export const draftOf = (rule) => ({ id: rule.id, name: rule.label, criteria: [...rule.criteria] });
