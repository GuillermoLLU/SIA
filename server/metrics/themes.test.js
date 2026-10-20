import test from 'node:test';
import assert from 'node:assert/strict';
import { readTitle, problemKey, THEME_NAMES } from './themes.js';

const themes = (problem) => readTitle(`100001 High X - ${problem}`).themes;
const has = (mask, name) => !!(mask & (1 << THEME_NAMES.indexOf(name)));

test('temas: varios a la vez; el aviso automático, solo el suyo', () => {
  assert.equal(readTitle('100001 High incidencia ruta y/o etiqueta del pedido').themes, 1);
  const m = themes('etiqueta mal impresa en packing');
  assert.ok(has(m, 'Etiquetas e impresión'));
  assert.ok(has(m, 'Packing y empaquetado'));
  assert.equal(themes('nada que ver'), 0);
});

test('el problema es lo que va tras « - »; los temas se buscan solo ahí, no en la cabecera del centro', () => {
  const t = readTitle(' 100632 Low ECOM ZARA POLONIA STRYKOW PACKING - [TEC] Error etiqueta 12. ');
  assert.equal(t.problem, '[tec] error etiqueta #');
  assert.ok(has(t.themes, 'Etiquetas e impresión'));
  assert.ok(!has(t.themes, 'Packing y empaquetado'));
  assert.deepEqual(readTitle('100632 Low ECOM ZARA PACKING'), { problem: '', themes: 0 });   // sin descripción
  assert.equal(readTitle('No arranca la PDA').problem, 'no arranca la pda');                   // sin cabecera: todo
  assert.deepEqual(readTitle('100001 High INCIDENCIA RUTA Y/O ETIQUETA: pedido #3'), { problem: 'pedido ##', themes: 1 });
});

test('problema: sin etiquetas entre corchetes y en singular, para juntar las formas de escribir lo mismo', () => {
  assert.equal(problemKey('[tec] error etiquetas'), problemKey('error etiqueta'));
  assert.equal(problemKey('cancelar pedidos'), problemKey('cancelar pedido'));
  assert.notEqual(problemKey('permisos de usuario sisu'), problemKey('permisos de usuario'));
  assert.equal(problemKey('[pos]'), '');
});
