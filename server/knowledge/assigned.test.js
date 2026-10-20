import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toAssignedBase } from './assigned.js';

const URL_A = 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co';
const row = (extra) => ({ base_id: 'b1', base_name: 'Soporte', url: URL_A, publishable_key: 'sb_publishable_a', power_key: 'pk-paula', ...extra });

test('toAssignedBase: la base con sus tokens sin repetir y la clave de poder', () => {
  const base = toAssignedBase([row({ group_token: 'tok-n1' }), row({ group_token: 'tok-n2' }), row({ group_token: 'tok-n2' }), { base_id: 'b3', base_name: 'Rota', url: URL_A }]);
  assert.deepEqual(base, { id: 'p-b1', name: 'Soporte', url: URL_A, key: 'sb_publishable_a', tokens: ['tok-n1', 'tok-n2'], powerKey: 'pk-paula' });
});

test('toAssignedBase: sin proyectos también se conecta; sin filas, null', () => {
  assert.deepEqual(toAssignedBase([row({ group_token: null })]).tokens, []);
  assert.equal(toAssignedBase([]), null);
  assert.equal(toAssignedBase(null), null);
});
