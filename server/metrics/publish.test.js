import test from 'node:test';
import assert from 'node:assert/strict';
import { createPublisher, copyName } from './publish.js';
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
    readdirSync: (d) => [...files.keys()].filter((f) => f.startsWith(`${p(d)}/`)).map((f) => f.slice(p(d).length + 1)),
  };
};
const now = () => new Date('2026-11-06T10:00:00Z');
// sin tickets de Jira guardados (#85: el cálculo también lee los de Jira)
const repo = (rows) => ({ firstYear: () => 2026, incidents: () => rows[Symbol.iterator](), jiraTickets: () => new Map(), jiraFetched: () => null });
// una fila de Remedy, del grupo (entra en el informe) o de otro (solo cuenta)
const row = (o = {}) => ({ ...Object.fromEntries(REQUIRED.map((c) => [c, ''])),
  INCIDENTNUMBER: 'INC000000000001', ASSIGNEDGROUP: 'AYS SOPORTE', ASSIGNEE: 'ANA LOPEZ', STATUS: 'CLOSED', PRIORITY: 'HIGH',
  REPORTEDDATE: '2026-03-01 10:00:00', RESOLUTION: 'Hecho', ...o });

test('publish calcula, escribe en un temporal y renombra; read devuelve la copia y null si el formato no es el actual', async () => {
  const fs = fakeFs(), mine = `/d/${copyName()}`;
  const pub = createPublisher({ repo: repo([row(), row({ INCIDENTNUMBER: 'INC000000000002' })]), dir: '/d', fs, now });
  const data = await pub.publish('issues.csv');
  assert.equal(data.meta.format, FORMAT);
  assert.equal(data.meta.file, 'issues.csv');
  assert.equal(copyName(), `datos-f${FORMAT}.json`);   // una copia por formato
  assert.deepEqual(fs.ops, [['mkdir', '/d'], ['write', `${mine}.tmp`], ['rename', `${mine}.tmp`, mine]]);
  assert.equal(pub.read().meta.format, FORMAT);
  fs.files.set(mine, JSON.stringify({ meta: { format: 'otro' } }));
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

test('una copia por formato: la de otra versión no se pisa ni se lee; la de antes (datos.json), si es de este formato, vale', async () => {
  const fs = fakeFs(), mine = `/d/${copyName()}`;
  const pub = createPublisher({ repo: repo([row()]), dir: '/d', fs, now });
  // la de otra versión de SIA (p. ej. develop, formato 4), en su fichero: ni se lee ni se toca
  fs.files.set('/d/datos-f4.json', JSON.stringify({ meta: { format: 4 } }));
  fs.files.set('/d/datos.json', JSON.stringify({ meta: { format: 4 } }));
  assert.equal(pub.read(), null);
  await pub.publish('issues.csv');
  assert.equal(JSON.parse(fs.files.get('/d/datos-f4.json')).meta.format, 4);
  assert.equal(JSON.parse(fs.files.get('/d/datos.json')).meta.format, 4);
  // la de antes, de este formato: se lee (al pasar a esta versión no se recalcula)
  fs.files.delete(mine);
  fs.files.set('/d/datos.json', JSON.stringify({ meta: { format: FORMAT, file: 'antes' } }));
  assert.equal(pub.read().meta.file, 'antes');
  // save: guarda lo ya calculado, sin volver a calcular
  pub.save({ meta: { format: FORMAT, file: 'guardado' } });
  assert.equal(pub.read().meta.file, 'guardado');
  // borrar: todas, de este formato y de los demás
  pub.remove();
  assert.deepEqual(fs.readdirSync('/d'), []);
});
