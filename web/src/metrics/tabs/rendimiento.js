// Rendimiento equipos (vista Equipo): cómo rinde el equipo de SISU, el de SGA o los dos. Arriba, el selector SISU / SGA
// (hoy.js, sysBarOf: clic, solo ese; otra vez, los dos; Ctrl+clic, uno frente al otro); debajo, los indicadores de lo
// recibido en el periodo (recibidas, entrantes por día, % de resolución, Tatt, Tan, Tesc, MTTR e IDMTTR) y las gráficas:
// la corona (lo abierto ahora que se abrió hasta el final del periodo, por su estado, más lo resuelto en el periodo),
// la antigüedad de lo abierto, lo recibido por prioridad y por tipología (categorización 3).
// Comparando (SISU frente a SGA o, en la barra de arriba, una persona frente a otra), cada gráfica, una por lado, y en
// cada indicador las cifras de los dos: en verde la mejor y en rojo la peor (las de volumen, sin color).
import { esc } from '../../ui/html.js';
import { num, pct, dur, signedDur } from '../format.js';
import { idmttr } from '../resolution.js';
import { workMinutes, WORK_NOTE } from '../hours.js';
import { sysBarOf, sysCmpOf, ofSysOf } from './hoy.js';
import { DAY } from '../rules.js';

// la corona: las situaciones de lo abierto (model.js, SITUATIONS) y lo resuelto (sit 6: Resuelta o Cerrada)
const PARTS = [
  ['asig', 'Asignada', [1, 2], 'En Asignada: sin tocar o devueltas a la cola.'],
  ['prov', 'Pendiente (proveedor)', [3], 'En Pendiente por una acción de un tercero (desarrollo, proveedor…).'],
  ['cli', 'Pendiente (cliente)', [4], 'En Pendiente por una acción o respuesta del centro o del cliente.'],
  ['curso', 'En curso', [0], 'Alguien está trabajando en ellas.'],
  ['otro', 'Pendiente (otro motivo)', [5], 'En Pendiente con otro motivo o sin motivo informado.'],
  ['res', 'Resueltas', [6], 'Resueltas o cerradas en el periodo.'],
].map(([cls, label, sits, tip]) => ({ cls, label, sits, tip, f: sits.map((k) => `sit:${k}`).join('|') }));
const TOP_CATS = 12;

// El reloj de cada incidencia: cuántos minutos de [from, to) cuentan. Las de SISU, solo los de su horario de atención
// (hours.js: de lunes a viernes, de 7 a 22 h); las de SGA, todos (tiempo natural). Solo para el Tatt (phasesOf).
const NATURAL = Object.assign((i, a, b) => Math.max(b - a, 0), { work: () => false });
export const clockOf = (m) => {
  const dow0 = new Date(m.BASE).getUTCDay(), work = (i) => m.DIMS.ss.get(i) === 0;
  return Object.assign((i, a, b) => (work(i) ? workMinutes(a, b, dow0) : Math.max(b - a, 0)), { work });
};

// El TTR de una incidencia, repartido en cuatro tiempos que no se solapan y que lo suman entero:
//   Tatt  de la apertura a la primera atención: el primer paso a En curso o la primera nota [SITUACION INICIAL] (la
//         columna fa del servidor; sin ella, unos datos de antes, el paso a En curso). Sin atender aún, todo es Tatt.
//         Es el único con el reloj de cada una (clock: en SISU, solo su horario de atención).
//   Tesc  tras la primera atención, en Pendiente de proveedor externo (aPv).
//   Tpc   tras la primera atención, en Pendiente de cliente (aPc).
//   Tan   el resto tras la primera atención: Asignada (también si vuelve a la cola), En curso y otras esperas.
// Tras la primera atención, todo en tiempo natural, también en SISU fuera de su horario: lo que pasa ya cuenta. El TTR,
// Tatt más todo lo de después, hasta la resolución o, abierta, hasta la última carga; de una abierta, lo que va de su
// último cambio a la última carga, en su estado de ahora (el servidor mide sus tramos hasta su último cambio). Una
// cancelada sin resolver, null.
export const phasesOf = (m, clock = NATURAL) => (i) => {
  const { C, OPEN, SNAP } = m, rep = C.rep[i], end = C.res[i] >= 0 ? Math.max(C.res[i], rep) : OPEN[i] ? SNAP : null;
  if (end == null) return null;
  const fa = C.fa ? C.fa[i] : C.ip[i];
  if (fa < 0 || rep + fa >= end) { const tatt = clock(i, rep, end); return { tatt, tan: 0, tesc: 0, tpc: 0, ttr: tatt }; }
  const at = rep + fa, col = (k, old) => (C[k] ? C[k][i] : C[old]?.[i] ?? 0);
  let tesc = col('aPv', 'tPv'), tpc = col('aPc', 'tPc');
  if (OPEN[i] && C.lm?.[i] >= 0 && C.lm[i] < SNAP) {
    const tail = SNAP - Math.max(C.lm[i], at), sit = m.DIMS.sit.get(i);
    if (tail > 0 && sit === 3) tesc += tail; else if (tail > 0 && sit === 4) tpc += tail;
  }
  const tatt = clock(i, rep, at), rest = end - at;
  tesc = Math.min(tesc, rest); tpc = Math.min(tpc, rest - tesc);
  return { tatt, tan: rest - tesc - tpc, tesc, tpc, ttr: tatt + rest };
};

