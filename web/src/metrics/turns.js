// Los turnos (sin DOM): lo que entra y se trabaja en cada tipo de turno, el día en 24 horas, lo que se queda para el
// turno siguiente y el reloj semanal. m: el modelo (model.js).
import { SHIFTS } from './shifts.js';

// Por tipo de turno (0–2 laborables, 3–5 fin de semana): los indicadores de lo que entra en él, cuántas entran por
// turno (slots: cuántos turnos de cada tipo hay en el periodo) y el trabajo hecho en él (model.js, shiftWork).
export const perShiftType = (m, l, slots) => {
  const by = slots.map(() => []), w = m.shiftWork(l);
  for (const i of l) by[m.STYPE[i]].push(i);
  return by.map((li, t) => ({ ...m.stats(li), perTurn: slots[t] ? li.length / slots[t] : null, worked: w[t].turns, resTurn: w[t].turns ? w[t].resolved / w[t].turns : null, people: w[t].people, perPerson: w[t].perPerson }));
};

// cuántas issues caen en cada hora del día (at: el instante de cada una, o null)
export const byHour = (m, l, at) => { const v = new Array(24).fill(0); for (const i of l) { const t = at(i); if (t != null) v[m.clock(t)[1]]++; } return v; };

// Qué se queda para el turno siguiente: de lo que entra en cada turno (mañana, tarde, noche, sumando laborables y
// fin de semana), cuándo se empieza; una fila por turno y lado (cos: los lados que se miran).
export const carryRows = (m, T, cos) => {
  const carried = cos.map((k) => m.carry(T[k]));
  return SHIFTS.flatMap((sn, j) => cos.map((k) => ({ label: sn, k, v: carried[cos.indexOf(k)][j].map((v, x) => v + carried[cos.indexOf(k)][j + 3][x]) })));
};

// El reloj semanal: cuántas issues por día de la semana (0 = lunes) y hora de un instante de cada una (at), y el máximo.
export const clockMatrix = (m, list, at) => {
  const hh = Array.from({ length: 7 }, () => new Array(24).fill(0));
  for (const i of list) { const t = at(i); if (t != null) { const [d, h] = m.clock(t); hh[d][h]++; } }
  return { hh, max: Math.max(1, ...hh.flat()) };
};
