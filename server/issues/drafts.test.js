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
const TEXT = { note: 'n', what: 'w', how: 'h', prevent: 'p', lang: 'en', step: 2 };

const IMG = (name) => ({ name, type: 'image/png', data: Buffer.from('hola') });

test('texto e imágenes, por persona e issue, y se recupera al volver a abrir', () => {
  const { file, drafts } = open();
  assert.equal(drafts.get('u1', 'INC1'), null);
  assert.equal(drafts.setText('u1', 'INC1', TEXT), '2026-10-28T15:20:00.000Z');
  assert.deepEqual(drafts.addImage('u1', 'INC1', IMG('cola.png')), { at: '2026-10-28T15:20:01.000Z', n: 1 });
  assert.deepEqual(drafts.addImage('u1', 'INC1', IMG('stock.png')), { at: '2026-10-28T15:20:02.000Z', n: 2 });
  drafts.close();
  const again = createResolveDrafts({ DatabaseSync, file, fs });
  assert.deepEqual(again.get('u1', 'INC1'), { at: '2026-10-28T15:20:02.000Z', ...TEXT, images: [{ n: 1, name: 'cola.png', type: 'image/png', size: 4 }, { n: 2, name: 'stock.png', type: 'image/png', size: 4 }] });
  assert.deepEqual(again.getImage('u1', 'INC1', 2), { name: 'stock.png', type: 'image/png', data: new Uint8Array(Buffer.from('hola')) });
  assert.equal(again.getImage('u1', 'INC1', 3), null);
  assert.equal(again.get('u2', 'INC1'), null);
  again.close();
});

test('una imagen se puede guardar antes que el texto; quitar una no renumera las demás; al descartar se va todo', () => {
  const { drafts } = open();
  drafts.addImage('u1', 'INC1', IMG('a.png'));
  assert.deepEqual(drafts.get('u1', 'INC1').images, [{ n: 1, name: 'a.png', type: 'image/png', size: 4 }]);
  drafts.setText('u1', 'INC1', TEXT);
  drafts.addImage('u1', 'INC1', IMG('b.png'));
  assert.equal(drafts.dropImage('u1', 'INC1', 1), '2026-10-28T15:20:03.000Z');
  assert.deepEqual(drafts.get('u1', 'INC1').images.map((i) => i.n), [2]);
  assert.equal(drafts.addImage('u1', 'INC1', IMG('c.png')).n, 3);   // el 1 no se reutiliza: [imagen1] ya no significa nada
  assert.equal(drafts.get('u1', 'INC1').note, 'n');
  drafts.drop('u1', 'INC1');
  assert.equal(drafts.get('u1', 'INC1'), null);
  assert.equal(drafts.getImage('u1', 'INC1', 2), null);
  drafts.close();
});

test('una BBDD de antes del idioma y del paso se migra sin perder lo guardado', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'sia-drafts-')), 'b.sqlite');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE resolve_drafts (user_id TEXT NOT NULL, issue_id TEXT NOT NULL, at TEXT NOT NULL,
    note TEXT, what TEXT, how TEXT, prevent TEXT, file_name TEXT, file_type TEXT, file_data BLOB, PRIMARY KEY (user_id, issue_id));
    PRAGMA user_version = 1;
    INSERT INTO resolve_drafts (user_id, issue_id, at, note, file_name, file_type, file_data) VALUES ('u1', 'INC1', 'x', 'antes', 'cola.png', 'image/png', X'686F6C61');`);
  old.close();
  const drafts = createResolveDrafts({ DatabaseSync, file, fs });
  assert.deepEqual([drafts.get('u1', 'INC1').note, drafts.get('u1', 'INC1').lang, drafts.get('u1', 'INC1').step], ['antes', 'es', 1]);
  assert.deepEqual(drafts.get('u1', 'INC1').images, [{ n: 1, name: 'cola.png', type: 'image/png', size: 4 }]);   // el adjunto de antes, como imagen 1
  drafts.close();
  createResolveDrafts({ DatabaseSync, file, fs }).close();   // la segunda vez no vuelve a migrar
});

test('quitar una imagen que no hay no crea un borrador ni le cambia la fecha', () => {
  const { drafts } = open();
  assert.equal(drafts.dropImage('u1', 'INC1', 1), null);
  assert.equal(drafts.get('u1', 'INC1'), null);
  const at = drafts.setText('u1', 'INC1', TEXT);
  assert.equal(drafts.dropImage('u1', 'INC1', 7), at);   // nada que borrar: el borrador sigue como estaba
  drafts.close();
});
