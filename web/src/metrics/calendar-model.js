// Un modelo para el panel de periodo (period-panel.js, period.js) que no depende de lo guardado: desde el 1 de enero
// de `startYear` hasta hoy, con las mismas medidas (minutos desde BASE) que el modelo de Métricas (model.js). Así el
// constructor de SQL y la primera carga pueden elegir fechas aunque la base esté vacía.
import { DAY } from './rules.js';

const MIN_MS = 6e4;

// openAt: 'year' abre en el 1 de enero de openYear (por defecto, el año en curso, hasta hoy); 'start', en el primer día
// del modelo. El panel deja cambiar de año entre startYear y el año de hoy.
export const calendarModel = (startYear, { now = new Date(), openAt = 'year', openYear = now.getUTCFullYear() } = {}) => {
  const BASE = Date.UTC(startYear, 0, 1);
  const END_D = (Math.floor((now.getTime() - BASE) / 864e5) + 1) * DAY;   // el día de hoy, excluido el siguiente
  const minuteOf = (k, d = 1) => (Date.UTC(startYear, k, d) - BASE) / MIN_MS;
  const monthAt = (min) => { const t = new Date(BASE + min * MIN_MS); return (t.getUTCFullYear() - startYear) * 12 + t.getUTCMonth(); };
  const LASTM = monthAt(END_D - 1);
  const d0 = openAt === 'start' ? 0 : minuteOf((openYear - startYear) * 12);
  const model = {
    BASE, MIN_D: 0, END_D, LASTM, minuteOf, monthAt,
    data: { meta: { start: startYear } },
    S: { d0, d1: END_D },
    setPeriod: (a, b) => {
      model.S.d0 = Math.max(model.MIN_D, Math.min(a, model.END_D - DAY));
      model.S.d1 = Math.min(model.END_D, Math.max(b, model.S.d0 + DAY));
    },
  };
  return model;
};
