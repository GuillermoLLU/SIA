import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanFields, cleanFile, MAX_FILE, MAX_TEXT } from './draft.js';

test('los cuatro campos y el idioma; lo que falta, vacío y en español; lo demás fuera', () => {
  assert.deepEqual(cleanFields({ note: 'n', what: 'w', extra: 'x' }), { note: 'n', what: 'w', how: '', prevent: '', lang: 'es', step: 1 });
  assert.equal(cleanFields({ lang: 'en' }).lang, 'en');
  assert.equal(cleanFields({ step: '2' }).step, 2);   // del formulario llega como texto
  assert.equal(cleanFields({ note: 'a'.repeat(MAX_TEXT) }).note.length, MAX_TEXT);
});

test('lo forzado desde devtools se rechaza, no se arregla', () => {
  const bad = (body, message) => assert.throws(() => cleanFields(body), { status: 400, ...(message ? { message } : {}) });
  for (const body of [null, 'texto', [1], 7]) bad(body, 'El borrador no es válido.');
  bad({ what: 3 }, 'El borrador no es válido.');
  bad({ note: { $gt: '' } }, 'El borrador no es válido.');
  bad({ note: 'a'.repeat(MAX_TEXT + 1) }, /pasa de 20\.000 caracteres/);
  bad({ lang: 'fr' }, 'Ese idioma no está.');
  bad({ lang: ['es'] }, 'Ese idioma no está.');
  for (const step of ['6', 0, 'x', 1.5]) bad({ step }, 'El borrador no es válido.');
});

test('la imagen: con nombre sin rutas, no vacía, de hasta 15 MB y de tipo imagen', () => {
  const png = { type: 'image/png' };
  const f = cleanFile({ name: '../c:\\cola.png', ...png, data: Buffer.from('hola').toString('base64') });
  assert.deepEqual([f.name, f.type, f.data.toString()], ['.._c:_cola.png', 'image/png', 'hola']);
  assert.throws(() => cleanFile({ name: 'x.png', ...png }), { status: 400, message: 'Falta el archivo.' });
  assert.throws(() => cleanFile({ name: '', ...png, data: 'aG9sYQ==' }), { status: 400 });
  assert.throws(() => cleanFile({ name: 'x', ...png, data: '' }), { message: 'Falta el archivo.' });
  assert.throws(() => cleanFile({ name: 'x', ...png, data: '==' }), { message: 'El archivo no ha llegado bien.' });
  assert.throws(() => cleanFile({ name: 'x', ...png, data: Buffer.alloc(MAX_FILE + 1).toString('base64') }), { status: 400, message: /15 MB/ });
  assert.equal(cleanFile({ name: 'x', ...png, data: Buffer.alloc(MAX_FILE).toString('base64') }).data.length, MAX_FILE);   // justo 15 MB, sí
  // lo que no es imagen no entra
  for (const type of [undefined, '', 'text/plain', 'application/pdf']) assert.throws(() => cleanFile({ name: 'a.txt', type, data: 'aG9sYQ==' }), { status: 400, message: 'Solo se adjuntan imágenes.' });
});

test('el adjunto forzado: ni ejecutables, ni base64 roto, ni nombres con trampa, ni tipos inventados', () => {
  const data = Buffer.from('hola').toString('base64');
  for (const name of ['virus.exe', 'a.BAT', 'x.ps1', 'f.js', 'acceso.lnk']) assert.throws(() => cleanFile({ name, data }), { status: 400, message: /ejecutable/ });
  for (const d of ['no es base64!', 'aG9sYQ', 'aG9s YQ==']) assert.throws(() => cleanFile({ name: 'a.txt', data: d }), { status: 400, message: 'El archivo no ha llegado bien.' });
  assert.throws(() => cleanFile(null), { status: 400 });
  assert.throws(() => cleanFile({ name: 'a.txt', data: 7 }), { status: 400 });
  // el carácter que da la vuelta al texto («gpj.exe» se vería «exe.jpg»), los de control y los invisibles: 400, no se arreglan
  for (const name of ['foto‮gpj.exe', 'a\u0000b.txt', 'a\nb.txt', ' ​ ']) assert.throws(() => cleanFile({ name, data }), { status: 400, message: /caracteres ocultos/ });
  // el tipo, solo si tiene forma de tipo (y de imagen)
  assert.throws(() => cleanFile({ name: 'a.png', type: 'image/png"><script>', data }), { message: 'Solo se adjuntan imágenes.' });
  assert.throws(() => cleanFile({ name: 'a.png', type: { a: 1 }, data }), { message: 'Solo se adjuntan imágenes.' });
});
