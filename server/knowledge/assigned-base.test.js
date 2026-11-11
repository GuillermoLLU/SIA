import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAssignedBase } from './assigned-base.js';

const URL_A = 'https://aaaaaaaaaaaaaaaaaaaa.supabase.co';
const ROWS = [{ base_id: 'b1', base_name: 'Soporte', url: URL_A, publishable_key: 'sb_publishable_a', power_key: 'pk', group_token: 'tok-sga' }];
const tick = () => new Promise((r) => setImmediate(r));

const setup = ({ views = ['issues'], rows = ROWS, context } = {}) => {
  const log = [];
  const warned = [];
  const assigned = createAssignedBase({
    auth: { context: context || (async (token) => (token ? { user: { id: 'u1', views }, accessToken: `jwt-${token}` } : null)) },
    knowledge: {
      mine: async (jwt) => { log.push(['mine', jwt]); await tick(); return rows; },
      syncPeople: async (jwt, ids) => { log.push(['syncPeople', jwt, ids]); return ['una clave a medias']; },
    },
    onSwitch: async (b) => log.push(['switch', b?.id ?? null]),
    log: { warn: (m) => warned.push(m) },
  });
  return { assigned, log, warned };
};

test('login: carga la base de quien entra y solo avisa si cambia', async () => {
  const { assigned, log } = setup();
  await assigned.login('t1');
  await assigned.login('t1');
  assert.deepEqual(log, [['mine', 'jwt-t1'], ['switch', 'p-b1'], ['mine', 'jwt-t1']]);
  assert.deepEqual(assigned.current().tokens, ['tok-sga']);
});

test('login de quien gestiona Personas: además repasa las claves de todo el equipo, sin esperar', async () => {
  const { assigned, log, warned } = setup({ views: ['people'] });
  await assigned.login('t1');
  await tick();
  assert.deepEqual(log.filter(([k]) => k === 'syncPeople'), [['syncPeople', 'jwt-t1', null]]);
  assert.deepEqual(warned, ['[sia] clave de poder de una persona: una clave a medias']);
});

test('ensure: una sola carga aunque lleguen varias peticiones a la vez, y sin repasar claves', async () => {
  const { assigned, log } = setup({ views: ['people'] });
  await Promise.all([assigned.ensure('t1'), assigned.ensure('t1'), assigned.ensure('t1')]);
  assert.deepEqual(log, [['mine', 'jwt-t1'], ['switch', 'p-b1']]);
  await assigned.ensure('t1');   // acabada la anterior, otra carga
  assert.equal(log.filter(([k]) => k === 'mine').length, 2);
});

test('reload: vuelve a leer la base de quien llama; sin sesión válida, nada', async () => {
  const { assigned, log } = setup();
  await assigned.reload(undefined);
  assert.deepEqual(log, []);
  await assigned.reload('t2');
  assert.deepEqual(log, [['mine', 'jwt-t2'], ['switch', 'p-b1']]);
});

test('sin base asignada se queda en null; clear la quita siempre', async () => {
  const { assigned, log } = setup({ rows: [] });
  await assigned.login('t1');
  assert.equal(assigned.current(), null);
  assert.deepEqual(log, [['mine', 'jwt-t1']]);
  await assigned.clear();
  assert.deepEqual(log.at(-1), ['switch', null]);
});

test('un fallo al cargar va al registro y no rompe nada', async () => {
  const { assigned, warned } = setup({ context: async () => { throw new Error('la base no responde'); } });
  await assigned.ensure('t1');
  assert.equal(assigned.current(), null);
  assert.deepEqual(warned, ['[sia] no se pudo cargar el conocimiento asignado: la base no responde']);
});
