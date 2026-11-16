// En qué se va el tiempo (sin DOM): el tiempo de las resueltas en tramos que se apilan, por separado las escaladas y
// las que no (#48), y la gráfica que lo pinta (en Resolución, con los lados de arriba: empresas o personas).
// m: el modelo (model.js).
//   escaladas      THesc (hasta escalar) partido por estados como lo que no se escala (en cola, en curso, esperando al
//                  centro: server/metrics/dataset.js, hQ/hI/hPc; sin ellos, todo a la cola), el escalado (Tesc, más las otras
//                  esperas de antes del Jira, hPo: pueden ser de otros escalados sin Jira) y Tcr (de la solución en Jira al cierre en Remedy); solo las que tienen los tres. Las demás, en out, por qué no: ligadas a un ticket previo, mal
//                  escaladas, cerradas con el Jira abierto, cerradas en Remedy antes que su Jira o sin datos de Jira.
//   sin escalar    en cola (Asignada, y lo de antes del primer cambio de estado), en curso (Tan), esperando al centro
//                  (Tpc) y otras esperas; suman su TTR. Sin Tesc: no se escalaron.
// En Análisis tiempos, también lo actual (phasesNowOf): lo que llevan hasta la última carga las que siguen abiertas.
import { esc } from '../ui/html.js';
import { num, pct, dur } from './format.js';
import { tescOf } from './resolution.js';

// los bits de server/metrics/remedy.js (FLAG) y el THesc de un ticket previo (server/metrics/escalation.js, PREVIOUS)
const THIRD_PARTY = 131072, BAD_ESCALATION = 262144, JIRA_OPEN = 524288, CLOSED_BEFORE_JIRA = 1048576, PREVIOUS = -2;
const mean = (sum, n) => (n ? sum / n : null);


// list → { esc: { n, out, seg: [cola, en curso y centro hasta escalar, escalado (otras esperas + Tesc), Tcr] }, plain: { n, seg: [cola, en curso, centro, otras] } } (medias, minutos)
export const phasesOf = (m) => (list) => {
  const { C, OPEN } = m;
  const escd = [0, 0, 0, 0, 0], plain = [0, 0, 0, 0], out = { previous: 0, bad: 0, jiraOpen: 0, early: 0, none: 0 };
  let nEsc = 0, nPlain = 0;
  for (const i of list) {
    if (C.res[i] < 0 || OPEN[i]) continue;
    if (C.fl[i] & THIRD_PARTY) {
      const v = [C.the?.[i] ?? -1, C.tes?.[i] ?? -1, C.tcr?.[i] ?? -1];
      if (v.some((x) => x < 0)) {
        out[v[0] === PREVIOUS ? 'previous' : C.fl[i] & BAD_ESCALATION ? 'bad' : C.fl[i] & JIRA_OPEN ? 'jiraOpen' : C.fl[i] & CLOSED_BEFORE_JIRA ? 'early' : 'none']++;
        continue;
      }
      // su THesc por estados (la cola, lo que queda: lo de antes del primer cambio, también)
      const split = (C.hQ?.[i] ?? -1) >= 0 ? [C.hQ[i], C.hI[i], C.hPc[i], C.hPo[i]] : [v[0], 0, 0, 0];
      // las otras esperas de antes del Jira, con el escalado: pueden ser de otros escalados sin Jira
      [split[0], split[1], split[2], split[3] + v[1], v[2]].forEach((x, k) => { escd[k] += x; });
      nEsc++;
    } else {
      const ttr = Math.max(C.res[i] - C.rep[i], 0), wait = C.tPv[i] + C.tPo[i];
      const queue = Math.max(ttr - C.tI[i] - C.tPc[i] - wait, C.tA[i]);
      [queue, C.tI[i], C.tPc[i], wait].forEach((x, k) => { plain[k] += x; });
      nPlain++;
    }
  }
  return { esc: { n: nEsc, out, seg: escd.map((x) => mean(x, nEsc)) }, plain: { n: nPlain, seg: plain.map((x) => mean(x, nPlain)) } };
};

