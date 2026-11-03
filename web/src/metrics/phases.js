// En qué se va el tiempo (sin DOM): el tiempo de las resueltas en tramos que se apilan, por separado las escaladas y
// las que no (#48), y la gráfica que lo pinta (en SLA y calidad, con los lados de arriba: empresas o personas).
// m: el modelo (model.js).
//   escaladas      THesc (hasta escalar), Tesc (escalada en Jira) y Tcr (de la solución en Jira al cierre en Remedy);
//                  solo las que tienen los tres. Las demás, en out, por qué no: ligadas a un ticket previo, mal
//                  escaladas, cerradas con el Jira abierto, cerradas en Remedy antes que su Jira o sin datos de Jira.
//   sin escalar    en cola (Asignada, y lo de antes del primer cambio de estado), en curso (Tan), esperando al centro
//                  (Tpc) y otras esperas; suman su TTR. Sin Tesc: no se escalaron.
import { esc } from '../ui/html.js';
import { num, pct, dur } from './format.js';

// los bits de server/metrics/remedy.js (FLAG) y el THesc de un ticket previo (server/metrics/escalation.js, PREVIOUS)
const THIRD_PARTY = 131072, BAD_ESCALATION = 262144, JIRA_OPEN = 524288, CLOSED_BEFORE_JIRA = 1048576, PREVIOUS = -2;
const mean = (sum, n) => (n ? sum / n : null);


// list → { esc: { n, out, seg: [THesc, Tesc, Tcr] }, plain: { n, seg: [cola, en curso, centro, otras] } } (medias, minutos)
export const phasesOf = (m) => (list) => {
  const { C, OPEN } = m;
  const escd = [0, 0, 0], plain = [0, 0, 0, 0], out = { previous: 0, bad: 0, jiraOpen: 0, early: 0, none: 0 };
  let nEsc = 0, nPlain = 0;
  for (const i of list) {
    if (C.res[i] < 0 || OPEN[i]) continue;
    if (C.fl[i] & THIRD_PARTY) {
      const v = [C.the?.[i] ?? -1, C.tes?.[i] ?? -1, C.tcr?.[i] ?? -1];
      if (v.some((x) => x < 0)) {
        out[v[0] === PREVIOUS ? 'previous' : C.fl[i] & BAD_ESCALATION ? 'bad' : C.fl[i] & JIRA_OPEN ? 'jiraOpen' : C.fl[i] & CLOSED_BEFORE_JIRA ? 'early' : 'none']++;
        continue;
      }
      v.forEach((x, k) => { escd[k] += x; });
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

// Las dos barras y sus tramos; cada tramo, de un color (metrics.css, mt-svc-pe y mt-svc-pp).
const PHASES = [
  ['esc', 'Escaladas', 'pe', [['Hasta escalar (THesc)', 'De la apertura al primer Jira creado después.'],
    ['Escalada en Jira (Tesc)', 'Del Jira más antiguo, también los Discarded, a la resolución del Jira de solución final.'],
    ['Cierre en Remedy (Tcr)', 'De la resolución del Jira de solución final a la resolución en Remedy.']]],
  ['plain', 'Sin escalar', 'pp', [['En cola', 'En Asignada, y lo de antes del primer cambio de estado.'], ['En curso (Tan)', 'En In Progress.'],
    ['Esperando al centro (Tpc)', 'En Pendiente esperando al centro o al cliente.'], ['Otras esperas', 'En Pendiente por otro motivo.']]],
];
// por qué una escalada resuelta no entra en su barra (phasesOf: out)
const OUT = [['previous', 'ligadas a un ticket previo'], ['bad', 'sin Jira válido'], ['jiraOpen', 'cerradas con el Jira abierto'],
  ['early', 'cerradas en Remedy antes que su Jira'], ['none', 'sin datos de Jira']];

export const PHASES_NOTE = 'De media por resuelta, cada tramo en el orden en que pasa; la barra entera es su tiempo de resolución medio. Escalada: estuvo en Pendiente con motivo Third Party Vendor Action Reqd; solo cuentan las que tienen sus tres tiempos de Jira, con los tickets creados entre su apertura y su cierre (las notas citan también tickets de otras incidencias). Las dos barras, en la misma escala. Pasa el ratón por un tramo para ver su detalle.';

// La gráfica: una barra para las escaladas y otra para las que no, con una fila por cada uno de rows ({ who, p }: su
// nombre y lo que da phasesOf), todo en la misma escala. jiraAt: cuándo se trajo de Jira (null: nunca).
export const phasesChart = (rows, { jiraAt = null } = {}) => {
  const total = (p) => (p.n ? p.seg.reduce((a, b) => a + b, 0) : null);
  const max = Math.max(1, ...PHASES.flatMap(([k]) => rows.map(({ p }) => total(p[k]) || 0)));
  const blocks = PHASES.map(([k, title, cls, segs]) => {
    const lines = rows.map(({ who, p: all }) => {
      const p = all[k], t = total(p);
      const left = k === 'esc' ? OUT.filter(([r]) => p.out[r]).map(([r, l]) => `${num(p.out[r])} ${l}`) : [];
      const count = k === 'esc' ? `${num(p.n)} escaladas resueltas${left.length ? `\nFuera: ${left.join(', ')}` : ''}` : `${num(p.n)} resueltas`;
      const empty = k === 'esc' && !jiraAt ? 'aún no se ha traído nada de Jira: pulsa «Actualizar y generar informe»'
        : left.length ? 'sin escaladas con sus tres tiempos de Jira' : 'sin datos';
      const bar = t == null ? `<em>${empty}</em>`
        : `<span class="mt-svc-stack" style="--mt-at:${(t / max).toFixed(4)}">${p.seg.map((v, j) => `<i class="mt-svc-${cls}${j}" style="flex-grow:${v.toFixed(1)}" data-tip="${esc(`${title} · ${who}\n${segs[j][0]}: ${dur(v)} (${pct(v / t)})\n${count}`)}">${v / max >= 0.08 ? dur(v) : ''}</i>`).join('')}</span><b>${dur(t)}</b>`;
      return `<div class="mt-svc-row" data-tip="${esc(`${title} · ${who}\nEn total, ${t == null ? 'sin datos' : dur(t)} de media · ${count}`)}"><span class="mt-svc-who">${esc(who)}</span><span class="mt-svc-track">${bar}</span></div>`;
    }).join('');
    const legend = `<div class="mt-legend">${segs.map(([l, tip], j) => `<span data-tip="${esc(tip)}"><i class="mt-svc-${cls}${j}"></i>${l}</span>`).join('')}</div>`;
    return `<div class="mt-svc-time"><p class="mt-svc-th"><b>${title}</b></p>${legend}${lines}</div>`;
  }).join('');
  return `<div class="mt-svc-times">${blocks}</div>`;
};