// las cifras de una lista (lo recibido en el periodo de un lado) en los indicadores; days: los días del periodo; clock:
// el reloj del Tatt de cada una (clockOf; sin él, el natural). Los tiempos, de media por incidencia (phasesOf: las que
// no pasan por uno, con 0), así que Tatt + Tan + Tesc + Tpc = MTTR. IDMTTR, de las abiertas frente a ese MTTR.
export const performance = (m, list, days, solved, escd, clock = NATURAL) => {
  const { OPEN } = m, mean = (v) => (v.length ? v.reduce((a, b) => a + b, 0) / v.length : null);
  const ph = phasesOf(m, clock), P = list.map((i) => [i, ph(i)]).filter(([, x]) => x);
  const of = (k) => mean(P.map(([, x]) => x[k]));
  // y la mediana de cada uno (la gráfica de la mediana), de las que pasan por él (con algo de ese tiempo: si no, el Tpc o
  // el Tesc, que la mayoría no tiene, darían 0); la del TTR, de todas. No suman la del TTR. medN: de cuántas es cada una
  const median = (v) => { if (!v.length) return null; const s = [...v].sort((a, b) => a - b), h = s.length >> 1; return s.length % 2 ? s[h] : (s[h - 1] + s[h]) / 2; };
  const some = (k) => P.map(([, x]) => x[k]).filter((v) => v > 0), md = (k) => median(some(k));
  const base = { mttr: of('ttr'), n: P.length };
  const idm = P.filter(([i]) => OPEN[i]).map(([, x]) => idmttr(x.ttr, base)).filter((x) => x != null);
  return {
    n: list.length,
    perDay: Array.isArray(days) ? dailyMedian(m, list, ...days) : days > 0 ? list.length / days : null,
    ...(Array.isArray(days) ? (({ weekday, weekend }) => ({ perWeekday: weekday, perWeekend: weekend }))(weekMeans(m, list, ...days)) : { perWeekday: null, perWeekend: null }),
    resolved: list.length ? list.filter(solved).length / list.length : null,
    tatt: of('tatt'), tan: of('tan'), tesc: of('tesc'), tpc: of('tpc'),
    med: { tatt: md('tatt'), tan: md('tan'), tesc: md('tesc'), tpc: md('tpc'), mttr: median(P.map(([, x]) => x.ttr)) },
    medN: { tatt: some('tatt').length, tan: some('tan').length, tesc: some('tesc').length, tpc: some('tpc').length, ttr: P.length },
    mttr: base.mttr,
    idmttr: idm.length ? idm.reduce((a, b) => a + b, 0) : null,
  };
};

