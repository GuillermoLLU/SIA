import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPlatformClient, PlatformError } from './client.js';
import { parsePlatformConfig } from './config.js';

const URL = 'https://abcdefghijklmnopqrst.supabase.co';
const KEY = 'sb_publishable_abc';

// fetch de mentira: apunta la petición y responde lo que se le diga.
const fakeFetch = (status, body) => {
  const calls = [];
  const fetch = async (url, init) => { calls.push({ url, ...init, headers: init.headers }); return { ok: status < 400, status, text: async () => (body === undefined ? '' : JSON.stringify(body)) }; };
  return { calls, fetch };
};

test('signIn: email y contraseña a Supabase Auth con la publishable; devuelve los tokens', async () => {
  const { calls, fetch } = fakeFetch(200, { access_token: 'at', refresh_token: 'rt', expires_in: 3600 });
  const t = await createPlatformClient({ url: URL, key: KEY, fetch }).signIn('a@b.com', 'pw');
  assert.equal(calls[0].url, `${URL}/auth/v1/token?grant_type=password`);
  assert.equal(calls[0].headers.apikey, KEY);
  assert.equal(calls[0].headers.Authorization, undefined);
  assert.deepEqual(JSON.parse(calls[0].body), { email: 'a@b.com', password: 'pw' });
  assert.equal(t.accessToken, 'at');
  assert.equal(t.refreshToken, 'rt');
  assert.ok(t.expiresAt > Date.now());
});

test('rpc y función: actúan con el JWT de quien llama', async () => {
  const { calls, fetch } = fakeFetch(200, { ok: true });
  const c = createPlatformClient({ url: URL, key: KEY, fetch });
  await c.rpc('jwt', 'platform_whoami');
  await c.users('jwt', { action: 'delete', id: 'x' });
  assert.equal(calls[0].url, `${URL}/rest/v1/rpc/platform_whoami`);
  assert.equal(calls[1].url, `${URL}/functions/v1/sia-users`);
  for (const call of calls) assert.equal(call.headers.Authorization, 'Bearer jwt');
});

test('errores: mensajes en castellano, 42501 como 403 y sin red como 503', async () => {
  const bad = (status, body) => createPlatformClient({ url: URL, key: KEY, fetch: fakeFetch(status, body).fetch });
  await assert.rejects(bad(400, { error_code: 'invalid_credentials', msg: 'Invalid login credentials' }).signIn('a', 'b'),
    (e) => e instanceof PlatformError && e.status === 400 && e.message === 'Email o contraseña incorrectos.');
  await assert.rejects(bad(401, { code: '42501', message: 'Solo un administrador puede hacer esto.' }).rpc('j', 'platform_list_users'),
    { status: 403, message: 'Solo un administrador puede hacer esto.' });
  await assert.rejects(bad(409, { error: 'Ya hay un usuario con ese email.' }).users('j', {}), { status: 409, message: 'Ya hay un usuario con ese email.' });
  const offline = createPlatformClient({ url: URL, key: KEY, fetch: async () => { throw new TypeError('fetch failed'); } });
  await assert.rejects(offline.rpc('j', 'x'), { status: 503 });
  const tls = createPlatformClient({ url: URL, key: KEY, fetch: async () => { throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'SELF_SIGNED_CERT_IN_CHAIN' } }); } });
  await assert.rejects(tls.rpc('j', 'x'), (e) => e.status === 503 && /certificado/.test(e.message));
});

test('config: URL de Supabase y clave publishable; el entorno manda; nada más vale', () => {
  const file = { platform: { url: `${URL}/`, publishableKey: KEY } };
  assert.deepEqual(parsePlatformConfig(file), { url: URL, key: KEY });
  assert.deepEqual(parsePlatformConfig(file, { SIA_PLATFORM_URL: 'https://zzzzzzzzzzzzzzzzzzzz.supabase.co' }).url, 'https://zzzzzzzzzzzzzzzzzzzz.supabase.co');
  assert.equal(parsePlatformConfig({ platform: { url: URL, publishableKey: 'sb_secret_x' } }), null, 'nunca la secret');
  assert.equal(parsePlatformConfig({ platform: { url: 'https://evil.com', publishableKey: KEY } }), null);
  assert.equal(parsePlatformConfig(null), null);
});
