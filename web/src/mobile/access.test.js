import test from 'node:test';
import assert from 'node:assert/strict';
import { devicesMsg, deviceState, devicesSignature, accessView } from './access.js';

const NOW = 1_000_000;

test('devicesMsg: singular, plural y el modo público', () => {
  assert.equal(devicesMsg({ devices: 0 }), 'Acceso abierto, sin dispositivos');
  assert.equal(devicesMsg({ devices: 1 }), '1 dispositivo conectado');
  assert.equal(devicesMsg({ devices: 2, mode: 'public' }), '2 dispositivos conectados · público');
});

test('deviceState y la firma que decide si se repinta', () => {
  assert.equal(deviceState({ locked: true }, NOW), 'bloqueado');
  assert.equal(deviceState({ online: true }, NOW), 'en línea');
  assert.equal(deviceState({ online: false, lastSeen: NOW - 5 * 60000 }, NOW), 'sin conexión · visto hace 5 min');
  const d = { id: 1, name: 'iPhone', mode: 'lan', locked: false, online: false, lastSeen: NOW - 90_000 };
  assert.equal(devicesSignature([d], NOW), devicesSignature([d], NOW + 20_000), 'dentro del mismo minuto no cambia');
  assert.notEqual(devicesSignature([d], NOW), devicesSignature([{ ...d, online: true }], NOW));
});

test('accessView: el estado del bridge manda, en este orden', () => {
  const v = accessView({ publicPhase: 'download' }, { choosing: true, wasPairing: false });
  assert.equal(v.view, 'loading');
  assert.equal(v.title, 'Descargando cloudflared');
  assert.deepEqual(v.steps.map((s) => [s.done, s.active]), [[true, false], [false, true], [false, false]]);

  assert.deepEqual(accessView({ publicError: 'sin red', devices: 0 }, { choosing: false, wasPairing: false }), { view: 'error', text: 'sin red' });
  const qr = accessView({ pendingPairing: true, qrUrl: 'u', pin: 123456, mode: 'public', pairExpiresAt: NOW + 65_000 }, { choosing: true, wasPairing: false }, NOW);
  assert.deepEqual(qr, { view: 'qr', qrUrl: 'u', pin: '123456', note: 'Escanéalo desde cualquier red y teclea el PIN · caduca en 1:05' });
  assert.deepEqual(accessView({ active: true, devices: 1 }, { choosing: true, wasPairing: false }), { view: 'choose' });
  assert.deepEqual(accessView({ active: true, devices: 1 }, { choosing: false, wasPairing: true }), { view: 'on', title: '1 dispositivo conectado' });
  assert.deepEqual(accessView({}, { choosing: false, wasPairing: true }), { view: 'idle', note: 'El QR caducó sin usarse.' });
  assert.deepEqual(accessView({}, { choosing: false, wasPairing: false }), { view: 'idle', note: '' });
});
