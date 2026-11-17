import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTickets, ticketCheck, jiraPriority, n3Subject, stepMissing, stepWarning, resumeStep, targetOf, minimumsOf, checkedMins, resultTicket, STEPS, FEED, nextOf, prevOf, titleOf, feedComment } from './escalate.js';
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

const ISSUE = { id: 'INC000027698079', priority: 'MEDIUM', center: '100497' };
const CTX = { dests: DESTINATIONS, issue: ISSUE };
const missing = (n, v) => stepMissing(n, { mode: 'escalate', ...v }, CTX);

test('dos flujos con el mismo aspecto: actualizar el escalado, o uno nuevo hasta el resumen', () => {
  assert.deepEqual(STEPS.map((s) => s.title), ['Recurrencia', 'A quién', 'Motivo', 'Requisitos', 'Resumen', 'Actualizar escalado']);
  assert.deepEqual([nextOf('link', 1), nextOf('link', FEED), prevOf('link', FEED)], [FEED, null, 1]);
  assert.deepEqual([nextOf('escalate', 1), nextOf('escalate', 4), nextOf('escalate', 5), prevOf('escalate', 2)], [2, 5, null, 1]);
  assert.equal(titleOf(FEED), 'Actualizar escalado');
});

test('actualizar escalado: el comentario empieza con lo nuevo de la incidencia y no se une sin él', () => {
  const check = { notes: [{ key: 'initial', note: { text: 'No lee' } }, { key: 'analysis', note: { text: 'Timeouts' } }] };
  assert.equal(feedComment({ id: 'INC1', center: '100497' }, check), 'Nueva incidencia relacionada: INC1 (centro 100497).\n\nSituación inicial: No lee\n\nAnálisis: Timeouts');
  assert.equal(feedComment({ id: 'INC1' }, { notes: [] }), 'Nueva incidencia relacionada: INC1.');
  assert.deepEqual(missing(FEED, { mode: 'link', comment: ' ' }), { field: 'comment', text: 'Escribe el comentario para seguir' });
  assert.equal(missing(FEED, { mode: 'link', comment: 'x' }), null);
});

test('paso 1: sin ticket se sigue a escalar; al unir, un ticket válido (TC-02)', () => {
  assert.equal(missing(1, {}), null);   // «Ninguno: escalar»
  assert.deepEqual(missing(1, { mode: 'link' }), { field: 'linked', text: 'Elige el ticket para seguir' });
  assert.equal(missing(1, { mode: 'link', linked: 'SISUPAC-9211' }), null);
  assert.deepEqual(missing(1, { mode: 'link', linked: 'other', linkedOther: 'MOCA' }), { field: 'linkedOther', text: 'Escribe un ticket válido para seguir' });
  assert.equal(missing(1, { mode: 'link', linked: 'other', linkedOther: 'ITD: ERA-4170' }), null);
  assert.equal(targetOf({ mode: 'link', linked: 'other', linkedOther: 'ITD: ERA-4170' }, DESTINATIONS), 'ERA-4170');
});

test('paso 2: sin destino no se sigue (TC-09); fuera del mapa, con su nombre', () => {
  assert.deepEqual(missing(2, {}), { field: 'dest', text: 'Elige el equipo para seguir' });
  assert.deepEqual(missing(2, { dest: 'other' }), { field: 'destOther', text: 'Escribe el equipo para seguir' });
  assert.equal(missing(2, { dest: 'other', destOther: 'Equipo X' }), null);
  assert.equal(missing(2, { dest: 'sisupac' }), null);
});

test('paso 3: el motivo, siempre', () => {
  assert.equal(missing(3, {}).field, 'reason');
  assert.equal(missing(3, { reason: 'Timeouts' }), null);
});

test('paso 4: lo mínimo del destino bloquea, salvo lo que es «si aplica»; la evidencia, si no queda rastro (TC-10)', () => {
  assert.deepEqual(minimumsOf(ISSUE, dest('sisupac')).map((m) => [m.key, m.required]), [['form', true], ['chat', false], ['logs', true]]);
  assert.deepEqual(minimumsOf(ISSUE, dest('sisupac')).map((m) => m.title), ['Formulario de SIGLO', 'Chat N3', 'Logs']);
  assert.equal(minimumsOf(ISSUE, dest('sisupac'))[1].subject, 'N3 - "SISUPAC" - INC000027698079 - 100497');   // el asunto, para copiarlo
  assert.deepEqual(minimumsOf(ISSUE, dest('returns')), []);   // solo N3 de desarrollo, de momento
  assert.deepEqual(checkedMins({ mins: 'form,logs' }), ['form', 'logs']);
  assert.deepEqual(checkedMins({}), []);
  assert.deepEqual(missing(4, { dest: 'sisupac' }), { field: 'mins', text: 'Confirma lo mínimo para seguir' });
  assert.deepEqual(missing(4, { dest: 'sisupac', mins: 'form' }), { field: 'mins', text: 'Confirma lo mínimo para seguir' });
  assert.equal(missing(4, { dest: 'sisupac', mins: 'form,logs' }), null);   // sin el chat: no hubo llamada
  assert.equal(missing(4, { dest: 'maestros' }), null);   // IOP abre su incidencia de Remedy
  for (const d of ['operaciones', 'as400', 'other']) assert.equal(missing(4, { dest: d }).field, 'sent');
  assert.equal(missing(4, { dest: 'operaciones', sent: 'Correo de las 10:12' }), null);
  assert.equal(missing(5, {}), null);
});

