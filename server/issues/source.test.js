import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createIssuesSource } from './source.js';
import { REQUIRED } from './snapshot.js';

const HEAD = `${REQUIRED.join(',')}\n`;
const row = (id, status = 'ASSIGNED', group = 'AYS SOPORTE') => {
  const r = { INCIDENTNUMBER: id, STATUS: status, ASSIGNEDGROUP: group, REPORTEDDATE: '2026-10-20 09:00:00', LASTMODIFIEDDATE: '2026-10-21 13:10:00', PRIORITY: 'LOW' };
  return `${REQUIRED.map((c) => r[c] || '').join(',')}\n`;
};
const chunks = (text, at = 100) => (async function* () { yield text.slice(0, at); yield text.slice(at); })();
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sia-issues-'));
const NOW = () => new Date('2026-10-22T09:00:00');

test('sin foto: vacío', () => {
  assert.deepEqual(createIssuesSource(path.join(tmp(), 'no-existe')).load(), { taken: null, issues: [] });
});

test('carga el CSV por trozos, guarda la foto y la relee del fichero', async () => {
  const dir = tmp();
  const source = createIssuesSource(dir, { now: NOW });
  const meta = await source.importCsv(chunks(`${HEAD}${row('INC1')}${row('INC2', 'ASSIGNED', 'OTRO')}`), 'issues.csv');
  const taken = new Date('2026-10-21T13:10:00').toISOString();
  assert.deepEqual(meta, { file: 'issues.csv', taken, issues: 1 });
  assert.deepEqual(source.load().issues.map((i) => i.id), ['INC1']);
  assert.equal(source.load().taken, taken);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(dir, 'foto.json'), 'utf8')), source.load());
  assert.deepEqual(createIssuesSource(dir).load().issues.map((i) => i.id), ['INC1']);
  fs.rmSync(dir, { recursive: true });
});

test('un CSV que no vale: su error, se lee hasta el final y nada se guarda', async () => {
  const dir = tmp();
  const source = createIssuesSource(dir, { now: NOW });
  let read = 0;
  const bad = (async function* () { for (const c of ['A,B\n', '1,2\n', '3,4\n']) { read++; yield c; } })();
  await assert.rejects(source.importCsv(bad, 'x.csv'), (e) => e.status === 400);
  assert.equal(read, 3);
  assert.deepEqual(source.load(), { taken: null, issues: [] });
  assert.equal(fs.existsSync(path.join(dir, 'foto.json')), false);
  fs.rmSync(dir, { recursive: true });
});

test('mientras se carga uno, otro da 409', async () => {
  const source = createIssuesSource(tmp(), { now: NOW });
  let release;
  const slow = (async function* () { yield HEAD; await new Promise((r) => { release = r; }); yield row('INC1'); })();
  const first = source.importCsv(slow, 'a.csv');
  await new Promise((r) => setTimeout(r, 5));
  await assert.rejects(source.importCsv(chunks(HEAD), 'b.csv'), (e) => e.status === 409);
  release();
  assert.equal((await first).issues, 1);
});
