import test from 'node:test';
import assert from 'node:assert/strict';
import { filterIssues, toggle, tileCounts, isFiltering, EMPTY_FILTER } from './filter.js';

const I = [
  { id: 'INC1', center: '000123', text: 'Impresora de etiquetas', priority: 'CRITICAL', sisu: true, prio: true },
  { id: 'INC2', center: '000456', text: 'Acceso a HHT', priority: 'HIGH', sisu: false, prio: false },
  { id: 'INC3', center: '000123', text: 'Pedido sin confirmar', priority: 'LOW', sisu: false, prio: false },
];
const F = (over) => ({ ...EMPTY_FILTER, ...over });

test('sin filtro, todas, numeradas por su puesto en la cola', () => {
  assert.deepEqual(filterIssues(I).map((i) => [i.id, i.rank]), [['INC1', 1], ['INC2', 2], ['INC3', 3]]);
  assert.equal(isFiltering(EMPTY_FILTER), false);
});

test('filtrar no cambia el puesto; dentro de un grupo se suman y entre grupos se cruzan', () => {
  assert.deepEqual(filterIssues(I, F({ severity: ['LOW'] })).map((i) => [i.id, i.rank]), [['INC3', 3]]);
  assert.deepEqual(filterIssues(I, F({ severity: ['CRITICAL', 'HIGH'] })).map((i) => i.id), ['INC1', 'INC2']);
  assert.deepEqual(filterIssues(I, F({ origin: ['sga'] })).map((i) => i.id), ['INC2', 'INC3']);
  assert.deepEqual(filterIssues(I, F({ origin: ['sga'], severity: ['HIGH'] })).map((i) => i.id), ['INC2']);
  assert.deepEqual(filterIssues(I, F({ origin: ['sga'], prio: true })), []);
  assert.deepEqual(filterIssues(I, F({ origin: ['sisu', 'sga'] })).length, 3);
});

test('pulsar una tarjeta la marca; otra vez, la quita; otra del grupo se suma', () => {
  const f1 = toggle(EMPTY_FILTER, 'severity', 'CRITICAL');
  assert.deepEqual(f1.severity, ['CRITICAL']);
  assert.deepEqual(toggle(f1, 'severity', 'HIGH').severity, ['CRITICAL', 'HIGH']);
  assert.deepEqual(toggle(f1, 'severity', 'CRITICAL').severity, []);
  assert.equal(toggle(f1, 'prio').prio, true);
  assert.equal(toggle(toggle(f1, 'prio'), 'prio').prio, false);
  assert.equal(isFiltering(f1), true);
});

test('cada tarjeta dice cuántas son lo suyo, con lo marcado en los otros grupos', () => {
  assert.deepEqual(tileCounts(I, EMPTY_FILTER), { total: 3, shown: 3, sisu: 1, sga: 2, prio: 1, severity: { CRITICAL: 1, HIGH: 1, MEDIUM: 0, LOW: 1 } });
  const sga = tileCounts(I, F({ origin: ['sga'], severity: ['LOW'] }));
  assert.deepEqual([sga.shown, sga.sisu, sga.sga, sga.prio, sga.severity.HIGH], [1, 0, 1, 0, 1]);
});