// Lo actual: lo que llevan hasta la última carga las que siguen abiertas, con los mismos tramos y la misma forma que
// phasesOf. Los estados se cuentan hasta la última modificación; lo de después, en el estado en que siguen (su situación:
// model.js, DIMS.sit). Escaladas: su THesc por estados, lo escalado hasta hoy (tescOf: con el Jira aún sin resolver,
// hasta la última carga) y, si su Jira ya está resuelto, lo que lleva sin cerrarse en Remedy (Tesc-r); sin THesc
// (ticket previo, sin Jira válido o sin datos de Jira), fuera, como en lo resuelto.
export const phasesNowOf = (m) => (list) => {
  const { C, OPEN, SNAP, DIMS } = m;
  const escd = [0, 0, 0, 0, 0], plain = [0, 0, 0, 0], out = { previous: 0, bad: 0, jiraOpen: 0, early: 0, none: 0 };
  let nEsc = 0, nPlain = 0;
  for (const i of list) {
    if (!OPEN[i]) continue;
    if (C.fl[i] & THIRD_PARTY) {
      const the = C.the?.[i] ?? -1;
      if (the < 0) { out[the === PREVIOUS ? 'previous' : C.fl[i] & BAD_ESCALATION ? 'bad' : 'none']++; continue; }
      const split = (C.hQ?.[i] ?? -1) >= 0 ? [C.hQ[i], C.hI[i], C.hPc[i], C.hPo[i]] : [the, 0, 0, 0];
      const tes = Math.max(tescOf(m, i), 0), tsr = Math.max(C.tsr?.[i] ?? -1, 0);
      [split[0], split[1], split[2], split[3] + tes, tsr].forEach((x, k) => { escd[k] += x; });
      nEsc++;
    } else {
      // lo de desde la última modificación, en el estado en que sigue: en curso, en cola, al centro u otras esperas
      const since = Math.max(SNAP - (C.lm?.[i] >= 0 ? C.lm[i] : SNAP), 0), sit = DIMS.sit.get(i);
      const work = C.tI[i] + (sit === 0 ? since : 0), centre = C.tPc[i] + (sit === 4 ? since : 0);
      const wait = C.tPv[i] + C.tPo[i] + (sit === 3 || sit === 5 ? since : 0);
      const queue = Math.max(SNAP - C.rep[i] - work - centre - wait, C.tA[i]);
      [queue, work, centre, wait].forEach((x, k) => { plain[k] += x; });
      nPlain++;
    }
  }
  return { esc: { n: nEsc, out, seg: escd.map((x) => mean(x, nEsc)) }, plain: { n: nPlain, seg: plain.map((x) => mean(x, nPlain)) } };
};
export const PHASES_NOW_NOTE = 'De media por incidencia abierta, lo que llevan hasta la última carga en cada tramo, en el orden en que pasa; la barra entera es lo que llevan abiertas de media. En las escaladas, lo escalado llega hasta hoy si su Jira sigue sin resolver y, si ya está resuelto, el último tramo es lo que lleva sin cerrarse en Remedy (Tesc-r). Las dos barras, en la misma escala. Pasa el ratón por un tramo para ver su detalle.';

