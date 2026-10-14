import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createMetricsStore } from './store.js';
import { REQUIRED } from './dataset.js';

const csv = (...rows) => [REQUIRED.join(','), ...rows.map((r) => REQUIRED.map((c) => r[c] ?? '').join(','))].join('\n');
const ISSUE = { INCIDENTNUMBER: 'INC000000000007', ASSIGNEDGROUP: 'AYS SOPORTE', ASSIGNEE: 'ANA LOPEZ', STATUS: 'CLOSED', REPORTEDDATE: '2026-02-01 10:00:00' };
const chunks = async function* (text, size = 7) { for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size); };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sia-metrics-'));
const now = () => new Date('2026-10-14T08:00:00Z');

test('sin datos: null', () => {
  assert.equal(createMetricsStore('/no/existe', { year: 2026 }).load(), null);
});

test('carga el CSV por trozos, guarda lo calculado y lo vuelve a leer', async () => {
  const dir = tmp();
  const meta = await createMetricsStore(dir, { year: 2026, now }).importCsv(chunks(csv(ISSUE)), 'issues.csv');
  assert.deepEqual({ ...meta, snapshot: undefined }, { file: 'issues.csv', year: 2026, group: 'AYS SOPORTE', rows: 1, total: 1, notices: 0, snapshot: undefined, generated: '2026-10-14T08:00:00.000Z' });
  const again = createMetricsStore(dir, { year: 2026 }).load();
  assert.deepEqual(again.cols.id, [7]);
  assert.deepEqual(fs.readdirSync(dir), ['datos.json']);
  fs.rmSync(dir, { recursive: true });
});

test('un CSV que no vale: lo lee hasta el final, falla y deja los datos de antes', async () => {
  const dir = tmp();
  const store = createMetricsStore(dir, { year: 2026, now });
  await store.importCsv(chunks(csv(ISSUE)), 'bueno.csv');
  let read = 0;
  const bad = async function* () { for await (const c of chunks('A,B\n1,2\n'.repeat(5))) { read += c.length; yield c; } };
  await assert.rejects(store.importCsv(bad(), 'malo.csv'), (e) => e.status === 400 && /le falta INCIDENTNUMBER/.test(e.message));
  assert.equal(read, 'A,B\n1,2\n'.repeat(5).length);
  assert.equal(store.load().meta.file, 'bueno.csv');
  fs.rmSync(dir, { recursive: true });
});

test('dos cargas a la vez: la segunda, 409', async () => {
  const dir = tmp();
  const store = createMetricsStore(dir, { year: 2026, now });
  let release;
  const slow = async function* () { yield csv(ISSUE); await new Promise((r) => { release = r; }); };
  const first = store.importCsv(slow(), 'a.csv');
  await assert.rejects(store.importCsv(chunks(csv(ISSUE)), 'b.csv'), (e) => e.status === 409);
  release();
  await first;
  fs.rmSync(dir, { recursive: true });
});
