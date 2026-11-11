import test from 'node:test';
import assert from 'node:assert/strict';
import { bridgeFromQuery, pickBridge } from './discover.js';

test('bridgeFromQuery: los puertos que pasa Electron', () => {
  assert.deepEqual(bridgeFromQuery(new URLSearchParams('ws=1&api=2')), { wsUrl: 'ws://localhost:1', apiBase: 'http://localhost:2/api' });
  assert.equal(bridgeFromQuery(new URLSearchParams('ws=1')), null);
});

test('pickBridge: el de desarrollo antes que el primero; sin ninguno, el primer par', () => {
  assert.deepEqual(pickBridge([{ w: 1, a: 2, dev: false }, { w: 3, a: 4, dev: true }]), { w: 3, a: 4, dev: true });
  assert.deepEqual(pickBridge([{ w: 1, a: 2, dev: false }]), { w: 1, a: 2, dev: false });
  assert.deepEqual(pickBridge([]), { w: 57413, a: 57414 });
});
