import test from 'node:test';
import assert from 'node:assert/strict';
import { createProjects, projectName } from './service.js';

// Base en memoria con lo justo del cliente de Supabase que usa el servicio.
const fakeDb = (tables, { failOn = null } = {}) => {
  let seq = 100;
  const from = (t) => {
    const q = { t, filters: [], op: 'select', row: null };
    const rows = () => tables[t].filter((r) => q.filters.every((f) => f(r)));
    const run = () => {
      if (failOn === `${q.op}:${t}`) return { data: null, error: { message: `falla ${q.op} ${t}` } };
      if (q.op === 'insert') { const r = { id: ++seq, ...q.row }; tables[t].push(r); return { data: q.single ? r : [r], error: null }; }
      if (q.op === 'delete') { const gone = rows(); tables[t] = tables[t].filter((r) => !gone.includes(r)); return { data: gone, error: null }; }
      return { data: rows(), error: null };
    };
    const api = {
      select: () => api, order: () => api, range: () => api,
      insert: (row) => { q.op = 'insert'; q.row = row; return api; },
      delete: () => { q.op = 'delete'; return api; },
      eq: (k, v) => { q.filters.push((r) => r[k] === v); return api; },
      in: (k, vs) => { q.filters.push((r) => vs.includes(r[k])); return api; },
      single: () => { q.single = true; return api; },
      then: (res, rej) => Promise.resolve(run()).then(res, rej),
    };
    return api;
  };
  return { from };
};
const empty = () => ({ projects: [], contexts: [], context_entries: [], context_chunks: [], access_groups: [], access_grants: [] });
const svc = createProjects({ newId: () => 'u1', fetchAll: (build) => build() });

test('projectName: de 1 a 80 caracteres', () => {
  assert.equal(projectName('  SGA '), 'SGA');
  assert.throws(() => projectName(' '), { status: 400 });
  assert.throws(() => projectName('x'.repeat(81)), { status: 400 });
});

test('create: proyecto con su propio token, un único grant y su contexto', async () => {
  const t = empty();
  const p = await svc.create(fakeDb(t), 'SGA');
  assert.deepEqual(p, { id: p.id, name: 'SGA', entries: 0 });
  assert.deepEqual(t.access_groups.map((g) => [g.token, g.name]), [['prj-u1', 'SGA']]);
  assert.deepEqual(t.access_grants.map((g) => [g.token, g.project_id]), [['prj-u1', p.id]]);
  assert.equal(t.contexts[0].project_id, p.id);
});

test('create: si falla a medias, no deja nada', async () => {
  const t = empty();
  await assert.rejects(svc.create(fakeDb(t, { failOn: 'insert:access_grants' }), 'SGA'), { status: 500 });
  assert.deepEqual([t.projects.length, t.access_groups.length], [0, 0]);
});

test('list: cada proyecto con sus entradas', async () => {
  const t = { ...empty(), projects: [{ id: 1, name: 'SGA' }, { id: 2, name: 'SISU' }], contexts: [{ id: 10, project_id: 1 }], context_entries: [{ id: 1, context_id: 10 }, { id: 2, context_id: 10 }] };
  assert.deepEqual(await svc.list(fakeDb(t)), [{ id: 1, name: 'SGA', entries: 2 }, { id: 2, name: 'SISU', entries: 0 }]);
});

test('remove: se va el proyecto y su token', async () => {
  const t = { ...empty(), projects: [{ id: 1, name: 'SGA' }], access_groups: [{ token: 'prj-a', name: 'SGA' }], access_grants: [{ token: 'prj-a', project_id: 1 }] };
  await svc.remove(fakeDb(t), 1);
  assert.deepEqual([t.projects.length, t.access_groups.length], [0, 0]);
});

test('entries: las de los contextos del proyecto; removeEntry borra la entrada y sus trozos', async () => {
  const t = { ...empty(), contexts: [{ id: 10, project_id: 1 }, { id: 11, project_id: 2 }], context_entries: [{ id: 1, context_id: 10, content: 'a' }, { id: 2, context_id: 11, content: 'b' }], context_chunks: [{ id: 5, entry_id: 1 }] };
  assert.deepEqual((await svc.entries(fakeDb(t), 1)).map((e) => e.id), [1]);
  assert.deepEqual(await svc.entries(fakeDb(t), 9), []);
  await svc.removeEntry(fakeDb(t), 1);
  assert.deepEqual([t.context_entries.length, t.context_chunks.length], [1, 0]);
});
