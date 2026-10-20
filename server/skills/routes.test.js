import test from 'node:test';
import assert from 'node:assert/strict';
import { skillsRoutes } from './routes.js';

// Lo justo del cliente de la base: skills, skill_files y access_groups en memoria.
const fakeDb = (tables) => {
  const from = (t) => {
    const q = { filters: [], op: 'select', row: null, single: false };
    const rows = () => tables[t].filter((r) => q.filters.every((f) => f(r)));
    const run = () => {
      if (q.op === 'upsert') { const i = tables[t].findIndex((r) => r.id === q.row.id); if (i >= 0) tables[t][i] = q.row; else tables[t].push(q.row); return { data: null, error: null }; }
      if (q.op === 'insert') { tables[t].push(...q.row); return { data: null, error: null }; }
      if (q.op === 'delete') { const gone = rows(); tables[t] = tables[t].filter((r) => !gone.includes(r)); return { data: null, error: null }; }
      const data = rows();
      if (q.single) return data.length ? { data: data[0], error: null } : { data: null, error: q.must ? { message: 'no hay' } : null };
      return { data, error: null };
    };
    const api = {
      select: () => api, order: () => api,
      upsert: (row) => { q.op = 'upsert'; q.row = row; return api; },
      insert: (rows_) => { q.op = 'insert'; q.row = rows_; return api; },
      delete: () => { q.op = 'delete'; return api; },
      eq: (k, v) => { q.filters.push((r) => r[k] === v); return api; },
      maybeSingle: () => { q.single = true; return api; },
      single: () => { q.single = true; q.must = true; return api; },
      then: (res, rej) => Promise.resolve(run()).then(res, rej),
    };
    return api;
  };
  return { from };
};

const setup = ({ perms = { lab: true, owner: false }, tokens = ['prj-1'] } = {}) => {
  const tables = { skills: [{ id: 'comun', scope: null }, { id: 'mia', scope: 'prj-1' }, { id: 'ajena', scope: 'prj-2' }], skill_files: [{ skill_id: 'mia', path: 'SKILL.md', content: 'x' }], access_groups: [{ token: 'prj-1', name: 'Uno' }, { token: 'prj-2', name: 'Dos' }] };
  const synced = [];
  const store = {};
  const drafts = { list: () => Object.keys(store), read: (id) => (store[id] ? { id, files: store[id] } : null), write: (id, f) => { store[id] = f; }, remove: (id) => { delete store[id]; } };
  const route = skillsRoutes({ json: (res, status, body) => Object.assign(res, { status, body }), readBody: async (req) => req.body || {}, sync: { sync: async (b) => synced.push(b?.id) }, drafts, workspace: { skillsDirFor: () => '/no/existe/' + Math.random() } });
  const call = async (method, path, body) => { const res = {}; await route({ method, body }, res, path, { db: fakeDb(tables), base: { id: 'p-1', tokens }, perms }); return res; };
  return { call, tables, synced, store };
};

test('groups y skills: solo lo de mis proyectos; el dueño, todo con nombres', async () => {
  const s = setup();
  assert.deepEqual((await s.call('GET', ['groups'])).body, [{ token: 'prj-1', name: 'Uno' }]);
  assert.deepEqual((await s.call('GET', ['skills'])).body, [{ id: 'mia', scope: 'prj-1', scopeName: 'Uno' }]);
  const owner = setup({ perms: { lab: true, owner: true } });
  assert.deepEqual((await owner.call('GET', ['skills'])).body.map((x) => x.scopeName), [null, 'Uno', 'Dos']);
  assert.deepEqual((await s.call('GET', ['skills', 'mia'])).body, { id: 'mia', scope: 'prj-1', files: [{ skill_id: 'mia', path: 'SKILL.md', content: 'x' }] });
  assert.equal((await s.call('GET', ['skills', 'nada'])).status, 404);
});

test('publicar: valida, las comunes solo el dueño, guarda y sincroniza', async () => {
  const s = setup();
  assert.equal((await s.call('POST', ['skills', 'publish'], { id: 'x', files: [] })).status, 400);
  assert.equal((await s.call('POST', ['skills', 'publish'], { id: 'nueva', files: [{ path: 'SKILL.md', content: '' }] })).status, 403, 'sin proyecto es común');
  assert.equal((await s.call('POST', ['skills', 'publish'], { id: 'comun', scope: 'prj-1', files: [{ path: 'SKILL.md', content: '' }] })).status, 403, 'ya era común');
  assert.equal((await s.call('POST', ['skills', 'publish'], { id: 'nueva', scope: 'prj-1', files: [{ path: 'a.md', content: '' }] })).status, 400, 'falta SKILL.md');
  const r = await s.call('POST', ['skills', 'publish'], { id: 'nueva', scope: 'prj-1', files: [{ path: 'SKILL.md', content: '---\ncommandLabel: Nueva\n---' }, { path: 'phases/1.md', content: 'p' }] });
  assert.deepEqual(r.body, { ok: true, id: 'nueva', files: 2 });
  const saved = s.tables.skills.find((x) => x.id === 'nueva');
  assert.equal(saved.label, 'Nueva');
  assert.equal(saved.scope, 'prj-1');
  assert.equal(s.tables.skill_files.filter((f) => f.skill_id === 'nueva').length, 2);
  assert.deepEqual(s.synced, ['p-1']);
});

test('borrar: id válido, las comunes solo el dueño; sin permiso lab, nada de escribir', async () => {
  const s = setup();
  assert.equal((await s.call('DELETE', ['skills', 'a;b'])).status, 400);
  assert.equal((await s.call('DELETE', ['skills', 'comun'])).status, 403);
  assert.deepEqual((await s.call('DELETE', ['skills', 'mia'])).body, { ok: true, deleted: 'mia' });
  assert.equal(s.tables.skills.some((x) => x.id === 'mia'), false);
  const noLab = setup({ perms: { lab: false } });
  assert.equal((await noLab.call('DELETE', ['skills', 'mia'])).status, 403);
  assert.equal((await noLab.call('GET', ['drafts'])).status, 403);
  assert.equal((await noLab.call('GET', ['skills'])).status, 200, 'leer sí');
});

test('borradores: listar, guardar, leer y borrar', async () => {
  const s = setup();
  assert.deepEqual((await s.call('GET', ['drafts'])).body, []);
  assert.equal((await s.call('PUT', ['drafts', 'mal id'], { files: [] })).status, 400);
  assert.equal((await s.call('PUT', ['drafts', 'b1'], { files: [] })).status, 400);
  assert.deepEqual((await s.call('PUT', ['drafts', 'b1'], { files: [{ path: 'SKILL.md', content: 'x' }] })).body, { ok: true });
  assert.deepEqual((await s.call('GET', ['drafts', 'b1'])).body, { id: 'b1', files: [{ path: 'SKILL.md', content: 'x' }] });
  assert.equal((await s.call('GET', ['drafts', 'b2'])).status, 404);
  await s.call('DELETE', ['drafts', 'b1']);
  assert.deepEqual(s.store, {});
});
