// Nuevas y resueltas por día de la semana (sin DOM): la media de los lunes, los martes... del periodo. Cada media divide
// entre todos los días de ese tipo del periodo, también los que no tuvieron actividad; sin ninguno, null.
const DAY = 1440;

// at: { in, out }, los instantes (minutos) de lo nuevo y lo resuelto; [d0, d1): el periodo, por días enteros;
// dowOf: el día de la semana de un instante (0 = lunes); keep: si cuenta ese día (por días sueltos). Devuelve uno por día de la semana: { days, in, out }.
export const weekdayAverages = (at, [d0, d1], dowOf, keep = () => true) => {
  const days = new Array(7).fill(0), totals = { in: new Array(7).fill(0), out: new Array(7).fill(0) };
  for (let d = d0; d < d1; d += DAY) if (keep(d)) days[dowOf(d)]++;
  for (const k of ['in', 'out']) for (const t of at[k]) totals[k][dowOf(t)]++;
  return days.map((n, w) => ({ days: n, in: n ? totals.in[w] / n : null, out: n ? totals.out[w] / n : null }));
};
