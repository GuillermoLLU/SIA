import test from 'node:test';
import assert from 'node:assert/strict';
import { fold, norm, key, toCode } from './text.js';

test('sin tildes, para buscar y para agrupar', () => {
  assert.equal(fold('Logística  Ñu'), 'Logistica  Ñu'.replace('Ñ', 'N'));
  assert.equal(norm('  Etiqueta   MAL  '), 'etiqueta mal');
  assert.equal(key(' ecom  Zara '), 'ECOM ZARA');
  assert.equal(norm(null), '');
});

test('el código de un estado o motivo escrito como en el historial', () => {
  assert.equal(toCode('Third Party Vendor Action Reqd'), 'THIRD_PARTY_VENDOR_ACTION_REQD');
  assert.equal(toCode('In Progress'), 'IN_PROGRESS');
  assert.equal(toCode('Customer Follow-Up Required'), 'CUSTOMER_FOLLOW_UP_REQUIRED');
  assert.equal(toCode(''), '');
});
