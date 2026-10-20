import test from 'node:test';
import assert from 'node:assert/strict';
import { isLoopback, clientIp, lanToken, deviceName, newPairing, pairingMatches, openWithoutSession, remoteReach, openWhileLocked, PAIR_TTL_MS } from './remote.js';

const req = (headers = {}, remoteAddress = '127.0.0.1') => ({ headers, socket: { remoteAddress } });

test('isLoopback: solo localhost de verdad; lo que llega por el proxy del túnel no lo es', () => {
  assert.equal(isLoopback(req()), true);
  assert.equal(isLoopback(req({}, '::1')), true);
  assert.equal(isLoopback(req({}, '::ffff:127.0.0.1')), true);
  assert.equal(isLoopback(req({}, '192.168.1.5')), false);
  assert.equal(isLoopback(req({ 'cf-connecting-ip': '1.2.3.4' })), false);
  assert.equal(isLoopback(req({ 'x-forwarded-for': '1.2.3.4' })), false);
});

test('clientIp y lanToken', () => {
  assert.equal(clientIp(req({}, '::ffff:10.0.0.2')), '10.0.0.2');
  assert.equal(clientIp(req({ 'cf-connecting-ip': '1.2.3.4' })), '1.2.3.4');
  const url = new URL('http://x/api/lan/lock?t=qq');
  assert.equal(lanToken(req({ 'x-sia-lan': 'hh' }), url), 'hh');
  assert.equal(lanToken(req(), url), 'qq');
  assert.equal(lanToken(req(), new URL('http://x/')), null);
});

test('deviceName: dispositivo y navegador reconocibles', () => {
  assert.equal(deviceName('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0) AppleWebKit/605 (KHTML, like Gecko) Version/17 Mobile/15E148 Safari/604.1'), 'iPhone · Safari');
  assert.equal(deviceName('Mozilla/5.0 (Linux; Android 14; Pixel) AppleWebKit/537 (KHTML, like Gecko) Chrome/120 Mobile Safari/537'), 'Android · Chrome');
  assert.equal(deviceName('Mozilla/5.0 (Windows NT 10.0) Firefox/120'), 'Windows · Firefox');
  assert.equal(deviceName(''), 'Dispositivo');
});

test('emparejar: token + PIN o solo PIN, mientras no caduque', () => {
  const p = newPairing('lan', { token: 'T', pin: '123456', now: 1000 });
  assert.equal(p.expiresAt, 1000 + PAIR_TTL_MS);
  assert.equal(pairingMatches(p, { token: 'T', pin: '123456' }, 2000), true);
  assert.equal(pairingMatches(p, { pin: 123456 }, 2000), true, 'solo el PIN, también como número');
  assert.equal(pairingMatches(p, { token: 'X', pin: '123456' }, 2000), false);
  assert.equal(pairingMatches(p, { pin: '000000' }, 2000), false);
  assert.equal(pairingMatches(p, { pin: '123456' }, p.expiresAt + 1), false);
  assert.equal(pairingMatches(null, { pin: '123456' }, 0), false);
});

test('qué abre cada capa del cortafuegos', () => {
  assert.equal(openWithoutSession(['index.html'], false), true, 'la web, siempre');
  assert.equal(openWithoutSession(['api', 'ping'], true), true);
  assert.equal(openWithoutSession(['api', 'ping'], false), false);
  assert.equal(openWithoutSession(['api', 'lan', 'pair'], true), true);
  assert.equal(openWithoutSession(['api', 'config'], true), false);
  assert.equal(remoteReach(['api', 'uploads', 'x']), true);
  assert.equal(remoteReach(['api', 'lan', 'status']), false);
  assert.equal(remoteReach(['api', 'config']), false);
  assert.equal(openWhileLocked(['api', 'lan', 'unlock']), true);
  assert.equal(openWhileLocked(['api', 'upload']), false);
});
