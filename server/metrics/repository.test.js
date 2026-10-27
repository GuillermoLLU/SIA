import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { createRepository } from './repository.js';

const HEAD = ['INCIDENTNUMBER', 'ASSIGNEDGROUP', 'STATUS', 'REPORTEDDATE', 'LASTMODIFIEDDATE', 'AUDIT_DETAIL', 'WORKLOG_DETAIL'];
const inc = (o = {}) => ({ ...Object.fromEntries(HEAD.map((c) => [c, ''])),
  INCIDENTNUMBER: 'INC1', ASSIGNEDGROUP: 'AYS SOPORTE', STATUS: 'ASSIGNED', REPORTEDDATE: '2026-03-01 09:00:00', LASTMODIFIEDDATE: '2026-03-01 10:00:00', ...o });
const now = () => new Date('2026-10-14T08:00:00Z');
const load = (repo) => { const out = []; repo.eachIncident((r) => out.push(r)); return out; };
const run = (repo, ...rows) => { const r = repo.begin(); rows.forEach(r.add); return r.commit(); };

// Un directorio de pruebas y sus repositorios; al acabar se cierran (Windows no borra un fichero abierto).
const scratch = () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sia-repo-')), file = path.join(dir, 'x.sqlite'), opened = [];
  const open = (clock = now) => { const repo = createRepository({ DatabaseSync, file, fs, now: clock }); opened.push(repo); return repo; };
  const sql = (query) => { const db = new DatabaseSync(file, { readOnly: true }); try { return db.prepare(query).all().map((r) => ({ ...r })); } finally { db.close(); } };
  return { dir, file, open, sql, done: () => { opened.forEach((r) => { try { r.close(); } catch { /* ya cerrado */ } }); fs.rmSync(dir, { recursive: true }); } };
};

test('alta, igual, más antigua y más reciente: sin duplicados', () => {
  const s = scratch(), repo = s.open();
  assert.deepEqual(run(repo, inc(), inc({ INCIDENTNUMBER: 'INC2' })), { inserted: 2, updated: 0, unchanged: 0, kept: 0 });
  assert.deepEqual(run(repo, inc(), inc({ INCIDENTNUMBER: 'INC2', STATUS: 'CLOSED', LASTMODIFIEDDATE: '2026-02-01 00:00:00' })), { inserted: 0, updated: 0, unchanged: 1, kept: 1 });
  assert.deepEqual(run(repo, inc({ STATUS: 'CLOSED', LASTMODIFIEDDATE: '2026-03-02 00:00:00' })), { inserted: 0, updated: 1, unchanged: 0, kept: 0 });
  assert.deepEqual(load(repo).map((r) => [r.INCIDENTNUMBER, r.STATUS]), [['INC1', 'CLOSED'], ['INC2', 'ASSIGNED']]);
  s.done();
});

test('misma fecha de modificación pero otro contenido: se actualiza', () => {
  const s = scratch(), repo = s.open();
  run(repo, inc());
  assert.equal(run(repo, inc({ STATUS: 'IN_PROGRESS' })).updated, 1);
  assert.equal(load(repo)[0].STATUS, 'IN_PROGRESS');
  s.done();
});

test('LASTUPDATE_BBDD: cuándo la tocó SIA, aparte de LASTMODIFIEDDATE; solo cambia si se toca', () => {
  const s = scratch();
  let clock = new Date('2026-10-14T08:00:00Z');
  const repo = s.open(() => clock);
  run(repo, inc());
  clock = new Date('2026-10-15T08:00:00Z');
  run(repo, inc());
  assert.equal(load(repo)[0].LASTUPDATE_BBDD, '2026-10-14T08:00:00.000Z');
  run(repo, inc({ LASTMODIFIEDDATE: '2026-03-05 00:00:00' }));
  const [r] = load(repo);
  assert.deepEqual([r.LASTUPDATE_BBDD, r.LASTMODIFIEDDATE], ['2026-10-15T08:00:00.000Z', '2026-03-05 00:00:00']);
  s.done();
});

