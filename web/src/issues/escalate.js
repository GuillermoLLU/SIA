// Escalar (#9), sin DOM: el ticket de proveedor (formato y prefijos de hoy),
// la prioridad del Jira y qué hace falta para escalar o vincular. Los destinos
// llegan de fuera (el catálogo).

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

// Lo recomendable que falta: no bloquea, se recuerda al escalar.
export const escalateTodo = (v, dest) => [
  ...(String(v.reason ?? '').trim() ? [] : ['el análisis previo']),
  ...(opensTicket(dest) || String(v.sent ?? '').trim() ? [] : ['la evidencia del escalado']),
];

// Lo que se envía al escalar o al vincular, o lo único sin lo que no se puede:
// a quién se escala o a qué ticket se vincula. → { missing } | { values }
export const readEscalate = (v, dests) => {
  const s = (k) => String(v[k] ?? '').trim();
  if (s('mode') === 'link') {
    const raw = s('linked') === 'other' ? s('linkedOther') : s('linked');
    if (!raw) return { missing: 'el ticket al que vincular' };
    const t = ticketCheck(raw);
    if (t.state !== 'ok') return { missing: 'un ticket válido (PROYECTO-número o INC y 12 dígitos)' };
    return { values: { mode: 'link', ticket: t.value, why: s('why') } };
  }
  if (!s('dest')) return { missing: 'a qué equipo se escala' };
  const dest = dests.find((d) => d.id === s('dest')) || null;
  if (!dest && !s('destOther')) return { missing: 'el nombre del equipo o proveedor' };
  return { values: {
    mode: 'escalate', dest: dest?.id || null, destName: dest?.name || s('destOther'), reason: s('reason'), sent: s('sent'), todo: escalateTodo(v, dest),
    ...(dest?.opens === 'jira' ? { jiraPriority: s('jiraPriority') } : {}),
  } };
};

// Lo escrito en Escalar, por issue, hasta que se escala o se une: cerrar el
// modal no lo pierde. → { get(id) → values | null, save(id, values), drop(id) }
// shortcut: en memoria de esta ventana, se pierde al recargar; con la integración irá al bridge, como el borrador de Resolver.
export const createEscalateDrafts = () => {
  const drafts = new Map();
  return {
    get: (id) => drafts.get(id) ?? null,
    save: (id, values) => { drafts.set(id, values); },
    drop: (id) => { drafts.delete(id); },
  };
};
