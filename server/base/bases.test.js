import { test } from 'node:test';
import assert from 'node:assert/strict';
import { supabaseUrlFrom, cleanSupabase, baseRef, cleanBase, normalizeBases, usable } from './bases.js';

test('supabaseUrlFrom admite ref pelada, URL del proyecto y URL del dashboard', () => {
  assert.equal(supabaseUrlFrom('kqzvxpmrtbndlgwhcsfa'), 'https://kqzvxpmrtbndlgwhcsfa.supabase.co');
  assert.equal(supabaseUrlFrom('https://abc.supabase.co/'), 'https://abc.supabase.co');
  assert.equal(supabaseUrlFrom('https://supabase.com/dashboard/project/KQZVXPMRTBNDLGWHCSFA/sql'), 'https://kqzvxpmrtbndlgwhcsfa.supabase.co');
  assert.equal(baseRef('https://wgqpl.supabase.co'), 'wgqpl');
});

test('cleanSupabase exige URL https válida y clave', () => {
  assert.deepEqual(cleanSupabase({ url: 'abcdefghijklmnopqrst', key: ' k ' }), { url: 'https://abcdefghijklmnopqrst.supabase.co', key: 'k' });
  assert.equal(cleanSupabase({ url: 'http://inseguro', key: 'k' }), null);
  assert.equal(cleanSupabase({ url: 'abcdefghijklmnopqrst', key: '' }), null);
  assert.equal(cleanSupabase(null), null);
});

test('cleanBase descarta la clave secret y conserva lo demás', () => {
  const b = cleanBase({ id: 'b1', name: 'Vieja', url: 'abcdefghijklmnopqrst', key: 'sb_secret_x', tokens: [' t1 ', ''], powerKey: ' pk ' });
  assert.equal(b.key, '');
  assert.deepEqual(b.tokens, ['t1']);
  assert.equal(b.powerKey, 'pk');
  assert.equal(b.enabled, true);
  assert.equal(usable(b), false);
  const ok = cleanBase({ url: 'abcdefghijklmnopqrst', key: 'sb_publishable_x' });
  assert.equal(ok.name, 'abcdefghijklmnopqrst');
  assert.match(ok.id, /^b/);
  assert.equal(usable(ok), true);
  assert.equal(usable({ ...ok, enabled: false }), false);
});

test('normalizeBases tolera basura en la config', () => {
  assert.deepEqual(normalizeBases(null), []);
  assert.deepEqual(normalizeBases([null, 'x', { url: 'no-url' }, { url: 'abcdefghijklmnopqrst', key: 'k' }]).map((b) => b.url), ['https://abcdefghijklmnopqrst.supabase.co']);
});
