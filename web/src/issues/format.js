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

// A quién espera una pendiente (el tercero al que se escaló), por el código de su motivo en Remedy;
// null si el motivo no lo dice (escalada según el procedimiento, aprobación de pedido…).
const THIRD = {
  THIRD_PARTY_VENDOR_ACTION_REQD: 'Proveedor', SUPPLIER_DELIVERY: 'Proveedor',
  CLIENT_ACTION_REQUIRED: 'Cliente', CUSTOMER_FOLLOW_UP_REQUIRED: 'Cliente',
  REQUEST_SSGG: 'SSGG', LOCAL_SITE_ACTION_REQUIRED: 'Centro',
};
export const thirdOf = (issue) => THIRD[issue.reason] || null;
// Cómo se dice en la cabecera de la issue: a quién está escalada o, si no se sabe, su motivo
export const escalatedLabel = (issue) => {
  const third = thirdOf(issue), reason = REASON_ES[issue.reason];
  return third ? `Escalada a ${third}` : reason && reason !== 'Escalada' ? `Escalada · ${reason}` : 'Escalada';
};

// La mesa: en qué estoy, qué espera a otros (lo que más tiempo lleva sin
// moverse, arriba) y lo último que he resuelto.
export const LISTS = [
  { key: 'doing', label: 'En curso', empty: 'Nada en curso. Coge la siguiente.', test: (i) => i.status === 'ASSIGNED' || i.status === 'IN_PROGRESS',
    sort: (a, b) => a.reported.localeCompare(b.reported) },
  { key: 'waiting', label: 'Seguimiento', hint: 'Pendientes de terceros: lo tuyo o los escalados de todo el equipo', empty: 'Nada esperando a otros.', test: (i) => i.status === 'PENDING',
    sort: (a, b) => a.modified.localeCompare(b.modified) },
  { key: 'resolved', label: 'Resueltas recientes', empty: 'Aún no hay resueltas.', test: (i) => i.status === 'RESOLVED',
    sort: (a, b) => b.resolved.localeCompare(a.resolved) },
];

// Seguimiento de lo mío o del equipo (#136): los escalados de todos con su Jira
// (escalations.js del bridge). Las que tienen el Jira resuelto piden cerrarse: arriba.
export const JIRA_ES = { open: 'Abierto', resolved: 'Resuelto', discarded: 'Descartado' };
export const jiraDone = (i) => i.jira?.state === 'resolved';
// las que tienen el Jira resuelto se cierran solas: en Seguimiento ya no salen
export const stillOpen = (list) => list.filter((i) => !jiraDone(i));
// mis pendientes con el Jira que les toca, si lo tienen
export const withJira = (items, escalations) => {
  const jira = new Map(escalations.map((e) => [e.id, e.jira]));
  return items.map((i) => (jira.has(i.id) ? { ...i, jira: jira.get(i.id) } : i));
};

// Una fecha como las de las issues: «YYYY-MM-DD HH:MM», hora local.
const pad = (n) => String(n).padStart(2, '0');
export const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;

// «2026-10-04 11:44» → «04/10 11:44»
export const when = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}` : '—');
// Lo más reciente primero (sin tocar la lista original).
export const newestFirst = (list) => [...list].reverse();
// Una fecha ISO de la base (UTC) en hora local, con el mismo formato.
export const whenIso = (iso) => when(stamp(new Date(iso)));
// Cuándo, frente a hoy: «HOY 13:05» si es de hoy; si no, «22/10 12:06» (con
// el año si es otro). Vale para una fecha ISO de la base y para una «YYYY-MM-DD HH:MM» de Remedy.
export const whenLabel = (s, now) => {
  const d = new Date(String(s || '').replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return '—';
  const time = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (d.toDateString() === now.toDateString()) return `HOY ${time}`;
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}${d.getFullYear() !== now.getFullYear() ? `/${d.getFullYear()}` : ''} ${time}`;
};

// La foto de Remedy frente a hoy: de cuándo es y si está al día (del mismo
// día que ahora). Si no, la mesa lo avisa: lo medido en SIA sigue siendo de hoy.
export const snapshotInfo = (taken, now) => {
  const t = new Date(taken);
  const stale = t.toDateString() !== now.toDateString();
  return { date: when(stamp(t)), stale };
};

// Minutos legibles: «30 min», «3 h», «3 d».
export const duration = (m) => (m < 60 ? `${Math.max(0, Math.round(m))} min` : m < 1440 ? `${Math.round(m / 60)} h` : `${Math.round(m / 1440)} d`);

// Tiempo entre una fecha («YYYY-MM-DD HH:MM», hora local) y ahora, legible.
export const age = (s, now) => duration((now - new Date(s.replace(' ', 'T'))) / 60000);

// Qué tiempo enseña una issue en En curso y Resueltas: cuánto hace que entró, o cuándo se resolvió
// (Seguimiento enseña sus días sin moverse, stillInfo).
export const since = (i, key, now) => (key === 'resolved' ? when(i.resolved) : `hace ${age(i.reported, now)}`);

// El estado de una issue en sus datos: cómo se dice, desde cuándo (su último cambio de estado en
// Remedy o, sin historial, desde que se creó) y, si está pendiente, a quién espera (su motivo).
export const statusInfo = (i) => ({
  label: STATUS_ES[i.status] || i.status || '—',
  since: (i.changes || []).at(-1)?.[0] || i.reported,
  waitsFor: i.status === 'PENDING' ? REASON_ES[i.reason] || '' : '',
});

// Desde cuándo espera a un tercero: el último paso a Pendiente del historial de Remedy
// (changes: [[fecha, de, a]]); sin él, su último cambio.
export const pendingSince = (i) => {
  const last = [...(i.changes || [])].reverse().find(([, , to]) => /^pending$/i.test(String(to)));
  return last ? last[0] : i.modified;
};

// Lo que lleva una pendiente de terceros sin moverse, en días, y cómo de mal: hasta 2 días va bien;
// de 3 a 6, se va alargando; 7 o más, hay que mirarla.
export const stillDays = (i, now) => Math.max(0, Math.floor((now - new Date(String(i.modified).replace(' ', 'T'))) / 86400000));
export const stillLevel = (days) => (days >= 7 ? 'late' : days >= 3 ? 'slow' : 'ok');
// listos para enseñar: { days, level, label: «1 día» | «N días» }
export const stillInfo = (i, now) => { const days = stillDays(i, now); return { days, level: stillLevel(days), label: `${days} ${days === 1 ? 'día' : 'días'}` }; };

// Las barras de cogidas por semana: a qué altura (%) va cada parte, con un
// techo mínimo de 5 para que una semana floja no llene la gráfica.
export const weekBars = (weeks) => {
  const max = Math.max(5, ...weeks.map((w) => w.sga + w.sisu));
  return weeks.map((w) => ({ ...w, total: w.sga + w.sisu, sgaPct: w.sga / max * 100, sisuPct: w.sisu / max * 100 }));
};
