// Datos de prueba de Escalar, hasta tener el catálogo completo de #34 y los
// eventos de SIA (#24): un extracto del mapa de escalado de soporte ECOM (un
// destino de cada tipo), tickets ya abiertos para vincular y los casos que se
// pueden simular sobre una issue de la foto para revisar la vista.

// level: N2 o N3 · via: por dónde se escala · opens: lo que abre (jira, remedy o none)
// · project: el proyecto de Jira que abre, para comprobar el ticket.
export const DESTINATIONS = [
  { id: 'sisupac', name: 'SISUPAC · N3 SISU', level: 'N3', via: 'SIGLO', opens: 'jira', project: 'SISUPAC' },
  { id: 'sisustock', name: 'SISUSTOCK · N3 SISU', level: 'N3', via: 'SIGLO', opens: 'jira', project: 'SISUSTOCK' },
  { id: 'sgaewmsap', name: 'SGAEWMSAP · N3 SGA', level: 'N3', via: 'SIGLO', opens: 'jira', project: 'SGAEWMSAP' },
  { id: 'wospac', name: 'WOSPAC · N3 SGA', level: 'N3', via: 'SIGLO', opens: 'jira', project: 'WOSPAC' },
  { id: 'era', name: 'ERA · N3', level: 'N3', via: 'SIGLO', opens: 'jira', project: 'ERA' },
  { id: 'changemgt', name: 'CHANGEMGT · N3', level: 'N3', via: 'MoninBot', opens: 'jira', project: 'CHANGEMGT' },
  { id: 'courier', name: 'N2 Courier Support', level: 'N2', via: 'IOP', opens: 'jira', project: 'ITSMECOM' },
  { id: 'returns', name: 'N2 Soporte Returns', level: 'N2', via: 'IOP', opens: 'jira', project: 'ITSMECOM' },
  { id: 'stock', name: 'N2 Stock Solutions', level: 'N2', via: 'IOP', opens: 'jira', project: 'ITSMECOM' },
  { id: 'maestros', name: 'Maestros · N2', level: 'N2', via: 'IOP', opens: 'remedy' },
  { id: 'teleco', name: 'Teleco · N2', level: 'N2', via: 'SIGLO', opens: 'remedy' },
  { id: 'as400', name: 'AS400 · N2', level: 'N2', via: 'Correo', opens: 'remedy' },
  { id: 'operaciones', name: 'Operaciones/Implantaciones · N2', level: 'N2', via: 'Correo', opens: 'none' },
];

// Tickets de proveedor abiertos que ya esperan otras issues del mismo problema.
export const OPEN_TICKETS = [
  { ticket: 'SISUPAC-9211', dest: 'sisupac', title: 'Lentitud RFID en packing', issues: 5, since: '2026-10-27 09:12' },
  { ticket: 'ITSMECOM-5804475', dest: 'returns', title: 'Error aleatorio en el proceso de returns', issues: 2, since: '2026-10-26 18:40' },
  { ticket: 'INC000027778368', dest: 'maestros', title: 'Artículo sin maestro en el centro', issues: 1, since: '2026-10-28 08:05' },
];

const ago = (now, min) => {
  const d = new Date(now - min * 60000), p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

// Casos que se simulan sobre la issue abierta: cambian lo que haga falta de ella.
export const TEST_CASES = [
  { id: '', label: 'La issue tal cual viene de la foto', apply: (i) => i },
  { id: 'crit-ok', label: 'Crítica cogida hace 20 min (en plazo)', apply: (i, now) => ({ ...i, priority: 'CRITICAL', status: 'IN_PROGRESS', reported: ago(now, 25), claimedBy: { ...(i.claimedBy || { name: 'Ana' }), at: new Date(now - 20 * 60000).toISOString() } }) },
  { id: 'crit-late', label: 'Crítica fuera de plazo', apply: (i, now) => ({ ...i, priority: 'CRITICAL', status: 'IN_PROGRESS', reported: ago(now, 190), claimedBy: null }) },
  { id: 'high', label: 'Alta cogida hace 1 h', apply: (i, now) => ({ ...i, priority: 'HIGH', status: 'IN_PROGRESS', reported: ago(now, 70), claimedBy: { ...(i.claimedBy || { name: 'Ana' }), at: new Date(now - 60 * 60000).toISOString() } }) },
  { id: 'medium', label: 'Media cogida hace 5 h', apply: (i, now) => ({ ...i, priority: 'MEDIUM', status: 'IN_PROGRESS', reported: ago(now, 320), claimedBy: { ...(i.claimedBy || { name: 'Ana' }), at: new Date(now - 300 * 60000).toISOString() } }) },
  { id: 'known', label: 'Remedy ya trae un ticket abierto (se propone unirla)', apply: (i) => ({ ...i, vendorTicket: 'ITD: SISUPAC-9211' }) },
  { id: 'known-other', label: 'Remedy trae un ticket que no está en la lista', apply: (i) => ({ ...i, vendorTicket: 'TEC: SGAMSRAP-8777' }) },
  { id: 'resolved', label: 'Resuelta con una solución temporal (causa raíz)', apply: (i) => ({ ...i, status: 'RESOLVED' }) },
];
