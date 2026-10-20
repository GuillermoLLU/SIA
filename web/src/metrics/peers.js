// Lo que haría el equipo con el trabajo de una persona (sin DOM): la media de resolución y el % dentro del SLA que
// tendría el otro lado con los mismos módulos o prioridades. Solo tiene sentido persona frente a su empresa.
// m: el modelo (model.js).

// El lado de la persona (p) y el de su equipo (t), o null si no es persona frente a empresa.
export const personVsTeam = (m) => {
  const { sides } = m.S, p = sides[0].people ? 0 : 1, t = 1 - p;
  return !sides[1] || !sides[p].people || sides[t].people ? null : { p, t };
};

// La media de una persona frente a lo que tardaría su equipo con sus mismos módulos: la media del equipo en cada
// módulo, con el peso que ese módulo tiene en lo suyo. R: lo resuelto de cada lado. → { own, expected, n } (minutos)
export const expectedAvg = (m, R, { p, t }) => {
  const mean = new Map(m.group('mo', R[t], true).map((x) => [x.k, m.stats(x.rows).avg]));
  const own = m.group('mo', R[p]), all = m.stats(R[t]).avg;
  const expected = own.length ? own.reduce((a, x) => a + x.n * (mean.get(x.k) ?? all), 0) / R[p].length : null;
  return { own: R[p].length ? m.stats(R[p]).avg : null, expected, n: [R[p].length, R[t].length] };
};

// si una issue se empezó dentro del SLA (1), fuera (0) o no cuenta (null): lo mismo que stats (sla), desde la dimensión sl
const slaHit = (m) => (i) => { const k = m.DIMS.sl.get(i); return k === 0 ? 1 : k <= 4 ? 0 : null; };

// Lo que cumpliría `ref` con el trabajo de `work`: su % dentro del SLA en cada prioridad y módulo (con menos de
// MIN_CELL issues, el de la prioridad), con el peso que tiene cada uno en `work`.
const MIN_CELL = 5;
export const expectedSla = (m, work, ref) => {
  const { C } = m, hit = slaHit(m), cell = new Map(), prio = new Map();
  const add = (mp, k, v) => { const x = mp.get(k) || [0, 0]; x[0] += v; x[1]++; mp.set(k, x); };
  for (const i of ref) { const v = hit(i); if (v != null) { add(cell, `${C.pr[i]}:${C.mo[i]}`, v); add(prio, C.pr[i], v); } }
  let t = 0, n = 0;
  for (const i of work) {
    if (hit(i) == null) continue;
    const c = cell.get(`${C.pr[i]}:${C.mo[i]}`), x = c && c[1] >= MIN_CELL ? c : prio.get(C.pr[i]);
    if (x) { t += x[0] / x[1]; n++; }
  }
  return n ? t / n : null;
};
