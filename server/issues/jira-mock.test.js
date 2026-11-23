import test from 'node:test';
import assert from 'node:assert/strict';
import { createJiraMock } from './jira-mock.js';

test('el Jira de prueba: lo del fichero y, lo demás, abierto', async () => {
  const fs = { readFileSync: () => JSON.stringify({ 'SISUPAC-1': { state: 'resolved', at: '2026-11-17 08:00' } }) };
  const states = await createJiraMock({ file: 'jira-prueba.json', fs }).states(['SISUPAC-1', 'SISUPAC-2']);
  assert.deepEqual([...states], [['SISUPAC-1', { state: 'resolved', at: '2026-11-17 08:00' }], ['SISUPAC-2', { state: 'open' }]]);
});

test('el Jira de prueba: sin fichero, todo abierto', async () => {
  const fs = { readFileSync: () => { throw new Error('ENOENT'); } };
  assert.deepEqual([...(await createJiraMock({ file: 'x', fs }).states(['SISUPAC-1']))], [['SISUPAC-1', { state: 'open' }]]);
});
