import test from 'node:test';
import assert from 'node:assert/strict';
import { createDataset, REQUIRED, CsvError } from './dataset.js';
import { themesOf, readTitle, problemKey, THEME_NAMES } from './themes.js';

const row = (o = {}) => ({ ...Object.fromEntries(REQUIRED.map((c) => [c, ''])),
  INCIDENTNUMBER: 'INC000000000001', ASSIGNEDGROUP: 'AYS SOPORTE', ASSIGNEE: 'ANA LOPEZ', STATUS: 'CLOSED', PRIORITY: 'HIGH',
  REPORTEDDATE: '2026-03-01 10:00:00', RESOLUTION: 'Hecho', ...o });

test('solo el grupo y el año, sin avisos automáticos; textos en diccionarios con el 0 vacío', () => {
  const ds = createDataset({ year: 2026 });
  ds.add(row());
  ds.add(row({ INCIDENTNUMBER: 'INC000000000002', ASSIGNEDGROUP: 'OTRO GRUPO' }));
  ds.add(row({ INCIDENTNUMBER: 'INC000000000003', REPORTEDDATE: '2025-12-31 23:59:00' }));
  ds.add(row({ INCIDENTNUMBER: 'INC000000000004', ASSIGNEE: '' }));
  ds.add(row({ INCIDENTNUMBER: 'INC000000000005', TAGS: 'AUTOTEC' }));
  const out = ds.build({ file: 'issues.csv', generated: '2026-10-14 10:00' });
  assert.deepEqual(out.cols.id, [1, 4]);
  assert.equal(out.meta.rows, 2);
  assert.equal(out.meta.total, 5);
  assert.deepEqual(out.dict.person, ['', 'ANA LOPEZ']);
  assert.deepEqual(out.cols.as, [1, 0]);
  assert.deepEqual(out.company, [2, 1]);
  assert.equal(out.meta.snapshot, out.cols.rep[0]);
  assert.deepEqual(out.themes, THEME_NAMES);
});

test('el último cambio de cada issue, en minutos como la apertura', () => {
  const ds = createDataset({ year: 2026 });
  ds.add(row({ LASTMODIFIEDDATE: '2026-03-02 10:00:00' }));
  const { cols, meta } = ds.build({ file: 'x', generated: 'y' });
  assert.equal(cols.lm[0] - cols.rep[0], 1440);
  assert.equal(meta.snapshot, cols.lm[0]);
});

test('resoluciones repetidas: solo las usadas 4 veces o más', () => {
  const ds = createDataset({ year: 2026 });
  for (let n = 0; n < 4; n++) ds.add(row({ INCIDENTNUMBER: `INC00000000001${n}`, RESOLUTION: `Reinicio ${n}` }));
  ds.add(row({ INCIDENTNUMBER: 'INC000000000020', RESOLUTION: 'Otra cosa' }));
  const { cols, dict } = ds.build({ file: 'x', generated: 'y' });
  assert.deepEqual(cols.rz, [1, 1, 1, 1, 0]);
  assert.equal(dict.resol[1], 'reinicio #');
});

test('un CSV que no es el de la consulta, o sin issues del grupo en el año: CsvError', () => {
  assert.throws(() => createDataset({ year: 2026 }).add({ A: '1' }), CsvError);
  const ds = createDataset({ year: 2026 });
  ds.add(row({ ASSIGNEDGROUP: 'OTRO' }));
  assert.throws(() => ds.build({ file: 'x', generated: 'y' }), /no tiene issues del grupo AYS SOPORTE/);
});

test('temas: varios a la vez; el aviso automático, solo el suyo', () => {
  assert.equal(themesOf('incidencia ruta y/o etiqueta del pedido'), 1);
  const m = themesOf('etiqueta mal impresa en packing');
  assert.ok(m & (1 << THEME_NAMES.indexOf('Etiquetas e impresión')));
  assert.ok(m & (1 << THEME_NAMES.indexOf('Packing y empaquetado')));
  assert.equal(themesOf('nada que ver'), 0);
});

test('el problema es lo que va tras « - »; los temas se buscan solo ahí, no en la cabecera del centro', () => {
  const t = readTitle(' 100632 Low ECOM ZARA POLONIA STRYKOW PACKING - [TEC] Error etiqueta 12. ');
  assert.equal(t.problem, '[tec] error etiqueta #');
  assert.ok(t.themes & (1 << THEME_NAMES.indexOf('Etiquetas e impresión')));
  assert.equal(t.themes & (1 << THEME_NAMES.indexOf('Packing y empaquetado')), 0);
  assert.deepEqual(readTitle('100632 Low ECOM ZARA PACKING'), { problem: '', themes: 0 });   // sin descripción
  assert.equal(readTitle('No arranca la PDA').problem, 'no arranca la pda');                   // sin cabecera: todo
  assert.deepEqual(readTitle('100001 High INCIDENCIA RUTA Y/O ETIQUETA: pedido #3'), { problem: 'pedido ##', themes: 1 });
});

test('problema: sin etiquetas entre corchetes y en singular, para juntar las formas de escribir lo mismo', () => {
  assert.equal(problemKey('[tec] error etiquetas'), problemKey('error etiqueta'));
  assert.equal(problemKey('cancelar pedidos'), problemKey('cancelar pedido'));
  assert.notEqual(problemKey('permisos de usuario sisu'), problemKey('permisos de usuario'));
  assert.equal(problemKey('[pos]'), '');
});

test('cada issue con su problema; se enseña la forma más escrita', () => {
  const ds = createDataset({ year: 2026 });
  const titles = ['100001 High X - Cancelar pedidos', '100001 High X - Cancelar pedido', '100001 High X - Cancelar pedidos', '100001 High X', '100001 High X - Otro'];
  titles.forEach((SUMMARY, n) => ds.add(row({ INCIDENTNUMBER: `INC00000000003${n}`, SUMMARY })));
  const { cols, dict } = ds.build({ file: 'x', generated: 'y' });
  assert.deepEqual(cols.de, [1, 1, 1, 0, 2]);
  assert.deepEqual(dict.problem, ['', 'cancelar pedidos', 'otro']);
});
