import test from 'node:test';
import assert from 'node:assert/strict';
import { escalateCheck, checkEscalate, cleanEscalate } from './escalate.js';

const n = (at, text, who = 'ANA') => ({ at, who, text });
const BASE = [
  n('2026-10-28 10:00', '[SITUACION INICIAL] No sale la ola'),
  n('2026-10-28 10:10', '[RECURRENCIA] Ninguna abierta en el centro con el mismo síntoma.'),
  n('2026-10-28 10:20', '[ANTECEDENTES] Sin antecedentes ni Jira abierto'),
  n('2026-10-28 10:30', '[ANÁLISIS] Timeouts de 8 a 12 s en el túnel RFID'),
];
const issue = (o) => ({ status: 'IN_PROGRESS', priority: 'MEDIUM', worklog: BASE, ...o });
const FULL = cleanEscalate({ mode: 'escalate', dest: 'sisupac', reason: 'Timeouts' });

test('las notas que pide: las del método hasta el análisis; el diagnóstico no', () => {
  const r = escalateCheck(issue());
  assert.deepEqual(r.notes.map((x) => [x.key, Boolean(x.note)]), [['initial', true], ['recurrence', true], ['background', true], ['analysis', true]]);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.analysis, { at: '2026-10-28 10:30', who: 'ANA', text: 'Timeouts de 8 a 12 s en el túnel RFID' });
  assert.deepEqual(escalateCheck(issue({ worklog: BASE.filter((x) => !x.text.includes('ANÁLISIS')) })).missing, ['Análisis']);
  // [RECURRENCIA] es la de Remedy: los escalados del mismo problema no salen de ella (los busca la web al abrir)
  assert.equal('recurrence' in escalateCheck(issue()), false);
  assert.deepEqual(escalateCheck(issue({ worklog: [] })).missing, ['Situación inicial', 'Recurrencia', 'Antecedentes', 'Análisis']);
});

test('solo en críticas, también la evaluación de mayor incidente, después de la situación inicial', () => {
  assert.deepEqual(escalateCheck(issue({ priority: 'CRITICAL' })).missing, ['¿Es mayor incidente?']);
  assert.equal(escalateCheck(issue({ priority: 'CRITICAL' })).notes[1].key, 'major');
  assert.deepEqual(escalateCheck(issue({ priority: 'CRITICAL', worklog: [...BASE, n('2026-10-28 10:40', '[MAJOR INCIDENT] No')] })).missing, []);
  for (const priority of ['HIGH', 'LOW']) assert.deepEqual(escalateCheck(issue({ priority })).missing, []);
});

test('el borrador: solo texto y un modo y un paso conocidos', () => {
  assert.deepEqual(cleanEscalate({ dest: 'era', step: '6', mins: 'form,logs', extra: 'x' }), { mode: 'escalate', dest: 'era', destOther: '', linked: '', linkedOther: '', reason: '', jiraPriority: '', sent: '', mins: 'form,logs', comment: '', step: 6 });
  for (const bad of [null, [], { mode: 'otro' }, { step: '7' }, { reason: 7 }, { mins: ['form'] }]) assert.throws(() => cleanEscalate(bad), { status: 400 });
  assert.throws(() => cleanEscalate({ reason: 'x'.repeat(20_001) }), /pasa de/);
});

test('confirmar: sin las notas no se escala ni se une; y lo que no puede faltar', () => {
  assert.equal(checkEscalate(issue(), FULL), FULL);
  assert.throws(() => checkEscalate(issue({ worklog: [] }), FULL), { status: 409, message: /Situación inicial, Recurrencia, Antecedentes, Análisis\./ });
  assert.throws(() => checkEscalate(issue({ worklog: [] }), cleanEscalate({ mode: 'link', linked: 'SISUPAC-9211', comment: 'x' })), { status: 409 });
  assert.ok(checkEscalate(issue(), cleanEscalate({ mode: 'link', linked: 'other', linkedOther: 'ERA-4170', comment: 'Nueva incidencia' })));
  assert.throws(() => checkEscalate(issue(), cleanEscalate({ mode: 'link', linked: 'ERA-4170' })), /el comentario/);
  assert.throws(() => checkEscalate(issue(), cleanEscalate({ mode: 'link', linked: 'other' })), /el ticket/);
  assert.throws(() => checkEscalate(issue(), cleanEscalate({ reason: 'x' })), /a qué equipo/);
  assert.throws(() => checkEscalate(issue(), cleanEscalate({ dest: 'other', reason: 'x' })), /a qué equipo/);
  assert.throws(() => checkEscalate(issue(), cleanEscalate({ dest: 'era' })), /qué pasa/);
});
