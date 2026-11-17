// Escalar (#9, #117), sin DOM: el ticket de proveedor (formato y prefijos de hoy),
// la prioridad del Jira, los pasos y qué hace falta en cada uno. Los destinos
// llegan de fuera (el catálogo). Las notas del método las comprueba el bridge.

import { noteQuality } from './quality.js';

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


// Lo mínimo que pide el destino antes de escalar (proceso de soporte, 2.3): el técnico lo
// confirma; lo que no es obligatorio («si has llamado») se enseña, pero no bloquea. De
// momento solo está definido para N3 de desarrollo; el resto, cuando se complete el catálogo (#9).
// subject: el asunto que se copia, si lo lleva.
export const minimumsOf = (issue, dest) => (isDev(dest) ? [
  { key: 'form', title: 'Formulario de SIGLO', text: 'Con el análisis previo y las evidencias.', required: true },
  { key: 'chat', title: 'Chat N3', text: 'Si has llamado: con la persona de desarrollo, el responsable técnico y la referencia de N3.', subject: n3Subject(issue, dest), required: false },
  { key: 'logs', title: 'Logs', text: 'Copiados a soporteSGA.', required: true },
] : []);
// Las casillas marcadas van en un solo campo, separadas por comas: «form,logs».
export const checkedMins = (v) => String(v.mins ?? '').split(',').filter(Boolean);

// Los pasos del asistente, como los de Resolver. Primero se busca un ticket abierto: si lo hay,
// se une y todo acaba en el 1; si no, se escala por los demás.
export const STEPS = [
  { n: 1, title: 'Ticket abierto' },
  { n: 2, title: 'A quién' },
  { n: 3, title: 'Motivo' },
  { n: 4, title: 'Requisitos' },
  { n: 5, title: 'Resumen' },
];
export const LAST = STEPS.length;

const text = (v, k) => String(v[k] ?? '').trim();
const linkedRaw = (v) => text(v, v.linked === 'other' ? 'linkedOther' : 'linked');
export const destOf = (v, dests) => dests.find((d) => d.id === v.dest) || null;

// Lo que falta para salir del paso n → { field: el campo que se señala, text } | null.
// Al unir, un ticket válido; al escalar, el destino, el motivo, lo mínimo del destino y, si no
// queda rastro en una herramienta, la evidencia.
export const stepMissing = (n, v, { dests, issue }) => {
  if (n === 1 && v.mode === 'link') {
    const field = v.linked === 'other' ? 'linkedOther' : 'linked';
    if (!linkedRaw(v)) return { field, text: 'Elige el ticket para seguir' };
    return ticketCheck(linkedRaw(v)).state === 'ok' ? null : { field, text: 'Escribe un ticket válido para seguir' };
  }
  if (n === 2 && !text(v, 'dest')) return { field: 'dest', text: 'Elige el equipo para seguir' };
  if (n === 2 && v.dest === 'other' && !text(v, 'destOther')) return { field: 'destOther', text: 'Escribe el equipo para seguir' };
  if (n === 3 && !text(v, 'reason')) return { field: 'reason', text: 'Cuenta el motivo para seguir' };
  if (n === 4) {
    const dest = destOf(v, dests), checked = checkedMins(v);
    if (minimumsOf(issue, dest).some((m) => m.required && !checked.includes(m.key))) return { field: 'mins', text: 'Confirma lo mínimo para seguir' };
    if (!opensTicket(dest) && !text(v, 'sent')) return { field: 'sent', text: 'Cuenta qué has enviado para seguir' };
  }
  return null;
};

// Lo que se le puede pasar al técnico al salir del paso n (o al unir, en el 1): se puede seguir,
// pero avisando, como la nota breve de Resolver. → { title, text, ok } | null
// background: la nota [ANTECEDENTES] de Remedy (la comprobación del bridge).
export const priorityLabel = (id) => JIRA_PRIORITIES.find((p) => p.id === id)?.label || id;
export const stepWarning = (n, v, { dests, issue, background }) => {
  if (n === 1 && v.mode === 'link') {
    const ticket = ticketCheck(linkedRaw(v)).value;
    const said = String(background?.text ?? '').toUpperCase().includes(ticket);
    return said ? null : { title: 'Los antecedentes no mencionan el ticket', ok: 'Unir igualmente',
      text: `En los antecedentes no aparece ${ticket}. ¿Seguro que es el mismo problema?` };
  }
  if (n === 3 && noteQuality(v.reason).level === 'low') {
    return { title: 'El motivo es muy breve', ok: 'Continuar', text: '¿Seguro que quieres continuar? El motivo es muy breve y el destino puede devolverla.' };
  }
  const dest = destOf(v, dests);
  const due = jiraPriority(issue.priority);
  if (n === 4 && dest?.opens === 'jira' && v.jiraPriority && v.jiraPriority !== due) {
    return { title: 'La prioridad del Jira no es la que le toca', ok: 'Continuar',
      text: `Por la criticidad de la issue le toca «${priorityLabel(due)}» y has elegido «${priorityLabel(v.jiraPriority)}». ¿Seguro que quieres seguir?` };
  }
  if (n === 4 && !opensTicket(dest) && noteQuality(v.sent).level === 'low') {
    return { title: 'La evidencia es muy breve', ok: 'Continuar', text: '¿Seguro que quieres continuar? Sin herramienta, lo que has enviado es la única prueba del escalado.' };
  }
  return null;
};

// El paso en el que se retoma un borrador: en el que se quedó, si los de antes siguen completos.
export const resumeStep = (saved, ctx) => {
  if (!saved || saved.mode === 'link') return 1;
  const step = Math.min(Number(saved.step) || 1, LAST);
  for (let n = 1; n < step; n++) if (stepMissing(n, saved, ctx)) return n;
  return step;
};

// A quién va, para el aviso del final: el equipo o el ticket (ya limpio).
export const targetOf = (v, dests) => (v.mode === 'link' ? ticketCheck(linkedRaw(v)).value : destOf(v, dests)?.name || text(v, 'destOther'));

// El ticket que queda al acabar → { ticket, sample } | null. Al unir, el elegido. Al escalar,
// hasta conectar Jira, uno de ejemplo con la forma que tendrá (sample: true); sin herramienta, ninguno.
export const resultTicket = (v, dests) => {
  if (v.mode === 'link') return { ticket: ticketCheck(linkedRaw(v)).value, sample: false };
  const dest = destOf(v, dests);
  if (dest?.opens === 'jira') return { ticket: `${dest.project}-0000`, sample: true };
  if (dest?.opens === 'remedy') return { ticket: 'INC000000000000', sample: true };
  return null;
};