// Los días del periodo, para las entrantes por día: días naturales enteros (todos los del calendario que toca [d0, d1),
// también los fines de semana y el de la última carga), sin mirar la hora a la que empieza o acaba.
export const periodDays = (d0, d1) => (d1 > d0 ? Math.ceil(d1 / DAY) - Math.floor(d0 / DAY) : 0);
// La media de entrantes entre semana (de lunes a viernes) y en fin de semana (sábado y domingo): las que entran esos
// días del periodo [d0, d1), por el día de su apertura y a cualquier hora, entre cuántos días de ese tipo tiene (también
// los que no entra ninguna). Sin días de ese tipo, null. → { weekday, weekend }
export const weekMeans = (m, list, d0, d1) => {
  const first = Math.floor(d0 / DAY), n = periodDays(d0, d1), dow0 = new Date(m.BASE).getUTCDay();
  const weekend = (d) => { const g = (((dow0 + d) % 7) + 7) % 7; return g === 0 || g === 6; };
  const days = [0, 0], got = [0, 0];
  for (let k = 0; k < n; k++) days[weekend(first + k) ? 1 : 0]++;
  for (const i of list) { const d = Math.floor(m.C.rep[i] / DAY); if (d >= first && d < first + n) got[weekend(d) ? 1 : 0]++; }
  return { weekday: days[0] ? got[0] / days[0] : null, weekend: days[1] ? got[1] / days[1] : null };
};

// Las entrantes por día: la mediana de cuántas entran cada día natural del periodo [d0, d1), también los días sin
// ninguna (fines de semana, festivos), por el día de su apertura, a cualquier hora. Sin días, null.
export const dailyMedian = (m, list, d0, d1) => {
  const first = Math.floor(d0 / DAY), n = periodDays(d0, d1);
  if (!n) return null;
  const per = new Array(n).fill(0);
  for (const i of list) { const k = Math.floor(m.C.rep[i] / DAY) - first; if (k >= 0 && k < n) per[k]++; }
  per.sort((a, b) => a - b);
  return n % 2 ? per[(n - 1) / 2] : (per[n / 2 - 1] + per[n / 2]) / 2;
};

// los indicadores: [clave, nombre, formato, qué es mejor, qué mide, filtro al pincharlo (los que tienen dimensión)]
const OPEN_F = [0, 1, 2, 3, 4, 5].map((k) => `sit:${k}`).join('|');
const TIME_NOTE = `De media por incidencia, resueltas y abiertas (estas, hasta la última carga); las que no pasan por ahí, con 0: así, Tatt + Tan + Tesc + Tpc = MTTR. ${WORK_NOTE}`;
const FIGS = [
  ['n', 'Recibidas', num, null, 'Incidencias recibidas en el periodo.'],
  ['perWeekday', 'Entrantes entre semana', (v) => v.toLocaleString('es-ES', { maximumFractionDigits: 1 }), null, 'La media de las recibidas cada día de lunes a viernes del periodo (también los que no entra ninguna), a cualquier hora.'],
  ['perWeekend', 'Entrantes en finde', (v) => v.toLocaleString('es-ES', { maximumFractionDigits: 1 }), null, 'La media de las recibidas cada sábado y domingo del periodo (también los que no entra ninguna), a cualquier hora. Sin ningún fin de semana en el periodo, —.'],
  ['resolved', '% de resolución', (v) => pct(v, 1), 'high', 'De lo recibido en el periodo, lo que ya está resuelto o cerrado.', 'sit:6'],
  ['tatt', 'Tatt', dur, 'low', 'De la apertura a la primera atención: el primer paso a En curso o la primera nota [SITUACION INICIAL], lo que llegue antes; sin atender aún, hasta la última carga. ' + TIME_NOTE],
  ['tan', 'Tan', dur, 'low', 'Tras la primera atención, lo que está Asignada (también si vuelve a la cola) o En curso, y las esperas que no son del proveedor ni del cliente. ' + TIME_NOTE],
  ['tesc', 'Tesc', dur, 'low', 'Tras la primera atención, lo que está en Pendiente de proveedor externo (un tercero: desarrollo, proveedor…). ' + TIME_NOTE, 'es:1'],
  // Tpc: lo que se espera al centro o al cliente; sin color (no depende solo del equipo)
  ['tpc', 'Tpc', dur, null, 'Tras la primera atención, lo que está en Pendiente de cliente: esperando una acción o una respuesta del centro o del cliente. Sin color: no depende solo del equipo. ' + TIME_NOTE],
  ['mttr', 'MTTR', dur, 'low', 'De lo recibido en el periodo: (TTR de las resueltas + lo que llevan abiertas las que siguen abiertas) / cuántas son. Es la suma de Tatt, Tan, Tesc y Tpc. ' + WORK_NOTE],
  ['idmttr', 'IDMTTR', signedDur, 'low', 'El impacto en el MTTR de las que siguen abiertas: la suma de (su edad − MTTR) / N, con el MTTR y N de lo recibido en el periodo. Positivo, lo suben; negativo, lo bajan. ' + WORK_NOTE, OPEN_F],
];

