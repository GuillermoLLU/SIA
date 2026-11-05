// Lo que hace cada técnico por turno (sin DOM), para Equipo soporte: resueltas (RPT), escaladas a proveedor (EPPT) y
// pasadas a pendiente de cliente (PCPT), entre sus turnos, partidas en entrantes (RPTe, EPPTe, PCPTe) y backlog (RPTb,
// EPPTb, PCPTb). Como en la #48: los turnos salen de sus sesiones de actividad (data.sessions, server/metrics/sessions.js)
// y cada paso (cols.sp: tipo, instante y persona) es de quien lo hizo. m: el modelo de las Métricas.
//
// Una sesión cuenta entera en el periodo si termina dentro de él, y sus pasos con ella. Un paso es entrante si la issue se
// abrió en el turno en que se actuó: las 8 h que terminan con la última acción de la sesión, o la sesión si dura más.
const TURN = 8 * 60;
export const KINDS = ['r', 'v', 'c'];   // el tipo de cada paso de cols.sp, por su índice
const empty = () => ({ turns: 0, r: [0, 0], v: [0, 0], c: [0, 0] });

// la sesión de una persona en un instante
export const sessionAt = (sessions = [], t) => sessions.find(([from, to]) => from <= t && t <= to);

// [d0, d1): el periodo, en minutos; keep: si cuenta una sesión que termina en ese minuto (por días sueltos dentro del
// periodo). Devuelve un Map persona → { turns, r, v, c: [entrantes, backlog] } de la empresa que se mira; sin sesiones, null.
export const shiftCounts = (m, [d0, d1], keep = () => true) => {
  const { C, N, data } = m;
  if (!data.sessions) return null;
  const own = m.S.sides[0].company, out = new Map();
  const of = (p) => { let o = out.get(p); if (!o) out.set(p, o = empty()); return o; };
  const inside = ([, to]) => to >= d0 && to < d1 && keep(to);
  data.sessions.forEach((sessions, p) => {
    if (data.company[p] !== own) return;
    for (const s of sessions) if (inside(s)) of(p).turns += s[2];
  });
  for (let i = 0; i < N; i++) {
    for (const [kind, t, p] of C.sp?.[i] || []) {
      if (data.company[p] !== own) continue;
      const s = sessionAt(data.sessions[p], t);
      if (!s || !inside(s)) continue;
      const entered = C.rep[i] >= Math.min(s[0], s[1] - TURN) && C.rep[i] <= s[1];
      of(p)[KINDS[kind]][entered ? 0 : 1]++;
    }
  }
  return out;
};

// Las cifras por turno de unos recuentos (de una persona o la suma del equipo): cada paso entre los turnos.
export const perTurn = (o) => {
  const turns = o?.turns || 0, f = (v) => (turns ? v / turns : null);
  const row = { turns };
  for (const k of KINDS) { const [e, b] = o ? o[k] : [0, 0]; row[k] = f(e + b); row[`${k}e`] = f(e); row[`${k}b`] = f(b); }
  return row;
};

// La media del equipo: el total del equipo entre los turnos del equipo.
export const teamPerTurn = (counts) => {
  const sum = empty();
  for (const o of counts.values()) {
    sum.turns += o.turns;
    for (const k of KINDS) { sum[k][0] += o[k][0]; sum[k][1] += o[k][1]; }
  }
  return perTurn(sum);
};
