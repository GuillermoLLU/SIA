import test from 'node:test';
import assert from 'node:assert/strict';
import { clientNetworkError } from './client-network.js';

test('faltan los certificados: 503, su code y la guía', () => {
  const e = clientNetworkError('certs', 'Faltan.', 'https://guia');
  assert.deepEqual({ message: e.message, status: e.status, code: e.code, help: e.help }, { message: 'Faltan.', status: 503, code: 'certs', help: { url: 'https://guia' } });
  assert.deepEqual(clientNetworkError('certs-vpn', 'Faltan los dos.', 'https://guia').help, { url: 'https://guia' });
});

test('sin VPN: 503 y su code, sin guía', () => {
  const e = clientNetworkError('vpn', 'Sin VPN.', 'https://guia');
  assert.equal(e.status, 503);
  assert.equal(e.code, 'vpn');
  assert.equal('help' in e, false);
});
