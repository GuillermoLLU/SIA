import { test } from 'node:test';
import assert from 'node:assert/strict';
import { messageOf, sends, escapes, escTwice, ESC_TWICE_MS, appendText, attachMark, insertAt, expandMarks } from './compose.js';

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

test('un adjunto en la caja: una marca corta por clase', () => {
  assert.equal(attachMark('/u/uploads/1-foto.jpg', []), '[Imagen 1]');
  const files = [{ mark: '[Imagen 1]' }, { mark: '[Archivo 1]' }];
  assert.equal(attachMark('/u/uploads/2-otra.PNG', files), '[Imagen 2]');
  assert.equal(attachMark('/u/uploads/3-informe.pdf', files), '[Archivo 2]');
});

test('la marca va donde está el cursor, separada por espacios', () => {
  assert.deepEqual(insertAt('mira esto', 5, 5, '[Imagen 1]'), { text: 'mira [Imagen 1] esto', at: 16 });
  assert.deepEqual(insertAt('mira', 4, 4, '[Imagen 1]'), { text: 'mira [Imagen 1] ', at: 16 });
  assert.deepEqual(insertAt('', 0, 0, '[Imagen 1]'), { text: '[Imagen 1] ', at: 11 });
});

test('al enviar, cada marca es su ruta; la que se borró no va', () => {
  const files = [{ mark: '[Imagen 1]', path: '/u/uploads/1.jpg' }, { mark: '[Imagen 2]', path: '/u/uploads/2.jpg' }];
  assert.equal(expandMarks('mira [Imagen 1] y ya', files), 'mira /u/uploads/1.jpg y ya');
});

test('Esc dos veces seguidas vacía la caja; una sola o separadas, no', () => {
  assert.equal(escapes({ key: 'Escape' }), true);
  assert.equal(escapes({ key: 'Escape', isComposing: true }), false);
  assert.equal(escapes({ key: 'Enter' }), false);
  assert.equal(escTwice(null, 1000), false);
  assert.equal(escTwice(1000, 1000 + ESC_TWICE_MS), true);
  assert.equal(escTwice(1000, 1000 + ESC_TWICE_MS + 1), false);
});
