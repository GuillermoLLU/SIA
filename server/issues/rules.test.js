import test from 'node:test';
import assert from 'node:assert/strict';
import { ruleProblem, loadRules, ruleById } from './rules.js';
import { BASIC_RULE } from './queue.js';

test('una regla vale con nombre y criterios del catálogo, sin repetir', () => {
  assert.equal(ruleProblem({ name: 'Urgencias', criteria: ['severity', 'age'] }), null);
  assert.equal(ruleProblem({ name: '  ', criteria: ['age'] }), 'Ponle un nombre a la regla.');
  assert.equal(ruleProblem({ name: 'x'.repeat(61), criteria: ['age'] }), 'El nombre no puede pasar de 60 caracteres.');
  assert.equal(ruleProblem({ name: 'Urgencias', criteria: [] }), 'Añade al menos un criterio.');
  assert.equal(ruleProblem({ name: 'Urgencias', criteria: ['nope'] }), 'Hay un criterio que no existe.');
  assert.equal(ruleProblem({ name: 'Urgencias', criteria: ['age', 'age'] }), 'Un criterio no se repite.');
  assert.equal(ruleProblem({}), 'Ponle un nombre a la regla.');
});

const platform = (rows) => ({ rpc: async (jwt, fn) => (fn === 'platform_list_rules' ? rows : []) });
const row = (id, name, criteria, builtin = false) => ({ id, name, criteria, builtin });

test('las reglas vienen de la base; sin la básica de serie (SQL sin ejecutar), vale la de código', async () => {
  const fromDb = await loadRules(platform([row('r-basic', 'Regla básica', ['recent', 'prio'], true), row('r-1', 'Urgencias', ['severity'])]), 'jwt');
  assert.deepEqual(fromDb, [{ id: 'r-basic', label: 'Regla básica', criteria: ['recent', 'prio'], builtin: true }, { id: 'r-1', label: 'Urgencias', criteria: ['severity'], builtin: false }]);
  const fallback = await loadRules(platform([row('r-1', 'Urgencias', ['severity'])]), 'jwt');
  assert.deepEqual(fallback.map((r) => r.id), ['basic', 'r-1']);
  assert.equal(fallback[0], BASIC_RULE);
});

test('la regla pedida; si no existe o se pide «basic», la de serie', () => {
  const rules = [{ id: 'r-1', label: 'Urgencias', criteria: ['severity'], builtin: false }, { id: 'r-basic', label: 'Regla básica', criteria: ['age'], builtin: true }];
  assert.equal(ruleById(rules, 'r-1').id, 'r-1');
  assert.equal(ruleById(rules, 'basic').id, 'r-basic');
  assert.equal(ruleById(rules, undefined).id, 'r-basic');
  assert.equal(ruleById([rules[0]], 'nope').id, 'r-1');
});
