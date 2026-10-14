// Formato de las Métricas (sin DOM): cifras, porcentajes, duraciones,
// fechas y los nombres en español de lo que Remedy da en inglés.

const nf = new Intl.NumberFormat('es-ES');
const nf1 = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

export const num = (n) => nf.format(Math.round(n));
export const dec = (x) => nf1.format(x);
export const pct = (x, digits = 0) => `${digits ? nf1.format(x * 100) : Math.round(x * 100)} %`;
// minutos → «45 min», «3,5 h» o «2,1 días»
export const dur = (m) => (m == null ? '—' : m < 90 ? `${Math.round(m)} min` : m < 2880 ? `${nf1.format(m / 60)} h` : `${nf1.format(m / 1440)} días`);

export const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const DOWS = ['lun', 'mar', 'mié', 'jue', 'vie', 'sáb', 'dom'];

const two = (n) => String(n).padStart(2, '0');
// minutos desde `base` (ms) → «dd/mm hh:mm», con la hora tal cual viene en el dato
export const dateOf = (base, m) => {
  const d = new Date(base + m * 6e4);
  return `${two(d.getUTCDate())}/${two(d.getUTCMonth() + 1)} ${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
};

const ES = {
  CLOSED: 'Cerrada', RESOLVED: 'Resuelta', ASSIGNED: 'Asignada', PENDING: 'Pendiente', IN_PROGRESS: 'En curso', CANCELLED: 'Cancelada',
  CRITICAL: 'Crítica', HIGH: 'Alta', MEDIUM: 'Media', LOW: 'Baja',
  USER_SERVICE_RESTORATION: 'Restauración de servicio (usuario)', USER_SERVICE_REQUEST: 'Petición de usuario',
  INFRASTRUCTURE_EVENT: 'Evento de infraestructura', INFRASTRUCTURE_RESTORATION: 'Restauración de infraestructura',
};
export const nice = (s) => ES[s] || (s === '' ? '(sin dato)' : s);
// «CLIENT_ACTION_REQUIRED» → «Client action required»
export const title = (s) => (s === '' ? '(sin dato)' : s.replace(/_/g, ' ').toLowerCase().replace(/^./, (c) => c.toUpperCase()));
