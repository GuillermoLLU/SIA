import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDraft, checkResolve } from './resolve.js';

const n = (at, text, who = 'ANA') => ({ at, who, text });
const worklog = [
  n('2026-10-28 10:00', '[SITUACION INICIAL] No sale la ola'),
  n('2026-10-28 10:20', '[ANTECEDENTES] Sin antecedentes'),
  n('2026-10-28 10:30', '[ANÁLISIS] Revisamos la cola'),
  n('2026-10-28 11:00', '[DIAGN�STICO] Cola bloqueada'),
  n('2026-10-28 11:05', '[DIAGNOSTICO] Cola bloqueada por un bulto'),
  n('2026-10-28 11:30', '[RESOLUTION] auto', 'REMEDY'),
];
const issue = (o) => ({ status: 'ASSIGNED', priority: 'HIGH', category: 'ECOM › EWMS', worklog, ...o });

test('qué ocurrió sale del último diagnóstico, con o sin tilde; [RESOLUTION] de Remedy no cuenta', () => {
  const r = resolveDraft(issue());
  assert.deepEqual(r.draft.what, { value: 'Cola bloqueada por un bulto', from: 'diagnóstico (28/10 11:05, ANA)' });
  assert.equal(r.draft.how, null);
  assert.equal(r.resolution, null);
  assert.deepEqual(r.notes.map((x) => Boolean(x.note)), [true, true, true, true, false]);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.missing, []);
});

test('con la nota de resolución escrita, no se vuelve a pedir y empieza «Cómo se resolvió»', () => {
  const r = resolveDraft(issue({ worklog: [...worklog, n('2026-10-28 11:40', '[RESOLUCION] Se libera el bulto')] }));
  assert.equal(r.resolution.text, 'Se libera el bulto');
  assert.equal(r.draft.how.value, 'Se libera el bulto');
});

test('lo que falta en Remedy para la nota de cierre: las notas (en críticas, también sus dos) y la categoría', () => {
  const r = resolveDraft(issue({ category: '', priority: 'CRITICAL', worklog: worklog.slice(0, 1) }));
  assert.deepEqual(r.missing, ['Antecedentes', 'Análisis', 'Diagnóstico', '¿Es mayor incidente?', 'Servicio restablecido', 'Categoría']);
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(resolveDraft(issue({ category: '' })).missing, ['Categoría']);
  assert.equal(r.notes.length, 7);
  assert.deepEqual(resolveDraft(issue()).missing, []);
  assert.deepEqual(resolveDraft({ priority: 'LOW', category: 'x' }).notes.length, 5);
});

test('con ticket de proveedor, recuerda avisar de que se ha resuelto', () => {
  assert.deepEqual(resolveDraft(issue({ vendorTicket: 'SISUPAC-1' })).warnings, ['Tiene el ticket de proveedor SISUPAC-1: avisa de que se ha resuelto.']);
});

// Confirmar: el bridge no se fía de la web (se puede tocar en devtools)
const ALL = [...worklog.slice(0, 5)];
const OK = { note: 'Se relanza', what: 'Se paró', how: 'Se relanzó', prevent: 'Corrección pedida', lang: 'es' };
const rejects = (fn, status, message) => assert.throws(fn, (e) => e.status === status && (!message || message.test(e.message)));

test('confirmar: con todo, lo que se envía', () => {
  assert.deepEqual(checkResolve(issue({ worklog: ALL }), OK), OK);
});

test('confirmar: resuelta o cerrada, no; aunque el botón se fuerce', () => {
  for (const status of ['RESOLVED', 'CLOSED', 'CANCELLED']) rejects(() => checkResolve(issue({ status, worklog: ALL }), OK), 409, /resuelta o cerrada/);
  for (const status of ['ASSIGNED', 'IN_PROGRESS', 'PENDING']) assert.ok(checkResolve(issue({ status, worklog: ALL }), OK));
});

test('confirmar: sin las notas o sin la categoría no se resuelve, aunque se salte el paso 1', () => {
  rejects(() => checkResolve(issue({ worklog: ALL.slice(0, 3) }), OK), 409, /faltan en Remedy: Diagnóstico\./);
  rejects(() => checkResolve(issue({ worklog: ALL, category: '' }), OK), 409, /Categoría/);
  rejects(() => checkResolve(issue({ worklog: ALL, priority: 'CRITICAL' }), OK), 409, /¿Es mayor incidente\?, Servicio restablecido/);
  rejects(() => checkResolve({ status: 'ASSIGNED', category: 'x' }, OK), 409);   // foto sin WORKLOG_DETAIL
});

test('confirmar: un campo vacío o solo con espacios, no', () => {
  rejects(() => checkResolve(issue({ worklog: ALL }), { ...OK, prevent: '   ' }), 400, /Falta: ¿Qué se hará para evitarlo\?/);
  rejects(() => checkResolve(issue({ worklog: ALL }), { ...OK, note: '' }), 400, /Nota interna/);
});

test('confirmar: con la nota de resolución ya en Remedy vale esa, no la que llegue', () => {
  const r = checkResolve(issue({ worklog: [...ALL, n('2026-10-28 11:40', '[RESOLUCION] Se libera el bulto')] }), { ...OK, note: 'cambiada en devtools' });
  assert.equal(r.note, 'Se libera el bulto');
});