test('AUDIT_DETAIL y WORKLOG_DETAIL se guardan enteros y abiertos por fecha', () => {
  const s = scratch(), repo = s.open();
  const audit = '2026-03-01 10:00:00.000 - ana - Status: ASSIGNED → IN_PROGRESS | 2026-03-02 10:00:00.000 - ana - Status: IN_PROGRESS → CLOSED';
  const worklog = '2026-03-01 10:30:00.000 - ana - Revisado';
  run(repo, inc({ AUDIT_DETAIL: audit, WORKLOG_DETAIL: worklog }));
  const [r] = load(repo);
  assert.deepEqual([r.AUDIT_DETAIL, r.WORKLOG_DETAIL], [audit, worklog]);
  assert.deepEqual(s.sql("SELECT incident, at, new_value FROM audit_events WHERE field = 'Status' AND at >= '2026-03-02' ORDER BY at"),
    [{ incident: 'INC1', at: '2026-03-02 10:00:00.000', new_value: 'CLOSED' }]);
  assert.deepEqual(s.sql('SELECT who, text FROM worklog_entries'), [{ who: 'ana', text: 'Revisado' }]);
  // al actualizar se rehacen, no se acumulan
  run(repo, inc({ LASTMODIFIEDDATE: '2026-03-09 00:00:00', AUDIT_DETAIL: audit.split(' | ')[0] }));
  assert.equal(s.sql('SELECT COUNT(*) AS n FROM audit_events')[0].n, 1);
  s.done();
});

test('se guarda en el fichero y se recupera al reabrir; varios años se acumulan', () => {
  const s = scratch(), first = s.open();
  run(first, inc({ REPORTEDDATE: '2026-03-01 09:00:00' }));
  first.close();
  const again = s.open();
  run(again, inc({ INCIDENTNUMBER: 'INC2', REPORTEDDATE: '2025-06-01 09:00:00' }));
  assert.deepEqual(load(again).map((r) => [r.INCIDENTNUMBER, r.REPORTEDDATE.slice(0, 4)]), [['INC1', '2026'], ['INC2', '2025']]);
  assert.deepEqual(fs.readdirSync(s.dir), ['x.sqlite']);
  s.done();
});

test('un fichero .tmp de una carga cortada con el motor anterior se descarta', () => {
  const s = scratch();
  fs.writeFileSync(`${s.file}.tmp`, '');
  s.open();
  assert.deepEqual(fs.readdirSync(s.dir), ['x.sqlite']);
  s.done();
});

test('un CSV con columnas nuevas las añade sin perder lo guardado; las que faltan salen vacías', () => {
  const s = scratch(), first = s.open();
  run(first, inc());
  first.close();
  const repo = s.open();
  run(repo, inc({ INCIDENTNUMBER: 'INC2', EXTRA: 'x' }));
  assert.deepEqual(load(repo).map((r) => [r.INCIDENTNUMBER, r.EXTRA]), [['INC1', ''], ['INC2', 'x']]);
  s.done();
});

test('rollback: no queda nada del CSV a medias', () => {
  const s = scratch(), repo = s.open();
  run(repo, inc());
  const r = repo.begin();
  r.add(inc({ INCIDENTNUMBER: 'INC9' }));
  r.add(inc({ STATUS: 'CLOSED', LASTMODIFIEDDATE: '2026-04-01 00:00:00' }));
  r.rollback();
  assert.deepEqual(load(repo).map((x) => [x.INCIDENTNUMBER, x.STATUS]), [['INC1', 'ASSIGNED']]);
  s.done();
});

test('firstYear: el año de la primera apertura del grupo', () => {
  const s = scratch(), repo = s.open();
  assert.equal(repo.firstYear('AYS SOPORTE'), null);
  run(repo, inc(), inc({ INCIDENTNUMBER: 'INC2', REPORTEDDATE: '2025-12-31 23:00:00' }), inc({ INCIDENTNUMBER: 'INC3', REPORTEDDATE: '2024-01-01 00:00:00', ASSIGNEDGROUP: 'OTRO' }));
  assert.equal(repo.firstYear('AYS SOPORTE'), 2025);
  s.done();
});
