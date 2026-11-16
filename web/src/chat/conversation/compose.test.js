import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageOf, sends, escapes, escTwice, ESC_TWICE_MS, appendText, withFiles, isImageName, fileExt } from './compose.js';

test('se manda el texto tal cual, sin el final en blanco; vacío, nada', () => {
  assert.equal(messageOf('hola  \n'), 'hola');
  assert.equal(messageOf('uno\ndos'), 'uno\ndos');
  assert.equal(messageOf('   \n '), null);
});

test('Enter envía; Shift+Enter y Enter componiendo un acento, no', () => {
  assert.equal(sends({ key: 'Enter' }), true);
  assert.equal(sends({ key: 'Enter', shiftKey: true }), false);
  assert.equal(sends({ key: 'Enter', isComposing: true }), false);
  assert.equal(sends({ key: 'a' }), false);
});

test('añadir algo a lo escrito, con un espacio de por medio', () => {
  assert.equal(appendText('', 'hola '), 'hola ');
  assert.equal(appendText('mira', 'esto'), 'mira esto');
  assert.equal(appendText('mira ', 'esto'), 'mira esto');
  assert.equal(appendText('igual', ''), 'igual');
});

test('los adjuntos van detrás del texto, cada uno en su línea; solo adjuntos también vale', () => {
  assert.equal(withFiles('mira esto', ['/u/uploads/1-a.png', '/u/uploads/2-b.pdf']), 'mira esto\n/u/uploads/1-a.png\n/u/uploads/2-b.pdf');
  assert.equal(withFiles(null, ['/u/uploads/1-a.png']), '/u/uploads/1-a.png');
  assert.equal(withFiles('hola', []), 'hola');
});

test('imagen o fichero, y su extensión para la ficha', () => {
  assert.equal(isImageName('1-foto.PNG'), true);
  assert.equal(isImageName('informe.pdf'), false);
  assert.equal(isImageName(undefined), false);
  assert.equal(fileExt('informe.pdf'), 'PDF');
  assert.equal(fileExt('sin'), 'SIN');
  assert.equal(fileExt(''), 'FILE');
});

test('Esc dos veces seguidas vacía la caja; una sola o separadas, no', () => {
  assert.equal(escapes({ key: 'Escape' }), true);
  assert.equal(escapes({ key: 'Escape', isComposing: true }), false);
  assert.equal(escapes({ key: 'Enter' }), false);
  assert.equal(escTwice(null, 1000), false);
  assert.equal(escTwice(1000, 1000 + ESC_TWICE_MS), true);
  assert.equal(escTwice(1000, 1000 + ESC_TWICE_MS + 1), false);
});
