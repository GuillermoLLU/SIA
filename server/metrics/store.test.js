import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createMetricsStore } from './store.js';
import { createRepository } from './repository.js';
import { REQUIRED, FORMAT } from './dataset.js';
import { FIRST_LOAD } from './query.js';

const row = (o) => ({ ...Object.fromEntries(REQUIRED.map((c) => [c, ''])), ...o });
const ISSUE = row({ INCIDENTNUMBER: 'INC000000000007', ASSIGNEDGROUP: 'AYS SOPORTE', ASSIGNEE: 'ANA LOPEZ', STATUS: 'CLOSED', REPORTEDDATE: '2026-02-01 10:00:00.000', LASTMODIFIEDDATE: '2026-02-01 12:00:00.000' });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'sia-metrics-'));
const now = () => new Date('2026-10-14T08:00:00Z');

// Snowflake falso: cada actualización devuelve el siguiente lote y apunta qué se le pidió.
const fakeSource = (...batches) => {
  const asked = [];
  return {
    asked,
    rows: async function* (sql, binds, { onTotal }) {
      asked.push(binds);
      const batch = batches.shift() ?? [];
      onTotal(batch.length);
      for (const r of batch) { if (r instanceof Error) throw r; yield r; }
    },
  };
};
const repos = [];   // se cierran al acabar cada prueba: Windows no borra un fichero abierto
const open = (dir, source = fakeSource(), log) => {
  const repo = createRepository({ DatabaseSync, file: path.join(dir, 'incidencias.sqlite'), fs, now });
  repos.push(repo);
  return { store: createMetricsStore(dir, { repo, source, now, log }), repo };
};
const clean = (dir) => { repos.splice(0).forEach((r) => r.close()); fs.rmSync(dir, { recursive: true }); };

test('sin datos: null', async () => {
  const dir = tmp();
  assert.equal(await open(dir).store.load(), null);
  clean(dir);
});

test('la primera actualización, con el repositorio vacío: todo desde 2026; calcula y lo vuelve a leer', async () => {
  const dir = tmp(), source = fakeSource([ISSUE]);
  const { meta, counts } = await open(dir, source).store.update();
  assert.deepEqual(source.asked, [[FIRST_LOAD]]);
  assert.deepEqual({ ...meta, snapshot: undefined, first: undefined, last: undefined }, { format: FORMAT, file: 'Snowflake', start: 2026, group: 'AYS SOPORTE', rows: 1, total: 1,
    snapshot: undefined, first: undefined, last: undefined, generated: '2026-10-14T08:00:00.000Z' });
  assert.deepEqual(counts, { inserted: 1, updated: 0, unchanged: 0, kept: 0 });
  assert.deepEqual((await open(dir).store.load()).cols.id, [7]);
  assert.deepEqual(fs.readdirSync(dir).filter((f) => !/-(wal|shm)$/.test(f)).sort(), ['datos.json', 'incidencias.sqlite']);   // sin los -wal y -shm de SQLite
  clean(dir);
});

test('las siguientes piden solo lo cambiado y aplican los criterios de siempre: A, B, idéntica y C', async () => {
  const dir = tmp();
  const other = row({ ...ISSUE, INCIDENTNUMBER: 'INC000000000008', REPORTEDDATE: '2025-11-20 08:00:00.000', LASTMODIFIEDDATE: '2026-03-01 09:00:00.000' });
  const third = row({ ...ISSUE, INCIDENTNUMBER: 'INC000000000009', STATUS: 'ASSIGNED' });
  const batches = [
    [ISSUE, other, third],
    [
      row({ ...ISSUE, INCIDENTNUMBER: 'INC000000000010', REPORTEDDATE: '2026-04-01 08:00:00.000', LASTMODIFIEDDATE: '2026-04-01 08:00:05.000' }),   // A: nueva
      row({ ...ISSUE, STATUS: 'ASSIGNED', LASTMODIFIEDDATE: '2026-02-03 12:00:00.000' }),                                                          // B: más reciente
      row({ ...third, WORKLOG_DETAIL: '2026-02-01 12:00:00.000 - ana - Revisado' }),                                                               // B: misma fecha, otro contenido
      other,                                                                                                                                         // idéntica
      row({ ...other, STATUS: 'IN_PROGRESS', LASTMODIFIEDDATE: '2026-02-15 00:00:00.000' }),                                                       // C: lo guardado es más reciente
    ],
  ];
  const source = fakeSource(...batches);
  const { store } = open(dir, source);
  await store.update();
  const { meta, counts } = await store.update();
  // el suelo, la apertura más antigua guardada; desde, la última modificación menos 2 días
  assert.deepEqual(source.asked[1], ['2025-11-20 08:00:00.000', '2026-03-01 03:00:00.000']);   // la última modificación menos 6 horas
  assert.deepEqual(counts, { inserted: 1, updated: 2, unchanged: 1, kept: 1 });
  assert.equal(meta.start, 2025);
  const data = await store.load();
  assert.deepEqual(data.cols.id, [7, 8, 9, 10]);
  assert.equal(data.dict.status[data.cols.st[0]], 'ASSIGNED');
  assert.equal(data.dict.status[data.cols.st[1]], 'CLOSED', 'C: se conserva lo guardado');
  clean(dir);
});

