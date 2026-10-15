import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { createCharts } from './charts.js';
import { createTabs, TABS } from './tabs.js';

// Cinco issues inventadas (minutos desde el 1 de enero; la foto, en el minuto 100.000):
// 1 Indra crítica, en curso a los 10 min · 2 T-Systems alta, en curso a los 100 min
// 3 Indra media, abierta y sin iniciar · 4 Indra baja, cerrada sin pasar por En curso
// 5 sin responsable
const SNAP = 100000;
const data = () => ({
  meta: { file: 'x.csv', year: 2026, group: 'AYS SOPORTE', rows: 5, total: 5, snapshot: SNAP, generated: '2026-10-14T08:00:00Z' },
  dict: { status: ['', 'CLOSED', 'ASSIGNED'], reason: [''], prio: ['', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'], svc: ['', 'USER_SERVICE_RESTORATION'],
    person: ['', 'ANA', 'LUIS'], centre: ['', 'C1'], op: ['', 'ECOM Zara'], module: ['', 'EWMS', 'PACKING'], cat: ['', 'X'],
    vtype: ['', 'TEC'], vproj: ['', 'SGA'], vkey: ['', 'SGA-1'], resol: ['', 'reinicio'], problem: ['', 'etiqueta mal'] },
  themes: ['Tema A', 'Tema B'],
  company: [2, 0, 1],
  cols: {
    id: [1, 2, 3, 4, 5], rep: [1000, 2000, SNAP - 200, 5000, 6000], res: [1060, 5000, -1, 5100, 6001],
    st: [1, 1, 2, 1, 1], rs: [0, 0, 0, 0, 0], pr: [1, 2, 3, 4, 2], sv: [1, 1, 1, 1, 1], as: [1, 2, 1, 1, 0],
    ce: [1, 1, 1, 0, 1], op: [1, 1, 1, 1, 1], mo: [1, 2, 1, 2, 1], k3: [1, 0, 1, 1, 1], sc: [1, 2, 1, 0, 0], fl: [0, 512, 0, 0, 0],
    vt: [1, 0, 0, 0, 0], vp: [1, 0, 0, 0, 0], vk: [1, 0, 0, 0, 0], fr: [10, 100, -1, 50, 1], ip: [10, 100, -1, -1, -1],
    tA: [10, 100, 200, 50, 0], tI: [50, 2900, 0, 0, 0], tPc: [0, 0, 0, 0, 0], tPv: [0, 0, 0, 0, 0], tPo: [0, 0, 0, 0, 0],
    nb: [0, 1, 0, 0, 0], np: [0, 0, 0, 0, 0], th: [1, 2, 3, 0, 0], rz: [1, 0, 0, 0, 0], de: [1, 0, 0, 0, 0],
    su: ['100001 High ECOM ZARA C1 EWMS - Etiqueta mal', 'Otro título', 'Abierta', '100002 Low ALGO', 'Sin responsable'],
  },
});

test('lo derivado de cada issue: empresa, abierta, mes', () => {
  const m = createModel(data());
  assert.deepEqual([...m.TEAM], [0, 1, 0, 0, 2]);
  assert.deepEqual([...m.OPEN], [0, 0, 1, 0, 0]);
  assert.equal(m.MONTH[2], 2);   // minuto 99.800 → marzo
  assert.equal(m.LASTM, 2);
});

test('de partida, solo nuestro equipo (Indra); comparar es añadir un segundo lado', () => {
  const m = createModel(data());
  m.refilter();
  assert.deepEqual(m.rows(), [0, 2, 3]);
  assert.equal(m.CMP(), false);
  m.S.sides[1] = { company: 1 }; m.refilter();
  assert.deepEqual(m.rows(), [0, 1, 2, 3]);
  assert.deepEqual([...m.SIDE], [0, 1, 0, 0, 2]);
  assert.deepEqual(m.NAMES(), ['Indra', 'T-Systems']);
  m.S.sides[1] = { company: 2 }; m.refilter();
  assert.deepEqual(m.rows(), [0, 2, 3, 4]);
});

test('el turno en que entra cada issue y si se empezó en ese mismo turno', () => {
  const m = createModel(data());
  // minuto 1.000 = 1 de enero, 16:40 (tarde); 2.000 = 2 de enero, 9:20 (mañana); 6.000 = 5 de enero (lunes), 4:00 (noche del domingo)
  assert.deepEqual([0, 1, 4].map(m.DIMS.tu.get), [1, 0, 2]);
  assert.deepEqual([0, 1, 4].map(m.DIMS.we.get), [0, 0, 1]);
  assert.equal(m.stats([0, 1]).inShift, 1);   // la 1 a los 10 min y la 2 a los 100: en su turno
  assert.equal(m.stats([2]).inShift, null);   // sin empezar
});

test('tarjetas: SGA y SISU por el ámbito, PRIO por la etiqueta (además de su SGA o SISU); si no, sin tarjeta', () => {
  const d = data(); d.cols.fl[0] = 2;   // la 1, SGA y priorizada
  const m = createModel(d);
  assert.deepEqual([0, 1, 3].map(m.DIMS.tj.get), [[0, 2], [1], [3]]);
});

test('situación de cada issue: en curso, sin tocar o devuelta a Asignada, en espera de un tercero, del cliente u otro motivo, o cerrada; y si está escalada', () => {
  const d = data();
  d.dict.status = ['', 'CLOSED', 'ASSIGNED', 'IN_PROGRESS', 'PENDING'];
  d.dict.reason = ['', 'THIRD_PARTY_VENDOR_ACTION_REQD', 'CUSTOMER_FOLLOW_UP_REQUIRED', 'FUTURE_ENHANCEMENT'];
  d.cols.st = [3, 2, 4, 4, 4]; d.cols.rs = [0, 0, 1, 2, 3];
  const m = createModel(d);
  assert.deepEqual([0, 2, 3, 4].map(m.DIMS.sit.get), [0, 3, 4, 5]);
  assert.equal(m.DIMS.sit.get(1), 2);   // en Asignada pero con una primera actuación: devuelta
  d.cols.fr[1] = -1;
  assert.equal(createModel(d).DIMS.sit.get(1), 1);   // en Asignada sin ningún movimiento: sin tocar
  d.cols.vt[1] = 1;
  assert.equal(createModel(d).DIMS.sit.get(1), 2);   // sin cambios de estado pero escalada: ya se trabajó
  assert.equal(createModel(data()).DIMS.sit.get(0), 6);   // cerrada
  assert.deepEqual([0, 1].map(createModel(data()).DIMS.es.get), [1, 0]);   // la 1 tiene ticket de tercero
});

test('la foto de hoy no mira el periodo; con anySide, tampoco el lado', () => {
  const m = createModel(data());
  m.S.from = m.S.to = 2; m.refilter();   // solo marzo: la 3
  assert.deepEqual(m.rows(), [2]);
  assert.deepEqual(m.today(), [0, 2, 3]);
  assert.deepEqual(m.today(true), [0, 1, 2, 3, 4]);
});

test('resueltas en el turno en que entraron', () => {
  const m = createModel(data());
  assert.equal(m.stats([0, 1]).resInShift, 0.5);   // la 1, en 60 min; la 2 se resuelve 2 días después
});

test('filtrar: cada gráfico ignora el filtro de su propia dimensión; buscar por título o número', () => {
  const m = createModel(data());
  m.S.sides[1] = { company: 1 };
  m.toggle('pr', 1); m.refilter();
  assert.deepEqual(m.rows(), [0]);
  assert.equal(m.group('pr').length, 4);
  m.toggle('pr', 1); m.S.q = 'inc000000000002'; m.refilter();
  assert.deepEqual(m.rows(), [1]);
});

test('una persona frente a una empresa, frente a su propia empresa (el resto) o sola', () => {
  const m = createModel(data());
  m.S.sides = [{ people: new Set([1]) }, { company: 1 }]; m.refilter();
  assert.deepEqual(m.NAMES(), ['ANA', 'T-Systems']);
  assert.deepEqual(m.rows(), [0, 1, 2, 3]);
  assert.equal(m.CMP(), true);
  m.S.sides = [{ people: new Set([2]) }, { company: 1 }]; m.refilter();
  assert.deepEqual(m.NAMES(), ['LUIS', 'Resto de T-Systems']);   // LUIS es de T-Systems: cuenta solo en A
  assert.deepEqual([...m.SIDE], [2, 0, 2, 2, 2]);
  m.S.sides = [{ people: new Set([1, 2]) }, null]; m.refilter();
  assert.deepEqual(m.NAMES(), ['2 personas', '']);
  assert.deepEqual(m.CO(), [0]);
  assert.equal(m.CMP(), false);
  assert.deepEqual(m.pool(), [0, 1, 2, 3, 4]);   // para elegir personas, todas, sea cual sea su lado
});

test('SLA de inicio: dentro, fuera, sin iniciar y fuera de plazo, cerrada sin pasar por En curso', () => {
  const m = createModel(data());
  m.S.sides[1] = { company: 1 }; m.refilter();
  const [indra, other] = m.bySide(m.rows()).map(m.stats);
  assert.equal(indra.sla, 0.5);       // la 1 a tiempo; la 3, abierta sin iniciar y vencida
  assert.equal(indra.waitKo, 1);
  assert.equal(indra.noIp, 1 / 3);    // la 4
  assert.equal(other.sla, 0);         // la 2, a los 100 min con 45 de plazo
  assert.deepEqual([0, 1, 2, 3].map(m.DIMS.sl.get), [0, 2, 4, 6]);
});

test('indicadores de un grupo', () => {
  const m = createModel(data());
  const s = m.stats([0, 1]);
  assert.equal(s.avg, (60 + 3000) / 2);
  assert.equal(s.d1, 0.5);
  assert.equal(s.reop, 0.5);
  assert.equal(s.vend, 0.5);
  assert.deepEqual(s.time, [110, 2950, 0, 0, 0]);
});

test('de las resueltas: SLA cumplido, resueltas por día, prioridades y marcas de IA', () => {
  const m = createModel(data());
  const s = m.stats([0, 1, 3]);           // resueltas las tres; la 1 empezó a tiempo, la 2 tarde, la 4 nunca pasó a En curso
  assert.equal(s.slaDoneOk, 1);
  assert.equal(s.slaDone, 1 / 3);
  assert.equal(s.perDay, 3 / 2);          // minutos 1060, 5000 y 5100: dos días distintos
  assert.equal(s.inPerDay, 3 / 3);        // abiertas en los minutos 1000, 2000 y 5000: tres días
  assert.deepEqual(s.prio, [0, 1, 1, 0, 1]);
  assert.equal(s.ia, 0);
});

test('todas las pestañas se pintan en cada modo, sin huecos ni NaN', () => {
  const m = createModel(data()), ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  const sides = [[{ company: 0 }, { company: 1 }], [{ company: 0 }, null], [{ people: new Set([1]) }, { company: 1 }], [{ people: new Set([2]) }, { people: new Set([1]) }]];
  for (const pair of sides) {
    for (const q of ['', 'nada así']) {
      Object.assign(m.S, { sides: pair, q });
      m.refilter();
      for (const [tab] of TABS) assert.doesNotMatch(tabs.render(tab, m.rows()), /undefined|NaN|\[object/, `${tab} ${m.NAMES()} «${q}»`);
    }
  }
});
