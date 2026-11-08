import { test } from 'node:test';
import assert from 'node:assert/strict';
import { originOf, knowsOrigin, forGroups, originArg } from './origin.js';

const sga = { id: 'INC1', sisu: false }, sisu = { id: 'INC2', sisu: true };

test('originOf: SISU si viene de SISU, SGA si no', () => {
  assert.equal(originOf(sisu), 'SISU');
  assert.equal(originOf(sga), 'SGA');
});

test('knowsOrigin: con un proyecto de ese nombre, sin importar mayúsculas; sin lista, no se filtra', () => {
  assert.equal(knowsOrigin(['SISU'], sisu), true);
  assert.equal(knowsOrigin(['SISU'], sga), false);
  assert.equal(knowsOrigin([' sga '], sga), true);
  assert.equal(knowsOrigin([], sga), false);
  assert.equal(knowsOrigin(undefined, sga), true);
});

test('forGroups: solo lo de sus orígenes', () => {
  assert.deepEqual(forGroups([sga, sisu], ['SISU']).map((i) => i.id), ['INC2']);
  assert.deepEqual(forGroups([sga, sisu], ['SGA', 'SISU']).map((i) => i.id), ['INC1', 'INC2']);
});

test('originArg: el origen para la base, de la issue de la foto; si ya no está, sin origen', () => {
  assert.deepEqual(originArg([sga, sisu], 'INC2'), { p_origin: 'SISU' });
  assert.deepEqual(originArg([sga, sisu], 'INC9'), {});
});
