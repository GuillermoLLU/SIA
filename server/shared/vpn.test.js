import test from 'node:test';
import assert from 'node:assert/strict';
import { isPrivateAddress, onVpn } from './vpn.js';

test('direcciones privadas: las de una red interna, no las públicas', () => {
  for (const a of ['10.110.101.161', '192.168.1.2', '172.16.0.1', '172.31.255.1', 'fd12::1']) assert.equal(isPrivateAddress(a), true, a);
  for (const a of ['20.76.246.158', '172.32.0.1', '8.8.8.8', '2001:db8::1']) assert.equal(isPrivateAddress(a), false, a);
});

test('onVpn: dentro si el nombre interno resuelve a una privada; fuera si no resuelve, da pública o tarda', async () => {
  assert.equal(await onVpn(async () => [{ address: '10.110.101.161' }], 'jira.x'), true);
  assert.equal(await onVpn(async () => [{ address: '20.1.2.3' }], 'jira.x'), false);
  assert.equal(await onVpn(async () => { throw Object.assign(new Error('x'), { code: 'ENOTFOUND' }); }, 'jira.x'), false);
  assert.equal(await onVpn(() => new Promise(() => {}), 'jira.x', { timeoutMs: 10 }), false);
});
