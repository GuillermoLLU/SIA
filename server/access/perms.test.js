import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PERMS, ALL_PERMS, cleanPerms, permsFromRow } from './perms.js';

test('cleanPerms deja solo los permisos conocidos, como booleanos', () => {
  assert.deepEqual(cleanPerms({ lab: 1, admin: 'yes', hack: true }), { lab: true, admin: true, links: false });
  assert.deepEqual(cleanPerms(null), { lab: false, admin: false, links: false });
  assert.deepEqual(Object.keys(ALL_PERMS), PERMS);
});

test('permsFromRow: el dueño lo abre todo; los demás, lo que diga perms', () => {
  assert.deepEqual(permsFromRow({ name: 'Owner', owner: true, perms: {} }), { name: 'Owner', owner: true, ...ALL_PERMS });
  assert.deepEqual(permsFromRow({ name: 'Edi', owner: false, perms: { links: true, invite: true } }), { name: 'Edi', owner: false, lab: false, admin: false, links: true });
  assert.equal(permsFromRow(null), null);
  assert.equal(permsFromRow('x'), null);
});
