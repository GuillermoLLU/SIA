// Al escalar (dominio, sin E/S): sin análisis no hay motivo para escalar (la
// auditoría resta −3), así que Escalar y Unir a un ticket solo se abren con las
// notas del método que lo dejan escrito en Remedy. Lo decide el bridge, como en
// Resolver; el catálogo de destinos y el formato del ticket los mira la web
// (escalate.js), que de momento tiene el catálogo de prueba.
import { fail, MAX_TEXT } from './draft.js';
import { NOTES, CRITICAL, lastByKey } from './resolve.js';

// Situación inicial, antecedentes (no hay procedimiento ni un Jira ya abierto) y
// análisis; en altas y críticas, además, la evaluación de mayor incidente. El
// diagnóstico no: a veces se escala justo porque no se llega a él.
const ALWAYS = ['initial', 'background', 'analysis'];
const SERIOUS = new Set(['HIGH', 'CRITICAL']);
const byKey = new Map([...NOTES, ...CRITICAL].map((n) => [n.key, n]));

// → { notes: [{ key, label, note }], missing: [label], analysis, background: { at, who, text } | null }
// analysis: la nota [ANALISIS], con la que empieza «Qué pasa»; background: [ANTECEDENTES], lo
// que dice por qué se une a un ticket ya abierto.
export const escalateCheck = (issue) => {
  const last = lastByKey(issue.worklog);
  const keys = [...ALWAYS, ...(SERIOUS.has(issue.priority) ? ['major'] : [])];
  const notes = keys.map((k) => ({ key: k, label: byKey.get(k).label, note: last[k] || null }));
  return { notes, missing: notes.filter((n) => !n.note).map((n) => n.label), analysis: last.analysis || null, background: last.background || null };
};

// Se escala lo que se está trabajando; una Resuelta, por la causa raíz. Una
// Pendiente ya espera a un tercero.
export const ESCALABLE = new Set(['ASSIGNED', 'IN_PROGRESS', 'RESOLVED']);

// Lo que escribe el técnico (escalate-form.js), todo texto, y el paso en el que va.
// mins: lo mínimo del destino que ha confirmado, separado por comas.
const FIELDS = ['dest', 'destOther', 'linked', 'linkedOther', 'reason', 'jiraPriority', 'sent', 'mins'];
const MODES = ['escalate', 'link'];
const STEPS = [1, 2, 3, 4, 5];

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
    return f;
  }
  if (!s('dest') || (f.dest === 'other' && !s('destOther'))) throw fail('Falta: a qué equipo se escala.');
  if (!s('reason')) throw fail('Falta: qué pasa.');
  return f;
};
