import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createIssuesSource } from './source.js';

const HEAD = 'INCIDENTNUMBER,SUMMARY,PRIORITY,STATUS,STATUSREASON,ASSIGNEE,ASSIGNEDGROUP,TAGS,REPORTEDDATE,LASTMODIFIEDDATE,LASTRESOLUTIONDATE,VENDORTICKETNUMBER,CHILDREQUEST,LINKREMEDY,AUDIT_DETAIL\n';

test('sin carpeta o sin CSV: vacío', () => {
  assert.deepEqual(createIssuesSource('/no/existe').load(), { taken: null, issues: [] });
});

test('lee el CSV más reciente con la hora del fichero', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sia-issues-'));
  fs.writeFileSync(path.join(dir, 'viejo.csv'), `${HEAD}INC1,,LOW,ASSIGNED,,,,,,,,,,,\n`);
  fs.utimesSync(path.join(dir, 'viejo.csv'), new Date('2026-10-01'), new Date('2026-10-01'));
  fs.writeFileSync(path.join(dir, 'nuevo.csv'), `${HEAD}INC2,,HIGH,ASSIGNED,,,,,,,,,,,\n`);
  fs.utimesSync(path.join(dir, 'nuevo.csv'), new Date('2026-10-04T09:44:00Z'), new Date('2026-10-04T09:44:00Z'));
  const { taken, issues } = createIssuesSource(dir).load();
  assert.equal(taken, '2026-10-04T09:44:00.000Z');
  assert.deepEqual(issues.map((i) => i.id), ['INC2']);
  fs.rmSync(dir, { recursive: true });
});
