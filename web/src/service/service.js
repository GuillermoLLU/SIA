// Métricas del servicio (épica #14; sin DOM): el servicio de Indra en su conjunto frente a los SLA de la oferta
// (2025_10_OT_INDITEX v5.1, diapositivas 42 y 43), en un periodo y en cada uno de sus días y, si se pide, frente al
// mismo servicio un año antes y frente a T-Systems. m: el modelo (metrics/model.js). Minutos, en tiempo natural.
//
// Cada métrica cuenta una incidencia en el día en que le pasa lo que mide (decidido al implementar la #81):
//   Entrantes                el día de su apertura; resuelta entrante, si además se resuelve antes de que acabe el
//                            día o el periodo que se mira.
//   Tatt (tiempo de acción)  el día de su primer paso a En curso; una abierta sin empezar, el día en que se le pasa el
//                            plazo, y cuenta como fuera. Una cerrada sin pasar por En curso no cuenta.
//   MTTR, reapertura y IA    el día de su resolución.
//   THesc                    el día en que se crea su primer Jira.
//   Tesc y Tesc-r            el día en que se resuelve su Jira de solución final (server/metrics/escalation.js).
//   Marcas de los escalados  el día de su apertura.
// Un día sin nada que medir no tiene valor: lo dice la vista, «sin datos». En los conteos, un día sin incidencias es 0.
// Un día de fuera de lo cargado no tiene ningún valor. Si la última vez no se pudo traer de Jira (meta.jira.message),
// sus métricas no tienen valor desde el día de la última vez que se trajo.
import { REOPENED, MISROUTED } from '../metrics/model.js';
import { DAY } from '../metrics/rules.js';

const IA_NOTE = 65536, THIRD_PARTY = 131072, BAD_ESCALATION = 262144, JIRA_OPEN = 524288, CLOSED_BEFORE_JIRA = 1048576;
const PREVIOUS = -2;   // THesc de un ticket previo a la apertura: no cuenta en la media

// Los SLA de la oferta. Durante la estabilización son SLO sin penalización; al acabar se fijan los definitivos.
export const ACTION_TARGET = 0.9;   // Indra los acepta con un cumplimiento mayor al 90 %
// Tiempo de resolución medio: crítica < 1 h, alta < 23 h, resto < 85 h; todas, < 55 h.
export const RESOLUTION = [['CRITICAL', 60], ['HIGH', 23 * 60], ['REST', 85 * 60]];
export const RESOLUTION_ALL = 55 * 60;
export const REOPEN_MAX = 0.05;     // ≤ 5 % en todas las prioridades
// Auditoría, nota mínima de las dimensiones T, C, P y CL ≥ 3: las notas aún no llegan a SIA (tarea #55).
export const AUDIT = [['CRITICAL', 0.95], ['HIGH', 0.9], ['REST', 0.8]];
export const PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

// Los tres lados: Indra, el mismo servicio un año antes (las dos empresas: es el servicio entero de entonces) y T-Systems.
export const SIDES = [['us', 'Indra'], ['prev', 'Año anterior'], ['ts', 'T-Systems']];
const OF_SIDE = { us: (t) => t === 0, prev: (t) => t !== 2, ts: (t) => t === 1 };

const mean = (sum, n) => (n ? sum / n : null);
const dayOf = (min) => Math.floor(min / DAY);

