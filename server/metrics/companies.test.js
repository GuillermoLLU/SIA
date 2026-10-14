import test from 'node:test';
import assert from 'node:assert/strict';
import { loginsOf, companyOf, COMPANY } from './companies.js';

const counts = (o) => new Map(Object.entries(o));

test('usuario de cada persona: el que empieza como su nombre, sin cuentas de sistema', () => {
  const m = loginsOf(new Map([
    ['ÁNGEL RUIZ PEREZ', counts({ 'robot.siglo': 50, OTROUSER: 9, ANGELRP: 2 })],
    ['MARTA GIL', counts({ LUCASM: 8, PACOV: 1 })],
    ['LUIS SANZ', counts({ ITX784_LOGISTIC_SUPPORT: 40, PACOV: 8 })],   // 8 de 48: no basta
    ['PEPE RIOS', counts({ LUCASM: 3, PACOV: 2 })],
    ['', counts({ NADIE: 9 })],
  ]));
  assert.deepEqual([...m], [['ANGELRP', 'ÁNGEL RUIZ PEREZ'], ['LUCASM', 'MARTA GIL']]);
});

test('empresa: sin responsable fuera; Indra por su usuario; el resto, T-Systems', () => {
  assert.equal(companyOf('', []), COMPANY.OUT);
  assert.equal(companyOf('X', ['RICARDOEB']), COMPANY.INDRA);
  assert.equal(companyOf('X', ['OTRO', 'RICARDOEB']), COMPANY.INDRA);
  assert.equal(companyOf('X', ['JOSEMFGOR']), COMPANY.OUT);
  assert.equal(companyOf('X', []), COMPANY.OTHER);
});
