import test from 'node:test';
import assert from 'node:assert/strict';
import { firstAttention } from './remedy.js';
import { afterAttention } from './dataset.js';

test('la primera atención: lo primero entre el paso a En curso y la nota [SITUACION INICIAL] (con o sin tilde)', () => {
  assert.equal(firstAttention(300, [], 1000), 300);                                         // solo En curso
  assert.equal(firstAttention(300, [[1100, '[SITUACION INICIAL] no imprime']], 1000), 100);   // la nota, antes
  assert.equal(firstAttention(50, [[1100, '[SITUACIÓN INICIAL]\nno imprime']], 1000), 50);    // En curso, antes
  assert.equal(firstAttention(-1, [[1200, '  [situación inicial] x']], 1000), 200);           // sin En curso, la nota
  assert.equal(firstAttention(-1, [[900, '[SITUACION INICIAL] de antes']], 1000), -1);        // de antes de abrirse, no
  assert.equal(firstAttention(-1, [[1100, 'nota con [SITUACION INICIAL] en medio']], 1000), -1);   // solo al principio
  assert.equal(firstAttention(-1, [], 1000), -1);
});

test('tras la primera atención, lo de Pendiente de proveedor y de cliente; lo de antes, no (es del Tatt)', () => {
  const spans = [[0, 100, 'queue'], [100, 200, 'client'], [200, 300, 'work'], [300, 500, 'vendor'], [500, 600, 'client']];
  // el minuto 0, lunes a las 00:00: en el horario de SISU (desde las 7, minuto 420), lo de proveedor de 7:00 a 8:20 y lo
  // de cliente de 8:20 a 10:00
  assert.deepEqual(afterAttention(spans, 150, 1), { aPv: 200, aPc: 150, aPvw: 80, aPcw: 100 });
  assert.deepEqual(afterAttention(spans, Infinity, 1), { aPv: 0, aPc: 0, aPvw: 0, aPcw: 0 });   // sin atender: todo es Tatt
  assert.deepEqual(afterAttention([[420, 600, 'vendor']], 0, 1), { aPv: 180, aPc: 0, aPvw: 180, aPcw: 0 });   // de 7 a 10, en horario
});
