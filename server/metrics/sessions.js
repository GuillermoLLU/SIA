// Los turnos de un técnico (#48, «Turnos y tasas por turno»): se deducen de su participación, no de un horario. Sus
// acciones (cambios en el historial y notas) separadas por menos de 6 h forman una sesión. Una sesión de 3 h o más, o con
// 30 acciones o más, cuenta como 1 turno (si pasa de 12 h, round(horas / 8)); una más corta, como max(horas, 0,5) / 8.
const GAP = 6 * 60;
const MANY = 30;

export const turnsOf = (hours, actions) => {
  if (hours > 12) return Math.round(hours / 8);
  if (hours >= 3 || actions >= MANY) return 1;
  return Math.max(hours, 0.5) / 8;
};

// minutes: los instantes de las acciones de un técnico, en cualquier orden. Devuelve sus sesiones, [desde, hasta, turnos].
export const sessionsOf = (minutes) => {
  const sorted = [...minutes].sort((a, b) => a - b), out = [];
  let start = null, end = null, actions = 0;
  const close = () => { if (actions) out.push([start, end, turnsOf((end - start) / 60, actions)]); };
  for (const t of sorted) {
    if (actions && t - end >= GAP) { close(); actions = 0; }
    if (!actions) start = t;
    end = t;
    actions++;
  }
  close();
  return out;
};
