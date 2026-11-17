// Al escalar (dominio, sin E/S): sin análisis no hay motivo para escalar (la
// auditoría resta −3), así que Escalar y Unir a un ticket solo se abren con las
// notas del método que lo dejan escrito en Remedy. Lo decide el bridge, como en
// Resolver; el catálogo de destinos y el formato del ticket los mira la web
// (escalate.js), que de momento tiene el catálogo de prueba.
import { fail, MAX_TEXT } from './draft.js';
import { methodNotes, lastByKey } from './resolve.js';

// Las notas del método hasta el análisis, como al resolver (reunión del 17/11/2026): situación inicial,
// en críticas la evaluación de mayor incidente, recurrencia, antecedentes y análisis. El diagnóstico
// no: a veces se escala justo porque no se llega a él. La recurrencia en Jira no se pide: la busca
// SIA al abrir Escalar, cada vez (de momento, de prueba).

// La nota [RECURRENCIA] lleva un apartado por herramienta: «Remedy: …» y, si ya se buscó, «Jira: …».
// → { remedy, jira, tickets }: el texto de cada apartado (null si no está) y las claves de Jira que nombra.
const PART = /^\s*(REMEDY|JIRA)\s*:\s*/i;
const JIRA_KEY = /\b[A-Z][A-Z0-9]*-\d+\b/g;
export const recurrenceOf = (text) => {
  const out = { remedy: null, jira: null };
  let cur = null;
  for (const line of String(text ?? '').split('\n')) {
    const m = line.match(PART);
    if (m) { cur = m[1].toLowerCase(); out[cur] = line.replace(PART, '').trim(); }
    else if (cur && line.trim()) out[cur] = `${out[cur]} ${line.trim()}`.trim();
  }
  return { ...out, tickets: [...new Set(out.jira?.toUpperCase().match(JIRA_KEY) || [])] };
};

// → { notes: [{ key, label, note }], missing: [label], analysis, background, recurrence: recurrenceOf | null }
// analysis: la nota [ANALISIS], con la que empieza el motivo; recurrence: la nota [RECURRENCIA]
// por apartados. Hasta tener la búsqueda en Jira, los tickets «encontrados» son los que nombra su
// apartado «Jira:» (los datos de prueba lo traen).
export const escalateCheck = (issue) => {
  const last = lastByKey(issue.worklog);
  const notes = methodNotes(issue.priority === 'CRITICAL').map(({ key, label }) => ({ key, label, note: last[key] || null }));
  return { notes, missing: notes.filter((n) => !n.note).map((n) => n.label), analysis: last.analysis || null, background: last.background || null,
    recurrence: last.recurrence ? recurrenceOf(last.recurrence.text) : null };
};

// Se escala lo que se está trabajando; una Resuelta, por la causa raíz. Una
// Pendiente ya espera a un tercero.
export const ESCALABLE = new Set(['ASSIGNED', 'IN_PROGRESS', 'RESOLVED']);

// Lo que escribe el técnico (escalate-form.js), todo texto, y el paso en el que va.
// mins: lo mínimo del destino que ha confirmado, separado por comas; comment: lo que se comenta en
// el ticket al unirla (nutrir).
const FIELDS = ['dest', 'destOther', 'linked', 'linkedOther', 'reason', 'jiraPriority', 'sent', 'mins', 'comment'];
const MODES = ['escalate', 'link'];
const STEPS = [1, 2, 3, 4, 5, 6];   // el 6: nutrir, al unir

// body del formulario → { mode, …FIELDS, step }. Lo que no cuadra se rechaza, como en Resolver.
export const cleanEscalate = (body) => {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) throw fail('El borrador no es válido.');
  const out = { mode: body.mode ?? 'escalate' };
  if (!MODES.includes(out.mode)) throw fail('El borrador no es válido.');
  for (const f of FIELDS) {
    const v = body[f] ?? '';
    if (typeof v !== 'string') throw fail('El borrador no es válido.');
    if (v.length > MAX_TEXT) throw fail(`Un texto pasa de ${MAX_TEXT.toLocaleString('es-ES')} caracteres.`);
    out[f] = v;
  }
  const step = Number(body.step ?? 1);   // llega como texto del formulario
  if (!STEPS.includes(step)) throw fail('El borrador no es válido.');
  return { ...out, step };
};

// Al confirmar, otra vez: las notas y lo que no puede faltar. Lanza 409 sin las
// notas y 400 si falta algo.
export const checkEscalate = (issue, f) => {
  const { missing } = escalateCheck(issue);
  if (missing.length) throw fail(`Para escalar faltan en Remedy: ${missing.join(', ')}.`, 409);
  const s = (k) => f[k].trim();
  if (f.mode === 'link') {
    if (!s(f.linked === 'other' ? 'linkedOther' : 'linked')) throw fail('Falta: el ticket al que unirla.');
    if (!s('comment')) throw fail('Falta: el comentario para el ticket.');
    return f;
  }
  if (!s('dest') || (f.dest === 'other' && !s('destOther'))) throw fail('Falta: a qué equipo se escala.');
  if (!s('reason')) throw fail('Falta: qué pasa.');
  return f;
};
