import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from '../model.js';
import { createCharts } from '../charts.js';
import { createTabs } from '../tabs.js';
import { data } from '../fixture.js';
import { hours } from './servicio.js';

const render = (svc, d = data()) => {
  const m = createModel(d); m.refilter();
  const ui = { exp: {}, sort: {}, svc }, tabs = createTabs(m, createCharts(m, ui), ui);
  return tabs.render('servicio', m.rows());
};
const times = (html) => html.slice(html.indexOf('mt-svc-times'), html.indexOf('¿Cumplimos los SLA?'));

test('todo en horas: sin decimales desde 10 h, uno como mucho hasta ahí y dos por debajo de una hora', () => {
  assert.deepEqual([4813, 3300, 576, 120, 60, 45, 15].map(hours), ['80 h', '55 h', '9,6 h', '2 h', '1 h', '0,75 h', '0,25 h']);
});

test('en la pestaña no queda ningún tiempo en días', () => {
  const d = data();
  d.cols.res[1] = 2000 + 5 * 1440;   // la de T-Systems tarda 5 días
  assert.doesNotMatch(render({ prev: true, ts: true }, d), /\bdías?\b \d|\d+ días?\b/);
});

test('en qué se va el tiempo: una barra de escaladas y otra sin escalar, y solo las escaladas tienen Tesc', () => {
  const html = times(render({ prev: false, ts: false }));
  assert.equal((html.match(/class="mt-svc-time"/g) || []).length, 2);
  const [esc, plain] = html.split('<p class="mt-svc-th"><b>Sin escalar</b>');
  assert.match(esc, /Escalada en Jira \(Tesc\)/);
  assert.doesNotMatch(plain, /Tesc/);
  assert.equal((plain.match(/<i class="mt-svc-pp\d"><\/i>/g) || []).length, 4, 'en la leyenda: cola, en curso, esperando al centro y otras esperas');
  // nunca se ha traído nada de Jira: la barra de escaladas dice que hay que actualizar
  assert.match(esc, /<em>aún no se ha traído nada de Jira: pulsa «Actualizar y generar informe»<\/em>/);
});

test('con Jira ya traído y sin escaladas: sin datos', () => {
  const d = data();
  d.meta.jira = { at: '2026-11-02T16:00:00Z', tickets: 10, message: '' };
  assert.match(times(render({ prev: false, ts: false }, d)).split('Sin escalar')[0], /<em>sin datos<\/em>/);
});

test('los tramos se apilan en su barra y suman su tiempo de resolución; una escalada sin Jira no cuenta', () => {
  const d = data();
  d.cols.fl[0] |= 131072;   // la crítica de Indra, escalada (resuelta en 60 min), con sus tres tiempos de Jira
  Object.assign(d.cols, { the: [10, -1, -1, -1, -1], tes: [40, -1, -1, -1, -1], tcr: [10, -1, -1, -1, -1] });
  d.cols.fl[3] |= 131072;   // la baja, escalada pero sin datos de Jira
  const html = times(render({ prev: false, ts: false }, d));
  const esc = html.split('Sin escalar')[0];
  assert.equal((esc.match(/<i class="mt-svc-pe\d" style="flex-grow:/g) || []).length, 3);
  assert.match(esc, /<b>1 h<\/b>/);   // en horas: 10 + 40 + 10 min
  assert.match(esc, /Escalada en Jira \(Tesc\): 0,67 h \(67 %\)/);
  assert.match(esc, /1 escaladas resueltas\nFuera: 1 sin datos de Jira/);
});

test('comparando: una fila por lado en cada barra', () => {
  const html = times(render({ prev: true, ts: true }));
  assert.equal((html.match(/class="mt-svc-row"/g) || []).length, 6);
  assert.match(html, /<span class="mt-svc-who">T-Systems<\/span>/);
});
