import test from 'node:test';
import assert from 'node:assert/strict';
import { queue, isFree, BASIC_RULE, CRITERIA } from './queue.js';

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
  assert.equal(BASIC_RULE.id, 'basic');
  assert.deepEqual(queue([issue('a')], new Set(), NOW, ['otra']), ['a']);
});

test('cada criterio del catálogo ordena lo suyo; a igualdad, la más antigua', () => {
  const by = (criteria, list) => queue(list, new Set(), NOW, criteria);
  const oct = (id, o) => issue(id, { reported: '2026-10-03 10:00', ...o }), sep = (id, o) => issue(id, { reported: '2026-09-20 10:00', ...o }), old = (id, o) => issue(id, { reported: '2026-07-01 10:00', ...o });
  assert.deepEqual(by(['recent'], [old('viejo'), oct('oct'), sep('sep')]), ['sep', 'oct', 'viejo']);
  assert.deepEqual(by(['prio'], [issue('a'), issue('b', { prio: true })]), ['b', 'a']);
  assert.deepEqual(by(['month'], [old('viejo'), oct('oct'), sep('sep')]), ['oct', 'sep', 'viejo']);
  assert.deepEqual(by(['severity'], [issue('baja', { priority: 'LOW' }), issue('crit', { priority: 'CRITICAL' }), issue('alta', { priority: 'HIGH' })]), ['crit', 'alta', 'baja']);
  assert.deepEqual(by(['critical'], [issue('alta', { priority: 'HIGH' }), issue('crit', { priority: 'CRITICAL' })]), ['crit', 'alta']);
  assert.deepEqual(by(['high'], [issue('crit', { priority: 'CRITICAL' }), issue('alta', { priority: 'HIGH' })]), ['alta', 'crit']);
  assert.deepEqual(by(['medium'], [issue('crit', { priority: 'CRITICAL' }), issue('media', { priority: 'MEDIUM' })]), ['media', 'crit']);
  assert.deepEqual(by(['low'], [issue('crit', { priority: 'CRITICAL' }), issue('baja', { priority: 'LOW' })]), ['baja', 'crit']);
  assert.deepEqual(by(['age'], [oct('oct'), sep('sep')]), ['sep', 'oct']);
  assert.deepEqual(by(['sisu'], [issue('sga'), issue('sisu', { sisu: true })]), ['sisu', 'sga']);
  assert.deepEqual(by(['sga'], [issue('sisu', { sisu: true }), issue('sga')]), ['sga', 'sisu']);
  // sin criterio que los separe, la más antigua primero; un criterio desconocido no cuenta
  assert.deepEqual(by(['nope'], [oct('oct'), sep('sep')]), ['sep', 'oct']);
});

test('la regla básica, expresada con el catálogo, da el orden del equipo', () => {
  assert.deepEqual(BASIC_RULE.criteria, ['recent', 'prio', 'month', 'severity', 'age']);
  assert.deepEqual(CRITERIA.map((c) => c.id), ['recent', 'prio', 'month', 'severity', 'critical', 'high', 'medium', 'low', 'age', 'sisu', 'sga']);
});