// en cada indicador, cuál de los dos va mejor: [clase del primero, del segundo] (good / bad; sin sentido o empate, sin color)
export const tones = (a, b, better) => {
  if (!better || a == null || b == null || a === b) return ['', ''];
  const first = better === 'high' ? a > b : a < b;
  return first ? ['good', 'bad'] : ['bad', 'good'];
};

// Los tiempos de los indicadores, uno tras otro en una barra (una por lado, en la misma escala): Tatt, Tan, Tesc y Tpc,
// que suman el MTTR (phasesOf). Al final de cada barra, su total. segments(f): [[nombre, minutos, clase, qué es]] de las
// cifras f (performance), sin los que no hay.
const TIME_PARTS = [['Tatt', 'tatt', 'De la apertura a la primera atención (En curso o la nota [SITUACION INICIAL]).', 'mt-part0'],
  ['Tan', 'tan', 'Tras la primera atención: Asignada (también de vuelta a la cola) o En curso, y otras esperas.', 'mt-part1'],
  ['Tesc', 'tesc', 'Tras la primera atención: en Pendiente de proveedor externo.', 'mt-part2'],
  ['Tpc', 'tpc', 'Tras la primera atención: en Pendiente de cliente.', 'mt-part4']];
export const segments = (f) => TIME_PARTS.map(([l, k, tip, cls]) => [l, f[k] ?? 0, cls, tip]).filter((s) => s[1] > 0);
// G: [[lado (j), sin escalar, escaladas]] con las cifras (performance) de cada parte; una barra por parte y lado, todas
// en la misma escala
export const TIME_KINDS = ['Sin escalar', 'Escaladas'];
// la vista en la que la gráfica de los tiempos va con la mediana (faces.js); en las demás, con la media
export const MEDIAN_FACE = 'tecnicas';
// median: con la mediana de cada tramo (f.med) en vez de la media. Las medianas no se suman: la barra es la suma de las
// de sus tramos y una raya marca la mediana del TTR (lo del final de la barra).
const timesBar = (G, sd, focusCls, median = false) => {
  const two = sd.ks.length > 1, order = (l) => { const j = TIME_PARTS.findIndex((p) => p[0] === l); return j < 0 ? TIME_PARTS.length : j; };   // la leyenda, en el orden de la barra
  const word = median ? 'mediana' : 'de media';
  // por partes: las sin escalar de cada lado juntas y, aparte, las escaladas
  const bars = TIME_KINDS.flatMap((kind, e) => G.map(([j, ...F]) => { const f = median ? F[e].med : F[e]; return { j, kind, n: F[e].n, seg: segments(f), ttr: f.mttr, cnt: F[e].medN }; }));
  const tot = bars.map((b) => (median ? b.ttr ?? 0 : b.seg.reduce((a, x) => a + x[1], 0)));
  const max = Math.max(1, ...tot, ...bars.map((b) => b.seg.reduce((a, x) => a + x[1], 0)));
  const names = [...new Map(bars.flatMap((b) => b.seg).map((s) => [s[0], s])).values()].sort((a, b) => order(a[0]) - order(b[0]));
  const legend = `<div class="mt-legend">${names.map(([l, , c, tip]) => `<span data-tip="${esc(tip)}"><i class="${c}"></i>${esc(l)}</span>`).join('')}</div>`;
  const rows = bars.map((b, r) => {
    const who = two ? `${sd.name(sd.ks[b.j])} · ` : '';
    // comparando, el nombre de la parte encima de sus barras y en cada una, el del lado
    const head = two && b.j === 0 ? `<div class="mt-rd-kind${r ? ' mt-rd-gap' : ''}">${b.kind}</div>` : '';
    const f = `es:${TIME_KINDS.indexOf(b.kind)}`;   // cada parte filtra: sin escalar o escaladas
    const mark = median && tot[r] ? `<b class="mt-rd-mark" style="left:${(tot[r] / max * 100).toFixed(2)}%" data-tip="${esc(`${who}${b.kind} · mediana del TTR: ${dur(tot[r])}`)}"></b>` : '';
    return `${head}<div class="mt-split mt-rd-times mt-clk ${focusCls(f)}" data-f="${f}"><span class="mt-split-l" data-tip="${esc(`${who}${b.kind}: ${num(b.n)} recibidas en el periodo\nClic para filtrar toda la página.`)}">${two ? `<i class="mt-sw mt-c${sd.ks[b.j]}"></i>${esc(sd.name(sd.ks[b.j]))}` : b.kind}</span>
    <span class="mt-hbar mt-split-b${median ? ' mt-rd-med' : ''}">${b.seg.map(([l, v, c]) => `<i class="${c}" style="width:${(v / max * 100).toFixed(2)}%" data-tip="${esc(`${who}${b.kind} · ${l}: ${dur(v)} ${word} por incidencia${median ? `, de las ${num(b.cnt[TIME_PARTS.find((p) => p[0] === l)[1]])} que pasan por ahí` : ''}`)}">${v / max >= 0.1 ? dur(v) : ''}</i>`).join('')}${mark}</span>
    <span class="mt-split-n" data-tip="${esc(`${median ? 'Mediana del TTR' : 'MTTR'}: ${tot[r] ? dur(tot[r]) : '—'} por incidencia (de ${num(b.n)})`)}">${tot[r] ? dur(tot[r]) : '—'}</span></div>`;
  }).join('');
  // por incidencia: cada tramo, la media (o la mediana) de ese tiempo en cada incidencia (las que no pasan por él, con 0),
  // no la suma de todas; con la media, uno tras otro suman el TTR medio (el MTTR)
  const tip = median
    ? `Por incidencia: cada tramo es la mediana de lo que pasa en él cada incidencia de las que pasan por él (el Tpc, de las que han estado en Pendiente de cliente; el Tesc, de las que han estado en Pendiente de proveedor): lo de una incidencia normal cuando le toca ese tramo. La mediana del TTR, de todas. Las medianas no se suman: la barra es la suma de las de sus tramos y la raya, la mediana del TTR, que es lo del final. Así se ve lo de una incidencia normal, sin las que tardan muchísimo. De lo recibido en el periodo, resueltas y abiertas (estas, hasta la última carga). Todas las barras, en la misma escala.\n${WORK_NOTE}`
    : `Por incidencia: cada tramo es lo que pasa de media cada incidencia en él (la suma de ese tiempo entre cuántas son; las que no pasan por él cuentan con 0), no el total acumulado. Uno tras otro, Tatt, Tan, Tesc y Tpc no se solapan y suman el MTTR, al final de cada barra. De lo recibido en el periodo, resueltas y abiertas (estas, hasta la última carga). Todas las barras, en la misma escala.\n${WORK_NOTE}`;
  const key = median ? `<span><i class="mt-rd-key"></i>Mediana del TTR</span>` : '';
  return `<section class="mt-card mt-s12 mt-rd-timecard"><h3 data-tip="${esc(tip)}">Tiempo ${median ? 'mediano' : 'medio'} por incidencia</h3>${legend.replace(/<\/div>$/, `${key}</div>`)}${rows}</section>`;
};

