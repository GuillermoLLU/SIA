// Lo que hace cada persona por turno (sin DOM), para Equipo soporte: resueltas (RPT), escaladas a proveedor (EPPT) y
// pasadas a pendiente de cliente (PCPT) en cada turno trabajado, partidas en entrantes (la issue entró en ese mismo
// turno: RPTe, EPPTe, PCPTe) y backlog (entró antes: RPTb, EPPTb, PCPTb). m: el modelo de las Métricas.
//
// Los turnos de cada paso los guarda el bridge (dataset.js sR/sV/sC: el número de cada turno de 8 h desde las 7:00 del
// 1 de enero, como shifts.js slotOf); sin ellos (un bridge de antes), no hay nada que contar (null). Cuenta lo que pasa
// en el periodo (turnos que empiezan dentro), sea cual sea el mes de apertura de la issue. Un turno trabajado es uno
// con algún paso suyo: empezar (a En curso), resolver, escalar a proveedor o pasar a pendiente de cliente. Todo se
// atribuye al responsable actual de la issue (no se sabe quién la tuvo antes), como en Turnos.
import { slotOf } from '../metrics/shifts.js';

const START = 7 * 60, LEN = 8 * 60;
export const KINDS = [['r', 'sR'], ['v', 'sV'], ['c', 'sC']];
const empty = () => ({ turns: new Set(), r: [0, 0], v: [0, 0], c: [0, 0] });

// list: las issues que se miran (las que pasan los filtros, abiertas en cualquier mes); [d0, d1): el periodo, en
// minutos. Devuelve un Map persona → { turns (turnos trabajados), r, v, c: [entrantes, backlog] }, o null sin los turnos.
export const shiftCounts = (m, list, [d0, d1]) => {
  const { C } = m;
  if (!C.sR) return null;
  const s0 = slotOf(d0 - 1) + 1, inside = (s) => s >= s0 && START + s * LEN < d1;
  const out = new Map();
  const of = (p) => { let o = out.get(p); if (!o) out.set(p, o = empty()); return o; };
  for (const i of list) {
    const p = C.as[i];
    if (!p) continue;
    const enter = slotOf(C.rep[i]);
    if (C.ip[i] >= 0) { const s = slotOf(C.rep[i] + C.ip[i]); if (inside(s)) of(p).turns.add(s); }
    for (const [k, col] of KINDS) {
      for (const s of C[col]?.[i] || []) {
        if (!inside(s)) continue;
        const o = of(p);
        o.turns.add(s);
        o[k][s === enter ? 0 : 1]++;
      }
    }
  }
  return out;
};

// Las cifras por turno de unos recuentos (de una persona o la suma del equipo): cada paso entre los turnos trabajados.
// turns: cuántos turnos (la suma de los de cada persona, para el equipo).
export const perTurn = (o, turns = o?.turns.size) => {
  const f = (v) => (turns ? v / turns : null);
  const row = { turns: turns || 0 };
  for (const [k] of KINDS) { const [e, b] = o ? o[k] : [0, 0]; row[k] = f(e + b); row[`${k}e`] = f(e); row[`${k}b`] = f(b); }
  return row;
};

// El equipo: lo de todas sus personas entre todos sus turnos trabajados (persona y turno): la media por persona y turno.
export const teamPerTurn = (counts) => {
  const sum = empty();
  let turns = 0;
  for (const o of counts.values()) {
    turns += o.turns.size;
    for (const [k] of KINDS) { sum[k][0] += o[k][0]; sum[k][1] += o[k][1]; }
  }
  return perTurn(sum, turns);
};
