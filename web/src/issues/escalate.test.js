import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTickets, ticketCheck, jiraPriority, n3Subject, stepMissing, stepWarning, resumeStep, channelOf, targetOf } from './escalate.js';
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

const missing = (n, v) => stepMissing(n, { mode: 'escalate', ...v }, DESTINATIONS);

test('paso 1: sin destino no se sigue (TC-09); fuera del mapa, con su nombre', () => {
  assert.deepEqual(missing(1, {}), { field: 'dest', text: 'Elige el equipo para seguir' });
  assert.deepEqual(missing(1, { dest: 'other' }), { field: 'destOther', text: 'Escribe el equipo para seguir' });
  assert.equal(missing(1, { dest: 'other', destOther: 'Equipo X' }), null);
  assert.equal(missing(1, { dest: 'sisupac' }), null);
});

test('paso 1 al unir: a uno de la lista o a otro, siempre un ticket válido (TC-02)', () => {
  assert.deepEqual(missing(1, { mode: 'link' }), { field: 'linked', text: 'Elige el ticket para seguir' });
  assert.equal(missing(1, { mode: 'link', linked: 'SISUPAC-9211' }), null);
  assert.deepEqual(missing(1, { mode: 'link', linked: 'other', linkedOther: 'MOCA' }), { field: 'linkedOther', text: 'Escribe un ticket válido para seguir' });
  assert.equal(missing(1, { mode: 'link', linked: 'other', linkedOther: 'ITD: ERA-4170' }), null);
  assert.equal(targetOf({ mode: 'link', linked: 'other', linkedOther: 'ITD: ERA-4170' }, DESTINATIONS), 'ERA-4170');
});

test('pasos 2 y 3: qué pasa siempre; la evidencia, solo si el destino no deja rastro en una herramienta (TC-10)', () => {
  assert.equal(missing(2, {}).field, 'reason');
  assert.equal(missing(2, { reason: 'Timeouts' }), null);
  assert.equal(missing(3, { dest: 'sisupac' }), null);
  assert.equal(missing(3, { dest: 'maestros' }), null);   // IOP abre su incidencia de Remedy
  for (const d of ['operaciones', 'as400', 'other']) assert.equal(missing(3, { dest: d }).field, 'sent');
  assert.equal(missing(3, { dest: 'operaciones', sent: 'Correo de las 10:12' }), null);
  assert.equal(missing(4, {}), null);
});

test('el borrador se retoma en su paso si los de antes siguen completos (TC-04); al unir, en el 1', () => {
  assert.equal(resumeStep(null, DESTINATIONS), 1);
  assert.equal(resumeStep({ mode: 'escalate', dest: 'sisupac', reason: 'x', step: '3' }, DESTINATIONS), 3);
  assert.equal(resumeStep({ mode: 'escalate', dest: 'sisupac', reason: '', step: 4 }, DESTINATIONS), 2);
  assert.equal(resumeStep({ mode: 'link', linked: 'SISUPAC-9211', step: 3 }, DESTINATIONS), 1);
});

test('avisos que se pueden pasar por alto: se sigue, pero avisando, como en Resolver', () => {
  const warn = (n, v, o = {}) => stepWarning(n, { mode: 'escalate', ...v }, { dests: DESTINATIONS, issue: { priority: 'MEDIUM' }, background: { text: 'Hay un Jira abierto: sisupac-9211, mismo síntoma.' }, ...o });
  // unir: los antecedentes tienen que nombrar el ticket (da igual mayúsculas o prefijos)
  assert.equal(warn(1, { mode: 'link', linked: 'SISUPAC-9211' }), null);
  assert.match(warn(1, { mode: 'link', linked: 'other', linkedOther: 'ITD: ERA-4170' }).text, /no aparece ERA-4170/);
  assert.equal(warn(1, { mode: 'link', linked: 'SISUPAC-9211' }, { background: null }).ok, 'Unir igualmente');
  assert.equal(warn(1, { dest: 'sisupac' }), null);   // escalar: el paso 1 no avisa
  // qué pasa, muy breve
  assert.equal(warn(2, { reason: 'Va lento' }).title, 'La descripción es muy breve');
  assert.equal(warn(2, { reason: 'x'.repeat(80) }), null);
  // la prioridad del Jira que no toca (la auditoría resta −1)
  assert.match(warn(3, { dest: 'sisupac', jiraPriority: 'BLOCKER' }).text, /le toca «Importante» y has elegido «Bloqueo»/);
  assert.equal(warn(3, { dest: 'sisupac', jiraPriority: 'MEDIUM' }), null);
  assert.equal(warn(3, { dest: 'maestros', jiraPriority: 'BLOCKER' }), null);   // no abre Jira: no cuenta
  // la evidencia, muy breve, cuando es la única prueba
  assert.equal(warn(3, { dest: 'operaciones', sent: 'Correo' }).title, 'La evidencia es muy breve');
  assert.equal(warn(3, { dest: 'operaciones', sent: 'Correo a operaciones@ a las 10:12 con los logs del proceso y la captura del error de la mesa 3.' }), null);
});

test('por dónde va cada destino, en una línea', () => {
  assert.equal(channelOf(dest('sisupac')), 'Por SIGLO · abre un Jira de SISUPAC');
  assert.equal(channelOf(dest('maestros')), 'Por IOP · abre una incidencia de Remedy');
  assert.equal(channelOf(dest('operaciones')), 'Por correo · sin ticket');
  assert.equal(channelOf(null), 'Fuera del mapa · sin ticket');
});
