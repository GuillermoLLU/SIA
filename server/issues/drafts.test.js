import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createResolveDrafts } from './drafts.js';

const open = () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sia-drafts-')), 'b.sqlite');
  let t = 0;
  return { file, drafts: createResolveDrafts({ DatabaseSync, file, fs, now: () => new Date(Date.UTC(2026, 9, 28, 15, 20, t++)) }) };
};
const TEXT = { note: 'n', what: 'w', how: 'h', prevent: 'p', lang: 'en' };

test('texto y adjunto, por persona e issue, y se recupera al volver a abrir', () => {
  const { file, drafts } = open();
  assert.equal(drafts.get('u1', 'INC1'), null);
  assert.equal(drafts.setText('u1', 'INC1', TEXT), '2026-10-28T15:20:00.000Z');
  drafts.setFile('u1', 'INC1', { name: 'cola.png', type: 'image/png', data: Buffer.from('hola') });
  drafts.close();
  const again = createResolveDrafts({ DatabaseSync, file, fs });
  assert.deepEqual(again.get('u1', 'INC1'), { at: '2026-10-28T15:20:01.000Z', ...TEXT, file: { name: 'cola.png', type: 'image/png', size: 4 } });
  assert.equal(again.get('u2', 'INC1'), null);
  again.close();
});

test('el adjunto se puede guardar antes que el texto, quitar y, al descartar, se va todo', () => {
  const { drafts } = open();
  drafts.setFile('u1', 'INC1', { name: 'a.txt', type: '', data: Buffer.from('x') });
  assert.deepEqual(drafts.get('u1', 'INC1').file, { name: 'a.txt', type: '', size: 1 });
  drafts.setText('u1', 'INC1', TEXT);
  assert.equal(drafts.get('u1', 'INC1').file.name, 'a.txt');
  drafts.setFile('u1', 'INC1', null);
  assert.equal(drafts.get('u1', 'INC1').file, null);
  assert.equal(drafts.get('u1', 'INC1').note, 'n');
  drafts.drop('u1', 'INC1');
  assert.equal(drafts.get('u1', 'INC1'), null);
  drafts.close();
});

test('una BBDD de antes del idioma se migra sin perder lo guardado', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sia-drafts-')), 'b.sqlite');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE resolve_drafts (user_id TEXT NOT NULL, issue_id TEXT NOT NULL, at TEXT NOT NULL,
    note TEXT, what TEXT, how TEXT, prevent TEXT, file_name TEXT, file_type TEXT, file_data BLOB, PRIMARY KEY (user_id, issue_id));
    PRAGMA user_version = 1;
    INSERT INTO resolve_drafts (user_id, issue_id, at, note) VALUES ('u1', 'INC1', 'x', 'antes');`);
  old.close();
  const drafts = createResolveDrafts({ DatabaseSync, file, fs });
  assert.deepEqual([drafts.get('u1', 'INC1').note, drafts.get('u1', 'INC1').lang], ['antes', 'es']);
  drafts.close();
  createResolveDrafts({ DatabaseSync, file, fs }).close();   // la segunda vez no vuelve a migrar
});
