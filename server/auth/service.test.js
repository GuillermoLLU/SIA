import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAuth } from './service.js';
import { PlatformError } from '../platform/client.js';

const ADMIN = { id: 'u-admin', email: 'admin@empresa.com', name: 'Admin', role: 'admin' };

// Supabase de mentira: una persona, refresh tokens que rotan y contadores.
const fakePlatform = () => {
  const p = {
    calls: { signIn: 0, refresh: 0, whoami: 0, signOut: 0 },
    active: true, down: false, clock: { t: 1_000_000 },
    async signIn(email, password) {
      p.calls.signIn++;
      if (p.down) throw new PlatformError(503, 'Sin conexión con la base de la instancia.');
      if (email !== 'admin@empresa.com' || password !== 'Clave-Buena-2026!') throw new PlatformError(400, 'Email o contraseña incorrectos.');
      return { accessToken: 'at1', refreshToken: 'r1', expiresAt: p.clock.t + 3_600_000 };
    },
    async refresh() {
      p.calls.refresh++;
      if (p.down) throw new PlatformError(503, 'Sin conexión con la base de la instancia.');
      await new Promise((r) => setTimeout(r, 5));
      return { accessToken: `at${p.calls.refresh + 1}`, refreshToken: `r${p.calls.refresh + 1}`, expiresAt: p.clock.t + 3_600_000 };
    },
    async rpc(jwt, fn) {
      assert.equal(fn, 'platform_whoami');
      p.calls.whoami++;
      if (p.down) throw new PlatformError(503, 'Sin conexión con la base de la instancia.');
      if (!p.active) throw new PlatformError(403, 'Sesión no válida o cuenta desactivada.');
      return ADMIN;
    },
    async signOut() { p.calls.signOut++; },
  };
  return p;
};

const setup = () => {
  let cfg = {};
  const platform = fakePlatform();
  const auth = createAuth({ platform, readConfig: () => cfg, writeConfig: (c) => { cfg = c; }, now: () => platform.clock.t });
  return { auth, platform, cfg: () => cfg };
};

test('login: el perfil sale de la base; con «Mantener la sesión» se guarda el refresh token, nunca el JWT', async () => {
  const { auth, cfg } = setup();
  const r = await auth.login(' Admin@Empresa.com ', 'Clave-Buena-2026!', true);
  assert.deepEqual(r.user, ADMIN);
  const stored = JSON.stringify(cfg().sessions);
  assert.ok(stored.includes('r1') && !stored.includes('at1') && !stored.includes(r.token));
  assert.deepEqual((await auth.context(r.token)).user, ADMIN);
  const short = await auth.login('admin@empresa.com', 'Clave-Buena-2026!', false);
  assert.equal(cfg().sessions.length, 1, 'sin marcar, solo en memoria');
  assert.ok(await auth.context(short.token));
});

test('login: credenciales malas, cuenta desactivada y freno tras cinco fallos', async () => {
  const { auth, platform } = setup();
  assert.equal((await auth.login('admin@empresa.com', 'mala', false)).error, 'Email o contraseña incorrectos.');
  platform.active = false;
  assert.match((await auth.login('admin@empresa.com', 'Clave-Buena-2026!', false)).error, /desactivada/);
  assert.equal(platform.calls.signOut, 1, 'la sesión de Supabase de un desactivado se cierra');
  platform.active = true;
  for (let i = 0; i < 2; i++) await auth.login('admin@empresa.com', 'mala', false);
  assert.deepEqual(await auth.login('admin@empresa.com', 'mala', false), { wait: 30 });
  assert.equal((await auth.login('admin@empresa.com', 'Clave-Buena-2026!', false)).wait, 30);
  platform.clock.t += 30_000;
  assert.ok((await auth.login('admin@empresa.com', 'Clave-Buena-2026!', false)).token);
});

test('login: si la base no responde no cuenta como fallo, se avisa', async () => {
  const { auth, platform } = setup();
  platform.down = true;
  await assert.rejects(auth.login('admin@empresa.com', 'Clave-Buena-2026!', false), { status: 503 });
});

test('context: renueva el JWT antes de caducar, guarda el refresh rotado y no renueva dos veces a la vez', async () => {
  const { auth, platform, cfg } = setup();
  const { token } = await auth.login('admin@empresa.com', 'Clave-Buena-2026!', true);
  platform.clock.t += 3_600_000 - 30_000; // a 30 s de caducar
  const [a, b] = await Promise.all([auth.context(token), auth.context(token)]);
  assert.equal(platform.calls.refresh, 1);
  assert.equal(a.accessToken, 'at2');
  assert.equal(b.accessToken, 'at2');
  assert.equal(cfg().sessions[0].refreshToken, 'r2', 'el refresh token nuevo queda guardado');
});

test('context: el perfil se revisa cada minuto; desactivado o revocado, la sesión cae', async () => {
  const { auth, platform, cfg } = setup();
  const { token } = await auth.login('admin@empresa.com', 'Clave-Buena-2026!', true);
  const before = platform.calls.whoami;
  await auth.context(token);
  assert.equal(platform.calls.whoami, before, 'dentro del minuto: sin preguntar');
  platform.clock.t += 61_000;
  platform.active = false;
  assert.equal(await auth.context(token), null);
  assert.equal(cfg().sessions.length, 0, 'y se borra');
  assert.equal(await auth.context(token), null);
});

test('context fresh: al abrir la app se pregunta siempre, aunque esté dentro del minuto', async () => {
  const { auth, platform } = setup();
  const { token } = await auth.login('admin@empresa.com', 'Clave-Buena-2026!', true);
  platform.active = false; // lo desactivan justo después
  assert.ok(await auth.context(token), 'sin fresh, dentro del minuto: lo último conocido');
  assert.equal(await auth.context(token, { fresh: true }), null, 'con fresh: ya no entra');
});

test('context: con la base caída se sigue con lo último conocido mientras el JWT valga', async () => {
  const { auth, platform } = setup();
  const { token } = await auth.login('admin@empresa.com', 'Clave-Buena-2026!', false);
  platform.clock.t += 61_000;
  platform.down = true;
  assert.deepEqual((await auth.context(token)).user, ADMIN);
  platform.clock.t += 3_600_000;
  await assert.rejects(auth.context(token), { status: 503 });
});

test('logout: cierra la sesión de Supabase y la local', async () => {
  const { auth, platform, cfg } = setup();
  const { token } = await auth.login('admin@empresa.com', 'Clave-Buena-2026!', true);
  await auth.logout(token);
  assert.equal(platform.calls.signOut, 1);
  assert.equal(cfg().sessions.length, 0);
  assert.equal(await auth.context(token), null);
});
