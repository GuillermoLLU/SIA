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

// La mesa: en qué estoy, qué espera a otros (lo que más tiempo lleva sin
// moverse, arriba) y lo último que he resuelto.
export const LISTS = [
  { key: 'doing', label: 'En curso', empty: 'Nada en curso. Coge la siguiente.', test: (i) => i.status === 'ASSIGNED' || i.status === 'IN_PROGRESS',
    sort: (a, b) => a.reported.localeCompare(b.reported) },
  { key: 'waiting', label: 'Seguimiento · pendientes de terceros', empty: 'Nada esperando a otros.', test: (i) => i.status === 'PENDING',
    sort: (a, b) => a.modified.localeCompare(b.modified) },
  { key: 'resolved', label: 'Resueltas recientes', empty: 'Aún no hay resueltas.', test: (i) => i.status === 'RESOLVED',
    sort: (a, b) => b.resolved.localeCompare(a.resolved) },
];

// Una fecha como las de las issues: «YYYY-MM-DD HH:MM», hora local.
const pad = (n) => String(n).padStart(2, '0');
export const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

// «2026-10-04 11:44» → «04/10 11:44»
export const when = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}` : '—');
// Una fecha ISO de la base (UTC) en hora local, con el mismo formato.
export const whenIso = (iso) => when(stamp(new Date(iso)));
// El día de una fecha ISO para agrupar: «Hoy», «Ayer» o «29/10».
export const dayLabel = (iso, now) => {
  const d = new Date(iso), days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()) - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 86400000);
  return days === 0 ? 'Hoy' : days === 1 ? 'Ayer' : `${pad(d.getDate())}/${pad(d.getMonth() + 1)}${d.getFullYear() !== now.getFullYear() ? `/${d.getFullYear()}` : ''}`;
};
// La hora de una fecha ISO: «12:42».
export const timeIso = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// La foto de Remedy frente a hoy: de cuándo es y si está al día (del mismo
// día que ahora). Si no, la mesa lo avisa: lo medido en SIA sigue siendo de hoy.
export const snapshotInfo = (taken, now) => {
  const t = new Date(taken);
  const stale = t.toDateString() !== now.toDateString();
  return { text: `Datos de Remedy del ${when(stamp(t))}`, stale };
};

// Minutos legibles: «30 min», «3 h», «3 d».
export const duration = (m) => (m < 60 ? `${Math.max(0, Math.round(m))} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`);

// Tiempo entre una fecha («YYYY-MM-DD HH:MM», hora local) y ahora, legible.
export const age = (s, now) => duration((now - new Date(s.replace(' ', 'T'))) / 60000);

// Qué tiempo enseña una issue en cada lista: sin moverse (esperando), cuándo
// se resolvió, o cuánto hace que entró.
export const since = (i, key, now) => (key === 'waiting' ? `sin moverse ${age(i.modified, now)}` : key === 'resolved' ? when(i.resolved) : `hace ${age(i.reported, now)}`);

// Las barras de cogidas por semana: a qué altura (%) va cada parte, con un
// techo mínimo de 5 para que una semana floja no llene la gráfica.
export const weekBars = (weeks) => {
  const max = Math.max(5, ...weeks.map((w) => w.sga + w.sisu));
  return weeks.map((w) => ({ ...w, total: w.sga + w.sisu, sgaPct: w.sga / max * 100, sisuPct: w.sisu / max * 100 }));
};
