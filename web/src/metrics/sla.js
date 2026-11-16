// SLA y calidad (sin DOM): cuándo pasan a En curso por prioridad, los indicadores con el SLA de cada prioridad y,
// comparando, lo de cada lado. m: el modelo (model.js).
import { START_LIMITS } from './model.js';
import { perHead } from './resolution.js';

// Cuándo pasan a En curso, por prioridad y lado (P): cada fila repartida entre los tramos de paso a En curso (c) y
// hasta qué tramo (lim) se está dentro del plazo de esa prioridad. La última fila, todas. max: la parte mayor.
export const startBlocks = (m, list, P) => {
  const { C, PRIOS } = m;
  const line = (label, l, f, p, k) => {
    const c = new Array(9).fill(0);
    for (const i of l) c[m.DIMS.ini.get(i)]++;
    return { label, f, k, n: l.length, c, s: m.stats(l), lim: p == null ? -1 : START_LIMITS.indexOf(m.SLA[p]) };
  };
  const blocks = [...PRIOS.filter((p) => list.some((i) => C.pr[i] === p)).map((p) => P.map((l, k) => line(m.slaLabel(p), l.filter((i) => C.pr[i] === p), `pr:${p}`, p, k))),
    P.map((l, k) => line('Todas', l, null, null, k))];
  const max = Math.max(0.01, ...blocks.slice(0, -1).flat().flatMap((x) => x.c.map((v) => v / (x.n || 1))));
  return { blocks, max };
};

// stats con el % dentro del SLA (byP) y las issues (nP) de cada prioridad
export const slaStats = (m) => (l) => {
  const s = m.stats(l);
  s.byP = []; s.nP = [];
  for (const p of m.PRIOS) { const t = m.stats(l.filter((i) => m.C.pr[i] === p)); s.byP[p] = t.sla; s.nP[p] = t.n; }
  return s;
};
// comparando: slaStats de cada lado de una lista, con las issues por persona (vol, H)
export const slaPair = (m, lists) => {
  const H = perHead(m), st = slaStats(m);
  return [0, 1].map((k) => { const s = st(lists[k]); s.vol = s.n / H[k]; s.H = H[k]; return s; });
};
// comparando empresas: los módulos con al menos `min` issues en cada lado, los `top` con más
export const commonModules = (m, A, T, min, top = 15) => m.group('mo', A, true).filter((x) => x.k)
  .filter((x) => T.slice(0, 2).every((l) => l.filter((i) => m.C.mo[i] === x.k).length >= min)).slice(0, top);