test('el borrador se retoma en su paso si los de antes siguen completos (TC-04); al unir, en el 1', () => {
  assert.equal(resumeStep(null, CTX), 1);
  assert.equal(resumeStep({ mode: 'escalate', dest: 'sisupac', reason: 'x', step: '4' }, CTX), 4);
  assert.equal(resumeStep({ mode: 'escalate', dest: 'sisupac', reason: 'x', step: 5 }, CTX), 4);   // falta lo mínimo
  assert.equal(resumeStep({ mode: 'escalate', dest: 'sisupac', reason: '', step: 5 }, CTX), 3);
  assert.equal(resumeStep({ mode: 'link', linked: 'SISUPAC-9211', step: 3 }, CTX), 1);
  assert.equal(resumeStep({ mode: 'link', linked: 'SISUPAC-9211', step: 6 }, CTX), 6);   // nutriendo: vuelve al comentario
  assert.equal(resumeStep({ mode: 'link', linked: 'other', linkedOther: 'MOCA', step: 6 }, CTX), 1);
});

test('avisos que se pueden pasar por alto: se sigue, pero avisando, como en Resolver', () => {
  const warn = (n, v, o = {}) => stepWarning(n, { mode: 'escalate', ...v }, { ...CTX, recurrence: { tickets: ['SISUPAC-9211'] }, ...o });
  // unir: la recurrencia en Jira tiene que haberlo encontrado (da igual mayúsculas o prefijos)
  assert.equal(warn(1, { mode: 'link', linked: 'other', linkedOther: 'itd: sisupac-9211' }), null);
  assert.match(warn(1, { mode: 'link', linked: 'other', linkedOther: 'ITD: ERA-4170' }).text, /^ERA-4170 no aparece en la recurrencia/);
  assert.equal(warn(1, { mode: 'link', linked: 'SISUPAC-9211' }, { recurrence: null }).ok, 'Unir igualmente');
  assert.equal(warn(1, {}), null);   // seguir sin ticket no avisa
  // el motivo, muy breve
  assert.equal(warn(3, { reason: 'Va lento' }).title, 'Motivo muy breve');
  assert.equal(warn(3, { reason: 'x'.repeat(80) }), null);
  // la prioridad del Jira que no toca (la auditoría resta −1)
  assert.match(warn(4, { dest: 'sisupac', jiraPriority: 'BLOCKER' }).text, /le toca «Importante»; has elegido «Bloqueo»/);
  assert.equal(warn(4, { dest: 'sisupac', jiraPriority: 'MEDIUM' }), null);
  assert.equal(warn(4, { dest: 'maestros', jiraPriority: 'BLOCKER' }), null);   // no abre Jira: no cuenta
  // la evidencia, muy breve, cuando es la única prueba
  assert.equal(warn(4, { dest: 'operaciones', sent: 'Correo' }).title, 'Evidencia muy breve');
  assert.equal(warn(4, { dest: 'operaciones', sent: 'Correo a operaciones@ a las 10:12 con los logs del proceso y la captura del error de la mesa 3.' }), null);
});

test('el ticket que queda al acabar: el elegido al unir; al escalar, de ejemplo hasta conectar Jira', () => {
  assert.deepEqual(resultTicket({ mode: 'link', linked: 'other', linkedOther: 'itd: era-4170' }, DESTINATIONS), { ticket: 'ERA-4170', sample: false });
  assert.deepEqual(resultTicket({ mode: 'escalate', dest: 'sisupac' }, DESTINATIONS), { ticket: 'SISUPAC-0000', sample: true });
  assert.deepEqual(resultTicket({ mode: 'escalate', dest: 'maestros' }, DESTINATIONS), { ticket: 'INC000000000000', sample: true });
  assert.equal(resultTicket({ mode: 'escalate', dest: 'operaciones' }, DESTINATIONS), null);   // por correo: sin ticket
  assert.equal(resultTicket({ mode: 'escalate', dest: 'other', destOther: 'X' }, DESTINATIONS), null);
});
