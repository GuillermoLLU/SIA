// Lo que entra y lo que se cierra (sin DOM): los tramos del periodo, lo cerrado dentro de él, el libro mayor
// mes a mes (o día a día) y el último mes completo frente al anterior. m: el modelo (model.js).
import { OLD_DAYS, DAY } from './rules.js';

// los meses que toca el periodo
export const monthsIn = (S) => Array.from({ length: S.to - S.from + 1 }, (_, j) => S.from + j);
// cuándo se resolvió una issue (minutos), o null si sigue abierta
export const resolvedAt = (m) => (i) => (!m.OPEN[i] && m.C.res[i] >= 0 ? m.C.res[i] : null);
export const startedAt = (m) => (i) => (m.C.ip[i] >= 0 ? m.C.rep[i] + m.C.ip[i] : null);

// Los tramos de la tabla mes a mes: los meses del periodo (el primero y el último, solo la parte que cae dentro) o,
// si el periodo es de un mes o menos, sus días.
const flowUnits = (m) => {
  const { S, LASTM } = m;
  if (!m.daily()) return monthsIn(S).map((k) => ({ label: m.monthName(k) + (k === LASTM ? '*' : ''), from: Math.max(m.minuteOf(k), S.d0), to: Math.min(m.minuteOf(k + 1), S.d1), f: `month:${k}` }));
  return Array.from({ length: Math.round((S.d1 - S.d0) / DAY) }, (_, j) => ({ label: m.dayName(S.d0 + j * DAY), from: S.d0 + j * DAY, to: S.d0 + (j + 1) * DAY }));
};

// lo cerrado dentro del periodo, por lado, se abriera cuando se abriera
export const closedInPeriod = (m) => {
  const { d0, d1 } = m.S, resAt = resolvedAt(m);
  return m.bySide(m.today()).map((l) => l.filter((i) => { const r = resAt(i); return r != null && r >= d0 && r < d1; }));
};

// El libro mayor de cada lado: por tramo, lo recibido (in) y qué ha sido de ello (closed, still, same: cerrado en el
// propio tramo), lo resuelto en el tramo (out, prev: de tramos anteriores), y lo que quedaba abierto al cerrarlo (open,
// old: con más de OLD_DAYS). Si el periodo acaba antes de la foto, un tramo más hasta hoy, para que las resueltas sumen
// las ya cerradas y las pendientes acaben en lo que sigue abierto. La última fila, el total (open y old, los del cierre).
export const ledger = (m, A) => {
  const { C, OPEN, SNAP } = m, T = m.bySide(A), units = flowUnits(m), resAt = resolvedAt(m), OLD = OLD_DAYS * DAY;
  const end = units.length ? units[units.length - 1].to : 0;
  if (end <= SNAP) units.push({ label: 'Después del periodo, hasta hoy', from: end, to: Infinity, after: true });
  const per = [0, 1].map((k) => {
    const rows = units.map(() => ({ in: 0, closed: 0, still: 0, same: 0, out: 0, prev: 0, open: 0, old: 0 }));
    for (const i of T[k]) {
      const r = resAt(i);
      units.forEach((u, j) => {
        const x = rows[j];
        if (C.rep[i] >= u.from && C.rep[i] < u.to) { x.in++; if (OPEN[i]) x.still++; else x.closed++; if (r != null && r < u.to) x.same++; }
        if (r != null && r >= u.from && r < u.to) { x.out++; if (C.rep[i] < u.from) x.prev++; }
        if (C.rep[i] < u.to && (r == null || r >= u.to)) { x.open++; if (Math.min(u.to, SNAP) - C.rep[i] > OLD) x.old++; }
      });
    }
    const tot = rows.reduce((a, x) => ({ in: a.in + x.in, closed: a.closed + x.closed, still: a.still + x.still, same: a.same + x.same, out: a.out + x.out, prev: a.prev + x.prev }), { in: 0, closed: 0, still: 0, same: 0, out: 0, prev: 0 });
    const last = rows[rows.length - 1] || { open: 0, old: 0 };
    return [...rows, { ...tot, open: last.open, old: last.old }];
  });
  return { units, per, day: m.daily() };
};

// Último mes completo del periodo frente al anterior: [mes, { n, v } por lado] o null. Las del mes anterior pueden
// quedar fuera del periodo.
export const monthVsPrev = (m) => {
  const { MONTH } = m;
  let lastFull = m.monthAt(m.S.d1 - 1);
  while (lastFull >= 1 && !m.fullMonth(lastFull)) lastFull--;
  if (lastFull < 1 || !m.fullMonth(lastFull)) return null;
  return [lastFull, m.bySide(m.today()).map((l) => {
    let a = 0, b = 0;
    for (const i of l) { if (MONTH[i] === lastFull) a++; else if (MONTH[i] === lastFull - 1) b++; }
    return { n: a + b, v: b ? (a - b) / b : null };
  })];
};
