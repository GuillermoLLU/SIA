import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newSession, liveSessions, sessionFor } from './sessions.js';

const H12 = 12 * 60 * 60 * 1000, D30 = 30 * 24 * 60 * 60 * 1000;

test('sesiones: «Mantener la sesión» dura más; caducadas y sin refresh token no valen', () => {
  const now = 1_000_000;
  const short = newSession({ userId: 'u1', refreshToken: 'r1', remember: false }, now);
  const long = newSession({ userId: 'u1', refreshToken: 'r2', remember: true }, now);
  assert.equal(short.session.expires, now + H12);
  assert.equal(long.session.expires, now + D30);
  assert.ok(!JSON.stringify(long.session).includes(long.token), 'el token local no se guarda, solo su hash');
  const all = [short.session, long.session];
  assert.equal(sessionFor(all, long.token, now)?.refreshToken, 'r2');
  assert.equal(sessionFor(all, short.token, now + H12 + 1), null);
  assert.equal(sessionFor(all, long.token, now + H12 + 1)?.userId, 'u1');
  assert.equal(sessionFor(all, 'otro', now), null);
  assert.equal(sessionFor(all, '', now), null);
  // las del inicio de sesión local anterior (sin refresh token) se descartan
  assert.equal(liveSessions([{ hash: 'h', userId: 'x', expires: now + 1 }], now).length, 0);
});
