// Lo pendiente (sin DOM): en qué situación está, qué conviene vigilar, lo que no tiene a nadie y, comparando,
// cómo está lo de cada lado. m: el modelo (model.js).
import { SITUATIONS, REOPENED, MISROUTED } from './model.js';
import { OLD_DAYS, DAY, isLate } from './rules.js';
import { slotOf } from './shifts.js';

// Su situación (model.js, SITUATIONS): en curso, en Asignada sin tocar o devuelta, o en espera (Pendiente) de un
// tercero, del cliente o por otro motivo; las seis suman todo lo abierto.
const SIT_TIPS = ['Alguien está trabajando en ellas.', 'En Asignada y sin ningún movimiento desde que se abrieron: nadie las ha mirado.',
  'En Asignada, pero ya se trabajaron: pasaron por En curso o Pendiente, o tienen ticket de tercero. Están paradas en la cola.',
  'En Pendiente por una acción de un tercero (desarrollo, proveedor…).',
  'En Pendiente por una acción o respuesta del centro o del cliente.', 'En Pendiente con otro motivo o sin motivo informado.'];
export const situations = (m) => SIT_TIPS.map((tip, k) => ({ label: SITUATIONS[k], test: (i) => m.DIMS.sit.get(i) === k, f: `sit:${k}`, tip }));
// los dos tramos de antigüedad de más de OLD_DAYS (model.js, AGE_LIMITS), para filtrar con un clic
export const OLD_FILTER = 'age:3|age:4';
export const ages = (m) => [0, 1, 2, 3, 4].map((k) => ({ label: m.DIMS.age.label(k), test: (i) => m.DIMS.age.get(i) === k, f: `age:${k}` }));

export const isOld = (m) => (i) => m.SNAP - m.C.rep[i] > OLD_DAYS * DAY;
export const late = (m) => (i) => isLate(m.OPEN[i], m.C.ip[i], m.SLA[m.C.pr[i]], m.SNAP - m.C.rep[i]);
export const escalated = (m) => (i) => m.C.vt[i] > 0;
// volvieron de Resuelta a abierta; un clic filtra por esa marca de calidad (model.js, DIMS.q: 0, Reabierta)
export const reopened = (m) => (i) => (m.C.fl[i] & REOPENED) !== 0;
export const REOPEN_FILTER = 'q:0';
export const REOPEN_TIP = 'Volvieron de Resuelta a abierta: la resolución no le sirvió al centro.';
// algún Jira suyo se descartó o pasó de un equipo a otro (model.js, DIMS.mx)
export const misrouted = (m) => (i) => (m.C.fl[i] & MISROUTED) !== 0;
export const MISROUTED_FILTER = 'mx:1';
export const MISROUTED_TIP = 'Algún Jira suyo se descartó o pasó de un equipo a otro (de proyecto o de equipo asignado): se escaló a quien no era.';
const cards = (m) => (i) => m.DIMS.tj.get(i);
export const isPrio = (m) => (i) => cards(m)(i).includes(2);
// lo que no tiene a nadie: abierto, de las tarjetas del equipo (SGA, SISU o PRIO) y del periodo, con los filtros
export const orphansIn = (m) => m.today(true).filter((i) => m.OPEN[i] && !m.C.as[i] && m.inPeriod(i) && cards(m)(i).some((k) => k < 3));

// Lo que conviene vigilar dentro de lo pendiente (se solapa: no se suma): [nombre, prueba, nota, filtro].
export const watchList = (m) => [
  ['Fuera de plazo', late(m), 'Nunca han pasado a En curso y ya superan el plazo de su prioridad.', 'sl:4'],
  [`Con más de ${OLD_DAYS} días`, isOld(m), `Llevan más de ${OLD_DAYS} días abiertas: si sube, el backlog envejece.`, OLD_FILTER],
  ['Escaladas', escalated(m), 'Con ticket de tercero, estén en el estado que estén (por eso no coincide con «espera tercero»: algunas ya se están trabajando o han vuelto a la cola).', 'es:1'],
  ['Mal escaladas', misrouted(m), MISROUTED_TIP, MISROUTED_FILTER],
  ['Reabiertas', reopened(m), REOPEN_TIP, REOPEN_FILTER],
  ['Críticas', (i) => m.C.pr[i] === m.CRIT, 'De prioridad crítica.', `pr:${m.CRIT}`],
  ['PRIO', isPrio(m), 'Priorizadas por negocio.', 'tj:2'],
];

