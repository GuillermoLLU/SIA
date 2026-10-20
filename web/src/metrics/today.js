// La foto de hoy (sin DOM): lo abierto ahora mismo, sea del mes que sea, en listas para actuar, y lo abierto de
// cada persona. m: el modelo (model.js).
import { IDLE_DAYS, RECENT_CRIT_DAYS, OLD_DAYS, DAY } from './rules.js';
import { late, isPrio, isOld, orphansToday } from './backlog.js';

export const todayLists = (m) => {
  const { C, OPEN, S, SNAP: now } = m, L = m.today(), op = L.filter((i) => OPEN[i]);
  const lm = C.lm;   // el último cambio de cada issue; sin él (datos de antes de guardarlo), no se sabe qué lleva parado
  const idle = (i) => (lm ? now - lm[i] : null), stale = (i) => idle(i) > IDLE_DAYS * DAY;
  const waits = (i) => { const k = m.DIMS.sit.get(i); return k === 3 ? 'v' : k === 4 ? 'c' : ''; };
  const byAge = (a, b) => C.rep[a] - C.rep[b], isLate = late(m), prio = isPrio(m);
  const people = S.sides.some((x) => x?.people);
  // quién tiene qué: lo abierto de cada persona, en estas columnas
  const cols = [['Abiertas', () => true], ['Asignada', (i) => m.DI.status[C.st[i]] === 'ASSIGNED'], ['En curso', (i) => m.DI.status[C.st[i]] === 'IN_PROGRESS'],
    ['Pendiente', (i) => m.DI.status[C.st[i]] === 'PENDING'], ['Críticas', (i) => C.pr[i] === m.CRIT], ['PRIO', prio],
    ['Sin iniciar, fuera de plazo', isLate], ['Esperando a un tercero', (i) => waits(i) === 'v'], ['Esperando al cliente', (i) => waits(i) === 'c'],
    [`Más de ${OLD_DAYS} días`, isOld(m)], ...(lm ? [[`Sin cambios en ${IDLE_DAYS} días`, stale]] : [])];
  return {
    op, lm, idle, waits, late: isLate, prio, stale, people,
    // una sola persona, sin comparar: la columna del responsable sobra
    one: S.sides.some((x) => x?.people?.size === 1) && !m.CMP(),
    // las críticas abiertas en los últimos días, resueltas o no, de la más reciente a la más antigua; lo demás, de lo
    // abierto, de la más antigua a la más reciente (lo parado, de lo más parado a lo menos)
    crit: L.filter((i) => C.pr[i] === m.CRIT && now - C.rep[i] <= RECENT_CRIT_DAYS * DAY).sort((a, b) => C.rep[b] - C.rep[a]),
    prioList: op.filter(prio).sort(byAge),
    lateList: op.filter(isLate).sort(byAge),
    vendor: op.filter((i) => waits(i) === 'v').sort(byAge),
    client: op.filter((i) => waits(i) === 'c').sort(byAge),
    staleList: lm ? op.filter(stale).sort((a, b) => lm[a] - lm[b]) : [],
    orphan: people ? [] : orphansToday(m).sort(byAge),
    all: op.slice().sort(byAge),
    cols,
    who: m.group('as', op, true).filter((x) => x.k).map((x) => ({ k: x.k, v: cols.map(([, t]) => x.rows.filter(t).length) })),
    tot: cols.map(([, t]) => op.filter(t).length),
  };
};
