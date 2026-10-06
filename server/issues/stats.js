// Las métricas de la mesa de una persona, a partir de sus issues (las de la
// foto: abiertas y resueltas aún sin cerrar en Remedy) y de lo que ha cogido
// en SIA. «today» es el día de la foto («YYYY-MM-DD»).

const DAY_MS = 86400000;
const minutesBetween = (from, to) => (new Date(to.replace(' ', 'T')) - new Date(from.replace(' ', 'T'))) / 60000;
const pad = (n) => String(n).padStart(2, '0');
export const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// Los últimos `days` días hasta `today` (incluido), del más antiguo al más reciente.
export const lastDays = (today, days) => {
  const end = new Date(`${today}T12:00:00`);
  return Array.from({ length: days }, (_, k) => dayKey(new Date(end - (days - 1 - k) * DAY_MS)));
};

export const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Por día: resueltas de SGA y de SISU, y a qué hora (0–23) se resolvió
// cada una: así se ven los turnos aunque vayan cambiando.
export const deskStats = (desk, myClaims, today, { days = 14 } = {}) => {
  const resolved = desk.filter((i) => i.status === 'RESOLVED' && i.resolved);
  const perDay = Object.fromEntries(lastDays(today, days).map((d) => [d, { sga: 0, sisu: 0, hours: Array(24).fill(0) }]));
  for (const i of resolved) {
    const d = perDay[i.resolved.slice(0, 10)];
    if (!d) continue;
    d[i.sisu ? 'sisu' : 'sga'] += 1;
    d.hours[+i.resolved.slice(11, 13)] += 1;
  }
  const week = lastDays(today, 7);
  const todays = perDay[today] || { sga: 0, sisu: 0 };
  return {
    resolvedToday: todays.sga + todays.sisu,
    resolvedTodayBy: { sga: todays.sga, sisu: todays.sisu },
    resolvedWeek: resolved.filter((i) => week.includes(i.resolved.slice(0, 10))).length,
    claimedToday: myClaims.filter((c) => dayKey(new Date(c.claimed_at)) === dayKey(new Date())).length,
    medianResolutionMin: median(resolved.map((i) => minutesBetween(i.reported, i.resolved)).filter((m) => m >= 0)),
    perDay: Object.entries(perDay).map(([day, d]) => ({ day, count: d.sga + d.sisu, ...d })),
  };
};
