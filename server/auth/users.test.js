import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SEED_ADMIN, REMEMBER_MS, SESSION_MS, makeUser, normalizeUsers, checkLogin, publicUser, newSession, liveSessions, userForToken } from './users.js';

test('sin usuarios se crea el administrador inicial, con la contraseña derivada', () => {
  const [u] = normalizeUsers(undefined);
  assert.equal(u.name, SEED_ADMIN.name);
  assert.equal(u.role, 'admin');
  assert.ok(!JSON.stringify(u).includes(`"${SEED_ADMIN.password}"`));
  assert.equal(normalizeUsers([{ name: 'roto' }]).length, 1);
});

test('checkLogin: nombre sin mayúsculas, contraseña exacta', () => {
  const users = normalizeUsers([makeUser({ name: 'Guille', password: '5555', role: 'admin' })]);
  assert.equal(checkLogin(users, ' guille ', '5555')?.name, 'Guille');
  assert.equal(checkLogin(users, 'Guille', '5556'), null);
  assert.equal(checkLogin(users, 'Otro', '5555'), null);
  assert.equal(checkLogin(users, 'Guille', ''), null);
  assert.deepEqual(Object.keys(publicUser(users[0])), ['id', 'name', 'role']);
});

test('sesiones: «Recordar» dura más; caducadas y huérfanas no valen', () => {
  const users = [makeUser({ name: 'A', password: 'x' })];
  const now = 1_000_000;
  const short = newSession(users[0].id, false, now);
  const long = newSession(users[0].id, true, now);
  assert.equal(short.session.expires, now + SESSION_MS);
  assert.equal(long.session.expires, now + REMEMBER_MS);
  assert.ok(!JSON.stringify(long.session).includes(long.token));
  const all = [short.session, long.session];
  assert.equal(userForToken(all, users, long.token, now)?.name, 'A');
  assert.equal(userForToken(all, users, short.token, now + SESSION_MS + 1), null);
  assert.equal(userForToken(all, users, long.token, now + SESSION_MS + 1)?.name, 'A');
  assert.equal(userForToken(all, users, 'otro', now), null);
  assert.equal(liveSessions(all, [], now).length, 0);
});
