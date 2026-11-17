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
const isDev = (dest) => dest?.level === 'N3' && dest.via === 'SIGLO';

// El destino deja rastro en una herramienta (SIGLO o IOP abren su ticket). Si
// no (correo, fuera del mapa), conviene dejar la evidencia de cómo se escaló.
export const opensTicket = (dest) => !!dest && dest.opens !== 'none' && dest.via !== 'Correo';


// Lo mínimo que pide el destino antes de escalar (proceso de soporte, 2.3): el técnico lo
// confirma; lo que no es obligatorio («si has llamado») se enseña, pero no bloquea. De
// momento solo está definido para N3 de desarrollo; el resto, cuando se complete el catálogo (#9).
// subject: el asunto que se copia, si lo lleva.
export const minimumsOf = (issue, dest) => (isDev(dest) ? [
  { key: 'form', title: 'Formulario de SIGLO', text: 'Con el análisis y las evidencias.', required: true },
  { key: 'chat', title: 'Chat N3', text: 'Si has llamado: con desarrollo, el responsable técnico y la referencia N3.', subject: n3Subject(issue, dest), required: false },
  { key: 'logs', title: 'Logs', text: 'Copiados a soporteSGA.', required: true },
] : []);
// Las casillas marcadas van en un solo campo, separadas por comas: «form,logs».
export const checkedMins = (v) => String(v.mins ?? '').split(',').filter(Boolean);

// La búsqueda de escalados del mismo problema, al abrir Escalar (reunión del 17/11/2026): en SGA, del
// mismo centro; en SISU, del mismo módulo; y con el resumen parecido. No es la nota [RECURRENCIA], que
// es la de Remedy. Hasta tener la búsqueda en Jira, sobre los escalados abiertos de prueba, y el
// resumen no se compara. → [{ …escalado, why: [por qué ha salido] }]
const moduleOf = (issue) => String(issue.category ?? '').split('›').pop().trim();
export const findEscalations = (issue, open) => open
  .filter((o) => (issue.sisu ? o.module === moduleOf(issue) : o.center === issue.center))
  .map((o) => ({ ...o, why: [issue.sisu ? 'Mismo módulo' : 'Mismo centro', 'Resumen parecido'] }));

// Los pasos del asistente, como los de Resolver. En el 1 se elige el flujo (reunión del 17/11/2026),
// los dos con el mismo aspecto: si alguna coincidencia es el mismo problema, se actualiza ese escalado
// con un comentario; si no, uno nuevo por los pasos 2 a 5.
export const FEED = 6;
export const STEPS = [
  { n: 1, title: 'Coincidencias' },   // ¿alguna es el mismo problema? Sí: actualizar; no: nuevo
  { n: 2, title: 'A quién' },
  { n: 3, title: 'Motivo' },
  { n: 4, title: 'Requisitos' },
  { n: 5, title: 'Resumen' },
  { n: FEED, title: 'Actualizar escalado' },
];
export const FLOWS = { link: [1, FEED], escalate: [1, 2, 3, 4, 5] };
export const LAST = 5;   // el resumen del escalado
export const titleOf = (n) => STEPS.find((s) => s.n === n)?.title;
const flowOf = (mode) => FLOWS[mode === 'link' ? 'link' : 'escalate'];
export const nextOf = (mode, n) => { const f = flowOf(mode); return f[f.indexOf(n) + 1] ?? null; };
export const prevOf = (mode, n) => { const f = flowOf(mode); return f[f.indexOf(n) - 1] ?? null; };

// Actualizar escalado: el comentario que se deja en el ticket (y en Remedy) al unirla, con lo nuevo de esta incidencia. Empieza
// escrito y se puede retocar. check: la comprobación del bridge (las notas de Remedy).
export const feedComment = (issue, check) => {
  const note = (k) => check.notes.find((n) => n.key === k)?.note?.text;
  return [
    `Nueva incidencia relacionada: ${issue.id}${issue.center ? ` (centro ${issue.center})` : ''}.`,
    note('initial') && `Situación inicial: ${note('initial')}`,
    note('analysis') && `Análisis: ${note('analysis')}`,
  ].filter(Boolean).join('\n\n');
};

const text = (v, k) => String(v[k] ?? '').trim();
const linkedRaw = (v) => text(v, v.linked === 'other' ? 'linkedOther' : 'linked');
export const destOf = (v, dests) => dests.find((d) => d.id === v.dest) || null;

// Lo que falta para salir del paso n → { field: el campo que se señala, text } | null.
// Al unir, un ticket válido; al escalar, el destino, el motivo, lo mínimo del destino y, si no
// queda rastro en una herramienta, la evidencia.
export const stepMissing = (n, v, { dests, issue }) => {
  if (n === 1 && v.mode === 'link') {
    const field = v.linked === 'other' ? 'linkedOther' : 'linked';
    if (!linkedRaw(v)) return { field, text: 'Elige el escalado para seguir' };
    return ticketCheck(linkedRaw(v)).state === 'ok' ? null : { field, text: 'Escribe una clave válida para seguir' };
  }
  if (n === FEED && !text(v, 'comment')) return { field: 'comment', text: 'Escribe el comentario para seguir' };
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
// found: las coincidencias de la búsqueda al abrir (findEscalations).
export const priorityLabel = (id) => JIRA_PRIORITIES.find((p) => p.id === id)?.label || id;
export const stepWarning = (n, v, { dests, issue, found = [] }) => {
  if (n === 1 && v.mode === 'link') {
    const ticket = ticketCheck(linkedRaw(v)).value;
    return found.some((o) => o.ticket === ticket) ? null : { title: 'No está entre las coincidencias', ok: 'Unir igualmente',
      text: `¿${ticket} es el mismo problema?` };
  }
  if (n === 3 && noteQuality(v.reason).level === 'low') {
    return { title: 'Motivo muy breve', ok: 'Continuar', text: 'El destino puede devolverla.' };
  }
  const dest = destOf(v, dests);
  const due = jiraPriority(issue.priority);
  if (n === 4 && dest?.opens === 'jira' && v.jiraPriority && v.jiraPriority !== due) {
    return { title: 'Prioridad del Jira distinta', ok: 'Continuar',
      text: `Por su criticidad le toca «${priorityLabel(due)}»; has elegido «${priorityLabel(v.jiraPriority)}».` };
  }
  if (n === 4 && !opensTicket(dest) && noteQuality(v.sent).level === 'low') {
    return { title: 'Evidencia muy breve', ok: 'Continuar', text: 'Es la única prueba del escalado.' };
  }
  return null;
};

// El paso en el que se retoma un borrador: en el que se quedó, si los de antes siguen completos.
export const resumeStep = (saved, ctx) => {
  if (!saved) return 1;
  if (saved.mode === 'link') return Number(saved.step) === FEED && !stepMissing(1, saved, ctx) ? FEED : 1;
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
