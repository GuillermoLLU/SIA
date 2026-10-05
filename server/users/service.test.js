import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUserAdmin } from './service.js';
import { SEED_ADMIN } from './users.js';

const setup = () => {
  let cfg = {};
  const users = createUserAdmin({ readConfig: () => cfg, writeConfig: (c) => { cfg = c; } });
  return { users, cfg: () => cfg };
};

test('ensureSeed guarda el administrador inicial una sola vez', () => {
  const { users, cfg } = setup();
  assert.equal(users.ensureSeed(), true);
  assert.equal(cfg().users[0].name, SEED_ADMIN.name);
  assert.equal(users.ensureSeed(), false);
});

test('alta, edición y baja quedan guardadas; un error no toca la config', () => {
  const { users, cfg } = setup();
  users.ensureSeed();
  const [g] = users.all();
  const { user } = users.create({ name: 'Ana', password: '1234' });
  assert.deepEqual(cfg().users.map((u) => u.name), ['Guille', 'Ana']);
  users.update(user.id, { role: 'admin' });
  assert.equal(cfg().users[1].role, 'admin');
  const before = cfg();
  assert.ok(users.create({ name: 'ana', password: '1234' }).error);
  assert.equal(cfg(), before);
  users.remove(user.id, g.id);
  assert.deepEqual(cfg().users.map((u) => u.name), ['Guille']);
});
