import test from 'node:test';
import assert from 'node:assert/strict';
import { transferForm, readTransfer, transferNote, TRANSFER_MODES } from './transfer.js';
import { TEAMS } from './transfer-mock.js';

const teams = [
  { id: 'ays-sga', name: 'AYS SOPORTE · SGA', group: 'Soporte' },
  { id: 'teleco', name: 'Teleco <red>', group: 'Otros equipos' },
];

test('dos opciones: a un compañero o a otro equipo', () => {
  assert.deepEqual(Object.keys(TRANSFER_MODES), ['person', 'team']);
  assert.deepEqual(Object.values(TRANSFER_MODES).map((m) => m.label), ['A un compañero', 'A otro equipo']);
});

test('la ventana se abre en «A un compañero»: su selector a la vista y el de equipo oculto', () => {
  const html = transferForm('INC1', { people: [{ id: 'u1', name: 'Ana <x>' }], teams });
  assert.match(html, /<h3>Traspasar la issue<\/h3><span>INC1<\/span>/);
  assert.match(html, /<input type="hidden" name="mode" value="person">/);
  assert.match(html, /data-transfer-mode="person" aria-selected="true"/);
  assert.match(html, /data-transfer-mode="team" aria-selected="false"/);
  assert.match(html, /data-transfer-pane="person">/);
  assert.match(html, /data-transfer-pane="team" hidden>/);
  assert.match(html, /<li role="option" data-pick-opt="u1" aria-selected="false">Ana &lt;x&gt;<\/li>/);
  assert.match(html, /type="submit"[^>]*disabled/, 'el botón empieza apagado');
});

test('abierta en «A otro equipo»: los equipos agrupados, escapados', () => {
  const html = transferForm('INC1', { teams, mode: 'team' });
  assert.match(html, /name="mode" value="team"/);
  assert.match(html, /data-transfer-pane="person" hidden>/);
  assert.match(html, /<li role="presentation" class="pick-group">Soporte<\/li><li role="option" data-pick-opt="ays-sga"/);
  assert.match(html, /class="pick-group">Otros equipos<\/li><li role="option" data-pick-opt="teleco" aria-selected="false">Teleco &lt;red&gt;/);
  assert.match(html, /Elige el equipo/);
});

test('sin compañeros que conozcan su origen: el selector apagado dice por qué', () => {
  assert.match(transferForm('INC1', { empty: 'Nadie más tiene el conocimiento de SISU' }), /data-pick-btn[^>]*disabled[^>]*>.*Nadie más tiene el conocimiento de SISU/);
  assert.match(transferForm('INC1'), /data-pick-btn[^>]*disabled[^>]*>.*No hay más personas en Issues/);
});

test('se queda en SIA o va como nota: la ventana no lleva el aviso de Remedy', () => {
  assert.doesNotMatch(transferForm('INC1', { teams }), /Aún no se envía a Remedy/);
});

test('a un compañero: hacen falta él y el motivo', () => {
  assert.deepEqual(readTransfer({ mode: 'person', to: '', comment: 'x' }), { missing: 'Compañero' });
  assert.deepEqual(readTransfer({ mode: 'person', to: 'u1', comment: '  ' }), { missing: 'Motivo' });
  assert.deepEqual(readTransfer({ mode: 'person', to: 'u1', comment: ' Lleva dos llamadas. ' }), { values: { mode: 'person', to: 'u1', comment: 'Lleva dos llamadas.' } });
  assert.deepEqual(readTransfer({ to: 'u1', comment: 'x' }).values.mode, 'person', 'sin opción, a un compañero');
});

test('a otro equipo: uno de la lista y el motivo; lo elegido para el compañero no cuenta', () => {
  assert.deepEqual(readTransfer({ mode: 'team', to: 'u1', team: '', comment: 'x' }, teams), { missing: 'Equipo' });
  assert.deepEqual(readTransfer({ mode: 'team', team: 'nope', comment: 'x' }, teams), { missing: 'Equipo' });
  assert.deepEqual(readTransfer({ mode: 'team', team: 'teleco', comment: '' }, teams), { missing: 'Motivo' });
  assert.deepEqual(readTransfer({ mode: 'team', team: 'teleco', comment: ' Red del centro caída. ' }, teams),
    { values: { mode: 'team', team: 'teleco', teamName: 'Teleco <red>', comment: 'Red del centro caída.' } });
});

test('la nota del traspaso a otro equipo', () => {
  assert.equal(transferNote({ teamName: 'Telecomunicaciones', comment: 'Los ISP fallan desde las 11:00.' }), 'Traspasada a Telecomunicaciones: Los ISP fallan desde las 11:00.');
});

test('los equipos de prueba: ids únicos, cada uno con su nombre y su grupo', () => {
  assert.equal(new Set(TEAMS.map((t) => t.id)).size, TEAMS.length);
  assert.ok(TEAMS.every((t) => t.name && t.group));
});
