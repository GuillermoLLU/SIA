import test from 'node:test';
import assert from 'node:assert/strict';
import { filterIssues, toggle, tileCounts, EMPTY_FILTER } from './filter.js';

const I = [
  { id: 'INC1', center: '000123', text: 'Impresora de etiquetas', priority: 'CRITICAL', sisu: true, prio: true },
  { id: 'INC2', center: '000456', text: 'Acceso a HHT', priority: 'HIGH', sisu: false, prio: false },
  { id: 'INC3', center: '000123', text: 'Pedido sin confirmar', priority: 'LOW', sisu: false, prio: false },
];

test('sin filtro, todas, numeradas por su puesto en la cola', () => {
  assert.deepEqual(filterIssues(I).map((i) => [i.id, i.rank]), [['INC1', 1], ['INC2', 2], ['INC3', 3]]);
});

test('filtrar no cambia el puesto; origen, criticidad y priorizada se combinan', () => {
  assert.deepEqual(filterIssues(I, { ...EMPTY_FILTER, severity: 'LOW' }).map((i) => [i.id, i.rank]), [['INC3', 3]]);
  assert.deepEqual(filterIssues(I, { ...EMPTY_FILTER, origin: 'sga' }).map((i) => i.id), ['INC2', 'INC3']);
  assert.deepEqual(filterIssues(I, { origin: 'sga', severity: 'HIGH', prio: false }).map((i) => i.id), ['INC2']);
  assert.deepEqual(filterIssues(I, { origin: 'sga', severity: 'all', prio: true }), []);
});

test('pulsar una tarjeta la pone; otra vez, la quita; otra del grupo la sustituye', () => {
  const f1 = toggle(EMPTY_FILTER, 'origin', 'sisu');
  assert.equal(f1.origin, 'sisu');
  assert.equal(toggle(f1, 'origin', 'sisu').origin, 'all');
  assert.equal(toggle(f1, 'origin', 'sga').origin, 'sga');
  assert.equal(toggle(f1, 'prio', true).prio, true);
  assert.equal(toggle(toggle(f1, 'prio', true), 'prio', true).prio, false);
});

test('cada tarjeta dice cuántas quedarían al pulsarla, con lo ya pulsado', () => {
  assert.deepEqual(tileCounts(I, EMPTY_FILTER), { total: 3, shown: 3, sisu: 1, sga: 2, prio: 1, severity: { CRITICAL: 1, HIGH: 1, MEDIUM: 0, LOW: 1 } });
  const sga = tileCounts(I, { ...EMPTY_FILTER, origin: 'sga' });
  assert.deepEqual([sga.shown, sga.sisu, sga.prio, sga.severity.CRITICAL, sga.severity.HIGH], [2, 1, 0, 0, 1]);
});
