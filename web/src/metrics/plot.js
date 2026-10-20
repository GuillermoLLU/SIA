// Lo que hay detrás de las piezas de pantalla (sin DOM): las series y escalas de las gráficas, el orden y el
// reparto de las fichas y los recuentos de los mapas de calor y las tablas de recuentos.
import { MIN_ISSUES } from './rules.js';

export const LINE_MIN = 10;   // un mes con menos issues no se pinta en las líneas: su cifra dice poco
const AIR = 1.1;              // la escala deja un 10 % de aire por encima del máximo

// Las series de una gráfica por mes, una por lado (cos): f(indicadores del mes), o null con pocas issues.
export const monthSeries = (m, A, f, cos) => cos.map((k) => {
  const mt = Array.from({ length: m.LASTM + 1 }, () => []);
  for (const i of A) if (m.SIDE[i] === k) mt[m.MONTH[i]].push(i);
  return mt.map((l) => (l.length >= LINE_MIN ? f(m.stats(l)) : null));
});

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