export const rendimientoTab = (t) => {
  const { m, ch, ui, grid, solved, escd } = t;
  const { C, S, OPEN, CO, bySide, isSel } = m;
  const { card, kpi, kpis, donut } = ch;

  // los lados que se ven: comparando SISU y SGA, los dos sistemas del único lado; comparando en la barra, los dos lados;
  // si no, el único. of(listas por lado) → una lista por lado que se ve
  const sidesOf = () => {
    if (sysCmpOf(m, ui)) { const b = CO()[0]; return { ks: [0, 1], name: m.DIMS.ss.label, of: (P) => [0, 1].map((k) => ofSysOf(m, P[b], k)) }; }
    const ks = CO();
    return { ks, name: t.name, of: (P) => { const out = []; ks.forEach((k, j) => { out[j] = P[k]; }); return out; } };
  };

  const empty = '<p class="mt-mut mt-small">Sin datos con estos filtros.</p>';
  const head = (sd, j) => (sd.ks.length > 1 ? `<i class="mt-sw mt-c${sd.ks[j]}"></i>${esc(sd.name(sd.ks[j]))} · ` : '');

  // barras horizontales: rows [{ label, v, f }]; color: el del lado
  const hbars = (rows, k, unit) => {
    const max = Math.max(1, ...rows.map((r) => r.v));
    return rows.length ? `<div class="mt-hb">${rows.map((r) => {
      return `<div class="mt-hb-row mt-clk ${t.focusCls(r.f)}" data-f="${r.f}" data-tip="${esc(`${r.label}: ${num(r.v)} ${unit}\nClic para filtrar toda la página.`)}"><span class="mt-hb-x">${esc(r.label)}</span>
      <span class="mt-hb-track"><i class="mt-c${k}" style="width:${(r.v / max * 100).toFixed(1)}%"></i></span><span class="mt-hb-v">${num(r.v)}</span></div>`;
    }).join('')}</div>` : empty;
  };

  // opts.face: en Técnicas, la gráfica de los tiempos con la mediana; en Equipo (y en los informes), con la media
  return (A, opts = {}) => {
    const median = opts.face === MEDIAN_FACE;
    const sd = sidesOf(), two = sd.ks.length > 1, span = two ? 's6' : 's4';
    const days = [S.d0, Math.min(S.d1, m.END_D)];   // las entrantes por día, la mediana de sus días (dailyMedian)
    // lo de la corona: lo abierto ahora que se abrió hasta el final del periodo y lo resuelto en el periodo
    const inRing = (i) => (OPEN[i] ? C.rep[i] < S.d1 : solved(i) && C.res[i] >= S.d0 && C.res[i] < S.d1);
    const openNow = (i) => OPEN[i] && C.rep[i] < S.d1;
    // con un estado, una antigüedad, una prioridad o una tipología elegidos, los demás siguen (apagados: model.js, widen)
    const wideOf = (dims, keep) => sd.of(bySide(m.widen(m.today().filter(keep), dims, { now: true, keep })));
    const ring = wideOf(['sit'], inRing), ages = wideOf(['age'], openNow);
    const recvP = sd.of(bySide(m.widen(A, ['pr']))), recvK = sd.of(bySide(m.widen(A, ['k3']))), recv = sd.of(bySide(A));

    // los indicadores
    const clock = clockOf(m);   // los tiempos de SISU, solo en su horario de atención (hours.js)
    const F = recv.map((l) => performance(m, l, days, solved, escd, clock));
    // con filtro: clic, centrarse en eso (otro clic, soltarlo; Ctrl+clic, sumarlo), como los demás filtros
    const on = (f) => f.split('|').every((x) => isSel(x.split(':')[0], +x.split(':')[1]));
    const figs = FIGS.map(([key, label, fmt, better, note, f]) => {
      const v = (j) => (F[j][key] == null ? '—' : fmt(F[j][key]));
      const cls = f ? ` mt-clk${on(f) ? ' mt-on' : ''}` : '';
      const attrs = f ? ` data-f${f.includes('|') ? '2' : ''}="${f}" role="button" tabindex="0" aria-pressed="${on(f)}"` : '';
      const tip = `${note}${two && better ? '\nEn verde, el que va mejor; en rojo, el que va peor.' : ''}${f ? `\n${on(f) ? 'Clic para quitar el filtro.' : 'Clic para ver solo estas.'}` : ''}`;
      if (!two) return kpi(label, v(0), '', cls.trim(), `data-tip="${esc(tip)}"${attrs}`);
      const tn = tones(F[0][key], F[1][key], better);
      return `<div class="mt-kpi mt-kpi-co mt-rd-kpi${cls}"${attrs} data-tip="${esc(tip)}"><div class="mt-kpi-l">${label}</div>
        ${[0, 1].map((j) => `<div class="mt-kpi-s"><i class="mt-c${sd.ks[j]}"></i><span>${esc(sd.name(sd.ks[j]))}</span><b class="mt-diff ${tn[j]}">${v(j)}</b></div>`).join('')}</div>`;
    });

    // debajo de los indicadores, sus tiempos en una barra acumulada (timesBar): Tatt, Tan, Tesc y, hasta el MTTR, el resto
    const recvE = sd.of(bySide(m.widen(A, ['es'])));   // con una parte elegida, la otra sigue (apagada)
    const TG = recvE.map((l, j) => [j, performance(m, l.filter((i) => !escd(i)), days, solved, escd, clock), performance(m, l.filter(escd), days, solved, escd, clock)]);
    const times = timesBar(TG, sd, t.focusCls, median);

    // la corona de un lado
    const ringCard = (j) => {
      const l = ring[j], at = (p) => l.filter((i) => p.sits.includes(m.DIMS.sit.get(i))).length;
      const shown = PARTS.filter((p) => p.cls !== 'otro' || at(p));
      const total = l.length;
      const legend = shown.map((p) => `<tr class="mt-clk ${t.focusCls(p.f)}" data-f${p.f.includes('|') ? '2' : ''}="${p.f}" data-tip="${esc(p.tip)}"><th><i class="mt-dn-sw mt-dn-${p.cls}"></i>${p.label}</th><td class="mt-num"><b>${num(at(p))}</b><small>${total ? pct(at(p) / total) : '—'}</small></td></tr>`).join('');
      const body = total ? `<div class="mt-dn">${donut(shown.map((p) => ({ ...p, v: at(p) })), [num(total), 'incidencias'], 116)}<table class="mt-dn-legend">${legend}</table></div>` : '<p class="mt-none-open">Sin incidencias</p>';
      return card(`${head(sd, j)}En qué estado está`, body, { span, tip: 'Lo abierto ahora que se abrió hasta el final del periodo, por su estado, y lo resuelto o cerrado en el periodo. Clic en un estado para filtrar.' });
    };
    const ageCard = (j) => card(`${head(sd, j)}Antigüedad de lo abierto`, hbars([0, 1, 2, 3, 4].map((k) => ({ label: m.DIMS.age.label(k), v: ages[j].filter((i) => m.DIMS.age.get(i) === k).length, f: `age:${k}` })), sd.ks[j], 'abiertas'),
      { span, tip: 'Lo abierto ahora que se abrió hasta el final del periodo, por los días que lleva abierto. Clic en una barra para filtrar.' });
    const prioCard = (j) => card(`${head(sd, j)}Recibidas por prioridad`, hbars(m.PRIOS.map((p) => ({ label: m.DIMS.pr.label(p), v: recvP[j].filter((i) => C.pr[i] === p).length, f: `pr:${p}` })), sd.ks[j], 'recibidas'),
      { span, tip: 'Lo recibido en el periodo, por prioridad. Clic en una barra para filtrar.' });
    // lo recibido por una dimensión (la tipología o el producto): sus TOP_CATS con más incidencias; L: lo de cada lado
    const topCard = (dim, L, title, what) => (j) => {
      const cnt = new Map(); for (const i of L[j]) { const k = m.DIMS[dim].get(i); cnt.set(k, (cnt.get(k) || 0) + 1); }
      const rows = [...cnt].sort((a, b) => b[1] - a[1]).slice(0, TOP_CATS).map(([k, v]) => ({ label: m.DIMS[dim].label(k), v, f: `${dim}:${k}` }));
      return card(`${head(sd, j)}${title}`, hbars(rows, sd.ks[j], 'recibidas'),
        { span: 's6', tip: `Lo recibido en el periodo, por ${what}: los ${TOP_CATS} con más incidencias. Clic en una barra para filtrar.` });
    };
    const catCard = topCard('k3', recvK, 'Recibidas por categorización', 'su tipología (categorización 3 de Remedy)');
    // el producto: la categoría de producto 3 de Remedy (el módulo / sistema)
    const prodCard = topCard('mo', sd.of(bySide(m.widen(A, ['mo']))), 'Recibidas por producto', 'su producto (categoría de producto 3 de Remedy: el módulo o sistema)');

    const each = (f) => sd.ks.map((_, j) => f(j)).join('');
    return grid(`<div class="mt-s12 mt-rd-top">${sysBarOf(m, ui)}<span class="mt-rd-hours" data-tip="${esc(WORK_NOTE)}">Tatt de SISU en su horario: de lunes a viernes, de 7 a 22 h</span></div>`,
      kpis(...figs), times,
      each(ringCard), each(ageCard), each(prioCard), each(catCard), each(prodCard));
  };
};
