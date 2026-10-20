import test from 'node:test';
import assert from 'node:assert/strict';
import { launchPlan } from './chooser.js';

test('un proyecto (o ninguno): se abre directo con lo que hay; varios: a elegir fuentes', () => {
  assert.deepEqual(launchPlan([{ id: 'a' }]), { step: 'launch', projects: ['a'] });
  assert.deepEqual(launchPlan([]), { step: 'launch', projects: [] });
  assert.deepEqual(launchPlan([{ id: 'a' }, { id: 'b' }]), { step: 'sources' });
});
