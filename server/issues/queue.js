// La cola: qué issue toca coger. Solo las que nadie tiene (sin responsable
// en Remedy ni cogida en SIA), en el orden de la regla elegida.
//
// Regla básica (la del equipo): priorizadas por negocio del mes en curso,
// luego las del mes anterior; después el resto del mes en curso por
// criticidad, luego el del mes anterior; y, con todo eso limpio, lo de más
// atrás. Dentro de cada grupo, a igualdad, la más antigua primero.

const SEVERITY = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

const monthOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
const previousMonth = (d) => monthOf(new Date(d.getFullYear(), d.getMonth() - 1, 1));

export const isFree = (i, claimed) => i.status === 'ASSIGNED' && !i.assignee && !claimed.has(i.id);

const basic = (now) => {
  const current = monthOf(now), previous = previousMonth(now);
  const group = (i) => {
    const m = i.reported.slice(0, 7);
    if (m === current) return i.prio ? 0 : 2;
    if (m === previous) return i.prio ? 1 : 3;
    return 4;
  };
  return (a, b) => group(a) - group(b) || (b.prio - a.prio) || (SEVERITY[b.priority] || 0) - (SEVERITY[a.priority] || 0) || a.reported.localeCompare(b.reported);
};

export const RULES = [{ id: 'basic', label: 'Regla básica', order: basic }];

// Ids libres en el orden de la regla (la base se queda con la primera que nadie tenga).
export const queue = (issues, claimed, now, ruleId = 'basic') => {
  const rule = RULES.find((r) => r.id === ruleId) || RULES[0];
  return issues.filter((i) => isFree(i, claimed)).sort(rule.order(now)).map((i) => i.id);
};
