// El periodo de las Métricas del servicio (dominio puro): los atajos y el rango a mano. Siempre días completos que
// acaban como muy tarde ayer: hoy aún no está cerrado. Las fechas, en ms de las 00:00 UTC de cada día; today: la de hoy.
const DAY_MS = 864e5;

export const SHORTCUTS = [['7d', 'Últimos 7 días'], ['14d', 'Últimas 2 semanas'], ['1m', 'Último mes'], ['3m', 'Último trimestre'], ['1y', 'Último año']];
export const DEFAULT_SHORTCUT = '14d';

// El día de hoy en el reloj de quien mira, como las 00:00 UTC de esa fecha.
export const todayOf = (now) => Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());

export const isoOf = (ms) => new Date(ms).toISOString().slice(0, 10);
// «2026-10-16» → ms; null si no es una fecha real (2026-02-30).
export const parseDay = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null;
  const ms = Date.parse(`${s}T00:00:00Z`);
  return Number.isNaN(ms) || isoOf(ms) !== s ? null : ms;
};

// El mismo día, meses antes; si ese mes no lo tiene (31 de marzo, un mes antes), su último día.
const monthsBack = (ms, n) => {
  const d = new Date(ms), first = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n, 1);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - n + 1, 0)).getUTCDate();
  return first + (Math.min(d.getUTCDate(), last) - 1) * DAY_MS;
};
const FROM = { '7d': (t) => t - 7 * DAY_MS, '14d': (t) => t - 14 * DAY_MS, '1m': (t) => monthsBack(t, 1), '3m': (t) => monthsBack(t, 3), '1y': (t) => monthsBack(t, 12) };

// Un atajo → { from, to }, los dos días incluidos; acaba ayer.
export const shortcutRange = (key, today) => ({ from: FROM[key](today), to: today - DAY_MS });

// Por qué no vale un rango a mano («2026-10-16», «2026-10-29»), o '' si vale.
export const rangeError = (from, to, today) => {
  const a = parseDay(from), b = parseDay(to);
  if (a == null || b == null) return 'Elige la fecha de inicio y la de fin.';
  if (a >= today || b >= today) return 'Solo se puede elegir hasta ayer: hoy aún no está cerrado.';
  return a > b ? 'La fecha de fin no puede ser anterior a la de inicio.' : '';
};

// { from, to } → [d0, d1), en minutos desde base, con d1 excluido, como el resto de las Métricas.
export const toMinutes = ({ from, to }, base) => [(from - base) / 6e4, (to + DAY_MS - base) / 6e4];
