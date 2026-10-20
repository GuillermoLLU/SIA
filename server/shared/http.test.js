import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { json, readBody, failed } from './http.js';

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

test('readBody: el JSON del cuerpo; vacío, {}; roto, error', async () => {
  const body = (chunks) => { const req = new EventEmitter(); setImmediate(() => { chunks.forEach((c) => req.emit('data', c)); req.emit('end'); }); return readBody(req); };
  assert.deepEqual(await body(['{"a":', '1}']), { a: 1 });
  assert.deepEqual(await body([]), {});
  await assert.rejects(body(['{']));
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
