import test from 'node:test';
import assert from 'node:assert/strict';
import { assistedPlan } from './assisted.js';

const COPILOT = { available: true };
const PROJECTS = [{ id: 5, name: 'SISU' }, { id: 6, name: 'SGA' }];

test('el plan: conocimiento autónomo y solo el proyecto del origen', () => {
  const p = assistedPlan({ copilot: COPILOT, projects: PROJECTS, origin: 'SISU' });
  assert.equal(p.knowledge, 'auto');
  assert.deepEqual(p.projects, [5]);
  assert.equal(assistedPlan({ copilot: COPILOT, projects: [{ id: 9, name: ' sga ' }], origin: 'SGA' }).projects[0], 9);
});

test('sin Copilot o sin el proyecto del origen, un motivo claro', () => {
  assert.match(assistedPlan({ copilot: { available: false }, projects: PROJECTS, origin: 'SGA' }).error, /no está instalado/);
  assert.match(assistedPlan({ copilot: COPILOT, projects: [PROJECTS[1]], origin: 'SISU' }).error, /conocimiento de SISU/);
});