test('el avance: preparar el conector, conectar, descargar (cuántas de cuántas) y calcular; al acabar, null', async () => {
  const dir = tmp(), seen = [];
  let store;
  const source = { rows: async function* (sql, binds, { onConnect, onTotal }) {
    seen.push({ ...store.progress() });
    onConnect();
    seen.push({ ...store.progress() });
    onTotal(2);
    for (const r of [ISSUE, row({ ...ISSUE, INCIDENTNUMBER: 'INC000000000008' })]) { seen.push({ ...store.progress() }); yield r; }
  } };
  ({ store } = open(dir, source));
  await store.update();
  assert.deepEqual(seen, [{ phase: 'prepare', done: 0, total: 0 }, { phase: 'connect', done: 0, total: 0 }, { phase: 'download', done: 0, total: 2 }, { phase: 'download', done: 1, total: 2 }]);
  assert.equal(store.progress(), null);
  clean(dir);
});

test('cada actualización apunta en el registro cuánto tardó cada fase', async () => {
  const dir = tmp(), lines = [];
  await open(dir, fakeSource([ISSUE]), (l) => lines.push(l)).store.update();
  assert.equal(lines.length, 1);
  assert.match(lines[0], /^\[sia\] métricas actualizadas en \d+,\d s: conector \d+,\d s · conexión y consulta \d+,\d s · 1 incidencias de Snowflake \(1 nuevas, 0 actualizadas, 0 quitadas por salir del grupo\) en \d+,\d s · informe de 1 incidencias en \d+,\d s$/);
  clean(dir);
});

test('sin nada nuevo: no es un error, cuentas a cero', async () => {
  const dir = tmp();
  const { store } = open(dir, fakeSource([ISSUE], []));
  await store.update();
  assert.deepEqual((await store.update()).counts, { inserted: 0, updated: 0, unchanged: 0, kept: 0 });
  assert.deepEqual((await store.load()).cols.id, [7]);
  clean(dir);
});

test('un fallo a mitad: no entra nada, lo guardado sigue y la siguiente vuelve a pedir lo mismo', async () => {
  const dir = tmp();
  const late = row({ ...ISSUE, INCIDENTNUMBER: 'INC000000000011', LASTMODIFIEDDATE: '2026-06-01 00:00:00.000' });
  const source = fakeSource([ISSUE], [late, Object.assign(new Error('No se llega a Snowflake'), { status: 503 })], []);
  const { store, repo } = open(dir, source);
  await store.update();
  const before = repo.extremes();
  await assert.rejects(store.update(), (e) => e.status === 503);
  assert.deepEqual(repo.extremes(), before);
  await store.update();
  assert.deepEqual(source.asked[2], source.asked[1]);
  assert.deepEqual((await store.load()).cols.id, [7]);
  clean(dir);
});

test('unos datos que no son los de la consulta: 400 y no entra nada', async () => {
  const dir = tmp();
  const { store, repo } = open(dir, fakeSource([{ A: '1' }]));
  await assert.rejects(store.update(), (e) => e.status === 400 && /no trae INCIDENTNUMBER/.test(e.message));
  assert.deepEqual(repo.extremes(), { first: null, last: null });
  clean(dir);
});

test('datos.json es una copia: si falta, se recalcula desde el repositorio', async () => {
  const dir = tmp();
  await open(dir, fakeSource([ISSUE])).store.update();
  fs.rmSync(path.join(dir, 'datos.json'));
  const data = await open(dir).store.load();
  assert.deepEqual([data.cols.id, data.meta.format], [[7], FORMAT]);
  fs.writeFileSync(path.join(dir, 'datos.json'), JSON.stringify({ meta: { format: 1 }, cols: {} }));
  assert.deepEqual((await open(dir).store.load()).cols.id, [7]);
  clean(dir);
});

test('dos actualizaciones a la vez: la segunda, 409', async () => {
  const dir = tmp();
  let release;
  const slow = { rows: async function* () { yield ISSUE; await new Promise((r) => { release = r; }); } };
  const { store } = open(dir, slow);
  const first = store.update();
  await new Promise((r) => setImmediate(r));
  await assert.rejects(store.update(), (e) => e.status === 409);
  release();
  await first;
  clean(dir);
});

