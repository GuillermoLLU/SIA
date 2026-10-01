import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isSecretKey, headerValue, siaHeaders } from './credentials.js';

const jwt = (payload) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.firma`;

test('la clave secret se reconoce en sus dos formas', () => {
  assert.equal(isSecretKey('sb_secret_abc123'), true);
  assert.equal(isSecretKey('  SB_SECRET_x '), true);
  assert.equal(isSecretKey(jwt({ role: 'service_role' })), true);
});

test('la publishable y el JWT anon no son secret', () => {
  assert.equal(isSecretKey('sb_publishable_abc123'), false);
  assert.equal(isSecretKey(jwt({ role: 'anon' })), false);
  assert.equal(isSecretKey(''), false);
  assert.equal(isSecretKey(null), false);
  assert.equal(isSecretKey('a.b'), false);
  assert.equal(isSecretKey('a.no-es-json.c'), false);
});

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
