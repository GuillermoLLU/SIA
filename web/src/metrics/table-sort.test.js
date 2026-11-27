import test from 'node:test';
import assert from 'node:assert/strict';
import { cellValue, orderOf, nextDir } from './table-sort.js';

test('Ordenar tablas: las celdas se leen como se pintan (números, %, puntos, horas, meses; vacías, null)', () => {
  assert.equal(cellValue('1.234'), 1234);
  assert.equal(cellValue(' 12,5 % '), 12.5);
  assert.equal(cellValue('+3 pts'), 3);
  assert.equal(cellValue('−2,1 h'), -126);
  assert.equal(cellValue('45 min'), 45);
  assert.equal(cellValue('2 d'), 2880);
  assert.equal(cellValue('1,5 h'), 90);
  assert.equal(cellValue('80 h'), 4800);
  assert.equal(cellValue('ene 2026') < cellValue('feb 2026'), true);
  assert.equal(cellValue('dic 2025') < cellValue('ene 2026'), true);
  assert.equal(cellValue('Indra'), 'Indra');
  assert.equal(cellValue('80 h ↓'), 4800);   // con la flecha del orden
  for (const v of ['', '—', '  ', null]) assert.equal(cellValue(v), null);
});

test('Ordenar tablas: números como números, texto como texto, vacíos siempre al final; sin orden, como venían', () => {
  const v = [10, null, 2, 30, 2];
  assert.deepEqual(orderOf(v, -1), [3, 0, 2, 4, 1]);   // de mayor a menor; los empates, como venían
  assert.deepEqual(orderOf(v, 1), [2, 4, 0, 3, 1]);
  assert.deepEqual(orderOf(v, 0), [0, 1, 2, 3, 4]);
  assert.deepEqual(orderOf(['Ñu', 'abeto', null, 'Zeta', 'Ábaco'], 1), [4, 1, 0, 3, 2]);
  assert.deepEqual(orderOf(['módulo 10', 'módulo 9'], 1), [1, 0]);
  // una columna de cifras con algún texto suelto: manda lo numérico y el texto va con los vacíos
  assert.deepEqual(orderOf([5, 'n/d', 7], -1), [2, 0, 1]);
});

test('Ordenar tablas: el primer clic, de mayor a menor (texto, A→Z); el segundo, al revés; el tercero, como venía', () => {
  assert.equal(nextDir(null, true), -1); assert.equal(nextDir(-1, true), 1); assert.equal(nextDir(1, true), 0);
  assert.equal(nextDir(null, false), 1); assert.equal(nextDir(1, false), -1); assert.equal(nextDir(-1, false), 0);
  assert.equal(nextDir(0, true), -1);
});

test('Ordenar tablas: las fechas «dd/mm/aaaa hh:mm», por fecha y hora (no como texto)', () => {
  const v = ['12/08/2026 14:35', '03/09/2026 09:00', '12/08/2026 09:10', '01/12/2025 23:59'].map(cellValue);
  assert.ok(v.every((x) => typeof x === 'number'));
  assert.deepEqual(orderOf(v, 1), [3, 2, 0, 1]);
  assert.equal(cellValue('03/09/2026') < cellValue('12/08/2027'), true);
});
