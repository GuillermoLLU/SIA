import test from 'node:test';
import assert from 'node:assert/strict';
import { progressOf, estimate, leftLabel, progressHtml, PHASES, CSV_PHASES, CLEAR_PHASES } from './progress.js';

const prepare = { phase: 'prepare', done: 0, total: 0 };
const connect = { phase: 'connect', done: 0, total: 0 };
const download = (done, total) => ({ phase: 'download', done, total });
const compute = (done, total) => ({ phase: 'compute', done, total });
const COMPUTE_S = PHASES[3].usual;

test('las fases: preparar el conector, conectar, traer y recalcular', () => {
  assert.deepEqual(PHASES.map((x) => x.id), ['prepare', 'connect', 'download', 'compute']);
});

test('preparar y conectar no dan cifras: la barra avanza desde el primer momento con lo habitual, sin decir cuánto queda', () => {
  const start = progressOf(null, { elapsed: 0, phaseMs: 0 });
  assert.deepEqual(start, { phase: 0, percent: 0, detail: 'Cargando el conector: la primera vez tras arrancar SIA puede tardar un poco.', left: 'Calculando cuánto queda…' });
  const a = progressOf(prepare, { elapsed: 2000, phaseMs: 2000 }).percent, b = progressOf(prepare, { elapsed: 4000, phaseMs: 4000 }).percent;
  assert.ok(a > 0 && b > a, `avanza: ${a} → ${b}`);
  // si el conector tarda mucho más de lo habitual (poca memoria), la barra sigue moviéndose, sin llegar al final
  const slow = [20000, 30000].map((ms) => progressOf(prepare, { elapsed: ms, phaseMs: ms }).percent);
  assert.ok(slow[1] > slow[0] && slow[1] < 60, `${slow}`);
  assert.equal(progressOf(connect, { elapsed: 8000, phaseMs: 1000 }).detail, 'Si se abre el navegador, entra con tu cuenta de Inditex.');
});

test('traer: lo que falta a su ritmo, más lo que suele tardar el recálculo', () => {
  assert.equal(estimate(download(0, 3000), 5000).known, false, 'sin ninguna aún, no hay ritmo');
  assert.equal(estimate(download(10, 3000), 1000).known, false, 'los primeros segundos no dicen nada');
  // 1.000 en 20 s: las 2.000 que faltan, 40 s más; y el recálculo
  assert.deepEqual(estimate(download(1000, 3000), 20000), { s: 40 + COMPUTE_S, known: true });
  assert.deepEqual(estimate(download(0, 0), 3000), { s: COMPUTE_S, known: true }, 'sin nada que traer, solo el recálculo');
});

test('recalcular: a su ritmo; hasta tenerlo, lo que suele tardar menos lo que lleva', () => {
  assert.deepEqual(estimate(compute(0, 85000), 1000), { s: COMPUTE_S - 1, known: true });
  assert.ok(estimate(compute(0, 85000), 60000).s > 0, 'si se alarga, nunca cero');
  assert.equal(Math.round(estimate(compute(42500, 85000), 15000).s), 15);
});

test('el caso de la captura (2.095 de 3.048 a los ~107 s): lo que de verdad queda', () => {
  const v = progressOf(download(2095, 3048), { elapsed: 107000, phaseMs: 100000 });
  assert.equal(v.left, 'Queda un minuto, más o menos');   // 953 a ~48 ms cada una (~45 s) + 35 s de recálculo
  assert.equal(v.percent, 57);
  assert.equal(v.detail, '2095 de 3048 incidencias');
});

test('el porcentaje es de tiempo y nunca llega a 100 hasta acabar', () => {
  assert.equal(progressOf(compute(42500, 85000), { elapsed: 45000, phaseMs: 15000 }).percent, 75);   // 45 s hechos, 15 por delante
  assert.equal(progressOf(compute(84999, 85000), { elapsed: 80000, phaseMs: 40000 }).percent, 99);
});

test('lo que queda, en palabras', () => {
  assert.equal(leftLabel(4), 'Casi está');
  assert.equal(leftLabel(21), 'Quedan unos 25 s');
  assert.equal(leftLabel(75), 'Queda un minuto, más o menos');
  assert.equal(leftLabel(250), 'Quedan unos 4 min');
});

test('la tarjeta: el porcentaje, la barra, lo que queda y los pasos hechos, el de ahora y los que faltan', () => {
  const html = progressHtml({ phase: 2, percent: 19, detail: '15.000 de 30.000 incidencias', left: 'Quedan unos 40 s' });
  assert.match(html, /aria-valuenow="19"/);
  assert.match(html, /<b>19<\/b><span>%<\/span>/);
  assert.match(html, /width:19%/);
  assert.match(html, /<b>Sincronizando nuevas y modificadas<\/b><span>Quedan unos 40 s<\/span>/);
  assert.deepEqual([...html.matchAll(/<li class="([^"]*)">/g)].map((x) => x[1]), ['mt-done', 'mt-done', 'mt-now', '']);
});

test('el CSV: el avance en MB leídos, con sus propias fases (leer y guardar, recalcular)', () => {
  const MB = 1048576;
  const v = progressOf({ phase: 'download', done: 50 * MB, total: 100 * MB, unit: 'bytes' }, { elapsed: 10000, phaseMs: 10000 }, CSV_PHASES);
  assert.equal(v.phase, 0);
  assert.equal(v.detail, '50 MB de 100 MB');
  assert.match(progressHtml(v, CSV_PHASES), /Leer el CSV y guardar sus incidencias/);
  assert.doesNotMatch(progressHtml(v, CSV_PHASES), /Conectar con Snowflake/);
});

test('sin avance aún (null), la primera pintura no falla, ni en el CSV (su primera fase es leer)', () => {
  assert.doesNotThrow(() => progressOf(null, { elapsed: 0, phaseMs: 0 }, CSV_PHASES));
  assert.equal(progressOf(null, { elapsed: 0, phaseMs: 0 }, CSV_PHASES).phase, 0);
});

test('sin cifras aún, el detalle dice que se prepara; nunca NaN', () => {
  const v = progressOf(null, { elapsed: 0, phaseMs: 0 }, CLEAR_PHASES);
  assert.equal(v.detail, '', 'al borrar no hay detalle');
  assert.doesNotMatch(progressOf({ phase: 'clear', done: 10, total: 100 }, { elapsed: 5000, phaseMs: 5000 }, CLEAR_PHASES).detail, /NaN/);
});
