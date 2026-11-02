// Métricas del servicio (épica #14; sin DOM): el servicio de Indra en su conjunto frente a los SLA de la oferta
// (2025_10_OT_INDITEX v5.1, diapositivas 42 y 43) y, si se pide, frente al mismo servicio en el mismo periodo del año
// anterior y frente a T-Systems en el mismo periodo. m: el modelo (model.js).
//
// Entran las issues abiertas en el periodo (como en el resto de las Métricas) que pasan los filtros de arriba; los
// lados de la comparación de arriba no cuentan, esta vista tiene los suyos. Tiempos en minutos, en tiempo natural.
//   Tatt (tiempo de acción)  de la apertura al primer paso a En curso, como el SLA de inicio de las Métricas.
//   MTTR                     (TTR de las resueltas + lo que llevan abiertas las que siguen abiertas) / issues (#48).
//   Reapertura               de las cerradas, las que volvieron de Resuelta a abierta.
//   Resueltas entrantes      las que entraron en el periodo y se resolvieron dentro de él (TC-07 de la #58).
//   Uso de la IA             de las resueltas, las que tienen una nota [ANALISIS_IA], [DIAGNOSTICO_IA] o [ANTECEDENTES_IA].
//   THesc, Tesc, Tesc-r      con los tickets Jira (server/metrics/escalation.js); Tesc-r, de las que siguen abiertas.
const REOPENED = 512, IA_NOTE = 65536, THIRD_PARTY = 131072, BAD_ESCALATION = 262144, JIRA_OPEN = 524288, CLOSED_BEFORE_JIRA = 1048576;
const PREVIOUS = -2;   // THesc de un ticket previo a la apertura: no cuenta en la media
const DAY = 1440;

// Los SLA de la oferta. Durante la estabilización son SLO sin penalización; al acabar se fijan los definitivos.
export const ACTION_TARGET = 0.9;   // Indra los acepta con un cumplimiento mayor al 90 %
// Tiempo de resolución medio: crítica < 1 h, alta < 23 h, resto < 85 h; todas, < 55 h.
export const RESOLUTION = [['CRITICAL', 60], ['HIGH', 23 * 60], ['REST', 85 * 60]];
export const RESOLUTION_ALL = 55 * 60;
export const REOPEN_MAX = 0.05;     // ≤ 5 % en todas las prioridades
// Auditoría, nota mínima de las dimensiones T, C, P y CL ≥ 3: el agente de calidad aún no existe (tarea #55).
export const AUDIT = [['CRITICAL', 0.95], ['HIGH', 0.9], ['REST', 0.8]];

// Los tres lados: Indra, el mismo servicio un año antes (las dos empresas: es el servicio entero de entonces) y T-Systems.
export const SIDES = [['us', 'Indra'], ['prev', 'Año anterior'], ['ts', 'T-Systems']];

const mean = (sum, n) => (n ? sum / n : null);

