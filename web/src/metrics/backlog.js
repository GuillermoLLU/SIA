// Lo pendiente (sin DOM): en qué situación está, qué conviene vigilar, lo que no tiene a nadie y, comparando,
// cómo está lo de cada lado. m: el modelo (model.js).
import { SITUATIONS } from './model.js';
import { OLD_DAYS, DAY, isLate } from './rules.js';

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
const cards = (m) => (i) => m.DIMS.tj.get(i);
export const isPrio = (m) => (i) => cards(m)(i).includes(2);
const inPeriod = (m) => (i) => m.MONTH[i] >= m.S.from && m.MONTH[i] <= m.S.to;
// lo que no tiene a nadie: abierto, de las tarjetas del equipo (SGA, SISU o PRIO) y del periodo, con los filtros
export const orphansIn = (m) => m.today(true).filter((i) => m.OPEN[i] && !m.C.as[i] && inPeriod(m)(i) && cards(m)(i).some((k) => k < 3));
// lo mismo, de cualquier mes (la foto de hoy)
export const orphansToday = (m) => m.today(true).filter((i) => m.OPEN[i] && !m.C.as[i] && cards(m)(i).some((k) => k < 3));

// Lo que conviene vigilar dentro de lo pendiente (se solapa: no se suma): [nombre, prueba, nota, filtro].
export const watchList = (m) => [
  ['Fuera de plazo', late(m), 'Nunca han pasado a En curso y ya superan el plazo de su prioridad.', 'sl:4'],
  [`Con más de ${OLD_DAYS} días`, isOld(m), `Llevan más de ${OLD_DAYS} días abiertas: si sube, el backlog envejece.`, OLD_FILTER],
  ['Escaladas', escalated(m), 'Con ticket de tercero, estén en el estado que estén (por eso no coincide con «espera tercero»: algunas ya se están trabajando o han vuelto a la cola).', 'es:1'],
  ['Críticas', (i) => m.C.pr[i] === m.CRIT, 'De prioridad crítica.', `pr:${m.CRIT}`],
  ['PRIO', isPrio(m), 'Priorizadas por negocio.', 'tj:2'],
];

// la antigüedad media de unas issues, en días (null sin ninguna)
export const meanAge = (m, l) => (l.length ? l.reduce((a, i) => a + m.SNAP - m.C.rep[i], 0) / l.length / DAY : null);
// el lado con menos (el que va mejor), o -1 si se ven iguales (al redondear con `same`) o falta uno
export const lower = (a, b, same) => (a == null || b == null || same(a) === same(b) ? -1 : a < b ? 0 : 1);

// Comparando, de cada fila de lo pendiente (r.test; sin prueba, todo) y por lado: sus issues por persona (c), qué
// parte son de sus pendientes (sh) y cuánto llevan abiertas de media (age); y qué lado va mejor en lo principal
// (main: con personas, por las issues; entre empresas, por el %; solo si r.better) y en la antigüedad (old).
export const pendingCells = (m, T, H, pp, r) => {
  const v = [0, 1].map((k) => { const l = r.test ? T[k].filter(r.test) : T[k]; return { c: l.length / H[k], sh: T[k].length ? l.length / T[k].length : null, age: meanAge(m, l) }; });
  const main = r.better ? (pp ? lower(v[0].c, v[1].c, (x) => Math.round(x * 10)) : lower(v[0].sh, v[1].sh, (x) => Math.round(x * 100))) : -1;
  const old = r.better || !r.test ? lower(v[0].age, v[1].age, (x) => Math.round(x * 10)) : -1;
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
