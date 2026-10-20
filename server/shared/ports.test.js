import test from 'node:test';
import assert from 'node:assert/strict';
import { choosePair } from './ports.js';

const quiet = { log() {}, warn() {} };
const pairs = [[1, 2], [3, 4], [5, 6]];

test('SIA_PORT fuerza el par', async () => {
  assert.deepEqual(await choosePair('1.0.0', { forced: '9000', pairs, log: quiet }), { ws: 9000, api: 9001 });
});

test('se adopta un SIA de la misma versión; otra versión o puerto ocupado pasan al siguiente', async () => {
  const same = await choosePair('1.0.0', { pairs, probe: async (api) => (api === 2 ? '1.0.0' : null), free: async () => true, log: quiet });
  assert.deepEqual(same, { ws: 1, api: 2 });
  const old = await choosePair('1.0.0', { pairs, probe: async (api) => (api === 2 ? '0.9.0' : null), free: async (p) => p > 4, log: quiet });
  assert.deepEqual(old, { ws: 5, api: 6 });
});

test('sin pares libres, el primero', async () => {
  assert.deepEqual(await choosePair('1.0.0', { pairs, probe: async () => null, free: async () => false, log: quiet }), { ws: 1, api: 2 });
});
