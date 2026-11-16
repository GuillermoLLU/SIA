import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublisher } from './publish.js';
import { FORMAT, REQUIRED } from './dataset.js';

// Un repositorio y un disco de mentira: el cálculo recorre lo que le dan y la copia va donde se le dice.
// Las rutas, siempre con «/»: path.join usa «\» en Windows y la prueba no debe depender del sistema.
const fakeFs = () => {
  const files = new Map(), ops = [];
  const p = (f) => f.replaceAll('\\', '/');
  return {
    files, ops,
    mkdirSync: (d) => ops.push(['mkdir', p(d)]),
    writeFileSync: (f, data) => { ops.push(['write', p(f)]); files.set(p(f), data); },
    renameSync: (a, b) => { ops.push(['rename', p(a), p(b)]); files.set(p(b), files.get(p(a))); files.delete(p(a)); },
    readFileSync: (f) => { if (!files.has(p(f))) throw new Error('ENOENT'); return files.get(p(f)); },
    rmSync: (f) => files.delete(p(f)),
  };
};
const now = () => new Date('2026-11-06T10:00:00Z');
const repo = (rows) => ({ firstYear: () => 2026, incidents: () => rows[Symbol.iterator]() });
// una fila de Remedy, del grupo (entra en el informe) o de otro (solo cuenta)
const row = (o = {}) => ({ ...Object.fromEntries(REQUIRED.map((c) => [c, ''])),
  INCIDENTNUMBER: 'INC000000000001', ASSIGNEDGROUP: 'AYS SOPORTE', ASSIGNEE: 'ANA LOPEZ', STATUS: 'CLOSED', PRIORITY: 'HIGH',
  REPORTEDDATE: '2026-03-01 10:00:00', RESOLUTION: 'Hecho', ...o });

test('publish calcula, escribe en un temporal y renombra; read devuelve la copia y null si el formato no es el actual', async () => {
  const fs = fakeFs();
  const pub = createPublisher({ repo: repo([row(), row({ INCIDENTNUMBER: 'INC000000000002' })]), dir: '/d', fs, now });
  const data = await pub.publish('issues.csv');
  assert.equal(data.meta.format, FORMAT);
  assert.equal(data.meta.file, 'issues.csv');
  assert.deepEqual(fs.ops, [['mkdir', '/d'], ['write', '/d/datos.json.tmp'], ['rename', '/d/datos.json.tmp', '/d/datos.json']]);
  assert.equal(pub.read().meta.format, FORMAT);
  fs.files.set('/d/datos.json', JSON.stringify({ meta: { format: 'otro' } }));
  assert.equal(pub.read(), null);   // una copia de otra versión no vale
  pub.remove();
  assert.equal(pub.read(), null);   // sin copia, null
});

test('compute solo avisa por las incidencias que entran en el informe', async () => {
  let n = 0;
  const pub = createPublisher({ repo: repo([row(), row({ INCIDENTNUMBER: 'INC000000000002', ASSIGNEDGROUP: 'OTRO GRUPO' }), row({ INCIDENTNUMBER: 'INC000000000003' })]), dir: '/d', fs: fakeFs(), now });
  const data = await pub.compute('issues.csv', () => { n += 1; });
  assert.equal(n, 2);
  assert.equal(data.meta.total, 3);
});
