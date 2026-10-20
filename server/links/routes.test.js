import test from 'node:test';
import assert from 'node:assert/strict';
import { linksRoutes } from './routes.js';

const fakeDb = (rows) => {
  let seq = 10;
  const from = () => {
    const q = { filters: [], op: 'select', row: null, single: false };
    const match = () => rows.filter((r) => q.filters.every((f) => f(r)));
    const run = () => {
      if (q.op === 'insert') { const r = { id: ++seq, created_at: 'c', ...q.row }; rows.push(r); return { data: r, error: null }; }
      if (q.op === 'update') { const r = match()[0]; Object.assign(r, q.row); return { data: r, error: null }; }
      if (q.op === 'delete') { const gone = match(); gone.forEach((g) => rows.splice(rows.indexOf(g), 1)); return { data: null, error: null }; }
      const data = match();
      return q.single ? { data: data[0] || null, error: null } : { data, error: null };
    };
    const api = {
      select: () => api, order: () => api, single: () => { q.single = true; return api; }, maybeSingle: () => { q.single = true; return api; },
      insert: (r) => { q.op = 'insert'; q.row = r; return api; }, update: (r) => { q.op = 'update'; q.row = r; return api; }, delete: () => { q.op = 'delete'; return api; },
      eq: (k, v) => { q.filters.push((r) => String(r[k]) === String(v)); return api; }, in: (k, vs) => { q.filters.push((r) => vs.includes(r[k])); return api; },
      then: (res, rej) => Promise.resolve(run()).then(res, rej),
    };
    return api;
  };
  return { from };
};

const setup = ({ perms = { links: true }, projects = [{ id: 1 }] } = {}) => {
  const rows = [{ id: 1, project_id: 1, title: 'Jira', url: 'https://j', image: null, notes: 'n', created_at: 'c' }, { id: 2, project_id: 2, title: 'Otro', url: 'https://o', image: null, notes: null, created_at: 'c' }];
  const route = linksRoutes({ json: (res, status, body) => Object.assign(res, { status, body }), readBody: async (req) => req.body || {} });
  return { rows, call: async (method, path, body) => { const res = {}; await route({ method, body }, res, path, { db: fakeDb(rows), perms, projects }); return res; } };
};

test('GET: solo los enlaces de mis proyectos; sin proyectos, ninguno', async () => {
  assert.deepEqual((await setup().call('GET', [])).body.map((l) => l.id), [1]);
  assert.deepEqual((await setup({ projects: [] }).call('GET', [])).body, []);
});

test('escribir exige el permiso links y el proyecto dentro del techo', async () => {
  const s = setup();
  assert.equal((await s.call('POST', [], { project_id: 2, title: 'x', url: 'https://x' })).status, 403);
  assert.equal((await s.call('POST', [], { project_id: 1, title: '', url: 'https://x' })).status, 400);
  const r = await s.call('POST', [], { project_id: 1, title: 'Nuevo', url: 'https://n' });
  assert.equal(r.body.title, 'Nuevo');
  assert.equal(s.rows.length, 3);
  assert.equal((await setup({ perms: { links: false } }).call('POST', [], { project_id: 1, title: 'x', url: 'https://x' })).status, 403);
});

test('PUT parcial conserva lo que no viene; DELETE solo lo mío', async () => {
  const s = setup();
  const r = await s.call('PUT', ['1'], { title: 'Jira 2' });
  assert.equal(r.body.title, 'Jira 2');
  assert.equal(r.body.notes, 'n');
  assert.equal((await s.call('PUT', ['2'], { title: 'x' })).status, 403);
  assert.equal((await s.call('PUT', ['1'], { project_id: 2 })).status, 403);
  assert.equal((await s.call('DELETE', ['2'])).status, 403);
  assert.equal((await s.call('DELETE', ['9'])).status, 404);
  assert.deepEqual((await s.call('DELETE', ['1'])).body, { ok: true });
  assert.equal(s.rows.length, 1);
});
