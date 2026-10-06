import test from 'node:test';
import assert from 'node:assert/strict';
import { queue, isFree, RULES } from './queue.js';

const NOW = new Date('2026-10-04T11:44:00');
const issue = (id, o = {}) => ({ id, priority: 'MEDIUM', status: 'ASSIGNED', assignee: '', prio: false, reported: '2026-10-02 10:00', ...o });

test('libres: asignadas al grupo, sin responsable y sin coger en SIA', () => {
  assert.equal(isFree(issue('a'), new Set()), true);
  assert.equal(isFree(issue('a', { assignee: 'X' }), new Set()), false);
  assert.equal(isFree(issue('a', { status: 'PENDING' }), new Set()), false);
  assert.equal(isFree(issue('a'), new Set(['a'])), false);
});

test('regla básica: PRIO del mes, PRIO del anterior, mes por criticidad, anterior por criticidad, más atrás', () => {
  const list = [
    issue('atras-critica', { priority: 'CRITICAL', reported: '2026-07-01 00:00' }),
    issue('sep-critica', { priority: 'CRITICAL', reported: '2026-09-20 00:00' }),
    issue('oct-baja', { priority: 'LOW' }),
    issue('oct-critica', { priority: 'CRITICAL' }),
    issue('sep-prio', { prio: true, priority: 'LOW', reported: '2026-09-05 00:00' }),
    issue('oct-prio', { prio: true, priority: 'LOW' }),
    issue('atras-prio', { prio: true, reported: '2026-06-01 00:00' }),
  ];
  assert.deepEqual(queue(list, new Set(), NOW), ['oct-prio', 'sep-prio', 'oct-critica', 'oct-baja', 'sep-critica', 'atras-prio', 'atras-critica']);
});

test('a igualdad, la más antigua; y fuera las cogidas', () => {
  const list = [issue('nueva', { reported: '2026-10-03 00:00' }), issue('vieja', { reported: '2026-10-01 00:00' }), issue('cogida')];
  assert.deepEqual(queue(list, new Set(['cogida']), NOW), ['vieja', 'nueva']);
});

test('mes anterior también al cambiar de año', () => {
  const list = [issue('dic', { reported: '2025-12-10 00:00', prio: true }), issue('nov', { reported: '2025-11-10 00:00', prio: true })];
  assert.deepEqual(queue(list, new Set(), new Date('2026-01-05T09:00:00')), ['dic', 'nov']);
});

test('regla desconocida: la básica', () => {
  assert.equal(RULES[0].id, 'basic');
  assert.deepEqual(queue([issue('a')], new Set(), NOW, 'otra'), ['a']);
});
