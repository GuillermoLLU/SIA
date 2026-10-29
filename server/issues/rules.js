// Las reglas de priorización, que viven en la base (platform_list_rules): la
// básica, de serie, y las que el equipo crea desde el Backlog. Si la base aún
// no tiene la básica (SQL sin ejecutar), vale la de código (queue.js). Y qué
// debe cumplir una regla para guardarse.
import { BASIC_RULE, CRITERIA } from './queue.js';

const NAME_MAX = 60;
const KNOWN = new Set(CRITERIA.map((c) => c.id));

// → null si vale; si no, qué falla, en palabras para la pantalla
export const ruleProblem = ({ name, criteria } = {}) => {
  if (typeof name !== 'string' || !name.trim()) return 'Ponle un nombre a la regla.';
  if (name.trim().length > NAME_MAX) return `El nombre no puede pasar de ${NAME_MAX} caracteres.`;
  if (!Array.isArray(criteria) || !criteria.length) return 'Añade al menos un criterio.';
  if (criteria.some((c) => !KNOWN.has(c))) return 'Hay un criterio que no existe.';
  if (new Set(criteria).size !== criteria.length) return 'Un criterio no se repite.';
  return null;
};

const fromDb = (r) => ({ id: r.id, label: r.name, criteria: r.criteria, builtin: !!r.builtin });

// La básica primero y, detrás, las del equipo por nombre (así las da la base).
export const loadRules = async (platform, jwt) => {
  const rules = (await platform.rpc(jwt, 'platform_list_rules')).map(fromDb);
  return rules.some((r) => r.builtin) ? rules : [BASIC_RULE, ...rules];
};
// La pedida o, si no existe (o se pide 'basic'), la básica.
export const ruleById = (rules, id) => rules.find((r) => r.id === id) || rules.find((r) => r.builtin) || rules[0];
