// Lo que hay detrás de las piezas de pantalla (sin DOM): las series y escalas de las gráficas, el orden y el
// reparto de las fichas y los recuentos de los mapas de calor y las tablas de recuentos.
import { MIN_ISSUES, DAY } from './rules.js';
import { MONTHS } from './format.js';

export const LINE_MIN = 10;   // un tramo (mes o día) con menos issues no se pinta en las líneas: su cifra dice poco
const AIR = 1.1;              // la escala deja un 10 % de aire por encima del máximo

// Las series de una gráfica de evolución en el periodo que se mira, una por lado (cos): por días si el periodo es de un
// mes o menos (m.daily()), si no por meses (del S.from al S.to). f(indicadores del tramo) da el valor, o null con pocas
// issues. → { daily, n: tramos, per: una lista de n valores por lado }
export const periodSeries = (m, A, f, cos) => {
  const { S, C } = m, daily = m.daily();
  const n = daily ? Math.round((S.d1 - S.d0) / DAY) : S.to - S.from + 1;
  const unit = daily ? (i) => Math.floor((C.rep[i] - S.d0) / DAY) : (i) => m.MONTH[i] - S.from;
  const per = cos.map((k) => {
    const mt = Array.from({ length: n }, () => []);
    for (const i of A) { const u = unit(i); if (m.SIDE[i] === k && u >= 0 && u < n) mt[u].push(i); }
    return mt.map((l) => (l.length >= LINE_MIN ? f(m.stats(l)) : null));
  });
  return { daily, n, per };
};

// Las etiquetas de un eje de meses (del mes `from` al `to`, numerados desde el enero de `start`): con más de 12, una
// de cada tantas contando desde la última, para que salga siempre el último mes y ninguna se monte en otra. Si el eje
// pasa de un año a otro, bajo la primera etiqueta de cada año va su año. → [{ k, label, sub }]
export const monthTicks = (from, to, start) => {
  const step = Math.ceil((to - from + 1) / 12), years = Math.floor(from / 12) !== Math.floor(to / 12), out = [];
  for (let k = from + ((to - from) % step); k <= to; k += step) {
    const prev = out[out.length - 1], y = Math.floor(k / 12);
    out.push({ k, label: MONTHS[k % 12], sub: years && (!prev || Math.floor(prev.k / 12) !== y) ? start + y : null });
  }
  return out;
};

// Lo mismo para un eje de los n días del periodo (k: el día, desde S.d0): el número del día y, bajo la primera
// etiqueta de cada mes, el mes.
export const dayTicks = (m, n) => {
  const step = Math.ceil(n / 12), out = [];
  let month = -1;
  for (let k = (n - 1) % step; k < n; k += step) {
    const d = new Date(m.BASE + (m.S.d0 + k * DAY) * 6e4);
    out.push({ k, label: String(d.getUTCDate()), sub: d.getUTCMonth() !== month ? MONTHS[d.getUTCMonth()] : null });
    month = d.getUTCMonth();
  }
  return out;
};

// La escala de una gráfica de n puntos en un dibujo de W×H con márgenes (L, R, T, B): el máximo con aire y dónde
// cae cada punto (x) y cada valor (y).
export const lineScale = (values, n, { W, H, L, R, T, B }) => {
  const max = Math.max(1e-9, ...values.filter((v) => v != null)) * AIR;
  return { max, x: (i) => L + i * (W - L - R) / Math.max(n, 1), y: (v) => T + (H - T - B) * (1 - v / max) };
};
// La del día en 24 horas: cada hora en el centro de su franja (x) o en su borde (edge), y las franjas de los
// turnos (de la hora `from` a `to`).
export const dayScale = (series, { W, H, L, R, T, B }) => {
  const max = Math.max(1, ...series.flatMap((s) => s.v)) * AIR, span = W - L - R, edge = (h) => L + h * span / 24;
  return { max, x: (h) => edge(h + 0.5), edge, y: (v) => T + (H - T - B) * (1 - v / max), band: (from, to) => ({ x: edge(from), width: (to - from) * span / 24 }) };
};

// El orden de una ficha: por la columna elegida (key) y sentido (dir); al ordenar por cómo se atiende (rated), lo
// que tiene menos de MIN_ISSUES va al final, porque su cifra dice poco; a igualdad, lo que más issues tiene.
export const scorecardOrder = (key, dir, rated) => {
  const few = (r) => (rated && r.n < MIN_ISSUES ? 1 : 0);
  return (a, b) => few(a) - few(b) || (key(a) - key(b)) * dir || b.n - a.n;
};
// Qué filas se ven: lo marcado (picked) va primero y siempre a la vista, aunque estuviera entre las de más allá de
// top; abierta (open), todas. rest: las que quedan fuera (para la fila «Resto»).
export const shownRows = (data, picked, top, open) => {
  const chosen = data.filter(picked), any = chosen.length > 0;
  const ordered = any ? [...chosen, ...data.filter((r) => !picked(r))] : data;
  const n = Math.max(top, chosen.length), shown = open ? ordered : ordered.slice(0, n);
  return { shown, any, rest: open ? [] : ordered.slice(n), more: data.length > n };
};

// Recuentos de un mapa de calor: por cada valor de la fila (R) y de la columna (Cc), cuántas issues de cada lado.
// keysR/keysC: los valores de cada issue en cada dimensión (varios, si es múltiple).
export const heatCounts = (R, Cc, list, keysR, keysC, SIDE) => {
  const ri = new Map(R.map((x, i) => [x.k, i])), ci = new Map(Cc.map((x, i) => [x.k, i])), mt = R.map(() => Cc.map(() => [0, 0, 0]));
  for (const i of list) for (const a of keysR(i)) { const r = ri.get(a); if (r == null) continue; for (const b of keysC(i)) { const c = ci.get(b); if (c != null) mt[r][c][SIDE[i]]++; } }
  const tot = (t) => t[0] + t[1] + t[2];
  return { mt, max: Math.max(1, ...mt.flat().map(tot)) };
};
// Recuentos de una tabla de condiciones: cuántas issues de cada lado cumplen cada fila y cada columna (cnt) y cada
// fila (rt); y, para el color, el máximo de cada bloque de filas (groupMax: fila → máximo de su bloque).
export const matrixCounts = (rows, cols, list, SIDE) => {
  const cnt = rows.map(() => cols.map(() => [0, 0, 0])), rt = rows.map(() => [0, 0, 0]);
  for (const i of list) {
    for (let r = 0; r < rows.length; r++) {
      if (!rows[r].test(i)) continue;
      rt[r][SIDE[i]]++;
      for (let c = 0; c < cols.length; c++) if (cols[c].test(i)) cnt[r][c][SIDE[i]]++;
    }
  }
  return { cnt, rt };
};
export const groupMax = (rowsDef, cnt, indexOf) => {
  const tot = (t) => t[0] + t[1] + t[2], groups = [], out = new Map();
  let g = -1;
  for (const r of rowsDef) { if (r.head) { g++; continue; } if (g < 0) g = 0; (groups[g] ||= []).push(r); }
  for (const rows of groups.filter(Boolean)) { const max = Math.max(1, ...rows.flatMap((r) => cnt[indexOf(r)].map(tot))); for (const r of rows) out.set(r, max); }   // un bloque sin filas no cuenta
  return out;
};
