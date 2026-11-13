import test from 'node:test';
import assert from 'node:assert/strict';
import { escalateCheck, checkEscalate, cleanEscalate } from './escalate.js';

const n = (at, text, who = 'ANA') => ({ at, who, text });
const BASE = [
  n('2026-10-28 10:00', '[SITUACION INICIAL] No sale la ola'),
  n('2026-10-28 10:20', '[ANTECEDENTES] Sin antecedentes ni Jira abierto'),
  n('2026-10-28 10:30', '[ANÁLISIS] Timeouts de 8 a 12 s en el túnel RFID'),
];
const issue = (o) => ({ status: 'IN_PROGRESS', priority: 'MEDIUM', worklog: BASE, ...o });
const FULL = cleanEscalate({ mode: 'escalate', dest: 'sisupac', reason: 'Timeouts' });

test('las notas que pide: situación inicial, antecedentes y análisis; el diagnóstico no', () => {
  const r = escalateCheck(issue());
  assert.deepEqual(r.notes.map((x) => [x.key, Boolean(x.note)]), [['initial', true], ['background', true], ['analysis', true]]);
  assert.deepEqual(r.missing, []);
  assert.deepEqual(r.analysis, { at: '2026-10-28 10:30', who: 'ANA', text: 'Timeouts de 8 a 12 s en el túnel RFID' });
  assert.equal(r.background.text, 'Sin antecedentes ni Jira abierto');   // lo que se enseña al unir
  assert.deepEqual(escalateCheck(issue({ worklog: BASE.slice(0, 2) })).missing, ['Análisis']);
  assert.equal(escalateCheck(issue({ worklog: BASE.slice(0, 2) })).analysis, null);
});

test('en altas y críticas, también la evaluación de mayor incidente', () => {
  for (const priority of ['HIGH', 'CRITICAL']) assert.deepEqual(escalateCheck(issue({ priority })).missing, ['¿Es mayor incidente?']);
  assert.deepEqual(escalateCheck(issue({ priority: 'HIGH', worklog: [...BASE, n('2026-10-28 10:40', '[MAJOR INCIDENT] No')] })).missing, []);
  assert.deepEqual(escalateCheck(issue({ priority: 'LOW' })).missing, []);
});

test('el borrador: solo texto y un modo y un paso conocidos', () => {
  assert.deepEqual(cleanEscalate({ dest: 'era', step: '3', extra: 'x' }), { mode: 'escalate', dest: 'era', destOther: '', linked: '', linkedOther: '', reason: '', jiraPriority: '', sent: '', step: 3 });
  for (const bad of [null, [], { mode: 'otro' }, { step: '5' }, { reason: 7 }]) assert.throws(() => cleanEscalate(bad), { status: 400 });
  assert.throws(() => cleanEscalate({ reason: 'x'.repeat(20_001) }), /pasa de/);
});

test('confirmar: sin las notas no se escala ni se une; y lo que no puede faltar', () => {
  assert.equal(checkEscalate(issue(), FULL), FULL);
  assert.throws(() => checkEscalate(issue({ worklog: [] }), FULL), { status: 409, message: /Situación inicial, Antecedentes, Análisis/ });
  assert.throws(() => checkEscalate(issue({ worklog: [] }), cleanEscalate({ mode: 'link', linked: 'SISUPAC-9211' })), { status: 409 });
  assert.ok(checkEscalate(issue(), cleanEscalate({ mode: 'link', linked: 'other', linkedOther: 'ERA-4170' })));
  assert.throws(() => checkEscalate(issue(), cleanEscalate({ mode: 'link', linked: 'other' })), /el ticket/);
  assert.throws(() => checkEscalate(issue(), cleanEscalate({ reason: 'x' })), /a qué equipo/);
  assert.throws(() => checkEscalate(issue(), cleanEscalate({ dest: 'other', reason: 'x' })), /a qué equipo/);
  assert.throws(() => checkEscalate(issue(), cleanEscalate({ dest: 'era' })), /qué pasa/);
});
