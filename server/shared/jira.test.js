import test from 'node:test';
import assert from 'node:assert/strict';
import { jiraKey } from './jira.js';

test('la clave de Jira de un ticket de proveedor, la primera que haya', () => {
  assert.deepEqual(jiraKey('TEC: SGAEWMSAP-7037'), { project: 'SGAEWMSAP', key: 'SGAEWMSAP-7037' });
  assert.deepEqual(jiraKey('SISUPAC-9211 y SISUPAC-9300'), { project: 'SISUPAC', key: 'SISUPAC-9211' });
  assert.equal(jiraKey('llamado al proveedor'), null);
  assert.equal(jiraKey(''), null);
  assert.equal(jiraKey(undefined), null);
});
