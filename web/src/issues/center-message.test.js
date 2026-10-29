import test from 'node:test';
import assert from 'node:assert/strict';
import { centerMessage } from './center-message.js';

const v = { what: 'Se paró la cola', how: 'Se relanzó', prevent: 'Corrección pedida' };
const greet = (lang, hour) => centerMessage(v, { lang, hour })[0];

test('en español: saludo, los tres textos tal cual y despedida, sin presentación ni firma', () => {
  assert.deepEqual(centerMessage(v, { hour: 10 }), [
    'Buenos días:', 'Se paró la cola', 'Se relanzó', 'Corrección pedida', 'Un saludo.',
  ]);
});

test('en inglés, con la misma estructura', () => {
  assert.deepEqual(centerMessage(v, { lang: 'en', hour: 15 }), [
    'Good afternoon,', 'Se paró la cola', 'Se relanzó', 'Corrección pedida', 'Kind regards.',
  ]);
});

test('el saludo, por tramos de la hora del técnico', () => {
  assert.deepEqual([5, 6, 13, 14, 20, 21, 0].map((h) => greet('es', h)),
    ['Buenas noches:', 'Buenos días:', 'Buenos días:', 'Buenas tardes:', 'Buenas tardes:', 'Buenas noches:', 'Buenas noches:']);
  assert.deepEqual([5, 6, 11, 12, 17, 18, 0].map((h) => greet('en', h)),
    ['Good evening,', 'Good morning,', 'Good morning,', 'Good afternoon,', 'Good afternoon,', 'Good evening,', 'Good evening,']);
  assert.equal(greet('fr', 10), 'Buenos días:');   // un idioma desconocido, en español
});
