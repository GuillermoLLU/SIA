import test from 'node:test';
import assert from 'node:assert/strict';
import { periodLabel, calendarHtml } from './period.js';

test('el texto del periodo', () => {
  assert.equal(periodLabel({ from: 0, to: 9 }, 9, 2026), 'Todo 2026');
  assert.equal(periodLabel({ from: 8, to: 8 }, 9, 2026), 'sep');
  assert.equal(periodLabel({ from: 3, to: 6 }, 9, 2026), 'abr – jul');
});

test('calendario: marcados los meses del periodo, o solo el primero elegido; sin datos, no se marcan', () => {
  const marked = (h) => [...h.matchAll(/data-month="(\d+)" class="mt-on"/g)].map((x) => Number(x[1]));
  assert.deepEqual(marked(calendarHtml({ from: 3, to: 5 }, 9, 2026, null)), [3, 4, 5]);
  assert.deepEqual(marked(calendarHtml({ from: 3, to: 5 }, 9, 2026, 7)), [7]);
  assert.equal((calendarHtml({ from: 0, to: 9 }, 9, 2026, null).match(/disabled/g) || []).length, 2);
});
