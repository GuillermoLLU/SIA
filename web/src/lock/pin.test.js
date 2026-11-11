import test from 'node:test';
import assert from 'node:assert/strict';
import { digits, pinProblem, unlockOutcome } from './pin.js';

test('digits: solo cifras, recortado a la longitud', () => {
  assert.equal(digits('1a2b345', 4), '1234');
  assert.equal(digits(null, 4), '');
});

test('pinProblem: forma y coincidencia, con la longitud del bridge', () => {
  assert.equal(pinProblem('123', '123'), 'El PIN son 4 dígitos.');
  assert.equal(pinProblem('1234', '1235'), 'Los dos PIN no coinciden.');
  assert.equal(pinProblem('1234', '1234'), '');
  assert.equal(pinProblem('123456', '123456', 6), '');
});

test('unlockOutcome: acierto, freno con segundos, fallo', () => {
  assert.deepEqual(unlockOutcome({ ok: true, status: 200 }), { do: 'ok' });
  assert.deepEqual(unlockOutcome({ ok: false, status: 429, data: { wait: 30 } }), { do: 'wait', secs: 30 });
  assert.deepEqual(unlockOutcome({ ok: false, status: 401 }), { do: 'fail' });
});
