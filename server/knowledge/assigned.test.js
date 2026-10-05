import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toAssignedBases, assignedId } from './assigned.js';

const URL_A = 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co';
const URL_B = 'https://bbbbbbbbbbbbbbbbbbbb.supabase.co';
const rows = [
  { base_id: 'b1', base_name: 'Soporte', url: URL_A, publishable_key: 'sb_publishable_a', group_name: 'N1', group_token: 'tok-n1' },
  { base_id: 'b1', base_name: 'Soporte', url: URL_A, publishable_key: 'sb_publishable_a', group_name: 'N2', group_token: 'tok-n2' },
  { base_id: 'b1', base_name: 'Soporte', url: URL_A, publishable_key: 'sb_publishable_a', group_name: 'N2 bis', group_token: 'tok-n2' },
  { base_id: 'b2', base_name: 'Logística', url: URL_B, publishable_key: 'sb_publishable_b', group_name: 'L', group_token: 'tok-l', power_key: 'pk-paula-b' },
  { base_id: 'b3', base_name: 'Rota', url: URL_B },
];

test('toAssignedBases: una base por base, con sus tokens sin repetir; filas incompletas fuera', () => {
  const bases = toAssignedBases(rows);
  assert.equal(bases.length, 2);
  assert.deepEqual(bases[0], { id: assignedId('b1'), name: 'Soporte', url: URL_A, key: 'sb_publishable_a', tokens: ['tok-n1', 'tok-n2'], groups: ['N1', 'N2'], powerKey: '', enabled: true });
  assert.equal(bases[1].powerKey, 'pk-paula-b', 'con la clave de poder que le dio la instancia');
  assert.deepEqual(toAssignedBases(null), []);
});

test('toAssignedBases: sin grupos también se conecta a la base (la ve todo el mundo)', () => {
  const [b] = toAssignedBases([{ base_id: 'b4', base_name: 'ITX', url: URL_A, publishable_key: 'sb_publishable_a', group_name: null, group_token: null, power_key: 'pk' }]);
  assert.deepEqual([b.name, b.tokens, b.groups, b.powerKey], ['ITX', [], [], 'pk']);
});
