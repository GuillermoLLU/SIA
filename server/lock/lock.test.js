import test from 'node:test';
import assert from 'node:assert/strict';
import { isPin, hashPin, hasPin, pinMatches, createBrake } from './lock.js';

const SALT = '00112233445566778899aabbccddeeff';

test('isPin: exactamente 4 dígitos', () => {
  assert.equal(isPin('1234'), true);
  for (const k of ['123', '12345', '12a4', 1234, '', null]) assert.equal(isPin(k), false, String(k));
});

test('hashPin y pinMatches: derivada con sal, nunca el PIN en claro; comparación segura', () => {
  const lock = hashPin('1234', SALT);
  assert.deepEqual(Object.keys(lock), ['salt', 'hash', 'len']);
  assert.equal(lock.len, 4);
  assert.doesNotMatch(lock.hash, /1234/);
  assert.equal(pinMatches(lock, '1234'), true);
  assert.equal(pinMatches(lock, '1235'), false);
  assert.equal(pinMatches(lock, ''), false);
  assert.equal(pinMatches({}, '1234'), false);
});

test('hasPin: solo con derivada, sal y el largo de la puerta', () => {
  assert.equal(hasPin(hashPin('1234', SALT)), true);
  assert.equal(hasPin({ ...hashPin('123456', SALT) }), false, 'PIN de otro largo, de otra versión');
  assert.equal(hasPin({ hash: 'x' }), false);
  assert.equal(hasPin(undefined), false);
});

test('freno: cinco fallos seguidos, 30 s de espera; un acierto lo reinicia', () => {
  let t = 1000;
  const brake = createBrake({ now: () => t });
  for (let i = 0; i < 4; i++) assert.deepEqual(brake.try(false), { ok: false });
  assert.deepEqual(brake.try(false), { ok: false, wait: 30 });
  t += 10_000;
  assert.deepEqual(brake.try(true), { ok: false, wait: 20 }, 'en espera ni el bueno entra');
  t += 20_000;
  assert.deepEqual(brake.try(true), { ok: true });
  for (let i = 0; i < 3; i++) brake.try(false);
  assert.deepEqual(brake.try(true), { ok: true });
  for (let i = 0; i < 4; i++) assert.deepEqual(brake.try(false), { ok: false }, 'el contador se reinició con el acierto');
});
