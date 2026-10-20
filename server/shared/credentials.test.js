import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headerValue, siaHeaders } from './credentials.js';


test('headerValue: solo ASCII visible, sin comas, unidos por coma', () => {
  assert.equal(headerValue(['tokA', ' tokB ', '', null]), 'tokA,tokB');
  assert.equal(headerValue(['con espacio', 'con,coma', 'ñ', 'ok']), 'ok');
  assert.equal(headerValue('solo'), 'solo');
  assert.equal(headerValue([]), '');
  assert.equal(headerValue(undefined), '');
});

test('siaHeaders: cada cabecera solo si tiene valor', () => {
  assert.deepEqual(siaHeaders([], ''), {});
  assert.deepEqual(siaHeaders(['t1', 't2'], ''), { 'x-sia-tokens': 't1,t2' });
  assert.deepEqual(siaHeaders([], 'pk'), { 'x-sia-power': 'pk' });
  assert.deepEqual(siaHeaders(['t1'], 'pk'), { 'x-sia-tokens': 't1', 'x-sia-power': 'pk' });
});
