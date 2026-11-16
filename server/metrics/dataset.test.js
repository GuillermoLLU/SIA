import test from 'node:test';
import assert from 'node:assert/strict';
import { createDataset, checkColumns, REQUIRED } from './dataset.js';
import { THEME_NAMES } from './themes.js';

const row = (o = {}) => ({ ...Object.fromEntries(REQUIRED.map((c) => [c, ''])),
  INCIDENTNUMBER: 'INC000000000001', ASSIGNEDGROUP: 'AYS SOPORTE', ASSIGNEE: 'ANA LOPEZ', STATUS: 'CLOSED', PRIORITY: 'HIGH',
  REPORTEDDATE: '2026-03-01 10:00:00', RESOLUTION: 'Hecho', ...o });

test('solo el grupo, de cualquier año y sin avisos automáticos; textos en diccionarios con el 0 vacío', () => {
  const ds = createDataset({ start: 2025 });
  ds.add(row());
  ds.add(row({ INCIDENTNUMBER: 'INC000000000002', ASSIGNEDGROUP: 'OTRO GRUPO' }));
  ds.add(row({ INCIDENTNUMBER: 'INC000000000003', REPORTEDDATE: '2025-12-31 23:59:00' }));
  ds.add(row({ INCIDENTNUMBER: 'INC000000000004', ASSIGNEE: '' }));
  ds.add(row({ INCIDENTNUMBER: 'INC000000000005', TAGS: 'AUTOTEC' }));
  const out = ds.build({ file: 'issues.csv', generated: '2026-10-14 10:00' });
  assert.deepEqual(out.cols.id, [1, 3, 4]);
  assert.equal(out.meta.rows, 3);
  assert.equal(out.meta.total, 5);
  assert.equal(out.meta.start, 2025);
  assert.deepEqual(out.dict.person, ['', 'ANA LOPEZ']);
  assert.deepEqual(out.cols.as, [1, 1, 0]);
  assert.deepEqual(out.company, [2, 1]);
  assert.equal(out.meta.snapshot, out.cols.rep[0]);
  assert.deepEqual(out.themes, THEME_NAMES);
});

test('la primera y la última apertura, sin contar los avisos automáticos', () => {
  const ds = createDataset({ start: 2024 });
  ds.add(row({ REPORTEDDATE: '2025-06-01 00:00:00' }));
  ds.add(row({ INCIDENTNUMBER: 'INC000000000002', REPORTEDDATE: '2026-10-13 12:00:00' }));
  ds.add(row({ INCIDENTNUMBER: 'INC000000000003', REPORTEDDATE: '2024-01-01 00:00:00', TAGS: 'AUTOTEC' }));
  ds.add(row({ INCIDENTNUMBER: 'INC000000000004', REPORTEDDATE: '2027-01-01 00:00:00', ASSIGNEDGROUP: 'OTRO' }));
  const { meta } = ds.build({ file: 'x', generated: 'y' });
  const at = (iso) => (Date.parse(`${iso}Z`) - Date.UTC(2024, 0, 1)) / 60000;
  assert.deepEqual([meta.first, meta.last], [at('2025-06-01T00:00:00'), at('2026-10-13T12:00:00')]);
});

test('el último cambio de cada issue, en minutos como la apertura', () => {
  const ds = createDataset({ start: 2026 });
  ds.add(row({ LASTMODIFIEDDATE: '2026-03-02 10:00:00' }));
  const { cols, meta } = ds.build({ file: 'x', generated: 'y' });
  assert.equal(cols.lm[0] - cols.rep[0], 1440);
  assert.equal(meta.snapshot, cols.lm[0]);
});

test('resoluciones repetidas: solo las usadas 4 veces o más', () => {
  const ds = createDataset({ start: 2026 });
  for (let n = 0; n < 4; n++) ds.add(row({ INCIDENTNUMBER: `INC00000000001${n}`, RESOLUTION: `Reinicio ${n}` }));
  ds.add(row({ INCIDENTNUMBER: 'INC000000000020', RESOLUTION: 'Otra cosa' }));
  const { cols, dict } = ds.build({ file: 'x', generated: 'y' });
  assert.deepEqual(cols.rz, [1, 1, 1, 1, 0]);
  assert.equal(dict.resol[1], 'reinicio #');
});

test('unos datos que no son los de la consulta, o sin issues del grupo: error con estado 400', () => {
  assert.throws(() => checkColumns({ A: '1' }), (e) => e.status === 400 && /La consulta de issues no trae/.test(e.message));
  assert.doesNotThrow(() => checkColumns(row()));
  const ds = createDataset({ start: 2026 });
  ds.add(row({ ASSIGNEDGROUP: 'OTRO' }));
  assert.throws(() => ds.build({ file: 'x', generated: 'y' }), (e) => e.status === 400 && /No hay issues del grupo AYS SOPORTE/.test(e.message));
});

test('cada issue con su problema; se enseña la forma más escrita', () => {
  const ds = createDataset({ start: 2026 });
  const titles = ['100001 High X - Cancelar pedidos', '100001 High X - Cancelar pedido', '100001 High X - Cancelar pedidos', '100001 High X', '100001 High X - Otro'];
  titles.forEach((SUMMARY, n) => ds.add(row({ INCIDENTNUMBER: `INC00000000003${n}`, SUMMARY })));
  const { cols, dict } = ds.build({ file: 'x', generated: 'y' });
  assert.deepEqual(cols.de, [1, 1, 1, 0, 2]);
  assert.deepEqual(dict.problem, ['', 'cancelar pedidos', 'otro']);
});

test('add dice si la incidencia entra en el informe (la misma regla que reportCount)', () => {
  const ds = createDataset({ start: 2026 });
  assert.equal(ds.add(row()), true);
  assert.equal(ds.add(row({ INCIDENTNUMBER: 'INC000000000002', ASSIGNEDGROUP: 'OTRO GRUPO' })), false);
  assert.equal(ds.add(row({ INCIDENTNUMBER: 'INC000000000003', TAGS: 'AUTOTEC' })), false);
  assert.equal(ds.add(row({ INCIDENTNUMBER: 'INC000000000004', TAGS: 'SISUINC' })), true);
});
