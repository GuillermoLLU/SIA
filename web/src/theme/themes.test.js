import test from 'node:test';
import assert from 'node:assert/strict';
import { THEMES, themeById, toggledTheme, modeOf } from './themes.js';

test('ids únicos y todos los colores en hexadecimal', () => {
  assert.equal(new Set(THEMES.map((t) => t.id)).size, THEMES.length);
  for (const t of THEMES) for (const v of Object.values(t.ui)) assert.match(v, /^#[0-9a-f]{6}$/i, `${t.id}`);
});

test('themeById: uno desconocido da SIA Claro', () => {
  assert.equal(themeById('nord').label, 'Nord');
  assert.equal(themeById('mocha-viejo').id, 'light');
});

test('el interruptor va al preferido del otro modo, o al de SIA', () => {
  assert.equal(toggledTheme('light').id, 'dark');
  assert.equal(toggledTheme('dark').id, 'light');
  assert.equal(toggledTheme('github-light', { dark: 'dracula' }).id, 'dracula');
  assert.equal(toggledTheme('dracula', { light: 'latte' }).id, 'latte');
  assert.equal(toggledTheme('light', { dark: 'latte' }).id, 'dark', 'un preferido del otro modo no vale');
  assert.equal(modeOf(themeById('gruvbox')), 'dark');
});
