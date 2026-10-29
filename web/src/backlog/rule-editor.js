// Editar una regla de priorización (sin DOM): su nombre y sus criterios en
// orden, como chips que pasan del catálogo a la regla y vuelven, y que dentro
// de la regla se colocan donde se quiera. Nada se muta: cada cambio devuelve
// una regla nueva.

export const NEW_RULE = { id: null, name: '', criteria: [] };

export const addCriterion = (rule, id) => (rule.criteria.includes(id) ? rule : { ...rule, criteria: [...rule.criteria, id] });
export const removeCriterion = (rule, id) => ({ ...rule, criteria: rule.criteria.filter((c) => c !== id) });
// Colocar un criterio en el puesto `index` (contado sin él, por si ya estaba);
// fuera de rango, al principio o al final.
export const placeCriterion = (rule, id, index) => {
  const rest = rule.criteria.filter((c) => c !== id);
  const at = Math.max(0, Math.min(index, rest.length));
  return { ...rule, criteria: [...rest.slice(0, at), id, ...rest.slice(at)] };
};
// del catálogo, lo que aún no está en la regla
export const available = (catalog, rule) => catalog.filter((c) => !rule.criteria.includes(c.id));
export const labelOf = (catalog, id) => catalog.find((c) => c.id === id)?.label || id;
// una regla de la base, lista para editarla
export const draftOf = (rule) => ({ id: rule.id, name: rule.label, criteria: [...rule.criteria] });
