import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextTuck, TUCK_PX } from './dock.js';

test('subir seguido más de TUCK_PX esconde; abajo del todo enseña', () => {
  let st = { tucked: false, climbed: 0 };
  st = nextTuck({ d: -20, atBottom: false, ...st });
  assert.deepEqual(st, { tucked: false, climbed: 20 });
  st = nextTuck({ d: -20, atBottom: false, ...st });
  assert.equal(st.tucked, true);
  assert.equal(st.climbed, 40);
  assert.ok(40 > TUCK_PX);
  st = nextTuck({ d: 300, atBottom: true, ...st });
  assert.deepEqual(st, { tucked: false, climbed: 0 });
});

test('bajar reinicia lo subido y no enseña por sí solo', () => {
  const tucked = { tucked: true, climbed: 50 };
  assert.deepEqual(nextTuck({ d: 30, atBottom: false, ...tucked }), { tucked: true, climbed: 0 });
  assert.deepEqual(nextTuck({ d: 0, atBottom: false, ...tucked }), tucked);
});
