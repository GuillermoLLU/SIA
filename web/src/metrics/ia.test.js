import test from 'node:test';
import assert from 'node:assert/strict';
import { iaKind, iaStats, iaUse, IA_OK, IA_FAIL, IA_UNREVIEWED, IA_NONE } from './ia.js';

test('cómo sale una issue según sus marcas de IA', () => {
  assert.equal(iaKind(0), IA_NONE);
  assert.equal(iaKind(1 | 512), IA_NONE);              // otras marcas, sin IA
  assert.equal(iaKind(2048), IA_UNREVIEWED);           // intervención de IA, sin revisión
  assert.equal(iaKind(32), IA_UNREVIEWED);             // IA_SOLVED sin revisión
  assert.equal(iaKind(2048 | 4096), IA_OK);            // revisión humana OK
  assert.equal(iaKind(2048 | 4096 | 64), IA_FAIL);     // el fallo pesa más que la revisión OK
  assert.equal(iaKind(8192), IA_FAIL);
});

// 6 issues: 1 y 2 de Ana (OK y fallo), 3 de Luis (sin revisar, IA_SOLVED), 4 de Luis sin IA, 5 sin responsable con IA,
// 6 de Eva sin IA
const C = { fl: [0, 2048 | 4096, 64, 32, 0, 2048, 0], as: [0, 1, 1, 2, 2, 0, 3] };

test('las cifras de IA de una lista', () => {
  const s = iaStats([1, 2, 3, 4, 5, 6], C);
  assert.deepEqual({ n: s.n, ia: s.ia, solved: s.solved, ok: s.ok, fail: s.fail, unrev: s.unrev, users: s.users, people: s.people },
    { n: 6, ia: 4, solved: 1, ok: 1, fail: 1, unrev: 2, users: 2, people: 3 });
  assert.equal(s.share, 4 / 6);
  assert.equal(s.okShare, 0.25);
  assert.equal(s.unrevShare, 0.5);
});

test('sin issues con IA, los repartos no tienen dato', () => {
  const s = iaStats([4, 6], C);
  assert.equal(s.ia, 0);
  assert.equal(s.share, 0);
  assert.equal(s.okShare, null);
  assert.equal(iaStats([], C).share, null);
});

test('las personas según qué parte de lo suyo lleva IA', () => {
  const people = [{ ia: 0, share: 0 }, { ia: 1, share: 0.02 }, { ia: 3, share: 0.1 }, { ia: 6, share: 0.15 }, { ia: 10, share: 0.4 }];
  const u = iaUse(people);
  assert.deepEqual(u.map((x) => x.c), [1, 1, 1, 2]);
  assert.deepEqual(u.map((x) => x.ia), [0, 1, 3, 16]);
  assert.ok(u.every((x) => x.n === 5 && x.all === 20));
});
