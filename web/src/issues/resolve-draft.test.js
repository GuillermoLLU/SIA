import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveDraft } from './resolve-draft.js';

const n = (at, text, who = 'ANA') => ({ at, who, text });
const worklog = [
  n('2026-10-28 10:00', '[SITUACION INICIAL] No sale la ola'),
  n('2026-10-28 10:20', '[ANTECEDENTES] Sin antecedentes'),
  n('2026-10-28 10:30', '[ANÁLISIS] Revisamos la cola'),
  n('2026-10-28 11:00', '[DIAGN�STICO] Cola bloqueada'),
  n('2026-10-28 11:05', '[DIAGNOSTICO] Cola bloqueada por un bulto'),
  n('2026-10-28 11:30', '[RESOLUTION] auto', 'REMEDY'),
];
const issue = (o) => ({ priority: 'HIGH', category: 'ECOM › EWMS', worklog, ...o });

test('qué ocurrió sale del último diagnóstico, con o sin tilde; [RESOLUTION] de Remedy no cuenta', () => {
  const r = resolveDraft(issue());
  assert.deepEqual(r.draft.what, { value: 'Cola bloqueada por un bulto', from: 'diagnóstico (28/10 11:05, ANA)' });
  assert.equal(r.draft.how, null);
  assert.equal(r.resolution, null);
  assert.deepEqual(r.notes.map((x) => Boolean(x.note)), [true, true, true, true, false]);
  assert.deepEqual(r.warnings, []);
});

test('con la nota de resolución escrita, no se vuelve a pedir y empieza «Cómo se resolvió»', () => {
  const r = resolveDraft(issue({ worklog: [...worklog, n('2026-10-28 11:40', '[RESOLUCION] Se libera el bulto')] }));
  assert.equal(r.resolution.text, 'Se libera el bulto');
  assert.equal(r.draft.how.value, 'Se libera el bulto');
});

test('avisos: las notas que faltan, sin diagnóstico, sin categoría y lo de las críticas', () => {
  const r = resolveDraft(issue({ category: '', priority: 'CRITICAL', worklog: worklog.slice(0, 1) }));
  assert.match(r.warnings[0], /antecedentes, análisis, diagnóstico\./);
  assert.equal(r.warnings.length, 4);
  assert.equal(r.notes.length, 7);
  assert.deepEqual(resolveDraft({ priority: 'LOW', category: 'x' }).notes.length, 5);
});

test('con ticket de proveedor, recuerda avisar de que se ha resuelto', () => {
  assert.deepEqual(resolveDraft(issue({ vendorTicket: 'SISUPAC-1' })).warnings, ['Tiene el ticket de proveedor SISUPAC-1: avisa de que se ha resuelto.']);
});
