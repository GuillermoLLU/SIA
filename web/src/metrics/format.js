// Formato de las Métricas (sin DOM): cifras, porcentajes, duraciones,
// fechas y los nombres en español de lo que Remedy da en inglés.

const nf = new Intl.NumberFormat('es-ES');
const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export const num = (n) => nf.format(Math.round(n));
export const dec = (x) => nf1.format(x);
export const pct = (x, digits = 0) => `${digits ? nf1.format(x * 100) : Math.round(x * 100)} %`;
// Todos los tiempos de las Métricas. Por debajo de una hora, en minutos («15 min», «45 min»). De una hora a 24, en horas:
// sin decimales desde 10 h («22 h») y con uno como mucho hasta ahí («9,6 h», «2 h»). Desde 24 h, en días y horas
// («3 días 2 h», «1 día»); si sobra menos de una hora, en días y minutos («1 día 30 min»).
const HOURS = [0, 1].map((d) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: d }));
const days = (d) => `${d} ${d === 1 ? 'día' : 'días'}`;
export const dur = (m) => {
  if (m == null) return '—';
  if (Math.round(m) < 60) return `${Math.round(m)} min`;
  if (m < 1410) return `${HOURS[m >= 600 ? 0 : 1].format(m / 60)} h`;   // de 23,5 h en adelante redondea a 1 día
  let d = Math.floor(m / 1440), rest = Math.round(m - d * 1440);
  if (rest < 60) return rest ? `${days(d)} ${rest} min` : days(d);
  let h = Math.round(rest / 60);
  if (h === 24) { d++; h = 0; }
  return h ? `${days(d)} ${h} h` : days(d);
};
// un tiempo con signo: lo que sube (+) o baja (−) algo, como el MTTR; lo que redondea a 0, sin signo
export const signedDur = (v) => { if (v == null) return '—'; const t = dur(Math.abs(v)); return /^0 /.test(t) ? t : `${v > 0 ? '+' : '−'}${t}`; };

export const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const DOWS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

const two = (n) => String(n).padStart(2, '0');
// minutos desde `base` (ms) → «dd/mm hh:mm», con la hora tal cual viene en el dato
export const dateOf = (base, m) => {
  const d = new Date(base + m * 6e4);
  return `${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
};

// ms → «dd/mm/aaaa»
export const dmy = (ms) => { const d = new Date(ms); return `${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`; };

const ES = {
  CLOSED: 'Cerrada', RESOLVED: 'Resuelta', ASSIGNED: 'Asignada', PENDING: 'Pendiente', IN_PROGRESS: 'En curso', CANCELLED: 'Cancelada',
  CRITICAL: 'Crítica', HIGH: 'Alta', MEDIUM: 'Media', LOW: 'Baja',
  USER_SERVICE_RESTORATION: 'Restauración de servicio (usuario)', USER_SERVICE_REQUEST: 'Petición de usuario',
  INFRASTRUCTURE_EVENT: 'Evento de infraestructura', INFRASTRUCTURE_RESTORATION: 'Restauración de infraestructura',
};
export const nice = (s) => ES[s] || (s === '' ? '(sin dato)' : s);
// «CLIENT_ACTION_REQUIRED» → «Client action required»
export const title = (s) => (s === '' ? '(sin dato)' : s.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()));
