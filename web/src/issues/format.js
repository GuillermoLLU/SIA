// Textos de las issues (sin DOM): criticidad, estados, motivos, fechas y
// cómo se reparten en las pestañas de la mesa.

export const SEVERITY_ES = { CRITICAL: 'Crítica', HIGH: 'Alta', MEDIUM: 'Media', LOW: 'Baja' };

export const STATUS_ES = { ASSIGNED: 'Asignada', IN_PROGRESS: 'En curso', PENDING: 'Pendiente', RESOLVED: 'Resuelta',
  Assigned: 'Asignada', 'In Progress': 'En curso', Pending: 'Pendiente', Resolved: 'Resuelta', Closed: 'Cerrada', Cancelled: 'Cancelada' };

export const REASON_ES = {
  NO_FURTHER_ACTION_REQUIRED: 'Sin más acción', ESCALATED_ACCORDING_TO_PROCEDURE: 'Escalada',
  THIRD_PARTY_VENDOR_ACTION_REQD: 'Proveedor', CLIENT_ACTION_REQUIRED: 'Cliente',
  CUSTOMER_FOLLOW_UP_REQUIRED: 'Seguimiento del cliente', REQUEST_SSGG: 'SSGG', PURCHASE_ORDER_APPROVAL: 'Aprobación de pedido',
  BAD_ASSIGNMENT: 'Mal asignada', SUPPLIER_DELIVERY: 'Entrega de proveedor', VERIFY_SOLUTION: 'Verificar solución',
  LOCAL_SITE_ACTION_REQUIRED: 'Centro',
};

// La mesa: en qué estoy, qué espera a otros y qué he resuelto.
export const TABS = [
  { key: 'doing', label: 'En curso', empty: 'No tienes ninguna en curso. Coge la siguiente.', test: (i) => i.status === 'ASSIGNED' || i.status === 'IN_PROGRESS' },
  { key: 'waiting', label: 'Pendientes de terceros', empty: 'Nada esperando a otros.', test: (i) => i.status === 'PENDING' },
  { key: 'resolved', label: 'Resueltas', empty: 'Aún no hay resueltas.', test: (i) => i.status === 'RESOLVED' },
];

// Una fecha como las de las issues: «YYYY-MM-DD HH:MM», hora local.
const pad = (n) => String(n).padStart(2, '0');
export const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

// «2026-10-04 11:44» → «04/10 11:44»
export const when = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}` : '—');

// Tiempo entre una fecha («YYYY-MM-DD HH:MM», hora local) y ahora, legible.
export const age = (s, now) => {
  const m = (now - new Date(s.replace(' ', 'T'))) / 60000;
  return m < 60 ? `${Math.max(0, Math.round(m))} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`;
};
