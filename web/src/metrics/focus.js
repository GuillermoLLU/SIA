// Módulos y focos (sin DOM): lo que cada centro o problema añade a su ficha y quién lleva cada módulo.
// m: el modelo (model.js).
import { MAJOR } from './model.js';
import { OWNERS_SHARE } from './rules.js';

// la ficha de los centros: lo que más les falla (su módulo con más issues) y sus major incidents
export const centreExtra = (m) => (st, l) => {
  const g = m.group('mo', l).filter((x) => x.k);
  st.top = g.length ? { label: m.DIMS.mo.label(g[0].k), share: g[0].n / (l.length || 1) } : null;
  st.mi = l.filter((i) => m.C.fl[i] & MAJOR).length;
};
// y la de los problemas, por tema: en cuántos centros pasa y si se cierra siempre igual (esto, solo de un problema:
// en un tema o en el total se mezclan problemas distintos)
export const problemExtra = (m) => (st, l) => {
  const { C, OPEN } = m, ce = new Set(), rz = new Map();
  let done = 0;
  for (const i of l) { if (C.ce[i]) ce.add(C.ce[i]); if (!OPEN[i] && C.res[i] >= 0) { done++; if (C.rz[i]) rz.set(C.rz[i], (rz.get(C.rz[i]) || 0) + 1); } }
  st.nce = ce.size;
  st.same = done && l.every((i) => C.de[i] === C.de[l[0]]) ? Math.max(0, ...rz.values()) / done : null;
};

// ¿De quién dependemos en cada módulo? Los `top` módulos con más issues con responsable: cuántas personas lo tocan
// (people), cuántas hacen falta para llevar OWNERS_SHARE de la que más lleva a la que menos (n80) y las tres que más
// llevan (top: { k, n }).
export const owners = (m, A, top = 15) => m.group('mo', A.filter((i) => m.C.as[i]), true).filter((x) => x.k).slice(0, top).map((x) => {
  const by = m.group('as', x.rows);
  let sum = 0, n80 = 0;
  for (const p of by) { sum += p.n; n80++; if (sum >= OWNERS_SHARE * x.n) break; }
  return { k: x.k, n: x.n, people: by.length, n80, top: by.slice(0, 3).map((p) => ({ k: p.k, n: p.n })) };
});
