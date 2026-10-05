import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED_ADMIN, makeUser, normalizeUsers, checkLogin, publicUser, createUser, updateUser, removeUser } from './users.js';

const admin = () => makeUser({ name: 'Guille', password: '5555', role: 'admin' });

test('sin usuarios se crea el administrador inicial, con la contraseña derivada', () => {
  const [u] = normalizeUsers(undefined);
  assert.equal(u.name, SEED_ADMIN.name);
  assert.equal(u.role, 'admin');
  assert.ok(!JSON.stringify(u).includes(`"${SEED_ADMIN.password}"`));
  assert.equal(normalizeUsers([{ name: 'roto' }]).length, 1);
});

test('checkLogin: nombre sin mayúsculas, contraseña exacta', () => {
  const users = [admin()];
  assert.equal(checkLogin(users, ' guille ', '5555')?.name, 'Guille');
  assert.equal(checkLogin(users, 'Guille', '5556'), null);
  assert.equal(checkLogin(users, 'Otro', '5555'), null);
  assert.equal(checkLogin(users, 'Guille', ''), null);
  assert.deepEqual(Object.keys(publicUser(users[0])), ['id', 'name', 'role']);
});

test('createUser: agente por defecto, nombre único y contraseña mínima', () => {
  const users = [admin()];
  const r = createUser(users, { name: ' Ana ', password: '1234' });
  assert.equal(r.user.name, 'Ana');
  assert.equal(r.user.role, 'agent');
  assert.equal(r.users.length, 2);
  assert.ok(checkLogin(r.users, 'ana', '1234'));
  assert.match(createUser(users, { name: 'GUILLE', password: '1234' }).error, /Ya hay/);
  assert.match(createUser(users, { name: 'Ana', password: '12' }).error, /contraseña/);
  assert.match(createUser(users, { name: '', password: '1234' }).error, /nombre/);
  assert.match(createUser(users, { name: 'Ana', password: '1234', role: 'root' }).error, /Rol/);
});

test('updateUser: cambia solo lo que viene; la contraseña nueva sustituye a la vieja', () => {
  const { users, user } = createUser([admin()], { name: 'Ana', password: '1234' });
  const r = updateUser(users, user.id, { name: 'Ana López', password: 'nueva' });
  assert.equal(r.user.name, 'Ana López');
  assert.equal(r.user.role, 'agent');
  assert.ok(checkLogin(r.users, 'ana lópez', 'nueva'));
  assert.equal(checkLogin(r.users, 'ana lópez', '1234'), null);
  assert.equal(updateUser(users, user.id, { name: 'Ana' }).user.name, 'Ana'); // su propio nombre no choca
  assert.match(updateUser(users, 'no', { name: 'X' }).error, /no existe/);
});

test('siempre queda un admin y nadie se borra a sí mismo', () => {
  const g = admin();
  const { users, user: ana } = createUser([g], { name: 'Ana', password: '1234' });
  assert.match(updateUser(users, g.id, { role: 'agent' }).error, /único administrador/);
  assert.match(removeUser(users, g.id, ana.id).error, /único administrador/);
  assert.match(removeUser(users, g.id, g.id).error, /propio/);
  assert.deepEqual(removeUser(users, ana.id, g.id).users.map((u) => u.name), ['Guille']);
  const two = updateUser(users, ana.id, { role: 'admin' }).users;
  assert.equal(updateUser(two, g.id, { role: 'agent' }).user.role, 'agent');
});
