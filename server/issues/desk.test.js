import test from 'node:test';
import assert from 'node:assert/strict';
import { sameName, deskOf, brief } from './desk.js';

test('el nombre en SIA dentro del asignado de Remedy', () => {
  assert.equal(sameName('ANA LOPEZ GARCIA', 'Ana López'), true);
  assert.equal(sameName('ANA MARTIN GARCIA', 'Ana López'), false);
  assert.equal(sameName('ANA LOPEZ GARCIA', 'Ana'), false);
  assert.equal(sameName('', 'Ana López'), false);
});

test('mi mesa: responsable en Remedy o cogida en SIA', () => {
  const issues = [{ id: 'INC1', assignee: 'ANA LOPEZ GARCIA' }, { id: 'INC2', assignee: '' }, { id: 'INC3', assignee: '' }];
  const claims = [{ issue_id: 'INC2', user_id: 'u-ana' }, { issue_id: 'INC3', user_id: 'u-otro' }];
  const desk = deskOf(issues, { id: 'u-ana', name: 'Ana López' }, claims);
  assert.deepEqual(desk.map((i) => [i.id, i.claimed]), [['INC1', false], ['INC2', true]]);
});

test('brief: sin notas ni historial', () => {
  const b = brief({ id: 'INC1', notes: 'largo', changes: [], text: 't' });
  assert.equal(b.notes, undefined);
  assert.equal(b.changes, undefined);
});
