import { test } from 'node:test';
import assert from 'node:assert/strict';
import { INVITE_PREFIX, inviteEncode, inviteDecode, inviteMask } from './invite.js';

const base = { name: 'PERSONAL', url: 'https://abc.supabase.co', key: 'sb_publishable_x' };

test('ida y vuelta con varios grupos, sin duplicados ni vacíos', () => {
  const text = inviteEncode({ ...base, tokens: ['t1', ' t2 ', 't1', ''] });
  assert.ok(text.startsWith(INVITE_PREFIX));
  assert.deepEqual(inviteDecode(text), { ...base, tokens: ['t1', 't2'] });
});

test('acentos y nombres largos sobreviven', () => {
  const text = inviteEncode({ ...base, name: 'Año ñ — «muy» largo'.repeat(5), tokens: ['t'] });
  const inv = inviteDecode(text);
  assert.equal(inv.name.length, 40);
  assert.ok(inv.name.startsWith('Año ñ — «muy»'));
});

test('la forma antigua con un solo token se sigue leyendo', () => {
  const old = INVITE_PREFIX + Buffer.from(JSON.stringify({ v: 1, name: 'x', url: base.url, key: base.key, token: 'solo' })).toString('base64url');
  assert.deepEqual(inviteDecode(old).tokens, ['solo']);
});

test('lo que no es una invitación devuelve null', () => {
  assert.equal(inviteDecode(''), null);
  assert.equal(inviteDecode('hola'), null);
  assert.equal(inviteDecode(INVITE_PREFIX + 'no-base64!!'), null);
  assert.equal(inviteDecode(INVITE_PREFIX + Buffer.from('{"v":2}').toString('base64url')), null);
  assert.equal(inviteDecode(INVITE_PREFIX + Buffer.from('{"v":1,"url":"","key":"k"}').toString('base64url')), null);
});

test('la máscara enseña principio y final', () => {
  assert.equal(inviteMask('sia-invite:ABCDEFGHIJKLMNOPQRSTUVWXYZ'), 'sia-invite:ABCDE…UVWXYZ');
});
