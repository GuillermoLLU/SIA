// Quién tiene qué (sin DOM): lo abierto ahora mismo de cada persona, sea del mes que sea, en unas columnas y con su
// total. Lo enseña el Resumen. m: el modelo (model.js).
import { IDLE_DAYS, OLD_DAYS, DAY } from './rules.js';
import { late, isPrio, isOld } from './backlog.js';

export const whoHas = (m) => {
  const { C, SNAP: now } = m, op = m.today().filter((i) => m.OPEN[i]);
  const lm = C.lm;   // el último cambio de cada issue; sin él (datos de antes de guardarlo), no se sabe qué lleva parado
  const waits = (i) => { const k = m.DIMS.sit.get(i); return k === 3 ? 'v' : k === 4 ? 'c' : ''; };
  const cols = [['Abiertas', () => true], ['Asignada', (i) => m.DI.status[C.st[i]] === 'ASSIGNED'], ['En curso', (i) => m.DI.status[C.st[i]] === 'IN_PROGRESS'],
    ['Pendiente', (i) => m.DI.status[C.st[i]] === 'PENDING'], ['Críticas', (i) => C.pr[i] === m.CRIT], ['PRIO', isPrio(m)],
    ['Sin iniciar, fuera de plazo', late(m)], ['Esperando a un tercero', (i) => waits(i) === 'v'], ['Esperando al cliente', (i) => waits(i) === 'c'],
    [`Más de ${OLD_DAYS} días`, isOld(m)], ...(lm ? [[`Sin cambios en ${IDLE_DAYS} días`, (i) => now - lm[i] > IDLE_DAYS * DAY]] : [])];
  return {
    op,
    cols,
    who: m.group('as', op, true).filter((x) => x.k).map((x) => ({ k: x.k, v: cols.map(([, t]) => x.rows.filter(t).length) })),
    tot: cols.map(([, t]) => op.filter(t).length),
  };
};