// la antigüedad media de unas issues, en minutos (null sin ninguna)
export const meanAge = (m, l) => (l.length ? l.reduce((a, i) => a + m.SNAP - m.C.rep[i], 0) / l.length : null);


// El backlog al acabar cada uno de los n días desde d0 (minutos desde BASE): cuántas de `list` estaban abiertas. Una
// issue está abierta desde su apertura hasta que se resuelve; una cancelada sin resolver, hasta su último cambio; una
// abierta aún, hasta hoy. Se cuenta de una pasada, sumando donde entra y restando donde sale.
export const backlogByDay = (m, list, d0, n) => {
  const { C, OPEN } = m, diff = new Int32Array(n + 1), at = (t) => Math.min(Math.max(Math.floor((t - d0) / DAY), 0), n);
  for (const i of list) {
    const end = C.res[i] >= 0 ? C.res[i] : OPEN[i] ? Infinity : C.lm[i] >= 0 ? C.lm[i] : C.rep[i];
    const a = at(C.rep[i]), b = end === Infinity ? n : at(end);
    if (a < b) { diff[a]++; diff[b]--; }
  }
  const out = new Array(n);
  for (let j = 0, run = 0; j < n; j++) out[j] = (run += diff[j]);
  return out;
};

// Entrantes frente a atendidas, cada uno de los n días desde d0 (minutos desde BASE): cuántas de `list` se abrieron
// ese día (inc) y, de esas, cuántas se atendieron el mismo día en que entraron: pasaron a Resuelta (res), a Pendiente
// de proveedor (ven) o a Pendiente de cliente (cli), por los días que guarda el bridge (dataset.js: eR, eV, eC; sin
// ellos, a cero). Cada una cuenta una vez, en lo más avanzado que le pasó ese día (resuelta, luego proveedor, luego
// cliente): lo atendido nunca pasa de lo que entró. Y, aparte, lo atendido del backlog (bkl): las que entraron antes y
// ese día pasaron a Resuelta, a Pendiente de proveedor o a Pendiente de cliente (solo los tipos de `kinds`: lo que se
// mira), una vez por issue y día.
export const flowByDay = (m, list, d0, n, kinds = ['res', 'ven', 'cli']) => {
  const { C } = m, day0 = Math.floor(d0 / DAY), zero = () => new Array(n).fill(0);
  const out = { inc: zero(), res: zero(), ven: zero(), cli: zero(), bkl: zero() };
  for (const i of list) {
    const d = Math.floor(C.rep[i] / DAY), j = d - day0, R = C.eR?.[i] || [], V = C.eV?.[i] || [], K = C.eC?.[i] || [];
    const acted = [...(kinds.includes('res') ? R : []), ...(kinds.includes('ven') ? V : []), ...(kinds.includes('cli') ? K : [])];
    for (const e of new Set(acted)) { const je = e - day0; if (e > d && je >= 0 && je < n) out.bkl[je]++; }
    if (j < 0 || j >= n) continue;
    out.inc[j]++;
    if (R.includes(d)) out.res[j]++;
    else if (V.includes(d)) out.ven[j]++;
    else if (K.includes(d)) out.cli[j]++;
  }
  return out;
};

