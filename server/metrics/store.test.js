import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createMetricsStore } from './store.js';
import { createRepository } from './repository.js';
import { REQUIRED, FORMAT } from './dataset.js';

const csv = (...rows) => [REQUIRED.join(','), ...rows.map((r) => REQUIRED.map((c) => r[c] ?? '').join(','))].join('\n');
const ISSUE = { INCIDENTNUMBER: 'INC000000000007', ASSIGNEDGROUP: 'AYS SOPORTE', ASSIGNEE: 'ANA LOPEZ', STATUS: 'CLOSED', REPORTEDDATE: '2026-02-01 10:00:00', LASTMODIFIEDDATE: '2026-02-01 12:00:00' };
const chunks = async function* (text, size = 7) { for (let i = 0; i < text.length; i += size) yield text.slice(i, i + size); };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sia-metrics-'));
const now = () => new Date('2026-10-14T08:00:00Z');
const repos = [];   // se cierran al acabar cada prueba: Windows no borra un fichero abierto
const open = (dir) => { const repo = createRepository({ DatabaseSync, file: path.join(dir, 'incidencias.sqlite'), fs, now }); repos.push(repo); return createMetricsStore(dir, { repo, now }); };
const clean = (dir) => { repos.splice(0).forEach((r) => r.close()); fs.rmSync(dir, { recursive: true }); };

test('sin datos: null', () => {
  const dir = tmp();
  assert.equal(open(dir).load(), null);
  clean(dir);
});

test('carga el CSV por trozos, calcula desde el repositorio y lo vuelve a leer', async () => {
  const dir = tmp();
  const { meta, counts } = await open(dir).importCsv(chunks(csv(ISSUE)), 'issues.csv');
  assert.deepEqual({ ...meta, snapshot: undefined, first: undefined, last: undefined }, { format: FORMAT, file: 'issues.csv', start: 2026, group: 'AYS SOPORTE', rows: 1, total: 1,
    snapshot: undefined, first: undefined, last: undefined, generated: '2026-10-14T08:00:00.000Z' });
  assert.deepEqual(counts, { inserted: 1, updated: 0, unchanged: 0, kept: 0 });
  assert.deepEqual(open(dir).load().cols.id, [7]);
  assert.deepEqual(fs.readdirSync(dir).sort(), ['datos.json', 'incidencias.sqlite']);
  clean(dir);
});

test('los CSV se suman: sin duplicados, lo más reciente gana y lo que no vuelve a venir se conserva', async () => {
  const dir = tmp(), store = open(dir);
  const other = { ...ISSUE, INCIDENTNUMBER: 'INC000000000008', REPORTEDDATE: '2025-11-20 08:00:00' };
  await store.importCsv(chunks(csv(ISSUE, other)), 'a.csv');
  const newer = { ...ISSUE, STATUS: 'ASSIGNED', LASTMODIFIEDDATE: '2026-02-03 12:00:00' };
  const third = { ...ISSUE, INCIDENTNUMBER: 'INC000000000009', REPORTEDDATE: '2026-04-01 08:00:00' };
  const { meta, counts } = await store.importCsv(chunks(csv(newer, third)), 'b.csv');
  assert.deepEqual(counts, { inserted: 1, updated: 1, unchanged: 0, kept: 0 });
  assert.equal(meta.start, 2025);
  assert.deepEqual(store.load().cols.id, [7, 8, 9]);
  assert.equal(store.load().dict.status[store.load().cols.st[0]], 'ASSIGNED');
  const old = await store.importCsv(chunks(csv(ISSUE)), 'c.csv');
  assert.deepEqual(old.counts, { inserted: 0, updated: 0, unchanged: 0, kept: 1 });
  clean(dir);
});

test('datos.json es una copia: si falta, se recalcula desde el repositorio', async () => {
  const dir = tmp();
  await open(dir).importCsv(chunks(csv(ISSUE)), 'issues.csv');
  fs.rmSync(path.join(dir, 'datos.json'));
  const data = open(dir).load();
  assert.deepEqual([data.cols.id, data.meta.format], [[7], FORMAT]);
  fs.writeFileSync(path.join(dir, 'datos.json'), JSON.stringify({ meta: { format: 1 }, cols: {} }));
  assert.deepEqual(open(dir).load().cols.id, [7]);
  clean(dir);
});

test('un CSV que no vale: lo lee hasta el final, falla y deja lo guardado', async () => {
  const dir = tmp();
  const store = open(dir);
  await store.importCsv(chunks(csv(ISSUE)), 'bueno.csv');
  let read = 0;
  const bad = async function* () { for await (const c of chunks('A,B\n1,2\n'.repeat(5))) { read += c.length; yield c; } };
  await assert.rejects(store.importCsv(bad(), 'malo.csv'), (e) => e.status === 400 && /le falta INCIDENTNUMBER/.test(e.message));
  assert.equal(read, 'A,B\n1,2\n'.repeat(5).length);
  assert.equal(store.load().meta.file, 'bueno.csv');
  await assert.rejects(store.importCsv(chunks(REQUIRED.join(',')), 'vacio.csv'), (e) => e.status === 400 && /no tiene filas/.test(e.message));
  clean(dir);
});

test('dos cargas a la vez: la segunda, 409', async () => {
  const dir = tmp();
  const store = open(dir);
  let release;
  const slow = async function* () { yield csv(ISSUE); await new Promise((r) => { release = r; }); };
  const first = store.importCsv(slow(), 'a.csv');
  await assert.rejects(store.importCsv(chunks(csv(ISSUE)), 'b.csv'), (e) => e.status === 409);
  release();
  await first;
  clean(dir);
});
