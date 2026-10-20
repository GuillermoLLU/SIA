import test from 'node:test';
import assert from 'node:assert/strict';
import { noDbClient, fetchAll, createBaseAccess, schemaOk, NO_DB_MSG } from './client.js';

test('schemaOk: la versión del esquema blindado o posterior', () => {
  assert.equal(schemaOk({ version: 2 }), true);
  assert.equal(schemaOk({ version: '3' }), true);
  assert.equal(schemaOk({ version: 1 }), false);
  assert.equal(schemaOk({}), false);
  assert.equal(schemaOk(null), false);
});

test('noDbClient: cualquier cadena de llamadas resuelve con el mismo error', async () => {
  assert.deepEqual(await noDbClient.from('x').select('*').eq('a', 1), { data: null, error: { message: NO_DB_MSG, code: 'NO_DB' }, count: null });
  assert.equal((await noDbClient.rpc('sia_status')).error.code, 'NO_DB');
});

test('fetchAll: pide por tandas de 1000 hasta agotar; un error corta', async () => {
  const rows = Array.from({ length: 2300 }, (_, i) => i);
  const ranges = [];
  const build = () => ({ range: async (a, b) => { ranges.push([a, b]); return { data: rows.slice(a, b + 1), error: null }; } });
  const r = await fetchAll(build);
  assert.equal(r.data.length, 2300);
  assert.deepEqual(ranges, [[0, 999], [1000, 1999], [2000, 2999]]);
  assert.deepEqual(await fetchAll(() => ({ range: async () => ({ data: null, error: { message: 'x' } }) })), { data: null, error: { message: 'x' } });
});

const fakeSupabase = (status, grants = []) => {
  const made = [];
  const createClient = (url, key, opts) => {
    made.push(opts.global.headers);
    return {
      rpc: async () => ({ data: status, error: null }),
      from: () => ({ select: () => ({ in: async () => ({ data: grants, error: null }) }) }),
    };
  };
  return { createClient, made };
};
const BASE = { id: 'p-1', url: 'https://x.supabase.co', key: 'pk', tokens: ['t1'], powerKey: 'pw' };

test('clientFor: un cliente por conexión y cabeceras; permsFor y needsSchema leen sia_status (cacheado 15 s)', async () => {
  let t = 0;
  const { createClient, made } = fakeSupabase({ version: 2, me: { name: 'Ana', owner: false, perms: { lab: true } } });
  const access = createBaseAccess({ createClient, fetch: () => {}, now: () => t });
  assert.equal(access.clientFor(BASE), access.clientFor(BASE));
  assert.notEqual(access.clientFor(BASE), access.clientFor(BASE, 'otra'));
  assert.deepEqual(made[0], { 'x-sia-tokens': 't1', 'x-sia-power': 'pw' });
  assert.deepEqual(await access.permsFor(BASE), { name: 'Ana', owner: false, lab: true, admin: false, links: false });
  assert.equal(await access.needsSchema(BASE), false);
  assert.equal(await access.permsFor({ ...BASE, powerKey: '' }), null, 'sin clave de poder no hay permisos');
  assert.equal(await access.needsSchema(null), true);
});

test('accessibleProjects: la unión de lo que abren los tokens; sin tokens o sin esquema, nada', async () => {
  const grants = [{ project_id: 1, projects: { id: 1, name: 'A' } }, { project_id: 1, projects: { id: 1, name: 'A' } }, { project_id: 2, projects: null }];
  const ok = createBaseAccess({ ...fakeSupabase({ version: 2 }, grants), fetch: () => {} });
  assert.deepEqual(await ok.accessibleProjects(BASE), [{ id: 1, name: 'A' }]);
  assert.deepEqual(await ok.accessibleProjects({ ...BASE, tokens: [] }), []);
  const old = createBaseAccess({ ...fakeSupabase({ version: 1 }, grants), fetch: () => {} });
  assert.deepEqual(await old.accessibleProjects(BASE), []);
});