// El tiempo de una incidencia por estado (minutos): [en cola, en curso, esperando al centro, a un tercero, otras
// esperas]; suman su TTR o, abierta (now), lo que lleva hasta la última carga (lo de desde su última modificación, en
// el estado en que sigue). La cola, lo que queda: también lo de antes del primer cambio de estado.
export const PARTS = [['En cola', 'pp0'], ['En curso', 'pp1'], ['Esperando al centro', 'pp2'], ['Esperando a terceros', 'pe1'], ['Otras esperas', 'pp3']];
export const timeParts = (m, now = false) => (i) => {
  const { C, SNAP, DIMS } = m;
  const since = now ? Math.max(SNAP - (C.lm?.[i] >= 0 ? C.lm[i] : SNAP), 0) : 0, sit = now ? DIMS.sit.get(i) : -1;
  const work = C.tI[i] + (sit === 0 ? since : 0), centre = C.tPc[i] + (sit === 4 ? since : 0);
  const vendor = C.tPv[i] + (sit === 3 ? since : 0), other = C.tPo[i] + (sit === 5 ? since : 0);
  const total = now ? SNAP - C.rep[i] : Math.max(C.res[i] - C.rep[i], 0);
  return [Math.max(total - work - centre - vendor - other, C.tA[i]), work, centre, vendor, other];
};
// Por módulo: lo de cada uno (resuelto del periodo o, now, abierto ahora), de más a menos tiempo total. Cada uno,
// { k, n, total, mean, parts (medias por estado) }; total, la suma de todos.
// groupTimes: lo mismo, por otra columna (col: 'mo', el módulo; 'ce', el centro…)
export const groupTimes = (m, list, now = false, col = 'mo') => {
  const { C, OPEN } = m, of = timeParts(m, now), by = new Map();
  for (const i of list) {
    if (now ? !OPEN[i] : C.res[i] < 0 || OPEN[i]) continue;
    const k = C[col][i], p = of(i), x = by.get(k) || { k, n: 0, sum: [0, 0, 0, 0, 0] };
    p.forEach((v, j) => { x.sum[j] += v; });
    x.n++; by.set(k, x);
  }
  const rows = [...by.values()].map((x) => { const total = x.sum.reduce((a, b) => a + b, 0); return { k: x.k, n: x.n, total, mean: total / x.n, parts: x.sum.map((v) => v / x.n) }; });
  rows.sort((a, b) => b.total - a.total || b.n - a.n);
  return { rows, total: rows.reduce((s, r) => s + r.total, 0), n: rows.reduce((s, r) => s + r.n, 0) };
};
export const modulesTimes = (m, list, now = false) => groupTimes(m, list, now, 'mo');

// Problemas comunes (server/metrics/problems.js, cols.pc): lo de cada uno (resuelto del periodo o, now, abierto ahora),
// de más a menos incidencias, con su tiempo (el de resolución o, abierta, lo que lleva) y sus módulos principales. El 0
// (sin clasificar), aparte. Cada uno, { k, n, total, mean, modules: [[módulo, n]] }; total y n, de todos.
export const problemsTimes = (m, list, now = false) => {
  const { C, OPEN, SNAP } = m, by = new Map();
  for (const i of list) {
    if (now ? !OPEN[i] : C.res[i] < 0 || OPEN[i]) continue;
    const k = C.pc?.[i] ?? 0, t = now ? SNAP - C.rep[i] : Math.max(C.res[i] - C.rep[i], 0);
    const x = by.get(k) || { k, n: 0, total: 0, mo: new Map() };
    x.n++; x.total += t; x.mo.set(C.mo[i], (x.mo.get(C.mo[i]) || 0) + 1);
    by.set(k, x);
  }
  const rows = [...by.values()].map((x) => ({ k: x.k, n: x.n, total: x.total, mean: x.total / x.n, modules: [...x.mo].sort((a, b) => b[1] - a[1]).slice(0, 3) }));
  const sum = (f) => rows.reduce((s, r) => s + f(r), 0);
  return { rows: rows.filter((r) => r.k).sort((a, b) => b.n - a.n || b.total - a.total), none: rows.find((r) => !r.k) || null, n: sum((r) => r.n), total: sum((r) => r.total) };
};

// Las dos barras y sus tramos [nombre, nota, color] (metrics.css, mt-svc-pp y mt-svc-pe): lo de Remedy, de los mismos
// colores en las dos barras; lo de Jira, de los suyos.
const UNTIL = ' Hasta escalar: de la apertura al primer Jira creado después (THesc).';
const PHASES = [
  ['esc', 'Escaladas', [['En cola', `En Asignada, y lo de antes del primer cambio de estado.${UNTIL}`, 'pp0'], ['En curso (Tan)', `En In Progress.${UNTIL}`, 'pp1'],
    ['Esperando al centro (Tpc)', `En Pendiente esperando al centro o al cliente.${UNTIL}`, 'pp2'],
    ['Escalada (Tesc)', 'Del Jira más antiguo, también los Discarded, a la resolución del Jira de solución final; y, antes de abrir el Jira, lo que estuvo en Pendiente por otro motivo o de un tercero: pueden ser otros escalados sin Jira.', 'pe1'],
    ['Cierre en Remedy (Tcr)', 'De la resolución del Jira de solución final a la resolución en Remedy.', 'pe2']]],
  ['plain', 'Sin escalar', [['En cola', 'En Asignada, y lo de antes del primer cambio de estado.', 'pp0'], ['En curso (Tan)', 'En In Progress.', 'pp1'],
    ['Esperando al centro (Tpc)', 'En Pendiente esperando al centro o al cliente.', 'pp2'], ['Otras esperas', 'En Pendiente por otro motivo.', 'pp3']]],
];
// por qué una escalada resuelta no entra en su barra (phasesOf: out)
const OUT = [['previous', 'ligadas a un ticket previo'], ['bad', 'sin Jira válido'], ['jiraOpen', 'cerradas con el Jira abierto'],
  ['early', 'cerradas en Remedy antes que su Jira'], ['none', 'sin datos de Jira']];

