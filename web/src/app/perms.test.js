import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createPermsWatch } from './perms.js';

const fail = (data = {}) => Object.assign(new Error('fallo'), { data });
const setup = (answers) => {
  const log = [], timeouts = [], on = new Map();
  let clock = 100_000;
  const watch = createPermsWatch({
    api: async () => { const a = answers.shift(); if (a instanceof Error) throw a; return { base: a }; },
    onUpdate: (access, opts) => log.push(['update', access, opts]),
    onLost: () => log.push(['lost']),
    win: { addEventListener: (t, f) => on.set(`win:${t}`, f) },
    doc: { body: { classList: { contains: () => false } }, visibilityState: 'visible', addEventListener: (t, f) => on.set(`doc:${t}`, f) },
    timers: { setTimeout: (f, ms) => { timeouts.push([f, ms]); return timeouts.length; }, clearTimeout: () => {}, setInterval: () => {} },
    now: () => clock,
  });
  return { watch, log, timeouts, on, tick: (ms) => { clock += ms; } };
};
const PERMS = { perms: { lab: true } };

test('la base responde: sus permisos y si han cambiado', async () => {
  const s = setup([PERMS, PERMS]);
  await s.watch.refresh();
  await s.watch.refresh({ quiet: true });
  assert.deepEqual(s.log.map(([k, , o]) => [k, o.changed]), [['update', true], ['update', false]]);
  assert.deepEqual(s.watch.perms(), { lab: true });
});

test('la instancia sin base (noDb): fuera lo que depende de ella y sin reintentos en bucle', async () => {
  const s = setup([fail({ noDb: true })]);
  await s.watch.refresh({ quiet: true });
  assert.deepEqual(s.log, [['lost']]);
  assert.equal(s.timeouts.length, 0, 'lo vuelve a mirar la revisión de cada dos minutos');
});

test('un fallo pasajero al entrar: sin base de momento, y se reintenta en breve hasta cuatro veces', async () => {
  const s = setup([fail(), fail(), fail(), fail(), fail(), PERMS]);
  await s.watch.refresh();
  assert.deepEqual(s.log, [['lost']]);
  for (let i = 0; i < 4; i += 1) await s.timeouts[i][0]();
  assert.equal(s.timeouts.length, 4, 'después del cuarto, ya no programa más');
  assert.equal(s.timeouts[0][1], 15_000);
  assert.deepEqual(s.log, [['lost']], 'en los reintentos (automáticos) un fallo pasajero no esconde nada');
});

test('un fallo pasajero en la revisión automática no esconde nada; si vuelve, reaparece', async () => {
  const s = setup([PERMS, fail(), PERMS]);
  await s.watch.refresh();
  await s.watch.refresh({ quiet: true });
  assert.deepEqual(s.log.map(([k]) => k), ['update']);
  await s.timeouts[0][0]();
  assert.deepEqual(s.log.map(([k]) => k), ['update', 'update']);
});

test('al volver el foco se revisa, pero no dos veces seguidas en diez segundos', async () => {
  const s = setup([PERMS, PERMS]);
  s.on.get('win:focus')();
  s.on.get('doc:visibilitychange')();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(s.log.length, 1);
  s.tick(10_000);
  s.on.get('win:focus')();
  await Promise.resolve(); await Promise.resolve();
  assert.equal(s.log.length, 2);
});
