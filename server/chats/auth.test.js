import { test } from 'node:test';
import assert from 'node:assert/strict';
import { looksLikeAuth, authDetail, authItem, authStateItem } from './auth.js';

test('un error que habla de la sesión se reconoce; uno cualquiera, no', () => {
  for (const t of ['Not logged in · Please run /login', 'OAuth token revoked · Please run /login', 'API Error: 401 Unauthorized', 'HTTP status 401', 'Invalid API key', 'Your token has expired', 'Please sign in again']) assert.equal(looksLikeAuth(t), true, t);
  for (const t of ['Rate limit reached', 'API Error: 500', 'El modelo no está disponible', 'Tardó 401 ms', '', null]) assert.equal(looksLikeAuth(t), false, String(t));
});

test('de lo que dijo se quita el «run /login»: en el chat no hay terminal donde hacerlo', () => {
  assert.equal(authDetail('Not logged in · Please run /login'), 'Not logged in');
  assert.equal(authDetail('OAuth token revoked · Please run /login to continue'), 'OAuth token revoked');
  assert.equal(authDetail('Not logged in. Run /login'), 'Not logged in');
  assert.equal(authDetail('401 Unauthorized'), '401 Unauthorized');
  assert.equal(authDetail(null), '');
});

test('las piezas de la tarjeta', () => {
  assert.deepEqual(authItem({ id: 'a1', detail: 'Not logged in · Please run /login', retry: 'hola' }), { kind: 'auth', id: 'a1', detail: 'Not logged in', retry: 'hola', ts: null });
  assert.deepEqual(authItem({ id: 'a2' }), { kind: 'auth', id: 'a2', detail: '', retry: null, ts: null });
  assert.deepEqual(authStateItem('a1', 'ready'), { kind: 'auth-state', id: 'a1', state: 'ready' });
});
