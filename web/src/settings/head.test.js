import { test } from 'node:test';
import assert from 'node:assert/strict';
import { headOf } from './head.js';

test('en las cajas: «Configuración» y sin flecha', () => {
  assert.deepEqual(headOf({}), { title: 'Configuración', back: false });
});

test('en una sección, la flecha vuelve a las cajas: «Configuración»', () => {
  assert.deepEqual(headOf({ section: 'equipo', sectionName: 'Equipo' }), { title: 'Configuración', back: true });
});

test('en una pantalla dentro de una sección (una ficha, los roles): el nombre de la sección', () => {
  assert.deepEqual(headOf({ section: 'equipo', sectionName: 'Equipo', full: { parent: 'Equipo' } }), { title: 'Equipo', back: true });
});

test('con el formulario de un enlace encima de una sección: esa sección; encima de las cajas, «Configuración»', () => {
  assert.deepEqual(headOf({ section: 'seguridad', sectionName: 'Seguridad', side: true }), { title: 'Seguridad', back: true });
  assert.deepEqual(headOf({ side: true }), { title: 'Configuración', back: true });
});
