import test from 'node:test';
import assert from 'node:assert/strict';
import { firstTouch, columns, matches, previousMonths, byCenter, summary, duration, monthOf } from './board.js';

const NOW = new Date('2026-10-04T11:44:00');
const issue = (o) => ({ id: 'INC', center: '', text: '', priority: 'MEDIUM', status: 'ASSIGNED', assignee: '', sisu: false, prio: false,
  reported: '2026-10-04 11:00', modified: '2026-10-04 11:00', resolved: '', ...o });
const col = (key) => columns(NOW).find((c) => c.key === key);
const order = (key, list) => list.filter(col(key).test).sort(col(key).sort).map((i) => i.id);
const fold = (s) => s.toLowerCase();

test('primera gestión: crítica 15 min, alta 2 h; solo sin asignar', () => {
  assert.equal(firstTouch(issue({ priority: 'CRITICAL', reported: '2026-10-04 11:40' }), NOW).late, false);
  assert.equal(firstTouch(issue({ priority: 'CRITICAL', reported: '2026-10-04 11:00' }), NOW).late, true);
  assert.equal(firstTouch(issue({ priority: 'HIGH', reported: '2026-10-04 10:00' }), NOW).late, false);
  assert.equal(firstTouch(issue({ priority: 'MEDIUM' }), NOW), null);
  assert.equal(firstTouch(issue({ priority: 'CRITICAL', assignee: 'X' }), NOW), null);
});

test('sin asignar: fuera de plazo, luego en plazo por lo que queda, luego el resto', () => {
  const list = [
    issue({ id: 'media', priority: 'MEDIUM', reported: '2026-09-01 00:00' }),
    issue({ id: 'alta-en-plazo', priority: 'HIGH', reported: '2026-10-04 11:30' }),
    issue({ id: 'critica-en-plazo', priority: 'CRITICAL', reported: '2026-10-04 11:40' }),
    issue({ id: 'alta-tarde', priority: 'HIGH', reported: '2026-10-04 08:00' }),
    issue({ id: 'cogida', assignee: 'X' }),
  ];
  assert.deepEqual(order('new', list), ['alta-tarde', 'critica-en-plazo', 'alta-en-plazo', 'media']);
});

test('asignadas: priorizadas por negocio, luego criticidad y antigüedad', () => {
  const list = [
    issue({ id: 'alta', assignee: 'X', priority: 'HIGH' }),
    issue({ id: 'prio', assignee: 'X', priority: 'LOW', prio: true }),
    issue({ id: 'alta-vieja', assignee: 'X', priority: 'HIGH', reported: '2026-10-01 00:00' }),
  ];
  assert.deepEqual(order('assigned', list), ['prio', 'alta-vieja', 'alta']);
});

test('pendientes: la que lleva más sin moverse arriba; resueltas: la más reciente', () => {
  assert.deepEqual(order('pending', [issue({ id: 'a', status: 'PENDING', modified: '2026-10-03 00:00' }), issue({ id: 'b', status: 'PENDING', modified: '2026-09-01 00:00' })]), ['b', 'a']);
  assert.deepEqual(order('resolved', [issue({ id: 'a', status: 'RESOLVED', resolved: '2026-10-01 00:00' }), issue({ id: 'b', status: 'RESOLVED', resolved: '2026-10-03 00:00' })]), ['b', 'a']);
});

test('filtro: mes en curso, anteriores, un mes, origen y texto', () => {
  const sep = issue({ reported: '2026-09-10 00:00', sisu: true, center: '100998' });
  const oct = issue({ prio: true, text: 'Sorter parado' });
  const f = (o) => ({ scope: 'current', month: null, origin: 'all', q: '', ...o });
  assert.equal(matches(oct, f({}), '2026-10', fold), true);
  assert.equal(matches(sep, f({}), '2026-10', fold), false);
  assert.equal(matches(sep, f({ scope: 'previous' }), '2026-10', fold), true);
  assert.equal(matches(sep, f({ scope: 'previous', month: '2026-08' }), '2026-10', fold), false);
  assert.equal(matches(sep, f({ scope: 'previous', origin: 'sga' }), '2026-10', fold), false);
  assert.equal(matches(oct, f({ origin: 'prio' }), '2026-10', fold), true);
  assert.equal(matches(oct, f({ q: 'sorter' }), '2026-10', fold), true);
  assert.equal(matches(sep, f({ scope: 'previous', q: '100998' }), '2026-10', fold), true);
});

test('meses anteriores, por centro y resumen', () => {
  const list = [issue({ reported: '2026-08-01 00:00' }), issue({ reported: '2026-09-01 00:00', center: '1' }), issue({ reported: '2026-09-02 00:00', center: '1' }), issue({})];
  assert.deepEqual(previousMonths(list, '2026-10'), [{ month: '2026-08', count: 1 }, { month: '2026-09', count: 2 }]);
  assert.equal(byCenter(list).get('1').length, 2);
  const s = summary([issue({ priority: 'CRITICAL', reported: '2026-10-04 10:00' }), issue({ status: 'RESOLVED', priority: 'CRITICAL', resolved: '2026-10-04 09:00' })], [issue({ status: 'RESOLVED', resolved: '2026-10-04 09:00' })], NOW);
  assert.deepEqual(s, { unassigned: 1, late: 1, critical: 1, prio: 0, resolvedToday: 1 });
});

test('duración legible y mes', () => {
  assert.equal(duration(30), '30 min');
  assert.equal(duration(180), '3 h');
  assert.equal(duration(4320), '3 d');
  assert.equal(monthOf(NOW), '2026-10');
});
