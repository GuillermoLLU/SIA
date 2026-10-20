import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSkillSync } from './sync.js';

const BASE = { id: 'p-1', name: 'Base', tokens: ['prj-1'] };
const fakeDb = (metas, files) => ({
  from: (t) => ({
    select: () => ({
      eq: async () => ({ data: metas, error: null }),
      order: () => ({ order: () => ({ range: async (a, b) => ({ data: files.slice(a, b + 1), error: null }) }) }),
    }),
  }),
});

const setup = (metas, files, { schema = true } = {}) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sia-sync-'));
  const kept = [];
  const workspace = { skillsDirFor: (b) => path.join(tmp, b.id, 'skills'), keepOnlyBase: (b) => kept.push(b?.id ?? null) };
  let t = 0;
  const log = [];
  const warn = console.warn, info = console.log;
  console.warn = (m) => log.push(m); console.log = (m) => log.push(m);
  const s = createSkillSync({ clientFor: () => fakeDb(metas, files), needsSchema: async () => !schema, workspace, now: () => t });
  return { s, tmp, kept, log, tick: (ms) => { t += ms; }, done: () => { console.warn = warn; console.log = info; fs.rmSync(tmp, { recursive: true, force: true }); } };
};

test('sync: solo las comunes y las de mis proyectos, con el nombre del MCP vigente y rutas seguras', async () => {
  const x = setup([{ id: 'c', scope: null }, { id: 'mine', scope: 'prj-1' }, { id: 'other', scope: 'prj-2' }],
    [{ skill_id: 'c', path: 'SKILL.md', content: 'usa ITX-knowledge' }, { skill_id: 'mine', path: 'phases/1.md', content: 'm' }, { skill_id: 'mine', path: '../evil', content: 'e' }, { skill_id: 'other', path: 'SKILL.md', content: 'o' }]);
  await x.s.sync(BASE);
  const dir = path.join(x.tmp, 'p-1', 'skills');
  assert.equal(fs.readFileSync(path.join(dir, 'c', 'SKILL.md'), 'utf8'), 'usa knowledge');
  assert.equal(fs.readFileSync(path.join(dir, 'mine', 'phases', '1.md'), 'utf8'), 'm');
  assert.deepEqual(fs.readdirSync(dir).sort(), ['c', 'mine']);
  assert.match(x.log.at(-1), /2 skills, 2 ficheros/);
  x.done();
});

test('sync: sin skills en la base se conserva la copia; sin esquema no se toca; maybe respeta el minuto', async () => {
  const x = setup([], []);
  fs.mkdirSync(path.join(x.tmp, 'p-1', 'skills', 'local'), { recursive: true });
  await x.s.sync(BASE);
  assert.ok(fs.existsSync(path.join(x.tmp, 'p-1', 'skills', 'local')));
  x.s.maybe(BASE);
  assert.equal(x.log.length, 1, 'acaba de sincronizar: no repite');
  x.tick(61_000); x.s.maybe(BASE);
  await new Promise((r) => setImmediate(r));
  assert.equal(x.log.length, 2);
  x.done();
  const y = setup([{ id: 'c', scope: null }], [], { schema: false });
  await y.s.sync(BASE);
  assert.match(y.log[0], /necesita el SQL/);
  y.done();
});

test('switchTo: deja solo la base nueva y la trae', async () => {
  const x = setup([{ id: 'c', scope: null }], [{ skill_id: 'c', path: 'SKILL.md', content: 'c' }]);
  await x.s.switchTo(BASE);
  assert.deepEqual(x.kept, ['p-1']);
  assert.ok(fs.existsSync(path.join(x.tmp, 'p-1', 'skills', 'c', 'SKILL.md')));
  await x.s.switchTo(null);
  assert.deepEqual(x.kept, ['p-1', null]);
  x.done();
});
