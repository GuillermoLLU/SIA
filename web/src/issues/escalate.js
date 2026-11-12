// Escalar (#9, #117), sin DOM: el ticket de proveedor (formato y prefijos de hoy),
// la prioridad del Jira, los pasos y qué hace falta en cada uno. Los destinos
// llegan de fuera (el catálogo). Las notas del método las comprueba el bridge.

// Una clave de Jira (PROYECTO-número) o una incidencia de Remedy (INC y 12 dígitos).
const JIRA = /^[A-Z][A-Z0-9]*-\d+$/;
const REMEDY = /^INC\d{12}$/;

// Lo que se escribe hoy a mano en Remedy: prefijos («ITD:», «TEC:») y varios
// tickets juntos. → { tickets, bad }: los válidos ya limpios y lo que no lo es.
export const parseTickets = (raw) => {
  const parts = String(raw ?? '').toUpperCase().replace(/\b[A-Z]{2,6}\s*:\s*/g, ' ').split(/[\s,;|]+/).filter(Boolean);
  return { tickets: parts.filter((t) => JIRA.test(t) || REMEDY.test(t)), bad: parts.filter((t) => !JIRA.test(t) && !REMEDY.test(t)) };
};

// El ticket al que se vincula. state: empty | ok | bad | many; value: cómo se guardará.
export const ticketCheck = (raw) => {
  const text = String(raw ?? '').trim();
  if (!text) return { state: 'empty' };
  const { tickets, bad } = parseTickets(text);
  if (bad.length || !tickets.length) return { state: 'bad', bad: bad.join(' ') || text };
  if (tickets.length > 1) return { state: 'many', tickets };
  return { state: 'ok', value: tickets[0], changed: tickets[0] !== text };
};

// La prioridad del Jira según la categoría de SIGLO (proceso de soporte, 2.4).
export const JIRA_PRIORITIES = [
  { id: 'BLOCKER', label: 'Bloqueo', when: 'Bug repetitivo, más de 10.000 uds. afectadas o mayor incidente' },
  { id: 'CRITICAL', label: 'Crítico', when: 'Bloqueos o bugs que dejan el módulo inoperativo' },
  { id: 'HIGH', label: 'Muy importante', when: 'Otros fallos que afectan a la producción' },
  { id: 'MEDIUM', label: 'Importante', when: 'El resto de bugs que llegan como incidencia' },
];
export const jiraPriority = (priority) => (priority === 'CRITICAL' ? 'CRITICAL' : priority === 'HIGH' ? 'HIGH' : 'MEDIUM');

// N3 de desarrollo: el asunto del chat obligatorio si se ha llamado.
export const n3Subject = (issue, dest) => `N3 - "${dest?.project || 'MÓDULO'}" - ${issue.id} - ${issue.center || 'Almacén afectado'}`;
export const isDev = (dest) => dest?.level === 'N3' && dest.via === 'SIGLO';

// El destino deja rastro en una herramienta (SIGLO o IOP abren su ticket). Si
// no (correo, fuera del mapa), conviene dejar la evidencia de cómo se escaló.
export const opensTicket = (dest) => !!dest && dest.opens !== 'none' && dest.via !== 'Correo';

// Por dónde va y lo que abre, en una línea: «Por SIGLO · abre un Jira de SISUPAC».
export const channelOf = (dest) => {
  if (!dest) return 'Fuera del mapa · sin ticket';
  const opens = dest.opens === 'jira' ? `abre un Jira de ${dest.project}` : dest.opens === 'remedy' ? 'abre una incidencia de Remedy' : 'sin ticket';
  return `${dest.via === 'Correo' ? 'Por correo' : `Por ${dest.via}`} · ${opens}`;
};

// Los pasos del asistente, como los de Resolver. Al unir a un ticket, todo va en el 1.
export const STEPS = [
  { n: 1, title: 'A quién' },
  { n: 2, title: 'Qué pasa' },
  { n: 3, title: 'Cómo se envía' },
  { n: 4, title: 'Revisar' },
];
export const LAST = STEPS.length;

const text = (v, k) => String(v[k] ?? '').trim();
const linkedRaw = (v) => text(v, v.linked === 'other' ? 'linkedOther' : 'linked');
export const destOf = (v, dests) => dests.find((d) => d.id === v.dest) || null;

// Lo que falta para salir del paso n → { field: el campo que se señala, text } | null.
// Sin destino o ticket no se sigue; sin herramienta que deje rastro, hace falta la evidencia.
export const stepMissing = (n, v, dests) => {
  if (n === 1 && v.mode === 'link') {
    const field = v.linked === 'other' ? 'linkedOther' : 'linked';
    if (!linkedRaw(v)) return { field, text: 'Elige el ticket para seguir' };
    return ticketCheck(linkedRaw(v)).state === 'ok' ? null : { field, text: 'Escribe un ticket válido para seguir' };
  }
  if (n === 1 && !text(v, 'dest')) return { field: 'dest', text: 'Elige el equipo para seguir' };
  if (n === 1 && v.dest === 'other' && !text(v, 'destOther')) return { field: 'destOther', text: 'Escribe el equipo para seguir' };
  if (n === 2 && !text(v, 'reason')) return { field: 'reason', text: 'Cuenta qué pasa para seguir' };
  if (n === 3 && !opensTicket(destOf(v, dests)) && !text(v, 'sent')) return { field: 'sent', text: 'Cuenta qué has enviado para seguir' };
  return null;
};

// El paso en el que se retoma un borrador: en el que se quedó, si los de antes siguen completos.
export const resumeStep = (saved, dests) => {
  if (!saved || saved.mode === 'link') return 1;
  const step = Math.min(Number(saved.step) || 1, LAST);
  for (let n = 1; n < step; n++) if (stepMissing(n, saved, dests)) return n;
  return step;
};

// A quién va, para el aviso del final: el equipo o el ticket (ya limpio).
export const targetOf = (v, dests) => (v.mode === 'link' ? ticketCheck(linkedRaw(v)).value : destOf(v, dests)?.name || text(v, 'destOther'));
