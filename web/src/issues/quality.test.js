import test from 'node:test';
import assert from 'node:assert/strict';
import { noteQuality, FULL } from './quality.js';

test('cuánto cuenta un texto: se llena con lo escrito, sin contar las imágenes', () => {
  assert.deepEqual(noteQuality(''), { pct: 0, label: 'Sin escribir', level: 'low' });
  assert.deepEqual(noteQuality(null), { pct: 0, label: 'Sin escribir', level: 'low' });
  // cada pregunta al centro cuenta hasta 250: la misma escala, más corta
  assert.deepEqual(noteQuality('x'.repeat(250), FULL.what), { pct: 100, label: 'Completa', level: 'ok' });
  assert.deepEqual([noteQuality('x'.repeat(30), FULL.how).label, noteQuality('x'.repeat(100), FULL.how).label, noteQuality('x'.repeat(200), FULL.how).label], ['Muy corta', 'Corta', 'Bien']);
  assert.deepEqual(noteQuality('Relanzada [imagen1]'), { pct: 2, label: 'Muy corta', level: 'low' });
  assert.deepEqual([noteQuality('x'.repeat(100)).label, noteQuality('x'.repeat(100)).level], ['Corta', 'mid']);
  assert.deepEqual(noteQuality('x'.repeat(200)), { pct: 50, label: 'Bien', level: 'good' });
  assert.deepEqual(noteQuality('x'.repeat(900)), { pct: 100, label: 'Completa', level: 'ok' });
});
