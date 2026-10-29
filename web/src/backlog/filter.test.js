import test from 'node:test';
import assert from 'node:assert/strict';
import { filterIssues, summary, EMPTY_FILTER } from './filter.js';

const I = [
  { id: 'INC1', center: '000123', text: 'Impresora de etiquetas', priority: 'CRITICAL', sisu: true, prio: true, reported: '2026-10-20 09:00' },
  { id: 'INC2', center: '000456', text: 'Acceso a HHT', priority: 'HIGH', sisu: false, prio: false, reported: '2026-10-12 17:30' },
  { id: 'INC3', center: '000123', text: 'Pedido sin confirmar', priority: 'LOW', sisu: false, prio: false, reported: '2026-10-25 08:00' },
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

test('resumen de la cola: total y por origen, reparto por criticidad y la más antigua', () => {
  const s = summary(I);
  assert.deepEqual({ total: s.total, urgent: s.urgent, prio: s.prio }, { total: 3, urgent: 2, prio: 1 });
  assert.deepEqual(s.sisu, { total: 1, urgent: 1, prio: 1 });
  assert.deepEqual(s.sga, { total: 2, urgent: 1, prio: 0 });
  assert.deepEqual(s.bySeverity, { CRITICAL: 1, HIGH: 1, MEDIUM: 0, LOW: 1 });
  assert.equal(s.oldest.id, 'INC2');
});

test('resumen de una cola vacía', () => {
  const s = summary([]);
  assert.deepEqual({ total: s.total, sisu: s.sisu, oldest: s.oldest }, { total: 0, sisu: { total: 0, urgent: 0, prio: 0 }, oldest: null });
});