export const createService = (m) => {
  const { C, DI, OPEN, TEAM, SNAP, SLA, BASE, MIN_D } = m;
  const prio = (k) => DI.prio.indexOf(k);
  // las prioridades de una fila: una sola o, «REST», media y baja
  const prios = (k) => (k === 'REST' ? [prio('MEDIUM'), prio('LOW')] : [prio(k)]).filter((p) => p > 0);

  // el mismo instante un año antes (minutos desde BASE)
  const yearBack = (min) => { const d = new Date(BASE + min * 6e4); d.setUTCFullYear(d.getUTCFullYear() - 1); return (d.getTime() - BASE) / 6e4; };
  // El periodo de cada lado y, del año anterior, si lo cargado lo cubre: 'full', 'partial' o 'none'.
  const periods = () => {
    const { d0, d1 } = m.S, p0 = yearBack(d0), p1 = yearBack(d1);
    return { us: [d0, d1], ts: [d0, d1], prev: [p0, p1], prevCover: p0 >= MIN_D ? 'full' : p1 > MIN_D ? 'partial' : 'none' };
  };
  // Las issues de cada lado: las que pasan los filtros (sin mirar el periodo ni los lados de arriba), abiertas en su periodo.
  const lists = () => {
    const P = periods(), all = m.today(true), out = { us: [], prev: [], ts: [] };
    const inside = (i, [a, b]) => C.rep[i] >= a && C.rep[i] < b;
    for (const i of all) {
      if (TEAM[i] === 0 && inside(i, P.us)) out.us.push(i);
      if (TEAM[i] === 1 && inside(i, P.ts)) out.ts.push(i);
      if (TEAM[i] !== 2 && inside(i, P.prev)) out.prev.push(i);
    }
    return out;
  };

  // lo que tarda una issue para el MTTR: resuelta, su TTR; abierta, lo que lleva; cancelada sin resolver, no cuenta (null)
  const ttr = (i) => (C.res[i] >= 0 ? Math.max(C.res[i] - C.rep[i], 0) : OPEN[i] ? Math.max(SNAP - C.rep[i], 0) : null);

  // Tatt de unas issues frente a su plazo: dentro, fuera (empezadas tarde, o abiertas sin empezar pasado el plazo; las
  // cerradas sin pasar por En curso no cuentan) y la media hasta En curso.
  const action = (list) => {
    let ok = 0, ko = 0, sum = 0, started = 0;
    for (const i of list) {
      const lim = SLA[C.pr[i]], v = C.ip[i];
      if (v >= 0) { sum += v; started++; }
      if (lim < 0) continue;
      if (v >= 0) { if (v <= lim) ok++; else ko++; } else if (OPEN[i] && SNAP - C.rep[i] > lim) ko++;
    }
    return { n: list.length, ok, ko, share: ok + ko ? ok / (ok + ko) : null, avg: mean(sum, started) };
  };
  // MTTR de unas issues y qué parte queda dentro de un objetivo (max, minutos)
  const resolution = (list, max) => {
    let sum = 0, n = 0, under = 0;
    for (const i of list) { const t = ttr(i); if (t == null) continue; sum += t; n++; if (t <= max) under++; }
    return { n, mttr: mean(sum, n), under: n ? under / n : null, max };
  };
  const reopen = (list) => {
    let done = 0, re = 0;
    for (const i of list) if (!OPEN[i]) { done++; if (C.fl[i] & REOPENED) re++; }
    return { done, re, share: done ? re / done : null };
  };

  // En qué se va el tiempo de las resueltas, por separado las escaladas y las que no (#48), en medias que se apilan:
  //   escaladas      THesc (hasta escalar), Tesc (escalada en Jira) y Tcr (de la solución en Jira al cierre en Remedy);
  //                  solo las que tienen los tres. Las demás, en out, por qué no: ligadas a un ticket previo, mal
  //                  escaladas, cerradas con el Jira abierto, cerradas en Remedy antes que su Jira o sin datos de Jira.
  //   sin escalar    en cola (Asignada, y lo de antes del primer cambio de estado), en curso (Tan), esperando al centro
  //                  (Tpc) y otras esperas; suman su TTR. Sin Tesc: no se escalaron.
  const phases = (list) => {
    const esc = [0, 0, 0], plain = [0, 0, 0, 0], out = { previous: 0, bad: 0, jiraOpen: 0, early: 0, none: 0 };
    let nEsc = 0, nPlain = 0;
    for (const i of list) {
      if (C.res[i] < 0 || OPEN[i]) continue;
      if (C.fl[i] & THIRD_PARTY) {
        const v = [C.the?.[i] ?? -1, C.tes?.[i] ?? -1, C.tcr?.[i] ?? -1];
        if (v.some((x) => x < 0)) {
          out[v[0] === PREVIOUS ? 'previous' : C.fl[i] & BAD_ESCALATION ? 'bad' : C.fl[i] & JIRA_OPEN ? 'jiraOpen' : C.fl[i] & CLOSED_BEFORE_JIRA ? 'early' : 'none']++;
          continue;
        }
        v.forEach((x, k) => { esc[k] += x; });
        nEsc++;
      } else {
        const ttrI = Math.max(C.res[i] - C.rep[i], 0), wait = C.tPv[i] + C.tPo[i];
        const queue = Math.max(ttrI - C.tI[i] - C.tPc[i] - wait, C.tA[i]);
        [queue, C.tI[i], C.tPc[i], wait].forEach((x, k) => { plain[k] += x; });
        nPlain++;
      }
    }
    return { esc: { n: nEsc, out, seg: esc.map((x) => mean(x, nEsc)) }, plain: { n: nPlain, seg: plain.map((x) => mean(x, nPlain)) } };
  };

  // Las cifras de un lado en su periodo [d0, d1).
  const stats = (list, [, d1]) => {
    const byP = (k) => list.filter((i) => prios(k).includes(C.pr[i]));
    let resolvedIn = 0, done = 0, ia = 0, esc = 0, bad = 0, jiraOpen = 0, early = 0;
    const t = { the: [0, 0], tes: [0, 0], tsr: [0, 0], previous: 0 };
    const add = (k, v) => { if (v >= 0) { t[k][0] += v; t[k][1]++; } };
    for (const i of list) {
      if (C.res[i] >= 0 && C.res[i] < d1) resolvedIn++;
      if (C.res[i] >= 0) { done++; if (C.fl[i] & IA_NOTE) ia++; }
      if (C.fl[i] & THIRD_PARTY) esc++;
      if (C.fl[i] & BAD_ESCALATION) bad++;
      if (C.fl[i] & JIRA_OPEN) jiraOpen++;
      if (C.fl[i] & CLOSED_BEFORE_JIRA) early++;
      const the = C.the?.[i] ?? -1;
      if (the === PREVIOUS) t.previous++; else add('the', the);
      add('tes', C.tes?.[i] ?? -1);
      if (OPEN[i]) add('tsr', C.tsr?.[i] ?? -1);
    }
    return {
      n: list.length, resolvedIn, inShare: list.length ? resolvedIn / list.length : null,
      action: { all: action(list), ...Object.fromEntries(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((k) => [k, action(byP(k))])) },
      resolution: { all: resolution(list, RESOLUTION_ALL), ...Object.fromEntries(RESOLUTION.map(([k, max]) => [k, resolution(byP(k), max)])) },
      reopen: { all: reopen(list), ...Object.fromEntries(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((k) => [k, reopen(byP(k))])) },
      ia: { done, ia, share: done ? ia / done : null },
      phases: phases(list),
      esc: { n: esc, bad, jiraOpen, early, previous: t.previous, thesc: mean(...t.the), nThesc: t.the[1], tesc: mean(...t.tes), nTesc: t.tes[1], tescr: mean(...t.tsr), nTescr: t.tsr[1] },
    };
  };

  // Mes a mes, por mes de apertura dentro del periodo: entrantes y resueltas entrantes (resueltas antes de acabar ese
  // mes, o el periodo si acaba antes). El año anterior, el mismo mes un año antes.
  const months = (L) => {
    const P = periods(), out = [];
    for (let k = m.S.from; k <= m.S.to; k++) {
      const a = Math.max(m.minuteOf(k), P.us[0]), b = Math.min(m.minuteOf(k + 1), P.us[1]), pa = yearBack(a), pb = yearBack(b);
      const cut = (list, x, y) => {
        const l = list.filter((i) => C.rep[i] >= x && C.rep[i] < y);
        const res = l.filter((i) => C.res[i] >= 0 && C.res[i] < y).length;
        return { n: l.length, resolvedIn: res, inShare: l.length ? res / l.length : null };
      };
      out.push({ k, label: `${m.monthName(k)}${k === m.LASTM ? '*' : ''}`, f: `month:${k}`, us: cut(L.us, a, b), prev: cut(L.prev, pa, pb), ts: cut(L.ts, a, b) });
    }
    return out;
  };

  // Todo lo de la vista: los periodos, las cifras de cada lado y el mes a mes.
  const compute = () => {
    const P = periods(), L = lists();
    return { periods: P, stats: { us: stats(L.us, P.us), prev: stats(L.prev, P.prev), ts: stats(L.ts, P.ts) }, months: months(L), days: (P.us[1] - P.us[0]) / DAY };
  };

  return { compute, periods, lists, stats, phases, yearBack, ttr };
};
