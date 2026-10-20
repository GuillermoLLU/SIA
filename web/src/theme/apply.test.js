import test from 'node:test';
import assert from 'node:assert/strict';
import { uiVars } from './apply.js';

test('uiVars: cada color del tema en su variable CSS', () => {
  assert.deepEqual(uiVars({ bg: '#1', surface: '#2', border: '#3', text: '#4', textLow: '#5', accent: '#6', scrollbar: '#7' }), {
    '--bg': '#1', '--surface': '#2', '--border': '#3', '--text': '#4', '--text-low': '#5', '--accent': '#6', '--scrollbar': '#7',
  });
});
