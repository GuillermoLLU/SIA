import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { samePath, createWorkspace, MODES } from './workspace.js';

test('samePath: prefijo largo de Windows, barra final y mayúsculas no cuentan', () => {
  assert.equal(samePath('/a/b/', '/a/B'), true);
  assert.equal(samePath('\\\\?\\/a/b', '/a/b'), true);
  assert.equal(samePath('/a/b', '/a/c'), false);
});

test('workspace: los modos con sus instrucciones y el enlace a las skills; la base tiene su rincón', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sia-ws-'));
  const root = path.join(tmp, 'app');
  for (const m of MODES) { fs.mkdirSync(path.join(root, 'workspace', 'modes', m), { recursive: true }); fs.writeFileSync(path.join(root, 'workspace', 'modes', m, 'CLAUDE.md'), `modo ${m} con ITX-knowledge`); }
  const ws = createWorkspace({ root, dir: path.join(tmp, 'ws') });
  for (const m of MODES) {
    assert.equal(fs.readFileSync(path.join(ws.dir, 'modes', m, 'CLAUDE.md'), 'utf8'), `modo ${m} con knowledge`, 'sembrado y con el nombre del MCP vigente');
    assert.ok(samePath(fs.readlinkSync(path.join(ws.dir, 'modes', m, 'skills')), ws.skillsDir));
  }
  assert.equal(ws.modeDirFor('auto', null), path.join(ws.dir, 'modes', 'auto'));
  const base = { id: 'p-1' };
  const d = ws.modeDirFor('demand', base);
  assert.equal(d, path.join(ws.basesDir, 'p-1', 'modes', 'demand'));
  assert.ok(samePath(fs.readlinkSync(path.join(d, 'skills')), ws.skillsDirFor(base)));
  fs.mkdirSync(path.join(ws.basesDir, 'p-2'));
  ws.keepOnlyBase(base);
  assert.deepEqual(fs.readdirSync(ws.basesDir), ['p-1']);
  fs.rmSync(tmp, { recursive: true, force: true });
});
