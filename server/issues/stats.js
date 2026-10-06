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

// En qué trabaja: sus issues (abiertas y resueltas) por tipo y por centro,
// las que más arriba. El nombre del centro, el del texto de su issue más
// reciente (lo que va antes del primer « - »).
const TOP = 6;
const isOpen = (i) => i.status !== 'RESOLVED';
export const focus = (desk) => {
  const tally = (keyOf, labelOf) => {
    const m = new Map();
    for (const i of desk) {
      const k = keyOf(i);
      const t = m.get(k) || { key: k, label: labelOf(i), open: 0, resolved: 0, last: '' };
      t[isOpen(i) ? 'open' : 'resolved'] += 1;
      if (i.reported > t.last) Object.assign(t, { last: i.reported, label: labelOf(i) });
      m.set(k, t);
    }
    return [...m.values()].sort((a, b) => (b.open + b.resolved) - (a.open + a.resolved) || a.key.localeCompare(b.key))
      .slice(0, TOP).map(({ key, label, open, resolved }) => ({ key, label, open, resolved }));
  };
  return {
    types: tally((i) => i.type || '', (i) => i.type || 'Sin tipo'),
    centers: tally((i) => i.center || '', (i) => (i.center ? i.text.split(' - ')[0] : 'Sin centro')),
  };
};

// Por día: resueltas de SGA y de SISU.
export const deskStats = (desk, myClaims, today, { days = 14 } = {}) => {
  const resolved = desk.filter((i) => i.status === 'RESOLVED' && i.resolved);
  const perDay = Object.fromEntries(lastDays(today, days).map((d) => [d, { sga: 0, sisu: 0 }]));
  for (const i of resolved) {
    const d = perDay[i.resolved.slice(0, 10)];
    if (d) d[i.sisu ? 'sisu' : 'sga'] += 1;
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
    focus: focus(desk),
  };
};
