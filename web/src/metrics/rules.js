// Los umbrales con que las Métricas juzgan una cifra (sin DOM ni datos): cada
// número, en un solo sitio, para que todas las pestañas digan lo mismo.
export const DAY = 1440;
export const OLD_DAYS = 15;          // una pendiente con más de estos días envejece el backlog
export const IDLE_DAYS = 5;          // sin ningún cambio en estos días: parada
export const MIN_ISSUES = 30;        // con menos issues, una cifra dice poco: no se marca peor ni ordena
export const BETTER_MIN = 10;        // comparando dos lados: con menos, no se marca quién va mejor
export const OWNERS_SHARE = 0.8;     // «quién lleva cada módulo»: las personas que suman esta parte
export const WORSE = 0.15;           // un 15 % o más peor que la referencia
export const MTTR_TARGET = 69 * 60;  // el MTTR al que se aspira (minutos): la cifra, en verde por debajo y en rojo por encima (Resumen, Mes a mes)

// La tendencia de un KPI de un mes frente al anterior (Resumen, Mes a mes): { dir: 'up' | 'down' | 'eq' | null (sin el
// mes anterior o sin cifra), cls: el color de la flecha, value: el de la cifra ('good' | 'bad' | '') }. better: 'high'
// (mejor si sube) o 'low' (mejor si baja); sin él, sin color (entrar más no es ir peor). La cifra, frente a ref (la media
// del año fiscal): mejor o peor que ella, según better; o, frente a target, un umbral (el MTTR de la propia media):
// mejor por debajo de él. Sin ninguno, la cifra sin color.
export const monthTrend = (v, prev, { better = null, target = null, ref = null } = {}) => {
  const dir = v == null || prev == null ? null : v > prev ? 'up' : v < prev ? 'down' : 'eq';
  const vs = (a, b, high) => (a === b ? '' : (a > b) === high ? 'good' : 'bad');
  const value = v == null ? '' : target != null ? vs(v, target, false) : ref != null && better ? vs(v, ref, better === 'high') : '';
  const cls = !better || !dir || dir === 'eq' ? '' : (dir === 'up') === (better === 'high') ? 'good' : 'bad';
  return { dir, cls, value };
};

// Claramente peor que la referencia w: un WORSE o más y, en los porcentajes (w ≤ 1), al menos un punto
// (0,7 % frente a 0,5 % no se marca). better: 'low' (cuanto menos, mejor) o 'high'.
export const clearlyWorse = (v, w, better) => {
  if (!better || v == null || w == null) return false;
  return (better === 'low' ? v > w * (1 + WORSE) : v < w * (1 - WORSE)) && (w > 1 || Math.abs(v - w) >= 0.01);
};

// Variación de los últimos 90 días frente a los 90 anteriores: null si los dos tramos tienen menos de
// DELTA_MIN issues (no dice nada); si no, la proporción (+1 = el doble) y si sube o baja más de un 10 %.
const DELTA_MIN = 15, DELTA_FLAT = 0.1;
export const trendDelta = ({ now, prev }) => {
  if (prev < DELTA_MIN && now < DELTA_MIN) return null;
  const d = prev ? (now - prev) / prev : 1;
  return { d, dir: d > DELTA_FLAT ? 'up' : d < -DELTA_FLAT ? 'down' : 'flat' };
};

// Intensidad de color de una celda (0–100), según su valor frente al máximo: lineal, o suavizada para que
// lo pequeño se vea en mapas con un valor muy dominante. Las dos dejan en 0 lo que no tiene valor.
export const shade = (v, max) => (v ? Math.round(6 + 94 * v / max) : 0);
export const shadeSoft = (v, max) => (v ? Math.round(8 + 92 * Math.pow(v / max, 0.6)) : 0);
export const HOT = 50;   // desde esta intensidad, el texto va en claro

// Sin iniciar y fuera de plazo: abierta, nunca pasó a En curso y ya supera el SLA de inicio de su
// prioridad (sla en minutos; -1 sin SLA). age: minutos desde la apertura.
export const isLate = (open, ip, sla, age) => !!open && ip < 0 && sla >= 0 && age > sla;
