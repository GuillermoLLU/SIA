import test from 'node:test';
import assert from 'node:assert/strict';
import { searchIssues } from './search.js';

const issue = (id, modified, o = {}) => ({ id, center: '101020', text: `Issue ${id}`, priority: 'MEDIUM', status: 'IN_PROGRESS', reason: '', prio: false, sisu: false, reported: '2026-11-01 10:00', modified, resolved: '', notes: 'no va', worklog: [], ...o });
const ISSUES = [
  issue('INC000027680871', '2026-11-10 12:00'),
  issue('INC000027680016', '2026-11-17 09:00'),
  issue('INC000012768000', '2026-11-16 09:00'),
  issue('INC000027701233', '2026-11-17 10:00'),
];
const CLAIMS = [{ issue_id: 'INC000027680016', user_name: 'glucia' }];

test('por el número entero o un trozo: primero la exacta, luego las que terminan así, luego las que lo contienen; a igualdad, la más reciente', () => {
  assert.deepEqual(searchIssues(ISSUES, CLAIMS, 'INC000027680016').map((r) => r.id), ['INC000027680016'], 'la exacta, y ninguna más');
  assert.deepEqual(searchIssues(ISSUES, CLAIMS, '27680016').map((r) => r.id), ['INC000027680016'], 'sin el prefijo ni los ceros');
  assert.deepEqual(searchIssues(ISSUES, CLAIMS, '0016').map((r) => r.id), ['INC000027680016'], 'por el final, como se dicta por teléfono');
  assert.deepEqual(searchIssues(ISSUES, CLAIMS, '2768').map((r) => r.id), ['INC000027680016', 'INC000012768000', 'INC000027680871'], 'contienen: la más reciente primero');
  assert.deepEqual(searchIssues(ISSUES, CLAIMS, 'inc 2768-0871').map((r) => r.id), ['INC000027680871'], 'solo cuentan las cifras');
});

test('en breve, con quién la tiene en SIA; sin lo largo de la issue', () => {
  const [r] = searchIssues(ISSUES, CLAIMS, '27680016');
  assert.deepEqual([r.id, r.text, r.center, r.status, r.holder], ['INC000027680016', 'Issue INC000027680016', '101020', 'IN_PROGRESS', 'glucia']);
  assert.equal(r.notes, undefined);
  assert.equal(r.worklog, undefined);
  assert.equal(searchIssues(ISSUES, CLAIMS, '27680871')[0].holder, null, 'sin coger en SIA');
});

test('con menos de cuatro cifras, nada; y como mucho ocho', () => {
  assert.deepEqual(searchIssues(ISSUES, CLAIMS, '276'), []);
  assert.deepEqual(searchIssues(ISSUES, CLAIMS, ''), []);
  assert.deepEqual(searchIssues(ISSUES, CLAIMS, null), []);
  const many = Array.from({ length: 12 }, (_, k) => issue(`INC00009999${String(k).padStart(4, '0')}`, `2026-11-${String(k + 1).padStart(2, '0')} 10:00`));
  assert.equal(searchIssues(many, [], '9999').length, 8);
});