// Lo mismo, de unos tipos de turno (kinds: 0 mañana, 1 tarde, 2 noche; shifts.js), juntos, cada uno de los n días desde d0: cuántas
// de `list` entraron en ese turno (inc) y, de esas, cuántas se atendieron en el mismo turno en que entraron (res, ven,
// cli: por los turnos que guarda el bridge, dataset.js sR/sV/sC; cada una, una vez, en lo más avanzado). Cada turno
// cuenta en el día en que empieza (la noche del lunes, de 23 a 7, es del lunes). Sin lo del backlog (bkl, a cero).
const SLOT0 = 7 * 60, SLOT_LEN = 8 * 60;
export const flowByShift = (m, list, d0, n, kinds) => {
  const want = new Set(kinds);
  const { C } = m, day0 = Math.floor(d0 / DAY), zero = () => new Array(n).fill(0);
  const out = { inc: zero(), res: zero(), ven: zero(), cli: zero(), bkl: zero() };
  for (const i of list) {
    const s = slotOf(C.rep[i]);
    if (!want.has(((s % 3) + 3) % 3)) continue;
    const j = Math.floor((SLOT0 + s * SLOT_LEN) / DAY) - day0;
    if (j < 0 || j >= n) continue;
    out.inc[j]++;
    if (C.sR?.[i]?.includes(s)) out.res[j]++;
    else if (C.sV?.[i]?.includes(s)) out.ven[j]++;
    else if (C.sC?.[i]?.includes(s)) out.cli[j]++;
  }
  return out;
};

// La línea de tendencia de una serie (mínimos cuadrados): valor en el primer punto (a) y cuánto sube o baja por punto
// (b). Con menos de dos puntos, plana.
export const trendOf = (v) => {
  const n = v.length;
  if (n < 2) return { a: v[0] ?? 0, b: 0 };
  const mx = (n - 1) / 2, my = v.reduce((s, y) => s + y, 0) / n;
  let sxy = 0, sxx = 0;
  v.forEach((y, x) => { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; });
  const b = sxy / sxx;
  return { a: my - b * mx, b };
};
// el lado con menos (el que va mejor), o -1 si se ven iguales (al redondear con `same`) o falta uno
const lower = (a, b, same) => (a == null || b == null || same(a) === same(b) ? -1 : a < b ? 0 : 1);

// Comparando, de cada fila de lo pendiente (r.test; sin prueba, todo) y por lado: sus issues por persona (c), qué
// parte son de sus pendientes (sh) y cuánto llevan abiertas de media (age); y qué lado va mejor en lo principal
// (main: con personas, por las issues; entre empresas, por el %; solo si r.better) y en la antigüedad (old).
export const pendingCells = (m, T, H, pp, r) => {
  const v = [0, 1].map((k) => { const l = r.test ? T[k].filter(r.test) : T[k]; return { c: l.length / H[k], sh: T[k].length ? l.length / T[k].length : null, age: meanAge(m, l) }; });
  const main = r.better ? (pp ? lower(v[0].c, v[1].c, (x) => Math.round(x * 10)) : lower(v[0].sh, v[1].sh, (x) => Math.round(x * 100))) : -1;
  const old = r.better || !r.test ? lower(v[0].age, v[1].age, (x) => Math.round(x / 60)) : -1;   // iguales si lo son en horas
  return { v, main, old };
};

// Comparando, las cifras de arriba del Backlog: por lado, lo que cumple algo de sus pendientes P (part: con personas,
// issues por persona; entre empresas, qué parte de sus pendientes), su antigüedad media y los días de entrada
// acumulados (las pendientes entre lo que entra al día: compara a quien recibe mucho con quien recibe poco).
export const backlogFigures = (m, T, P, H, pp, days) => ({
  part: (test) => [0, 1].map((k) => { const c = P[k].filter(test).length; return { n: P[k].length, v: pp ? c / H[k] : P[k].length ? c / P[k].length : null }; }),
  age: [0, 1].map((k) => ({ n: P[k].length, v: meanAge(m, P[k]) })),
  stock: [0, 1].map((k) => ({ n: T[k].length, v: P[k].length / (T[k].length / days) })),
});
