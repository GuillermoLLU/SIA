// Dominio del tablero de issues (sin DOM). Las fechas vienen como texto local
// «YYYY-MM-DD HH:MM»; «now» es la hora de la foto de datos.

export const SEVERITY = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
export const SEVERITY_ES = { CRITICAL: 'Crítica', HIGH: 'Alta', MEDIUM: 'Media', LOW: 'Baja' };
// Plazo para empezar a gestionarla, solo el que ha explicado el equipo.
export const FIRST_TOUCH_MIN = { CRITICAL: 15, HIGH: 120 };

export const at = (s) => new Date(s.replace(' ', 'T'));
export const minutesSince = (s, now) => (now - at(s)) / 60000;
export const monthOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
export const dayOf = (d) => `${monthOf(d)}-${String(d.getDate()).padStart(2, '0')}`;

export const unassigned = (i) => i.status === 'ASSIGNED' && !i.assignee;

// Primera gestión: solo cuenta mientras nadie la ha cogido.
export const firstTouch = (i, now) => {
  const limit = FIRST_TOUCH_MIN[i.priority];
  if (!limit || !unassigned(i)) return null;
  const left = limit - minutesSince(i.reported, now);
  return { left, late: left < 0 };
};

const bySeverityThenAge = (a, b) => (SEVERITY[b.priority] || 0) - (SEVERITY[a.priority] || 0) || a.reported.localeCompare(b.reported);

// Columnas por estado, cada una ya ordenada: arriba, lo que toca primero.
export const columns = (now) => [
  { key: 'new', title: 'Sin asignar', hint: 'Fuera de plazo primero; luego críticas y altas por plazo; después, lo más antiguo.',
    test: unassigned,
    sort: (a, b) => {
      const fa = firstTouch(a, now), fb = firstTouch(b, now);
      const rank = (f) => (f ? (f.late ? 0 : 1) : 2);
      return rank(fa) - rank(fb) || (fa && fb ? fa.left - fb.left : 0) || (b.prio - a.prio) || bySeverityThenAge(a, b);
    } },
  { key: 'assigned', title: 'Asignadas', hint: 'Priorizadas por negocio arriba; luego por criticidad y antigüedad.',
    test: (i) => i.status === 'ASSIGNED' && !!i.assignee, sort: (a, b) => (b.prio - a.prio) || bySeverityThenAge(a, b) },
  { key: 'doing', title: 'En curso', hint: 'Por criticidad y antigüedad.',
    test: (i) => i.status === 'IN_PROGRESS', sort: bySeverityThenAge },
  { key: 'pending', title: 'Pendientes', hint: 'Las que llevan más tiempo sin moverse, arriba.',
    test: (i) => i.status === 'PENDING', sort: (a, b) => a.modified.localeCompare(b.modified) },
  { key: 'resolved', title: 'Resueltas', hint: 'Resueltas sin cerrar; las más recientes arriba.',
    test: (i) => i.status === 'RESOLVED', sort: (a, b) => b.resolved.localeCompare(a.resolved) },
];

// Filtro: alcance (mes en curso o anteriores, opcionalmente un mes), origen y texto ya normalizado.
export const matches = (i, { scope, month, origin, q }, current, fold) => {
  const m = i.reported.slice(0, 7);
  if (scope === 'current' ? m !== current : m === current) return false;
  if (scope === 'previous' && month && m !== month) return false;
  if (origin === 'sga' && i.sisu) return false;
  if (origin === 'sisu' && !i.sisu) return false;
  if (origin === 'prio' && !i.prio) return false;
  return !q || fold(`${i.id} ${i.center} ${i.text}`).includes(q);
};

// Abiertas por mes de los meses anteriores al actual, en orden.
export const previousMonths = (issues, current) => {
  const counts = {};
  for (const i of issues) { const m = i.reported.slice(0, 7); if (m !== current) counts[m] = (counts[m] || 0) + 1; }
  return Object.keys(counts).sort().map((m) => ({ month: m, count: counts[m] }));
};

// Issues de cada centro, para ver de un vistazo si ya lo ha reclamado antes.
export const byCenter = (issues) => {
  const map = new Map();
  for (const i of issues) if (i.center) map.set(i.center, [...(map.get(i.center) || []), i]);
  return map;
};

export const summary = (list, all, now) => {
  const open = list.filter((i) => i.status !== 'RESOLVED');
  const waiting = list.filter(unassigned);
  return {
    unassigned: waiting.length,
    late: waiting.filter((i) => firstTouch(i, now)?.late).length,
    critical: open.filter((i) => i.priority === 'CRITICAL').length,
    prio: open.filter((i) => i.prio).length,
    resolvedToday: all.filter((i) => i.resolved.startsWith(dayOf(now))).length,
  };
};

export const duration = (m) => (m < 60 ? `${Math.round(m)} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`);