// Un CSV de la consulta de Remedy (cabecera y filas) y su lectura en trozos, como llega del bridge.
const csvOf = (...rows) => [REQUIRED.join(','), ...rows.map((r) => REQUIRED.map((c) => `"${String(r[c] ?? '').replaceAll('"', '""')}"`).join(','))].join('\n') + '\n';
const chunksOf = (text) => (async function* () { yield text; })();

test('importCsv: una foto a mano pasa por las reglas de siempre; lo más reciente guardado no se pisa', async () => {
  const dir = tmp(), { store, repo } = open(dir);
  const first = await store.importCsv(chunksOf(csvOf(ISSUE)), 'issues.csv');
  assert.deepEqual(first.counts, { inserted: 1, updated: 0, unchanged: 0, kept: 0 });
  assert.equal(first.meta.file, 'issues.csv');
  const older = { ...ISSUE, STATUS: 'ASSIGNED', LASTMODIFIEDDATE: '2026-02-01 11:00:00.000' };
  assert.deepEqual((await store.importCsv(chunksOf(csvOf(older)), 'antiguo.csv')).counts, { inserted: 0, updated: 0, unchanged: 0, kept: 1 });
  assert.equal(repo.count(), 1);
  clean(dir);
});

test('importCsv: rechaza lo que no es la consulta o no tiene filas, y no deja nada a medias', async () => {
  const dir = tmp(), { store, repo } = open(dir);
  await assert.rejects(store.importCsv(chunksOf('a,b\n1,2\n'), 'x.csv'), (e) => e.status === 400);
  await assert.rejects(store.importCsv(chunksOf(`${REQUIRED.join(',')}\n`), 'x.csv'), (e) => e.status === 400 && /no tiene filas/.test(e.message));
  assert.equal(repo.count(), 0);
  clean(dir);
});

test('solo se guarda el grupo: lo que sale del grupo se quita de lo guardado', async () => {
  const dir = tmp(), logs = [];
  const other = row({ INCIDENTNUMBER: 'INC000000000009', ASSIGNEDGROUP: 'OTRO GRUPO', REPORTEDDATE: '2026-02-02 10:00:00.000' });
  const moved = { ...ISSUE, ASSIGNEDGROUP: 'OTRO GRUPO', LASTMODIFIEDDATE: '2026-02-03 09:00:00.000' };
  const stays = { ...ISSUE, INCIDENTNUMBER: 'INC000000000010' };   // del grupo, y se queda en él
  const { store, repo } = open(dir, fakeSource([ISSUE, other, stays], [moved]), (l) => logs.push(l));
  await store.update();
  assert.equal(repo.count(), 2, 'la de otro grupo no entra');
  await store.update();
  assert.equal(repo.count(), 1, 'la que ha salido del grupo se quita');
  assert.match(logs[1], /1 quitadas por salir del grupo/);
  clean(dir);
});

test('cancelar una actualización a mitad de la descarga: no entra nada; ya guardada, no se cancela', async () => {
  const dir = tmp();
  const stalled = { asked: [], rows: async function* () { yield ISSUE; await new Promise(() => {}); } };
  const { store, repo } = open(dir, stalled);
  const running = store.update();
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(store.cancel(), { cancelled: true });
  await assert.rejects(running, (e) => e.cancelled === true);
  assert.equal(repo.count(), 0, 'lo que llegó antes de cancelar se deshace');
  assert.deepEqual(store.cancel(), { cancelled: false }, 'sin nada en marcha, no hace nada');
  clean(dir);
});

test('la primera carga con un periodo pide ese periodo; luego, lo cambiado de siempre', async () => {
  const dir = tmp(), source = fakeSource([ISSUE], []);
  const { store } = open(dir, source);
  await store.update({ from: '2026-03-01', to: '2026-03-31' });
  assert.deepEqual(source.asked[0], ['2026-03-01 00:00:00.000', '2026-04-01 00:00:00.000'], 'desde el primer día, hasta el último incluido');
  await store.update({ from: '2020-01-01', to: '2020-01-02' });   // con datos, el periodo se ignora
  assert.deepEqual(source.asked[1], ['2026-02-01 10:00:00.000', '2026-02-01 06:00:00.000'], 'sigue con lo cambiado de siempre: desde la apertura más antigua; lo modificado desde la última menos 6 horas');
  clean(dir);
});

test('borrar el histórico: la base y su copia quedan vacías; Snowflake no se toca', async () => {
  const dir = tmp(), { store, repo } = open(dir, fakeSource([ISSUE]));
  await store.update();
  assert.equal(repo.count(), 1);
  assert.deepEqual(await store.clear(), { cleared: true });
  assert.equal(repo.count(), 0);
  assert.equal(await store.load(), null);
  assert.equal(fs.existsSync(path.join(dir, 'datos.json')), false);
  clean(dir);
});
