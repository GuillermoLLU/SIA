import test from 'node:test';
import assert from 'node:assert/strict';
import { trustSystemCerts, readSystemCerts, isCertError } from './certs.js';

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

test('trustSystemCerts con los del sistema ya leídos (al reintentar)', () => {
  const tls = fakeTls({ default: ['A'], system: ['VIEJO'] });
  assert.equal(trustSystemCerts(tls, ['A', 'NUEVO']), true);
  assert.deepEqual(tls.set, ['A', 'NUEVO']);
});

test('readSystemCerts: los lee un proceso nuevo, como Node', async () => {
  let call;
  const execFile = (bin, args, opts, cb) => { call = { bin, args, opts }; cb(null, '["PEM1","PEM2"]'); };
  assert.deepEqual(await readSystemCerts(execFile, 'node.exe'), ['PEM1', 'PEM2']);
  assert.equal(call.bin, 'node.exe');
  assert.equal(call.opts.env.ELECTRON_RUN_AS_NODE, '1');
  await assert.rejects(readSystemCerts((b, a, o, cb) => cb(new Error('no')), 'node.exe'));
  await assert.rejects(readSystemCerts((b, a, o, cb) => cb(null, 'basura'), 'node.exe'));
});

test('isCertError', () => {
  assert.equal(isCertError({ cause: { code: 'SELF_SIGNED_CERT_IN_CHAIN' } }), true);
  assert.equal(isCertError({ message: 'unable to verify the first certificate' }), true);
  assert.equal(isCertError({ code: '401001', message: 'self-signed certificate in certificate chain' }), true);   // Snowflake
  assert.equal(isCertError({ code: 'ENOTFOUND', message: 'getaddrinfo' }), false);
  assert.equal(isCertError(new TypeError('fetch failed')), false);
});
