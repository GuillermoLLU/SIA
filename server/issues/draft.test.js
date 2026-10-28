import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanFields, cleanFile, MAX_FILE } from './draft.js';

test('los cuatro campos, como texto; lo demás fuera', () => {
  assert.deepEqual(cleanFields({ note: 'n', what: 3, extra: 'x' }), { note: 'n', what: '3', how: '', prevent: '' });
  assert.equal(cleanFields({ note: 'a'.repeat(30_000) }).note.length, 20_000);
});

test('el adjunto: con nombre sin rutas, no vacío y de hasta 10 MB', () => {
  const f = cleanFile({ name: '../c:\\cola.png', type: 'image/png', data: Buffer.from('hola').toString('base64') });
  assert.deepEqual([f.name, f.type, f.data.toString()], ['.._c:_cola.png', 'image/png', 'hola']);
  assert.throws(() => cleanFile({ name: 'x.png' }), { status: 400, message: 'Falta el archivo.' });
  assert.throws(() => cleanFile({ name: '', data: 'aG9sYQ==' }), { status: 400 });
  assert.throws(() => cleanFile({ name: 'x', data: '====' }), { message: 'El archivo está vacío.' });
  assert.throws(() => cleanFile({ name: 'x', data: Buffer.alloc(MAX_FILE + 1).toString('base64') }), { status: 400, message: /10 MB/ });
});
