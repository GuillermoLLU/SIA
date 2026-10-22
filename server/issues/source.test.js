import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createIssuesSource, REQUIRED } from './source.js';

const HEAD = `${REQUIRED.join(',')}\n`;
const row = (id, status, group, reported, modified, resolved = '') => {
  const r = { INCIDENTNUMBER: id, STATUS: status, ASSIGNEDGROUP: group, REPORTEDDATE: reported, LASTMODIFIEDDATE: modified, LASTRESOLUTIONDATE: resolved, PRIORITY: 'LOW' };
  return `${REQUIRED.map((c) => r[c] || '').join(',')}\n`;
};
const chunks = (text, at = 100) => (async function* () { yield text.slice(0, at); yield text.slice(at); })();
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sia-issues-'));
const NOW = () => new Date('2026-10-22T09:00:00');

test('sin foto: vacío', () => {
  assert.deepEqual(createIssuesSource(path.join(tmp(), 'no-existe')).load(), { taken: null, issues: [] });
});

test('la foto: abiertas del grupo y resueltas en la última semana, con la hora del dato más reciente', async () => {
  const dir = tmp();
  const source = createIssuesSource(dir, { now: NOW });
  const csv = HEAD
    + row('INC1', 'ASSIGNED', 'AYS SOPORTE', '2026-10-20 09:00:00', '2026-10-20 09:00:00')
    + row('INC2', 'PENDING', 'AYS SOPORTE', '2026-09-01 08:00:00', '2026-10-21 13:10:00')
    + row('INC3', 'RESOLVED', 'AYS SOPORTE', '2026-10-15 08:00:00', '2026-10-16 08:00:00', '2026-10-16 08:00:00')
    + row('INC4', 'CLOSED', 'AYS SOPORTE', '2026-10-01 08:00:00', '2026-10-02 08:00:00', '2026-10-02 08:00:00')
    + row('INC5', 'CANCELLED', 'AYS SOPORTE', '2026-10-20 08:00:00', '2026-10-20 08:00:00', '2026-10-20 08:00:00')
    + row('INC6', 'ASSIGNED', 'OTRO GRUPO', '2026-10-21 10:00:00', '2026-10-21 10:00:00');
  const meta = await source.importCsv(chunks(csv), 'issues.csv');
  const taken = new Date('2026-10-21T13:10:00').toISOString();
  assert.deepEqual(meta, { file: 'issues.csv', taken, issues: 3 });
  assert.deepEqual(source.load().issues.map((i) => i.id), ['INC1', 'INC2', 'INC3']);
  assert.equal(source.load().taken, taken);
  assert.deepEqual(createIssuesSource(dir).load().issues.map((i) => i.id), ['INC1', 'INC2', 'INC3']);
  fs.rmSync(dir, { recursive: true });
});

test('un CSV que no es el de la consulta, o sin issues del grupo: error 400 y nada guardado', async () => {
  const dir = tmp();
  const source = createIssuesSource(dir, { now: NOW });
  await assert.rejects(source.importCsv(chunks('A,B\n1,2\n', 3), 'x.csv'), (e) => e.status === 400 && /le falta INCIDENTNUMBER/.test(e.message));
  await assert.rejects(source.importCsv(chunks(`${HEAD}${row('INC1', 'ASSIGNED', 'OTRO', '2026-10-20 09:00:00', '2026-10-20 09:00:00')}`), 'x.csv'), (e) => e.status === 400 && /grupo AYS SOPORTE/.test(e.message));
  assert.deepEqual(source.load(), { taken: null, issues: [] });
  assert.equal(fs.existsSync(path.join(dir, 'foto.json')), false);
  fs.rmSync(dir, { recursive: true });
});

test('mientras se carga uno, otro da 409', async () => {
  const source = createIssuesSource(tmp(), { now: NOW });
  let release;
  const slow = (async function* () { yield HEAD; await new Promise((r) => { release = r; }); yield row('INC1', 'ASSIGNED', 'AYS SOPORTE', '2026-10-20 09:00:00', '2026-10-20 09:00:00'); })();
  const first = source.importCsv(slow, 'a.csv');
  await new Promise((r) => setTimeout(r, 5));
  await assert.rejects(source.importCsv(chunks(HEAD), 'b.csv'), (e) => e.status === 409);
  release();
  assert.equal((await first).issues, 1);
});
