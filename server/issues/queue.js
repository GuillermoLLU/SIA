// La cola: qué issue toca coger. Solo las que nadie tiene (sin responsable
// en Remedy ni cogida en SIA), en el orden de la regla elegida.
//
// Una regla de priorización es una lista ordenada de criterios: el primero
// manda y los demás desempatan, por orden; a igualdad en todo, la más antigua
// primero. El catálogo de criterios es cerrado (CRITERIA; la base lo repite
// en platform.known_criteria()). La regla básica, la del equipo, va aquí; las
// demás las crea el equipo desde el Backlog y viven en la base (rules.js).

const SEVERITY = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

const monthOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const previousMonth = (d) => monthOf(new Date(d.getFullYear(), d.getMonth() - 1, 1));
// 0: del mes en curso · 1: del mes anterior · 2: de más atrás
const monthBucket = (i, now) => { const m = i.reported.slice(0, 7); return m === monthOf(now) ? 0 : m === previousMonth(now) ? 1 : 2; };
// el que más puntúa, primero
const most = (score) => (a, b, now) => score(b, now) - score(a, now);

export const CRITERIA = [
  { id: 'recent', label: 'Mes en curso o anterior, antes que lo atrasado', cmp: most((i, now) => (monthBucket(i, now) < 2 ? 1 : 0)) },
  { id: 'prio', label: 'Priorizadas por negocio', cmp: most((i) => (i.prio ? 1 : 0)) },
  { id: 'month', label: 'Mes de alta: en curso, anterior, más atrás', cmp: (a, b, now) => monthBucket(a, now) - monthBucket(b, now) },
  { id: 'severity', label: 'Criticidad, de mayor a menor', cmp: most((i) => SEVERITY[i.priority] || 0) },
  { id: 'critical', label: 'Críticas primero', cmp: most((i) => (i.priority === 'CRITICAL' ? 1 : 0)) },
  { id: 'high', label: 'Altas primero', cmp: most((i) => (i.priority === 'HIGH' ? 1 : 0)) },
  { id: 'medium', label: 'Medias primero', cmp: most((i) => (i.priority === 'MEDIUM' ? 1 : 0)) },
  { id: 'low', label: 'Bajas primero', cmp: most((i) => (i.priority === 'LOW' ? 1 : 0)) },
  { id: 'age', label: 'Más antiguas primero', cmp: (a, b) => a.reported.localeCompare(b.reported) },
  { id: 'sisu', label: 'SISU primero', cmp: most((i) => (i.sisu ? 1 : 0)) },
  { id: 'sga', label: 'SGA primero', cmp: most((i) => (i.sisu ? 0 : 1)) },
];

// La del equipo: priorizadas por negocio del mes en curso, luego las del mes
// anterior; después el resto del mes en curso por criticidad, luego el del
// anterior; y, con todo eso limpio, lo de más atrás.
export const BASIC_RULE = { id: 'basic', label: 'Regla básica', criteria: ['recent', 'prio', 'month', 'severity', 'age'], builtin: true };

const byId = new Map(CRITERIA.map((c) => [c.id, c]));

// El comparador de una lista de criterios (uno desconocido no cuenta).
export const orderBy = (criteria, now) => {
  const cmps = criteria.map((id) => byId.get(id)?.cmp).filter(Boolean);
  return (a, b) => {
    for (const cmp of cmps) { const d = cmp(a, b, now); if (d) return d; }
    return a.reported.localeCompare(b.reported);
  };
};

export const isFree = (i, claimed) => i.status === 'ASSIGNED' && !i.assignee && !claimed.has(i.id);

// Ids libres en el orden de los criterios (la base se queda con la primera que nadie tenga).
export const queue = (issues, claimed, now, criteria = BASIC_RULE.criteria) =>
  issues.filter((i) => isFree(i, claimed)).sort(orderBy(criteria, now)).map((i) => i.id);
