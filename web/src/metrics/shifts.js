// Los turnos del servicio (sin DOM): mañana de 7 a 15, tarde de 15 a 23 y noche de 23 a 7.
// Salen de la actividad del propio equipo en 2026 (cuándo empieza y acaba cada persona en las
// semanas en que está en un turno); la gente rota de turno por semanas.
//
// Un turno concreto es cada tramo de 8 h desde las 7:00 del 1 de enero: `slot` es su número
// (las horas, tal cual vienen en el dato: minutos desde el 1 de enero). Su tipo es mañana,
// tarde o noche; y es de fin de semana si empieza en sábado o domingo (la noche del domingo
// también: empieza el domingo a las 23:00).
export const SHIFTS = ['Mañana', 'Tarde', 'Noche'];
export const SHIFT_HOURS = ['7 a 15 h', '15 a 23 h', '23 a 7 h'];
export const DAYS = ['Laborables', 'Fin de semana'];
const START = 7 * 60, LEN = 8 * 60, DAY = 1440;
// una persona cuenta como activa en un turno si hace al menos esto (empezar o resolver issues)
export const MIN_ACTIONS = 3;

export const slotOf = (min) => Math.floor((min - START) / LEN);
const kindOf = (slot) => ((slot % 3) + 3) % 3;
const startOf = (slot) => START + slot * LEN;

// base: el 1 de enero del año, en ms (UTC). Devuelve si un turno es de fin de semana.
export const weekendOf = (base) => {
  const d0 = new Date(base).getUTCDay();
  return (slot) => { const g = (((d0 + Math.floor(startOf(slot) / DAY)) % 7) + 7) % 7; return g === 0 || g === 6; };
};
// tipo de un turno concreto, con el día: 0–2 laborables (mañana, tarde, noche), 3–5 fin de semana
export const typeOf = (weekend) => (slot) => kindOf(slot) + (weekend(slot) ? 3 : 0);

// Cuántos turnos de cada tipo caben en un tramo de tiempo [from, to) (minutos), contando solo los
// que empiezan dentro.
export const slotsIn = (from, to, type) => {
  const n = new Array(6).fill(0);
  for (let s = slotOf(from - 1) + 1; startOf(s) < to; s++) n[type(s)]++;
  return n;
};

// De lo que entra en cada tipo de turno, cuándo se empieza (pasa a En curso): en el mismo turno,
// en el siguiente, más tarde o nunca (abierta sin empezar o cerrada sin pasar por En curso).
// C: las columnas de las Métricas (rep, ip).
export const carry = (list, C, type) => {
  const out = Array.from({ length: 6 }, () => [0, 0, 0, 0]);
  for (const i of list) {
    const s = slotOf(C.rep[i]), row = out[type(s)];
    if (C.ip[i] < 0) { row[3]++; continue; }
    const d = slotOf(C.rep[i] + C.ip[i]) - s;
    row[d <= 0 ? 0 : d === 1 ? 1 : 2]++;
  }
  return out;
};

// El trabajo hecho en cada tipo de turno: cada vez que se empieza o se resuelve una issue cuenta
// como una acción de su responsable, en el turno en que ocurre. Por tipo de turno:
//   turns: turnos con alguna acción; actions y resolved: acciones y resoluciones;
//   people: personas activas por turno, de media (con MIN_ACTIONS o más en ese turno);
//   perPerson: acciones por persona activa y turno.
// Todo se atribuye al responsable actual de la issue (no se sabe quién la tuvo antes).
export const shiftWork = (list, C, isOpen, type) => {
  const bySlot = new Map();
  const act = (min, p, res) => {
    const s = slotOf(min);
    let w = bySlot.get(s); if (!w) bySlot.set(s, w = { people: new Map(), resolved: 0 });
    w.people.set(p, (w.people.get(p) || 0) + 1);
    if (res) w.resolved++;
  };
  for (const i of list) {
    if (C.ip[i] >= 0) act(C.rep[i] + C.ip[i], C.as[i], false);
    if (!isOpen(i) && C.res[i] >= 0) act(C.res[i], C.as[i], true);
  }
  const out = Array.from({ length: 6 }, () => ({ turns: 0, actions: 0, resolved: 0, active: 0, activeActions: 0 }));
  for (const [s, w] of bySlot) {
    const o = out[type(s)];
    o.turns++; o.resolved += w.resolved;
    for (const v of w.people.values()) { o.actions += v; if (v >= MIN_ACTIONS) { o.active++; o.activeActions += v; } }
  }
  return out.map((o) => ({ ...o, people: o.turns ? o.active / o.turns : null, perPerson: o.active ? o.activeActions / o.active : null }));
};
