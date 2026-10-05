import test from 'node:test';
import assert from 'node:assert/strict';
import { isUuid } from './ids.js';

test('isUuid: solo uuid, sin colarse nada más', () => {
  assert.equal(isUuid('00000000-0000-0000-0000-0000000000a1'), true);
  assert.equal(isUuid('00000000-0000-0000-0000-0000000000a1x'), false);
  assert.equal(isUuid('roles'), false);
  assert.equal(isUuid(undefined), false);
});
