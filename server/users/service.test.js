import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUserAdmin } from './service.js';

// Plataforma de mentira que apunta qué se le pide.
const recorder = () => {
  const log = [];
  return {
    log,
    platform: {
      rpc: async (jwt, fn, args) => { log.push(['rpc', jwt, fn, args]); return fn === 'platform_list_users' ? [{ id: 'u1' }] : null; },
      users: async (jwt, body) => { log.push(['fn', jwt, body]); return body.action === 'create' ? { user: { id: 'u2', email: body.email } } : { ok: true }; },
    },
  };
};

test('listar y dar de alta van con el JWT de quien lo pide', async () => {
  const { log, platform } = recorder();
  const users = createUserAdmin({ platform });
  assert.deepEqual(await users.list('jwt-a'), [{ id: 'u1' }]);
  assert.deepEqual(await users.create('jwt-a', { email: 'ana@x.com', name: 'Ana', password: 'p', role: 'agent' }), { id: 'u2', email: 'ana@x.com' });
  assert.deepEqual(log, [
    ['rpc', 'jwt-a', 'platform_list_users', undefined],
    ['fn', 'jwt-a', { action: 'create', email: 'ana@x.com', name: 'Ana', password: 'p', role: 'agent' }],
  ]);
});

test('editar manda a la base solo lo que cambia, y la contraseña a la función', async () => {
  const { log, platform } = recorder();
  const users = createUserAdmin({ platform });
  await users.update('jwt', 'u1', { active: false });
  await users.update('jwt', 'u1', { password: 'Nueva-2026!xx' });
  await users.update('jwt', 'u1', { name: 'Ana', role: 'admin', password: '' });
  assert.deepEqual(log, [
    ['rpc', 'jwt', 'platform_update_user', { p_user: 'u1', p_active: false }],
    ['fn', 'jwt', { action: 'set_password', id: 'u1', password: 'Nueva-2026!xx' }],
    ['rpc', 'jwt', 'platform_update_user', { p_user: 'u1', p_name: 'Ana', p_role: 'admin' }],
  ]);
});

test('borrar va por la función', async () => {
  const { log, platform } = recorder();
  await createUserAdmin({ platform }).remove('jwt', 'u1');
  assert.deepEqual(log, [['fn', 'jwt', { action: 'delete', id: 'u1' }]]);
});
