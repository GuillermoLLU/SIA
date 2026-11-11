import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, themeById, toggledTheme } from './themes.js';

test('ids únicos y todos los colores en hexadecimal', () => {
  assert.equal(new Set(THEMES.map((t) => t.id)).size, THEMES.length);
  for (const t of THEMES) for (const v of Object.values(t.ui)) assert.match(v, /^#[0-9a-f]{6}$/i, `${t.id}`);
});

test('themeById: uno desconocido da el claro', () => {
  assert.equal(themeById('dark').id, 'dark');
  assert.equal(themeById('nord').id, 'light');
});

test('toggledTheme: el otro tema', () => {
  assert.equal(toggledTheme('light').id, 'dark');
  assert.equal(toggledTheme('dark').id, 'light');
  assert.equal(toggledTheme('nord').id, 'dark');
});
