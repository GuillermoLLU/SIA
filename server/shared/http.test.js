import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { json, readBody, failed, mimeOf, sendFile } from './http.js';

const capture = () => {
  const res = {};
  const j = (r, status, body) => Object.assign(r, { status, body });
  return { res, j };
};

test('json: estado, cabecera y cuerpo', () => {
  const out = [];
  json({ writeHead: (c, h) => out.push(c, h), end: (b) => out.push(b) }, 404, { error: 'no' });
  assert.deepEqual(out, [404, { 'Content-Type': 'application/json' }, '{"error":"no"}']);
});

test('readBody: el JSON del cuerpo; vacío, {}; roto, 400; demasiado grande, 413', async () => {
  const body = (chunks) => { const req = new EventEmitter(); setImmediate(() => { chunks.forEach((c) => req.emit('data', c)); req.emit('end'); }); return readBody(req); };
  assert.deepEqual(await body(['{"a":', '1}']), { a: 1 });
  assert.deepEqual(await body([]), {});
  await assert.rejects(body(['{']), { status: 400 });
  await assert.rejects(body(['"', 'x'.repeat(40_000_001)]), { status: 413 });
});

test('failed: con estado, su texto (5xx como 503); sin estado, 500 sin detalles', () => {
  const { res, j } = capture();
  failed(j, res, Object.assign(new Error('Ya existe.'), { status: 409 }));
  assert.deepEqual([res.status, res.body], [409, { error: 'Ya existe.' }]);
  failed(j, res, Object.assign(new Error('la base no responde'), { status: 502 }));
  assert.deepEqual([res.status, res.body], [503, { error: 'la base no responde' }]);
  failed(j, res, new Error('disco'));
  assert.deepEqual([res.status, res.body], [500, { error: 'Error interno.' }]);
});

test('sendFile: el tipo por la extensión; lo raro, binario', () => {
  assert.equal(mimeOf('.CSS'), 'text/css; charset=utf-8');
  assert.equal(mimeOf('.exe'), 'application/octet-stream');
  const out = [];
  sendFile({ writeHead: (c, h) => out.push(c, h), end: (b) => out.push(b) }, '.png', 'img');
  assert.deepEqual(out, [200, { 'Content-Type': 'image/png' }, 'img']);
});

test('un fallo sin estado: 500 genérico al cliente, y el log dice qué pasó', () => {
  const logged = [], original = console.error;
  console.error = (m) => logged.push(m);
  try {
    let body = null;
    failed((res, status, b) => { body = b; }, {}, new Error('boom'));
    assert.deepEqual(body, { error: 'Error interno.' });
    assert.match(logged[0], /boom/);
  } finally {
    console.error = original;
  }
});
