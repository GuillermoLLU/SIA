import test from 'node:test';
import assert from 'node:assert/strict';
import { createLock } from './service.js';
import { lockRoutes } from './routes.js';

const setup = (initial = {}) => {
  let cfg = initial, t = 1000;
  const config = { read: () => cfg, patch: (c) => { cfg = { ...cfg, ...c }; } };
  const lock = createLock({ config, now: () => t, random: () => Buffer.alloc(16, 1) });
  const route = lockRoutes(lock, { json: (res, status, body) => Object.assign(res, { status, body }), readBody: async (req) => req.body || {} });
  const call = async (method, action, body) => { const res = {}; await route({ method, body }, res, action); return res; };
  return { call, lock, cfg: () => cfg, tick: (ms) => { t += ms; } };
};

test('sin PIN: no se puede bloquear; elegirlo lo guarda derivado y desbloqueado', async () => {
  const s = setup();
  assert.deepEqual((await s.call('GET')).body, { hasKey: false, locked: false, len: 4 });
  assert.equal((await s.call('POST', 'on')).status, 409);
  assert.equal((await s.call('PUT', 'key', { key: '12' })).status, 400);
  assert.deepEqual((await s.call('PUT', 'key', { key: '1234' })).body, { ok: true, hasKey: true, len: 4 });
  assert.equal(s.cfg().lock.locked, false);
  assert.doesNotMatch(JSON.stringify(s.cfg()), /1234/);
});

test('bloquear y desbloquear; con el candado echado no se cambia el PIN', async () => {
  const s = setup();
  await s.call('PUT', 'key', { key: '1234' });
  assert.deepEqual((await s.call('POST', 'on')).body, { locked: true });
  assert.equal(s.lock.locked(), true);
  assert.equal((await s.call('PUT', 'key', { key: '9999' })).status, 423);
  assert.equal((await s.call('POST', 'off', { key: '0000' })).status, 403);
  assert.deepEqual((await s.call('POST', 'off', { key: '1234' })).body, { locked: false });
});

test('cambiar el PIN exige el actual; cinco fallos imponen espera', async () => {
  const s = setup();
  await s.call('PUT', 'key', { key: '1234' });
  assert.equal((await s.call('PUT', 'key', { key: '5678', current: '0000' })).status, 403);
  for (let i = 0; i < 4; i++) await s.call('PUT', 'key', { key: '5678', current: '0000' });
  const r = await s.call('PUT', 'key', { key: '5678', current: '1234' });
  assert.equal(r.status, 429);
  assert.equal(r.body.wait, 30);
  s.tick(31_000);
  assert.equal((await s.call('PUT', 'key', { key: '5678', current: '1234' })).status, 200);
  assert.equal(s.lock.matches('5678'), true);
});

test('arranca bloqueado si la config lo dice y hay PIN de verdad', () => {
  const withPin = setup({}); withPin.lock.setPin('1234', { locked: true });
  assert.equal(createLock({ config: { read: withPin.cfg, patch() {} } }).locked(), true);
  assert.equal(createLock({ config: { read: () => ({ lock: { locked: true, hash: 'x' } }), patch() {} } }).locked(), false);
});
