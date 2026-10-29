import test from 'node:test';
import assert from 'node:assert/strict';
import { pickLauncher, chatPlan, tabLabel } from './start.js';

const LAUNCHERS = [{ id: 'claude', label: 'Claude', available: true }, { id: 'copilot', label: 'Copilot', available: false }];
const PROJECTS = [{ id: 5, name: 'SISU' }, { id: 6, name: 'SGA' }];

test('el chat: Claude, conocimiento autónomo y todo lo que la persona ve', () => {
  const p = chatPlan({ launchers: LAUNCHERS, projects: PROJECTS });
  assert.equal(p.launcher.id, 'claude');
  assert.equal(p.knowledge, 'auto');
  assert.deepEqual(p.projects, [5, 6]);
  assert.deepEqual(chatPlan({ launchers: LAUNCHERS }).projects, [], 'sin proyectos se abre igual, sin conocimiento');
});

test('sin Claude, un motivo claro', () => {
  assert.match(pickLauncher([]).error, /no está configurado/);
  assert.match(pickLauncher([{ id: 'claude', available: false }]).error, /no está instalado/);
  assert.match(chatPlan({ launchers: [], projects: PROJECTS }).error, /no está configurado/);
});

test('la pestaña se llama como la pregunta, recortada por palabra', () => {
  assert.equal(tabLabel('¿Qué hace la PDA?', 'Claude'), '¿Qué hace la PDA?');
  assert.equal(tabLabel('\n\n  primera   línea \nsegunda', 'Claude'), 'primera línea');
  assert.equal(tabLabel('Explícame cómo funciona el proceso de expedición', 'Claude'), 'Explícame cómo funciona el…');
  assert.equal(tabLabel('a'.repeat(40), 'Claude'), `${'a'.repeat(28)}…`);
  assert.equal(tabLabel('   ', 'Claude'), 'Claude');
  assert.equal(tabLabel(null, 'Claude'), 'Claude');
});
