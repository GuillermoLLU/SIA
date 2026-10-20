import test from 'node:test';
import assert from 'node:assert/strict';
import { isNewer, versionInfo } from './updates.js';

test('isNewer: major.minor.patch, número a número', () => {
  assert.equal(isNewer('1.2.0', '1.1.9'), true);
  assert.equal(isNewer('1.10.0', '1.9.0'), true);
  assert.equal(isNewer('1.0.0', '1.0.0'), false);
  assert.equal(isNewer('1.0', '1.0.1'), false);
  assert.equal(isNewer('1.0.0-beta', '1.0.0'), false, 'un sufijo no cuenta');
});

test('versionInfo: con fila, si hay algo más nuevo; sin fila, nada', () => {
  assert.deepEqual(versionInfo('1.0.0', { version: '1.1.0', url: 'u', notes: 'n' }), { current: '1.0.0', latest: '1.1.0', url: 'u', notes: 'n', updateAvailable: true });
  assert.deepEqual(versionInfo('1.0.0', null), { current: '1.0.0', latest: null, url: null, notes: '', updateAvailable: false });
  assert.equal(versionInfo('2.0.0', { version: '1.1.0' }).updateAvailable, false);
});
