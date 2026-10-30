// Métricas de la mesa de una persona.
// - today: lo resuelto hoy según Remedy (día de la foto), por origen.
// - history: lo medido en SIA (se llena con el uso, no hacia atrás): lo
//   cogido por semana, por origen, y si se cogió a tiempo (primera gestión:
//   crítica 15 min, alta 2 h, lo que ha explicado el equipo).

const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const FIRST_TOUCH_MIN = { CRITICAL: 15, HIGH: 120 };

export const today = (desk, day) => {
  const done = desk.filter((i) => i.status === 'RESOLVED' && i.resolved.startsWith(day));
  const sisu = done.filter((i) => i.sisu).length;
  return { resolved: done.length, sga: done.length - sisu, sisu };
};

// Lunes de la semana de una fecha, «YYYY-MM-DD».
export const weekOf = (d) => {
  const m = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  m.setDate(m.getDate() - ((m.getDay() + 6) % 7));
  return dayKey(m);
};

// Las que siguen siendo suyas: las cogió (claimed) o se las traspasaron o
// asignaron desde el Backlog (received) y no las ha devuelto ni traspasado después. Lo que cuenta es el
// último movimiento de cada issue.
const MINE = new Set(['claimed', 'received']);
const kept = (events) => {
  const last = new Map();
  for (const e of events) last.set(e.issue_id, e);
  return events.filter((e) => MINE.has(e.action) && last.get(e.issue_id) === e);
};

export const history = (events, issuesById, now, weeks = 12) => {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 7 * (weeks - 1));
  const series = Array.from({ length: weeks }, (_, k) => {
    const d = new Date(start); d.setDate(d.getDate() + 7 * k);
    return { week: weekOf(d), sga: 0, sisu: 0 };
  });
  const byWeek = new Map(series.map((w) => [w.week, w]));
  let timed = 0, onTime = 0;
  const claims = kept(events);
  for (const e of claims) {
    const at = new Date(e.happened_at), issue = issuesById.get(e.issue_id);
    const w = byWeek.get(weekOf(at));
    if (w) w[issue?.sisu ? 'sisu' : 'sga'] += 1;
    // a tiempo solo se mide en las que cogió uno mismo: una traspasada ya venía empezada
    const limit = e.action === 'claimed' && issue && FIRST_TOUCH_MIN[issue.priority];
    if (limit) { timed += 1; if ((at - new Date(issue.reported.replace(' ', 'T'))) / 60000 <= limit) onTime += 1; }
  }
  return {
    weeks: series,
    claimedToday: claims.filter((e) => dayKey(new Date(e.happened_at)) === dayKey(now)).length,
    perWeek: claims.length ? Math.round(claims.length / weeks * 10) / 10 : 0,
    onTimePct: timed ? Math.round(onTime / timed * 100) : null,
  };
};
