import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuth } from './service.js';
import { SEED_ADMIN } from './users.js';

const setup = () => {
  let cfg = {};
  const clock = { t: 1_000_000 };
  const auth = createAuth({ readConfig: () => cfg, writeConfig: (c) => { cfg = c; }, now: () => clock.t });
  return { auth, clock, cfg: () => cfg };
};

test('ensureUsers guarda el administrador inicial una sola vez', () => {
  const { auth, cfg } = setup();
  assert.equal(auth.ensureUsers(), true);
  assert.equal(cfg().users[0].name, SEED_ADMIN.name);
  assert.equal(auth.ensureUsers(), false);
});

test('login con «Recordar» persiste la sesión; sin él, solo en memoria', () => {
  const { auth, cfg } = setup();
  auth.ensureUsers();
  const short = auth.login('guille', SEED_ADMIN.password, false);
  assert.equal(cfg().sessions, undefined);
  const long = auth.login('Guille', SEED_ADMIN.password, true);
  assert.equal(cfg().sessions.length, 1);
  assert.equal(auth.userOf(short.token)?.name, 'Guille');
  assert.equal(auth.userOf(long.token)?.name, 'Guille');
  auth.logout(long.token);
  auth.logout(short.token);
  assert.equal(cfg().sessions.length, 0);
  assert.equal(auth.userOf(short.token), null);
});

test('cinco fallos seguidos frenan 30 s, también a la contraseña buena', () => {
  const { auth, clock } = setup();
  auth.ensureUsers();
  for (let i = 0; i < 4; i++) assert.deepEqual(auth.login('Guille', 'mal'), {});
  assert.deepEqual(auth.login('Guille', 'mal'), { wait: 30 });
  assert.equal(auth.login('Guille', SEED_ADMIN.password).wait, 30);
  clock.t += 30_000;
  assert.ok(auth.login('Guille', SEED_ADMIN.password).token);
});
