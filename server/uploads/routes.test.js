import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { uploadsRoutes } from './routes.js';

test('subir y servir un adjunto; fuera de la carpeta no se llega', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sia-up-'));
  const sent = [];
  const route = uploadsRoutes(dir, { json: (res, status, body) => Object.assign(res, { status, body }), readBody: async (req) => req.body, sendFile: (res, ext, content) => sent.push([ext, content.toString()]) });
  const call = async (method, p, body) => { const res = {}; await route({ method, body }, res, p); return res; };
  assert.equal((await call('POST', ['upload'], { name: 'a.txt', data: '' })).status, 400);
  const up = await call('POST', ['upload'], { name: 'foto.PNG', data: Buffer.from('hola').toString('base64') });
  assert.equal(up.body.name, '1-foto.png');
  assert.equal(fs.readFileSync(up.body.absPath, 'utf8'), 'hola');
  await call('GET', ['uploads', '1-foto.png']);
  assert.deepEqual(sent, [['.png', 'hola']]);
  assert.equal((await call('GET', ['uploads', '..%2F..%2Fetc%2Fpasswd'])).status, 404);
  fs.rmSync(dir, { recursive: true, force: true });
});
