import { test } from 'node:test';
import assert from 'node:assert/strict';
import { answerable, instant, complete, answersOf, answerMap } from './ask.js';

const q = (extra = {}) => ({ question: '¿?', header: '', multi: false, options: [{ label: 'a' }, { label: 'b' }, { label: 'c' }], ...extra });

test('las respuestas por pregunta', () => {
  const ask = [{ question: '¿Té o café?', options: [{ label: 'Té' }, { label: 'Café' }] }, { question: '¿Extras?', multi: true, options: [{ label: 'Leche' }, { label: 'Azúcar' }, { label: 'Nada' }] }];
  assert.deepEqual(answerMap(ask, [[1], [0, 1]]), { '¿Té o café?': 'Café', '¿Extras?': 'Leche, Azúcar' });
});

test('desde la tarjeta: de 1 a 4 preguntas, todas con opciones; con un clic, solo una de una respuesta', () => {
  assert.equal(answerable([q()]), true);
  assert.equal(answerable([q(), q({ multi: true })]), true);
  assert.equal(answerable([q({ options: [] })]), false);
  assert.equal(answerable([q(), q(), q(), q(), q()]), false);
  assert.equal(answerable(undefined), false);
  assert.equal(instant([q()]), true);
  assert.equal(instant([q({ multi: true })]), false);
  assert.equal(instant([q(), q()]), false);
});

test('contestado del todo: una opción en las de una respuesta, al menos una en las de varias', () => {
  assert.equal(complete([q(), q({ multi: true })], [[1], [0, 2]]), true);
  assert.equal(complete([q(), q({ multi: true })], [[1], []]), false);
  assert.equal(complete([q()], [[0, 1]]), false);
});

test('lo contestado: cada pregunta con su respuesta; si no se entiende, nada', () => {
  assert.deepEqual(answersOf('"¿Qué bebida?"="Café" "¿Qué toppings?"="Leche, Canela"'),
    [{ question: '¿Qué bebida?', answer: 'Café' }, { question: '¿Qué toppings?', answer: 'Leche, Canela' }]);
  assert.deepEqual(answersOf('[Request interrupted by user]'), []);
});
