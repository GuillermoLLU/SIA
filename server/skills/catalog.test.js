import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { skillList, walkDir, createDrafts } from './catalog.js';

test('skillList: una por carpeta con SKILL.md activo; sin carpeta, nada', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sia-skills-'));
  fs.mkdirSync(path.join(dir, 'jira')); fs.writeFileSync(path.join(dir, 'jira', 'SKILL.md'), '---\ncommandLabel: Jira\ncategory: data\n---\n');
  fs.mkdirSync(path.join(dir, 'off')); fs.writeFileSync(path.join(dir, 'off', 'SKILL.md'), '---\nenabled: false\n---\n');
  fs.mkdirSync(path.join(dir, 'vacia'));
  assert.deepEqual(skillList(dir), [{ id: 'jira', label: 'Jira', description: '', category: 'data' }]);
  assert.deepEqual(skillList(path.join(dir, 'no-existe')), []);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('borradores: escribir desde cero, leer con rutas de Unix, listar y borrar', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sia-drafts-'));
  const drafts = createDrafts(path.join(dir, 'lab-drafts'));
  assert.deepEqual(drafts.list(), []);
  drafts.write('mia', [{ path: 'SKILL.md', content: 'a' }, { path: 'phases/01.md', content: 'b' }, { path: 'viejo.md', content: 'v' }]);
  drafts.write('mia', [{ path: 'SKILL.md', content: 'a2' }, { path: 'phases\\01.md', content: 'b' }]);
  assert.deepEqual(drafts.read('mia'), { id: 'mia', files: [{ path: 'SKILL.md', content: 'a2' }, { path: 'phases/01.md', content: 'b' }] });
  assert.deepEqual(drafts.list(), ['mia']);
  assert.equal(drafts.read('otra'), null);
  drafts.remove('mia');
  assert.deepEqual(walkDir(path.join(dir, 'lab-drafts')), []);
  fs.rmSync(dir, { recursive: true, force: true });
});
