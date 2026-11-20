// El horario de atención de SISU (sin DOM): solo trabaja entre semana, de 7 a 22 h, así que en Rendimiento equipos
// (tabs/rendimiento.js) su Tatt (hasta la primera atención) solo cuenta lo que cae dentro; lo de después de atenderla,
// y todo en SGA, en tiempo natural. La misma regla que server/metrics/hours.js (sus columnas en horario): si cambia una,
// cambia la otra.
// Minutos desde el 1 de enero del año de los datos (como el resto de las Métricas), con la hora tal cual viene.
export const WORK_DAYS = [1, 2, 3, 4, 5];   // de lunes (1) a viernes (5), como Date.getUTCDay
export const WORK_FROM = 7 * 60, WORK_TO = 22 * 60;
export const WORK_NOTE = 'En SISU, el Tatt solo cuenta su horario de atención (de lunes a viernes, de 7 a 22 h); desde la primera atención, todo en tiempo natural. En SGA, todo en tiempo natural.';
const DAY = 1440;

// dow0: el día de la semana del minuto 0 (Date.getUTCDay del 1 de enero). Devuelve los minutos de [from, to) que caen
// en el horario de atención.
export const workMinutes = (from, to, dow0) => {
  if (!(to > from)) return 0;
  let sum = 0;
  for (let d = Math.floor(from / DAY), end = Math.floor((to - 1) / DAY); d <= end; d++) {
    if (!WORK_DAYS.includes((((dow0 + d) % 7) + 7) % 7)) continue;
    const a = Math.max(from, d * DAY + WORK_FROM), b = Math.min(to, d * DAY + WORK_TO);
    if (b > a) sum += b - a;
  }
  return sum;
};
