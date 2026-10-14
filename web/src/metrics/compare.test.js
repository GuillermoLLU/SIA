import test from 'node:test';
import assert from 'node:assert/strict';
import { compareFigure, verdict } from './compare.js';
import { pct, dur, num, dec } from './format.js';

const figure = (x, y, fmt, better) => compareFigure({ n: 10, v: x }, { n: 10, v: y }, (s) => fmt(s.v), (s) => s.v, better);

test('tiempos: la diferencia en tiempo; al lado, en %', () => {
  assert.deepEqual(figure(10368, 4320, dur, 'low'), { main: '+4 días 5 h', other: '+140 %', cls: 'bad', a: '7 días 5 h', b: '3 días' });
  assert.deepEqual(figure(300, 600, dur, 'low'), { main: '−5 h', other: '−50 %', cls: 'good', a: '5 h', b: '10 h' });
});

test('porcentajes: cuánto más o menos que la otra; al lado, en puntos', () => {
  assert.deepEqual(figure(0.36, 0.58, pct, 'high'), { main: '−38 %', other: '−22,0 pts', cls: 'bad', a: '36 %', b: '58 %' });
});

test('recuentos: en unidades; sin sentido mejor, sin color', () => {
  assert.deepEqual(figure(146, 78, num), { main: '+68', other: '+87 %', cls: '', a: '146', b: '78' });
  assert.deepEqual(figure(1.6, 2.4, dec), { main: '−0,8', other: '−33 %', cls: '', a: '1,6', b: '2,4' });
});

test('iguales al redondeo: «=»; sin dato en una de las dos: null', () => {
  assert.equal(figure(0.5, 0.5, pct, 'high').main, '=');
  assert.equal(compareFigure({ n: 0 }, { n: 3 }, String, () => 1), null);
  assert.equal(compareFigure({ n: 2 }, { n: 3 }, String, (s) => (s.n === 2 ? null : 1)), null);
});

test('verdict: cualquier diferencia cuenta', () => {
  assert.equal(verdict(2, 1), 'bad');
  assert.equal(verdict(2, 1, false), 'good');
  assert.equal(verdict(1, 1), '');
});
