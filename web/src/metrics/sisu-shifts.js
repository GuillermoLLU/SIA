// Los turnos de SISU (sin DOM): solo de lunes a viernes, mañana de 7 a 15 h y tarde de 14 a 22 h (se solapan de 14 a 15).
// En la pestaña Turnos (tabs/turnos.js), mirando solo SISU, en vez de los tres turnos de 24 h (shifts.js).
//
// Cada incidencia la recibe un turno concreto (shiftOf, por la hora de su apertura): la de mañana, lo que entra de 7 a
// 14 h; la de tarde, de 14 a 22 h (de 14 a 15, ya está la tarde, que se queda con ello). Lo que entra fuera de turno (de
// 22 a 7 h, y el fin de semana, desde el viernes a las 22 h) pasa al siguiente turno: el desfase, para que lo de la noche
// y el fin de semana cuente en quien lo atiende (la mañana siguiente; la del lunes). Así, todo lo que entra cuenta, a
// cualquier hora, en un turno de lunes a viernes.
//
// Un turno concreto: { day, k } (el día, en días desde el minuto 0, y 0 mañana o 1 tarde); su número, day * 2 + k.
// m: el modelo (model.js): su reloj (m.clock(minuto) → [día de la semana, 0 = lunes; hora]).
export const SISU_SHIFTS = ['Mañana', 'Tarde'];
export const SISU_SHIFT_HOURS = ['7 a 15 h', '14 a 22 h'];
const DAY = 1440, FROM = [7 * 60, 14 * 60], TO = [15 * 60, 22 * 60];

const weekday = (m, day) => m.clock(day * DAY)[0] < 5;
const nextWeekday = (m, day) => { let d = day + 1; while (!weekday(m, d)) d++; return d; };

// El turno que recibe lo que entra en el minuto t (desfase: fuera de turno, el siguiente); out: si entró fuera de turno.
export const shiftOf = (m, t) => {
  const day = Math.floor(t / DAY), min = t - day * DAY;
  if (!weekday(m, day)) return { day: nextWeekday(m, day), k: 0, out: true };   // fin de semana: la mañana del lunes
  if (min < FROM[0]) return { day, k: 0, out: true };                           // de madrugada: la mañana de ese día
  if (min < FROM[1]) return { day, k: 0, out: false };
  if (min < TO[1]) return { day, k: 1, out: false };
  return { day: nextWeekday(m, day), k: 0, out: true };                         // de noche: la mañana siguiente
};
export const slotNo = (s) => s.day * 2 + s.k;
// cuándo acaba un turno y cuál le sigue (la tarde, tras la mañana; la mañana del siguiente día laborable, tras la tarde)
export const endOf = (s) => s.day * DAY + TO[s.k];
export const nextOf = (m, s) => (s.k === 0 ? { day: s.day, k: 1 } : { day: nextWeekday(m, s.day), k: 0 });

// Cuántos turnos de mañana y de tarde hay en [d0, d1): los de los días laborables del periodo. → [mañanas, tardes]
export const slotsIn = (m, d0, d1) => {
  let n = 0;
  for (let d = Math.floor(d0 / DAY), end = Math.ceil(d1 / DAY); d < end; d++) if (weekday(m, d)) n++;
  return [n, n];
};

// Cuándo se empieza lo que recibe cada turno: en su turno (antes de que acabe), en el siguiente, más tarde o sin pasar por
// En curso. → por turno (0 mañana, 1 tarde), [en su turno, en el siguiente, más tarde, sin empezar]
export const carry = (m, list) => {
  const out = [[0, 0, 0, 0], [0, 0, 0, 0]];
  for (const i of list) {
    const s = shiftOf(m, m.C.rep[i]), row = out[s.k];
    if (m.C.ip[i] < 0) { row[3]++; continue; }
    const t = m.C.rep[i] + m.C.ip[i];
    row[t < endOf(s) ? 0 : t < endOf(nextOf(m, s)) ? 1 : 2]++;
  }
  return out;
};

// El trabajo hecho en cada turno, como el de los turnos de 24 h (model.js, shiftWork): empezar o resolver es una acción
// del responsable, en el turno en que ocurre (fuera de turno, en el siguiente). Por turno (mañana, tarde): turns, con
// alguna acción; resolved; people, personas activas por turno de media (con minActions o más); perPerson.
export const work = (m, list, isOpen, minActions) => {
  const by = new Map();
  const act = (t, p, res) => {
    const s = shiftOf(m, t), no = slotNo(s);
    let w = by.get(no); if (!w) by.set(no, w = { k: s.k, people: new Map(), resolved: 0 });
    w.people.set(p, (w.people.get(p) || 0) + 1);
    if (res) w.resolved++;
  };
  const { C } = m;
  for (const i of list) {
    if (C.ip[i] >= 0) act(C.rep[i] + C.ip[i], C.as[i], false);
    if (!isOpen(i) && C.res[i] >= 0) act(C.res[i], C.as[i], true);
  }
  const out = [0, 1].map(() => ({ turns: 0, resolved: 0, active: 0, activeActions: 0 }));
  for (const w of by.values()) {
    const o = out[w.k];
    o.turns++; o.resolved += w.resolved;
    for (const v of w.people.values()) if (v >= minActions) { o.active++; o.activeActions += v; }
  }
  return out.map((o) => ({ ...o, people: o.turns ? o.active / o.turns : null, perPerson: o.active ? o.activeActions / o.active : null }));
};
