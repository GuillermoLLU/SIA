import test from 'node:test';
import assert from 'node:assert/strict';
import { TABS, when, age, stamp } from './format.js';

const NOW = new Date('2026-10-04T11:44:00');

test('pestañas de la mesa por estado', () => {
  const tab = (status) => TABS.find((t) => t.test({ status }))?.key;
  assert.equal(tab('ASSIGNED'), 'doing');
  assert.equal(tab('IN_PROGRESS'), 'doing');
  assert.equal(tab('PENDING'), 'waiting');
  assert.equal(tab('RESOLVED'), 'resolved');
});

test('fechas y antigüedad', () => {
  assert.equal(stamp(NOW), '2026-10-04 11:44');
  assert.equal(when('2026-10-04 11:44'), '04/10 11:44');
  assert.equal(when(''), '—');
  assert.equal(age('2026-10-04 11:14', NOW), '30 min');
  assert.equal(age('2026-10-04 08:44', NOW), '3 h');
  assert.equal(age('2026-10-01 11:44', NOW), '3 d');
});