export const PHASES_NOTE = 'De media por resuelta, cada tramo en el orden en que pasa (en las escaladas, lo de antes de abrir el Jira, por estados, como en las que no se escalan; sus otras esperas, con el escalado); la barra entera es su tiempo de resolución medio. Escalada: estuvo en Pendiente con motivo Third Party Vendor Action Reqd; solo cuentan las que tienen sus tres tiempos de Jira, con los tickets creados entre su apertura y su cierre (las notas citan también tickets de otras incidencias). Las dos barras, en la misma escala. Pasa el ratón por un tramo para ver su detalle.';

// La gráfica: una barra para las escaladas y otra para las que no, con una fila por cada uno de rows ({ who, p }: su
// nombre y lo que da phasesOf), todo en la misma escala. jiraAt: cuándo se trajo de Jira (null: nunca).
// now: lo actual (phasesNowOf): las cuentas, de abiertas
export const phasesChart = (rows, { jiraAt = null, now = false } = {}) => {
  const total = (p) => (p.n ? p.seg.reduce((a, b) => a + b, 0) : null);
  const max = Math.max(1, ...PHASES.flatMap(([k]) => rows.map(({ p }) => total(p[k]) || 0)));
  const blocks = PHASES.map(([k, title, segs]) => {
    const lines = rows.map(({ who, p: all }) => {
      const p = all[k], t = total(p);
      const left = k === 'esc' ? OUT.filter(([r]) => p.out[r]).map(([r, l]) => `${num(p.out[r])} ${l}`) : [];
      const done = now ? 'abiertas' : 'resueltas';
      const count = k === 'esc' ? `${num(p.n)} escaladas ${done}${left.length ? `\nFuera: ${left.join(', ')}` : ''}` : `${num(p.n)} ${done}`;
      const empty = k === 'esc' && !jiraAt ? 'aún no se ha traído nada de Jira: pulsa «Actualizar y generar informe»'
        : left.length ? 'sin escaladas con sus tres tiempos de Jira' : 'sin datos';
      const bar = t == null ? `<em>${empty}</em>`
        : `<span class="mt-svc-stack" style="--mt-at:${(t / max).toFixed(4)}">${p.seg.map((v, j) => `<i class="mt-svc-${segs[j][2]}" style="flex-grow:${v.toFixed(1)}" data-tip="${esc(`${title} · ${who}\n${segs[j][0]}: ${dur(v)} (${pct(v / t)})\n${count}`)}">${v / max >= 0.08 ? dur(v) : ''}</i>`).join('')}</span><b>${dur(t)}</b>`;
      return `<div class="mt-svc-row" data-tip="${esc(`${title} · ${who}\nEn total, ${t == null ? 'sin datos' : dur(t)} de media · ${count}`)}"><span class="mt-svc-who">${esc(who)}</span><span class="mt-svc-track">${bar}</span></div>`;
    }).join('');
    const legend = `<div class="mt-legend">${segs.map(([l, tip, cls]) => `<span data-tip="${esc(tip)}"><i class="mt-svc-${cls}"></i>${l}</span>`).join('')}</div>`;
    return `<div class="mt-svc-time"><p class="mt-svc-th"><b>${title}</b></p>${legend}${lines}</div>`;
  }).join('');
  return `<div class="mt-svc-times">${blocks}</div>`;
};
