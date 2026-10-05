import { test } from 'node:test';
import assert from 'node:assert/strict';
import { REMEMBER_MS, SESSION_MS, newSession, liveSessions, sessionFor } from './sessions.js';

test('sesiones: «Mantener la sesión» dura más; caducadas y sin refresh token no valen', () => {
  const now = 1_000_000;
  const short = newSession({ userId: 'u1', refreshToken: 'r1', remember: false }, now);
  const long = newSession({ userId: 'u1', refreshToken: 'r2', remember: true }, now);
  assert.equal(short.session.expires, now + SESSION_MS);
  assert.equal(long.session.expires, now + REMEMBER_MS);
  assert.ok(!JSON.stringify(long.session).includes(long.token), 'el token local no se guarda, solo su hash');
  const all = [short.session, long.session];
  assert.equal(sessionFor(all, long.token, now)?.refreshToken, 'r2');
  assert.equal(sessionFor(all, short.token, now + SESSION_MS + 1), null);
  assert.equal(sessionFor(all, long.token, now + SESSION_MS + 1)?.userId, 'u1');
  assert.equal(sessionFor(all, 'otro', now), null);
  assert.equal(sessionFor(all, '', now), null);
  // las del inicio de sesión local anterior (sin refresh token) se descartan
  assert.equal(liveSessions([{ hash: 'h', userId: 'x', expires: now + 1 }], now).length, 0);
});
