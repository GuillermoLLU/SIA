import test from 'node:test';
import assert from 'node:assert/strict';
import { entries } from './remedy-entries.js';

test('entradas «fecha - quién - texto»; el texto puede llevar guiones y barras', () => {
  const t = '2026-10-06 14:40:00.000 - ANA LOPEZ - Llamada al centro | 2026-10-06 15:10:00.000 - LUIS - Esc. proveedor - ticket X | y más';
  assert.deepEqual(entries(t), [
    { at: '2026-10-06 14:40:00.000', who: 'ANA LOPEZ', text: 'Llamada al centro' },
    { at: '2026-10-06 15:10:00.000', who: 'LUIS', text: 'Esc. proveedor - ticket X | y más' },
  ]);
  assert.deepEqual(entries(''), []);
  assert.deepEqual(entries(null), []);
});
