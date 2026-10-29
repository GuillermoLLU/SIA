import test from 'node:test';
import assert from 'node:assert/strict';
import { filterIssues, summary, EMPTY_FILTER } from './filter.js';

const I = [
  { id: 'INC1', center: '000123', text: 'Impresora de etiquetas', priority: 'CRITICAL', sisu: true, prio: true },
  { id: 'INC2', center: '000456', text: 'Acceso a HHT', priority: 'HIGH', sisu: false, prio: false },
  { id: 'INC3', center: '000123', text: 'Pedido sin confirmar', priority: 'LOW', sisu: false, prio: false },
];

test('sin filtro, todas, numeradas por su puesto en la cola', () => {
  assert.deepEqual(filterIssues(I).map((i) => i.rank), [1, 2, 3]);
  assert.deepEqual(filterIssues(I, EMPTY_FILTER).map((i) => i.id), ['INC1', 'INC2', 'INC3']);
});

test('filtrar no cambia el puesto', () => {
  assert.deepEqual(filterIssues(I, { ...EMPTY_FILTER, severity: 'LOW' }).map((i) => [i.id, i.rank]), [['INC3', 3]]);
});

test('texto: por código, centro o resumen, sin acentos ni mayúsculas', () => {
  assert.deepEqual(filterIssues(I, { ...EMPTY_FILTER, q: 'inc2' }).map((i) => i.id), ['INC2']);
  assert.deepEqual(filterIssues(I, { ...EMPTY_FILTER, q: ' 000123 ' }).map((i) => i.id), ['INC1', 'INC3']);
  assert.deepEqual(filterIssues(I, { ...EMPTY_FILTER, q: 'ETIQUÉTAS' }).map((i) => i.id), ['INC1']);
});

test('origen y criticidad se combinan', () => {
  assert.deepEqual(filterIssues(I, { ...EMPTY_FILTER, origin: 'sga' }).map((i) => i.id), ['INC2', 'INC3']);
  assert.deepEqual(filterIssues(I, { q: '', origin: 'sga', severity: 'HIGH' }).map((i) => i.id), ['INC2']);
  assert.deepEqual(filterIssues(I, { q: '', origin: 'sisu', severity: 'HIGH' }), []);
});

test('resumen de la cola', () => {
  assert.deepEqual(summary(I), { total: 3, sisu: 1, sga: 2, urgent: 2, prio: 1 });
  assert.deepEqual(summary([]), { total: 0, sisu: 0, sga: 0, urgent: 0, prio: 0 });
});
