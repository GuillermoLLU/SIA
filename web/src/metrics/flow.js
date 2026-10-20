// Lo que entra y lo que se cierra (sin DOM): los tramos del periodo, lo cerrado dentro de él, el libro mayor
// mes a mes (o día a día) y el último mes completo frente al anterior. m: el modelo (model.js).
import { MONTHS } from './format.js';
import { OLD_DAYS, DAY } from './rules.js';

export const monthsIn = (S) => Array.from({ length: S.to - S.from + 1 }, (_, j) => S.from + j);
// minutos desde el 1 de enero de un día
const minOf = (m, mo, d = 1) => (Date.UTC(m.data.meta.year, mo, d) - m.BASE) / 6e4;
// cuándo se resolvió una issue (minutos), o null si sigue abierta
export const resolvedAt = (m) => (i) => (!m.OPEN[i] && m.C.res[i] >= 0 ? m.C.res[i] : null);
export const startedAt = (m) => (i) => (m.C.ip[i] >= 0 ? m.C.rep[i] + m.C.ip[i] : null);

// Los tramos de la tabla mes a mes: los meses del periodo o, si es un solo mes, sus días (hasta la foto).
export const flowUnits = (m) => {
  const { S, LASTM } = m;
  if (S.from !== S.to) return monthsIn(S).map((k) => ({ label: MONTHS[k] + (k === LASTM ? '*' : ''), from: minOf(m, k), to: minOf(m, k + 1), f: `month:${k}` }));
  const y = m.data.meta.year;
  const last = Math.min(new Date(Date.UTC(y, S.from + 1, 0)).getUTCDate(), S.from === LASTM ? new Date(m.BASE + m.SNAP * 6e4).getUTCDate() : 31);
  return Array.from({ length: last }, (_, j) => ({ label: `${j + 1} ${MONTHS[S.from]}`, from: minOf(m, S.from, j + 1), to: minOf(m, S.from, j + 2) }));
};

// lo cerrado dentro del periodo, por lado, se abriera cuando se abriera
export const closedInPeriod = (m) => {
  const from = minOf(m, m.S.from), to = minOf(m, m.S.to + 1), resAt = resolvedAt(m);
  return m.bySide(m.today()).map((l) => l.filter((i) => { const r = resAt(i); return r != null && r >= from && r < to; }));
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
  return { units, per, day: m.S.from === m.S.to };
};

// Último mes completo del periodo frente al anterior: [mes, { n, v } por lado] o null. Las del mes anterior pueden
// quedar fuera del periodo.
export const monthVsPrev = (m) => {
  const { S, LASTM, MONTH } = m, lastFull = S.to === LASTM ? LASTM - 1 : S.to;
  if (lastFull < 1 || lastFull < S.from) return null;
  return [lastFull, m.bySide(m.today()).map((l) => {
    let a = 0, b = 0;
    for (const i of l) { if (MONTH[i] === lastFull) a++; else if (MONTH[i] === lastFull - 1) b++; }
    return { n: a + b, v: b ? (a - b) / b : null };
  })];
};