export const createService = (m) => {
  const { C, DI, OPEN, TEAM, SNAP, SLA, BASE, MIN_D, data: { meta } } = m;
  const FIRST_DAY = dayOf(MIN_D), LAST_DAY = dayOf(SNAP);
  const prioOf = (i) => DI.prio[C.pr[i]];
  const groupOf = (i) => { const p = prioOf(i); return p === 'MEDIUM' || p === 'LOW' ? 'REST' : p; };

  // el mismo instante un año antes (minutos desde BASE)
  const yearBack = (min) => { const d = new Date(BASE + min * 6e4); d.setUTCFullYear(d.getUTCFullYear() - 1); return (d.getTime() - BASE) / 6e4; };

  // Desde qué día no hay datos de Jira: sin nada traído, ninguno; traído y luego fallido, desde el de la última vez.
  const jiraCut = () => {
    const { at = null, message = '' } = meta.jira || {};
    if (!at) return -Infinity;
    if (!message) return Infinity;
    const d = new Date(at);
    return dayOf((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - BASE) / 6e4);
  };

  // Las incidencias de un lado por día y por lo que les pasa ese día.
  const bucketsOf = (side) => {
    const out = new Map(), inSide = OF_SIDE[side];
    const put = (min, k, i) => {
      const d = dayOf(min);
      let b = out.get(d);
      if (!b) out.set(d, b = { rep: [], start: [], late: [], res: [], the: [], previous: [], tes: [], tsr: [] });
      b[k].push(i);
    };
    for (const i of m.today(true)) {
      if (!inSide(TEAM[i])) continue;
      put(C.rep[i], 'rep', i);
      const lim = SLA[C.pr[i]];
      if (C.ip[i] >= 0) put(C.rep[i] + C.ip[i], 'start', i);
      else if (OPEN[i] && lim >= 0 && SNAP - C.rep[i] > lim) put(C.rep[i] + lim, 'late', i);
      if (C.res[i] >= 0) put(C.res[i], 'res', i);
      const the = C.the?.[i] ?? -1, tes = C.tes?.[i] ?? -1, tsr = C.tsr?.[i] ?? -1;
      if (the === PREVIOUS) put(C.rep[i], 'previous', i);
      if (the >= 0) {
        put(C.rep[i] + the, 'the', i);
        if (tes >= 0) put(C.rep[i] + the + tes, 'tes', i);
        if (tsr >= 0 && OPEN[i] && tes >= 0) put(C.rep[i] + the + tes, 'tsr', i);
      }
    }
    return out;
  };

  // Las cifras de unos días (números de día) de un lado; end: hasta cuándo cuenta una resuelta entrante (minutos).
  const figures = (buckets, days, end, cut) => {
    const zero = (keys, make) => Object.fromEntries(keys.map((k) => [k, make()]));
    const action = zero(['all', ...PRIORITIES], () => ({ ok: 0, ko: 0, sum: 0, started: 0 }));
    const res = zero(['all', 'CRITICAL', 'HIGH', 'REST'], () => ({ n: 0, sum: 0, under: 0 }));
    const reop = zero(['all', ...PRIORITIES], () => ({ done: 0, re: 0 }));
    const esc = { n: 0, bad: 0, jiraOpen: 0, early: 0, misrouted: 0, previous: 0 };
    const avg = { the: [0, 0], tes: [0, 0], tsr: [0, 0] };
    const maxOf = new Map([...RESOLUTION, ['all', RESOLUTION_ALL]]);
    let n = 0, resolvedIn = 0, done = 0, ia = 0;
    const seen = new Set(days);
    for (const day of seen) {
      const b = buckets.get(day);
      if (!b) continue;
      for (const i of b.rep) {
        n++;
        if (C.res[i] >= 0 && C.res[i] < end) resolvedIn++;
        if (C.fl[i] & THIRD_PARTY) esc.n++;
        if (C.fl[i] & BAD_ESCALATION) esc.bad++;
        if (C.fl[i] & JIRA_OPEN) esc.jiraOpen++;
        if (C.fl[i] & CLOSED_BEFORE_JIRA) esc.early++;
        if (C.fl[i] & MISROUTED) esc.misrouted++;
      }
      for (const i of b.start) {
        const lim = SLA[C.pr[i]], v = C.ip[i];
        for (const a of [action.all, action[prioOf(i)]]) {
          if (!a) continue;
          a.sum += v; a.started++;
          if (lim >= 0) { if (v <= lim) a.ok++; else a.ko++; }
        }
      }
      for (const i of b.late) for (const a of [action.all, action[prioOf(i)]]) if (a) a.ko++;
      for (const i of b.res) {
        const t = Math.max(C.res[i] - C.rep[i], 0);
        for (const k of ['all', groupOf(i)]) {
          const r = res[k];
          if (r) { r.n++; r.sum += t; if (t <= maxOf.get(k)) r.under++; }
        }
        done++;
        if (C.fl[i] & IA_NOTE) ia++;
        if (!OPEN[i]) for (const r of [reop.all, reop[prioOf(i)]]) if (r) { r.done++; if (C.fl[i] & REOPENED) r.re++; }
      }
      if (day < cut) {
        esc.previous += b.previous.length;
        for (const i of b.the) { avg.the[0] += C.the[i]; avg.the[1]++; }
        for (const i of b.tes) { avg.tes[0] += C.tes[i]; avg.tes[1]++; }
        for (const i of b.tsr) { avg.tsr[0] += C.tsr[i]; avg.tsr[1]++; }
      }
    }
    const map = (o, f) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v, k)]));
    return {
      n, resolvedIn, inShare: n ? resolvedIn / n : null,
      action: map(action, (a) => ({ ok: a.ok, ko: a.ko, share: a.ok + a.ko ? a.ok / (a.ok + a.ko) : null, avg: mean(a.sum, a.started) })),
      resolution: map(res, (r, k) => ({ n: r.n, mttr: mean(r.sum, r.n), under: r.n ? r.under / r.n : null, max: maxOf.get(k) })),
      reopen: map(reop, (r) => ({ done: r.done, re: r.re, share: r.done ? r.re / r.done : null })),
      ia: { done, ia, share: done ? ia / done : null },
      esc: { ...esc, thesc: mean(...avg.the), nThesc: avg.the[1], tesc: mean(...avg.tes), nTesc: avg.tes[1], tescr: mean(...avg.tsr), nTescr: avg.tsr[1] },
    };
  };

  // Un periodo [d0, d1) (minutos desde BASE): sus días y, de cada lado, las cifras del periodo y las de cada día (null:
  // ese día queda fuera de lo cargado). Del año anterior, el mismo día un año antes; prevCover: si lo cargado lo cubre.
  const compute = ([d0, d1]) => {
    const days = Array.from({ length: Math.round((d1 - d0) / DAY) }, (_, j) => d0 + j * DAY);
    const cut = jiraCut(), stats = {}, daily = {};
    for (const [side] of SIDES) {
      const buckets = bucketsOf(side), at = side === 'prev' ? yearBack : (x) => x;
      const inside = (day) => day >= FIRST_DAY && day <= LAST_DAY;
      stats[side] = figures(buckets, days.map((x) => dayOf(at(x))).filter(inside), at(d1), cut);
      daily[side] = days.map((x) => {
        const day = dayOf(at(x));
        return inside(day) ? figures(buckets, [day], at(x + DAY), cut) : null;
      });
    }
    const p0 = yearBack(d0), p1 = yearBack(d1);
    return { days, stats, daily, prev: [p0, p1], prevCover: p0 >= MIN_D ? 'full' : p1 > MIN_D ? 'partial' : 'none', jiraCut: cut };
  };

  return { compute };
};
