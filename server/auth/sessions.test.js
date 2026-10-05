import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REMEMBER_MS, SESSION_MS, newSession, liveSessions, userForToken } from './sessions.js';

test('sesiones: «Mantener la sesión» dura más; caducadas y huérfanas no valen', () => {
  const users = [{ id: 'u1', name: 'A' }];
  const now = 1_000_000;
  const short = newSession('u1', false, now);
  const long = newSession('u1', true, now);
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
