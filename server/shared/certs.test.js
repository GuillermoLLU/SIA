import test from 'node:test';
import assert from 'node:assert/strict';
import { trustSystemCerts } from './certs.js';

const fakeTls = (stores) => {
  const tls = { set: null, getCACertificates: (kind) => { if (stores[kind] instanceof Error) throw stores[kind]; return stores[kind]; } };
  tls.setDefaultCACertificates = (list) => { tls.set = list; };
  return tls;
};

test('los certificados de Node más los del sistema, sin repetir', () => {
  const tls = fakeTls({ default: ['A', 'B'], system: ['B', 'CORP'] });
  assert.equal(trustSystemCerts(tls), true);
  assert.deepEqual(tls.set, ['A', 'B', 'CORP']);
});

test('un Node sin la API, o sin acceso al almacén del sistema: no se toca nada', () => {
  assert.equal(trustSystemCerts({ getCACertificates: () => [] }), false);
  const tls = fakeTls({ default: ['A'], system: new Error('sin acceso') });
  assert.equal(trustSystemCerts(tls), false);
  assert.equal(tls.set, null);
});
