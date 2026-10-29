import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTickets, ticketCheck, jiraPriority, n3Subject, escalateTodo, readEscalate, createEscalateDrafts } from './escalate.js';
import { DESTINATIONS } from './escalate-mock.js';

const dest = (id) => DESTINATIONS.find((d) => d.id === id);

test('el ticket: los prefijos de hoy fuera y varios tickets separados', () => {
  assert.deepEqual(parseTickets('ITD: sisupac-9211'), { tickets: ['SISUPAC-9211'], bad: [] });
  assert.deepEqual(parseTickets('SISUPAC-9211, ITSMECOM-5804475'), { tickets: ['SISUPAC-9211', 'ITSMECOM-5804475'], bad: [] });
  assert.deepEqual(parseTickets('TEC: MOCA'), { tickets: [], bad: ['MOCA'] });
  assert.deepEqual(parseTickets('INC000027778368'), { tickets: ['INC000027778368'], bad: [] });
  assert.deepEqual(parseTickets('INC00002777'), { tickets: [], bad: ['INC00002777'] });
});

test('el ticket al que se une: vacío, válido, limpiado, mal escrito y varios', () => {
  assert.deepEqual(ticketCheck(''), { state: 'empty' });
  assert.deepEqual(ticketCheck('SISUPAC-9211'), { state: 'ok', value: 'SISUPAC-9211', changed: false });
  assert.deepEqual(ticketCheck('ITD: SISUPAC-9211'), { state: 'ok', value: 'SISUPAC-9211', changed: true });
  assert.equal(ticketCheck('TEC: MOCA').state, 'bad');
  assert.equal(ticketCheck('SISUPAC-1, WOSPAC-2').state, 'many');
});

test('la prioridad del Jira y el asunto del chat de N3', () => {
  assert.deepEqual(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(jiraPriority), ['CRITICAL', 'HIGH', 'MEDIUM', 'MEDIUM']);
  assert.equal(n3Subject({ id: 'INC000027698079', center: '100497' }, dest('sisupac')), 'N3 - "SISUPAC" - INC000027698079 - 100497');
});

test('escalar: solo bloquea no saber a quién', () => {
  const r = (v) => readEscalate({ mode: 'escalate', ...v }, DESTINATIONS);
  assert.deepEqual(r({}), { missing: 'a qué equipo se escala' });
  assert.deepEqual(r({ dest: 'other' }), { missing: 'el nombre del equipo o proveedor' });
  assert.ok(r({ dest: 'sisupac' }).values);
  assert.ok(r({ dest: 'operaciones' }).values);
});

test('escalar: lo que se registra, sin ticket de proveedor, y la prioridad del Jira solo si abre un Jira', () => {
  const r = (v) => readEscalate({ mode: 'escalate', ...v }, DESTINATIONS);
  assert.deepEqual(r({ dest: 'sisupac', reason: 'Timeouts', jiraPriority: 'CRITICAL', ticket: 'SISUPAC-1' }).values,
    { mode: 'escalate', dest: 'sisupac', destName: 'SISUPAC · N3 SISU', reason: 'Timeouts', sent: '', todo: [], jiraPriority: 'CRITICAL' });
  assert.equal('jiraPriority' in r({ dest: 'as400', reason: 'x', sent: 'Correo de las 10:12', jiraPriority: 'HIGH' }).values, false);
  assert.equal(r({ dest: 'other', destOther: 'Equipo X', reason: 'x', sent: 'Teams' }).values.destName, 'Equipo X');
});

test('lo recomendable que falta: el análisis siempre; la evidencia, solo si no queda rastro en una herramienta', () => {
  assert.deepEqual(escalateTodo({}, dest('sisupac')), ['el análisis previo']);
  assert.deepEqual(escalateTodo({}, dest('operaciones')), ['el análisis previo', 'la evidencia del escalado']);
  assert.deepEqual(escalateTodo({ reason: 'x' }, null), ['la evidencia del escalado']);
  assert.deepEqual(escalateTodo({ reason: 'x', sent: 'Correo' }, dest('as400')), []);
});

test('unir: a uno de la lista o a otro, siempre con un ticket válido', () => {
  const r = (v) => readEscalate({ mode: 'link', ...v }, DESTINATIONS);
  assert.deepEqual(r({}), { missing: 'el ticket al que vincular' });
  assert.deepEqual(r({ linked: 'SISUPAC-9211' }).values, { mode: 'link', ticket: 'SISUPAC-9211', why: '' });
  assert.match(r({ linked: 'other', linkedOther: 'MOCA' }).missing, /ticket válido/);
  assert.equal(r({ linked: 'other', linkedOther: 'ITD: ERA-4170' }).values.ticket, 'ERA-4170');
});

test('el borrador de Escalar: por issue, hasta que se escala o se une', () => {
  const d = createEscalateDrafts();
  assert.equal(d.get('INC1'), null);
  d.save('INC1', { dest: 'sisupac' });
  assert.deepEqual(d.get('INC1'), { dest: 'sisupac' });
  assert.equal(d.get('INC2'), null);
  d.save('INC1', { dest: 'returns' });
  assert.equal(d.get('INC1').dest, 'returns');
  d.drop('INC1');
  assert.equal(d.get('INC1'), null);
});
