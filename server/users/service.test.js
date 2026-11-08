import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createUserAdmin } from './service.js';

// Plataforma de mentira que apunta qué se le pide.
const recorder = () => {
  const log = [];
  return {
    log,
    platform: {
      rpc: async (jwt, fn, args) => {
        log.push(['rpc', jwt, fn, args]);
        if (fn === 'platform_list_users') return [{ id: 'u1' }];
        if (fn === 'platform_list_rules') return [{ id: 'r-b', name: 'Regla básica', criteria: ['age'], builtin: true }, { id: 'r-u', name: 'Urgencias', criteria: ['severity'], builtin: false }];
        return null;
      },
      users: async (jwt, body) => { log.push(['fn', jwt, body]); return body.action === 'create' ? { user: { id: 'u2', email: body.email } } : { ok: true }; },
    },
  };
};

test('listar y dar de alta van con el JWT de quien lo pide', async () => {
  const { log, platform } = recorder();
  const users = createUserAdmin({ platform });
  assert.deepEqual(await users.list('jwt-a'), [{ id: 'u1' }]);
  assert.deepEqual(await users.create('jwt-a', { email: 'ana@x.com', name: 'Ana', password: 'p', role: 'r1' }), { id: 'u2', email: 'ana@x.com' });
  assert.deepEqual(log, [
    ['rpc', 'jwt-a', 'platform_list_users', undefined],
    ['fn', 'jwt-a', { action: 'create', email: 'ana@x.com', name: 'Ana', password: 'p', role: 'r1' }],
  ]);
});

test('editar manda a la base solo lo que cambia, y la contraseña a la función', async () => {
  const { log, platform } = recorder();
  const users = createUserAdmin({ platform });
  await users.update('jwt', 'u1', { active: false });
  await users.update('jwt', 'u1', { password: 'Nueva-2026!xx' });
  await users.update('jwt', 'u1', { name: 'Ana', role: 'r1', password: '' });
  await users.update('jwt', 'u1', { rule: 'r-u' });
  assert.deepEqual(log, [
    ['rpc', 'jwt', 'platform_update_user', { p_user: 'u1', p_active: false }],
    ['fn', 'jwt', { action: 'set_password', id: 'u1', password: 'Nueva-2026!xx' }],
    ['rpc', 'jwt', 'platform_update_user', { p_user: 'u1', p_name: 'Ana', p_role: 'r1' }],
    ['rpc', 'jwt', 'platform_update_user', { p_user: 'u1', p_rule: 'r-u' }],
  ]);
});

test('las reglas de priorización, en breve, para elegir la de cada rol y cada persona', async () => {
  const { platform } = recorder();
  assert.deepEqual(await createUserAdmin({ platform }).rules('jwt'), [{ id: 'r-b', label: 'Regla básica', builtin: true }, { id: 'r-u', label: 'Urgencias', builtin: false }]);
});

test('borrar va por la función', async () => {
  const { log, platform } = recorder();
  await createUserAdmin({ platform }).remove('jwt', 'u1');
  assert.deepEqual(log, [['fn', 'jwt', { action: 'delete', id: 'u1' }]]);
});

test('roles: listar, guardar (crear o cambiar) y borrar, con el JWT de quien lo pide', async () => {
  const { log, platform } = recorder();
  const users = createUserAdmin({ platform });
  await users.roles('jwt');
  await users.saveRole('jwt', null, { name: 'Supervisor', views: ['lab'] });
  await users.saveRole('jwt', 'r1', { name: 'Supervisión', views: ['people'], rule: 'r-u' });
  await users.removeRole('jwt', 'r1');
  assert.deepEqual(log.map((l) => [l[2], l[3]]), [
    ['platform_list_roles', undefined],
    ['platform_save_role', { p_role: null, p_name: 'Supervisor', p_views: ['lab'], p_rule: null }],
    ['platform_save_role', { p_role: 'r1', p_name: 'Supervisión', p_views: ['people'], p_rule: 'r-u' }],
    ['platform_delete_role', { p_role: 'r1' }],
  ]);
});
