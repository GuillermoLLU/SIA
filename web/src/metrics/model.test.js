import test from 'node:test';
import assert from 'node:assert/strict';
import { createModel } from './model.js';
import { data, SNAP } from './fixture.js';
import { createCharts } from './charts.js';
import { createTabs, TABS } from './tabs.js';

test('lo derivado de cada incidencia: empresa, abierta, mes', () => {
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

test('el turno en que entra cada incidencia y si se empezó en ese mismo turno', () => {
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

test('situación de cada incidencia: en curso, sin tocar o devuelta a Asignada, en espera de un tercero, del cliente u otro motivo, o cerrada; y si está escalada', () => {
  const d = data();
  d.cols.fl[0] |= 131072;   // la primera, escalada: ha estado en Pendiente de un tercero
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
  assert.deepEqual([0, 1].map(createModel(d).DIMS.es.get), [1, 0]);   // la 1 ha estado en Pendiente de un tercero; tener ticket no basta
});

test('la foto de hoy no mira el periodo; con anySide, tampoco el lado', () => {
  const m = createModel(data());
  m.setPeriod(m.minuteOf(2), m.END_D); m.refilter();   // solo marzo: la 3
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

test('una persona frente a una empresa, frente a su propia empresa (todo el equipo, ella incluida) o sola', () => {
  const m = createModel(data());
  m.S.sides = [{ people: new Set([1]) }, { company: 1 }]; m.refilter();
  assert.deepEqual(m.NAMES(), ['ANA', 'T-Systems']);
  assert.deepEqual(m.rows(), [0, 1, 2, 3]);
  assert.equal(m.CMP(), true);
  m.S.sides = [{ people: new Set([2]) }, { company: 1 }]; m.refilter();
  assert.deepEqual(m.NAMES(), ['LUIS', 'T-Systems']);   // LUIS es de T-Systems: su issue va en A y en las cifras de T-Systems
  assert.deepEqual([...m.SIDE], [2, 0, 2, 2, 2]);
  assert.deepEqual(m.bySide(m.rows())[1], []);   // y LUIS, sin actividad en los últimos 30 días, no cuenta en el equipo
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
  assert.equal(indra.noIpDone, 1 / 2);    // de las cerradas (la 1 y la 4), la 4
  assert.equal(other.sla, 0);         // la 2, a los 100 min con 45 de plazo
  assert.deepEqual([0, 1, 2, 3].map(m.DIMS.sl.get), [0, 2, 4, 6]);
});

test('indicadores de un grupo', () => {
  const d = data();
  d.cols.fl[0] |= 131072;   // la primera, escalada
  const m = createModel(d);
  const s = m.stats([0, 1]);
  assert.equal(s.avg, (60 + 3000) / 2);
  assert.equal(s.d1, 0.5);
  assert.equal(s.reop, 0.5);
  assert.equal(s.vend, 0.5);
});

test('de las resueltas: SLA cumplido, resueltas por día, prioridades y marcas de IA', () => {
  const m = createModel(data());
  const s = m.stats([0, 1, 3]);           // resueltas las tres; la 1 empezó a tiempo, la 2 tarde, la 4 nunca pasó a En curso
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

test('tema principal: el primero de los suyos, para que cada incidencia cuente en uno solo; sin tema, el último', () => {
  const m = createModel(data());   // th: [A, B, A y B, ninguno, ninguno]
  assert.deepEqual([0, 1, 2, 3].map(m.DIMS.tp.get), [0, 1, 0, 2]);
  assert.equal(m.DIMS.tp.label(2), 'Sin tema detectado');
});

test('ficha con filas que se despliegan: el tema, en sus problemas; «Otros» suma lo que no cabe', () => {
  const d = data(); d.cols.de = [1, 0, 2, 0, 0]; d.dict.problem = ['', 'etiqueta mal', 'otro'];
  const m = createModel(d), ui = { exp: {}, sort: {} }, ch = createCharts(m, ui);
  m.refilter();
  const html = () => ch.scorecard('tp', [['Volumen', ['n']]], { id: 't', child: { dim: 'de', top: 1, noun: 'problemas' } });
  assert.equal((html().match(/mt-sc-kid/g) || []).length, 0);
  ui.exp['t:0'] = true;   // Tema A: las issues 1 y 3 (la 2 es de T-Systems)
  const h = html();
  assert.match(h, /data-f="de:\d"/);
  assert.match(h, /Otros 1 problemas/);
  assert.equal((h.match(/mt-sc-kid/g) || []).length, 2);
});

test('comparando con personas, una empresa es todo su equipo: quien tuvo actividad en los 30 días antes de la foto, también la persona comparada', () => {
  const d = data();   // ANA (1, Indra): la 3, abierta hace nada; LUIS (2, T-Systems)
  const m = createModel(d);
  m.S.sides = [{ company: 0 }, { company: 1 }]; m.refilter();
  assert.equal(m.perHead(), false);
  m.S.sides = [{ people: new Set([1]) }, { company: 0 }]; m.refilter();   // ANA frente a Indra
  assert.equal(m.perHead(), true);
  assert.deepEqual([...m.heads(1)], [1]);
  assert.deepEqual(m.bySide(m.rows())[1], [0, 2, 3]);   // todo lo de Indra, también lo de ANA
  assert.equal(m.NAMES()[1], 'Indra');
  d.cols.rep[2] = SNAP - 40 * 1440;   // ANA, sin nada en los últimos 30 días: ya no cuenta en el equipo
  const m2 = createModel(d); m2.S.sides = [{ people: new Set([1]) }, { company: 0 }]; m2.refilter();
  assert.equal(m2.heads(1).size, 0);
  assert.deepEqual(m2.bySide(m2.rows())[1], []);
});

test('Mes a mes comparando: entre empresas, en relación a lo que entra; persona frente a su empresa, con la media del equipo', () => {
  const m = createModel(data()), ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  m.S.sides = [{ company: 0 }, { company: 1 }]; m.refilter();
  let h = tabs.render('entrada', m.rows());
  assert.match(h, /mt-led2/);
  assert.match(h, /Resueltas por cada 100 recibidas/);
  assert.match(h, /Qué recibe cada uno/);   // y Qué entra, sin meses: lo que recibe cada lado
  assert.doesNotMatch(h, /Qué entra cada mes/);
  assert.doesNotMatch(h, /undefined|NaN/);
  m.S.sides = [{ people: new Set([1]) }, { company: 0 }]; m.refilter();
  h = tabs.render('entrada', m.rows());
  assert.match(h, /Media de Indra/);
  assert.match(h, /Pendientes al cierre/);
  assert.doesNotMatch(h, /undefined|NaN/);
});

test('Entrada y Backlog comparando, sin tarjetas (cada empresa las usa a su manera); sin comparar, Entrada sí las tiene', () => {
  const m = createModel(data()), ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  m.refilter();
  assert.match(tabs.render('entrada', m.rows()), />Tarjeta</);
  m.S.sides = [{ company: 0 }, { company: 1 }]; m.refilter();
  for (const tab of ['entrada', 'backlog']) assert.doesNotMatch(tabs.render(tab, m.rows()), />Tarjeta<|>PRIO<|undefined|NaN/);
});

test('Módulos no compara empresas: se pinta solo la primera y el lado de comparar se queda como estaba', () => {
  const m = createModel(data());
  m.S.sides[1] = { company: 1 }; m.refilter();
  assert.deepEqual(m.alone((A) => A), [0, 2, 3]);
  assert.deepEqual(m.S.sides[1], { company: 1 });
  assert.deepEqual(m.rows(), [0, 1, 2, 3]);
  const html = createTabs(m, createCharts(m, { exp: {}, sort: {} }), { exp: {}, sort: {} }).render('modulos', m.rows());
  assert.match(html, /no compara empresas/);
  assert.match(html, /Quién lleva cada módulo/);
  assert.doesNotMatch(html, /Qué toca cada uno/);
});

test('Módulos con personas: qué toca cada uno, sin las fichas', () => {
  const m = createModel(data());
  m.S.sides = [{ people: new Set([1]) }, { people: new Set([2]) }]; m.refilter();
  const html = createTabs(m, createCharts(m, { exp: {}, sort: {} }), { exp: {}, sort: {} }).render('modulos', m.rows());
  assert.match(html, /Qué toca cada uno/);
  assert.doesNotMatch(html, /Quién lleva cada módulo|no compara empresas/);
});

test('Resolución no compara empresas; con personas, módulo a módulo y la media frente a sus mismos módulos', () => {
  const m = createModel(data()), ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  m.S.sides = [{ company: 0 }, { company: 1 }]; m.refilter();
  let h = tabs.render('resolucion', m.rows());
  assert.match(h, /no compara empresas/);
  h = tabs.render('escalados', m.rows());
  assert.match(h, /no compara: se ve solo Indra/);
  assert.match(h, /Malos escalados/);
  m.S.sides = [{ people: new Set([1]) }, { company: 0 }]; m.refilter();   // ANA frente a Indra
  h = tabs.render('resolucion', m.rows());
  assert.match(h, /Módulo a módulo/);
  assert.match(h, /Media frente a sus módulos/);
  assert.match(h, /Indra, en sus módulos/);
  assert.doesNotMatch(h, /Malos escalados|no compara/);
  assert.match(tabs.render('escalados', m.rows()), /no compara: se ve solo ANA/);
  assert.doesNotMatch(h, /<h3>En qué se va el tiempo<\/h3>/);   // ahora en Análisis tiempos
  m.S.sides = [{ people: new Set([2]) }, { people: new Set([1]) }]; m.refilter();   // dos personas: sin la referencia del equipo
  h = tabs.render('resolucion', m.rows());
  assert.match(h, /Módulo a módulo/);
  assert.doesNotMatch(h, /frente a sus módulos|undefined|NaN/);
});

test('SLA y calidad: tramos de paso a En curso que caen en los plazos y marcas de calidad y registro', () => {
  const m = createModel(data());
  const all = m.rows();
  for (const i of all) {
    const k = m.DIMS.ini.get(i), v = m.C.ip[i];
    if (v >= 0) assert.ok(k <= 6 && (k === 0 ? v <= 15 : v > [15, 45, 120, 480, 1440, 10080][k - 1]));
    else assert.equal(k, m.OPEN[i] ? 7 : 8);
    const q = m.DIMS.q.get(i);
    assert.ok(q.length && (q.includes(7) ? q.length === 1 : true));
  }
  const s = m.stats(all);
  assert.ok(s.noIpDone === null || (s.noIpDone >= 0 && s.noIpDone <= 1));
  const html = createTabs(m, createCharts(m, { exp: {}, sort: {} }), { exp: {}, sort: {} }).render('sla', all);
  assert.match(html, /Cuándo pasan a En curso/);
  assert.match(html, /Por prioridad y tarjeta/);
  assert.doesNotMatch(html, /undefined|NaN/);
});

test('SLA y calidad comparando: entre empresas, por prioridad y con el mismo trabajo, sin turnos; con personas, sin módulos', () => {
  const m = createModel(data()), ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  m.S.sides = [{ company: 0 }, { company: 1 }]; m.refilter();
  let h = tabs.render('sla', m.rows());
  assert.match(h, /Dentro del SLA, con el mismo trabajo/);
  assert.match(h, /Módulo a módulo/);
  assert.doesNotMatch(h, /Por turno y día de entrada|Tarjeta|>Título sin descripción<|undefined|NaN/);   // la columna, no la nota
  m.S.sides = [{ people: new Set([1]) }, { company: 0 }]; m.refilter();   // ANA frente a Indra
  h = tabs.render('sla', m.rows());
  assert.match(h, /Indra, con ese trabajo/);
  assert.match(h, />Título sin descripción</);
  assert.doesNotMatch(h, /Por turno y día de entrada|Módulo a módulo|undefined|NaN/);
});

test('IA: uso de cada incidencia por sus marcas (con fallo manda sobre revisada OK) y la pestaña sin huecos', () => {
  const d = data();
  d.cols.fl[0] = 32 | 2048 | 4096; d.cols.fl[1] = 2048 | 4096 | 8192; d.cols.fl[2] = 2048;
  const m = createModel(d);
  assert.deepEqual([0, 1, 2, 3].map(m.DIMS.ia.get), [0, 1, 2, 3]);
  const html = createTabs(m, createCharts(m, { exp: {}, sort: {} }), { exp: {}, sort: {} }).render('ia', m.rows());
  assert.match(html, /Módulos donde se usa/);
  assert.doesNotMatch(html, /undefined|NaN/);
});

test('IA comparando: entre empresas, en qué trabajo (sin turnos ni tarjetas) y personas según su uso; con personas, módulo a módulo', () => {
  const d = data();
  d.cols.fl[0] = 2048 | 4096; d.cols.fl[1] = 2048 | 64;
  const m = createModel(d), ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  m.S.sides = [{ company: 0 }, { company: 1 }]; m.refilter();
  let h = tabs.render('ia', m.rows());
  assert.match(h, /En qué trabajo/);
  for (const block of ['Prioridad', 'Tipo de servicio', 'Escalado']) assert.match(h, new RegExp(`<th class="mt-gl"[^>]*>${block}`));
  assert.match(h, /Personas según su uso/);
  assert.doesNotMatch(h, /Turno|Tarjeta|Media con IA|Módulo a módulo|undefined|NaN/);
  m.S.sides = [{ people: new Set([1]) }, { company: 0 }]; m.refilter();   // ANA frente a Indra
  h = tabs.render('ia', m.rows());
  assert.match(h, /Módulo a módulo/);
  assert.match(h, /Según cómo sale/);
  assert.match(h, /Media con IA/);
  assert.doesNotMatch(h, /Personas según su uso|undefined|NaN/);
});

test('de lo resuelto: los tramos de tiempo, el máximo y el tiempo en cada estado, solo de las resueltas', () => {
  const m = createModel(data());
  const s = m.stats([0, 1, 2]);   // 1 y 2 resueltas; 3 abierta (su tiempo no cuenta)
  assert.equal(s.w7, 0);
  assert.equal(s.d1, 0.5); assert.equal(s.d7, 0.5); assert.equal(s.d15, 0);   // una en menos de 1 día y otra de 1 a 7
  assert.ok(s.mx >= 1440 && s.mx > s.avg);
  assert.deepEqual(s.rt, [110, 2950, 0, 0, 0]);
});

// los mismos datos con el origen en 2025: la foto cae 14 meses después (marzo de 2026)
const twoYears = () => {
  const d = data(), shift = 365 * 1440;
  d.meta.start = 2025;
  d.meta.snapshot = SNAP + shift;
  d.cols.rep = d.cols.rep.map((v, i) => (i >= 2 ? v + shift : v));
  d.cols.res = d.cols.res.map((v, i) => (v >= 0 && i >= 2 ? v + shift : v));
  return d;
};

test('datos de más de un año: los meses siguen contando desde el primer enero y llevan su año', () => {
  const m = createModel(twoYears());
  assert.deepEqual([m.MONTH[0], m.MONTH[1], m.MONTH[2]], [0, 0, 14]);   // ene 2025, ene 2025, mar 2026
  assert.equal(m.LASTM, 14);
  assert.deepEqual([m.monthName(0), m.monthName(11), m.monthName(14)], ['ene 2025', 'dic 2025', 'mar 2026']);
  assert.equal(m.DIMS.month.label(13), 'feb 2026');
  assert.equal(createModel(data()).monthName(2), 'mar');   // con un solo año, sin año
});

test('datos de más de un año: todas las pestañas se pintan, de un mes y de todo el periodo', () => {
  const m = createModel(twoYears()), ui = { exp: {}, sort: {} }, tabs = createTabs(m, createCharts(m, ui), ui);
  // todo; el último mes; diez días a caballo de dos años; un solo día
  for (const [d0, d1] of [[m.MIN_D, m.END_D], [m.minuteOf(m.LASTM), m.END_D], [m.minuteOf(11, 25), m.minuteOf(12, 5)], [m.minuteOf(12, 10), m.minuteOf(12, 11)]]) {
    m.setPeriod(d0, d1);
    Object.assign(m.S, { q: '', sides: [{ company: 0 }, { company: 1 }] });
    m.refilter();
    for (const [tab] of TABS) assert.doesNotMatch(tabs.render(tab, m.rows()), /undefined|NaN|\[object/, `${tab} ${d0}-${d1}`);
  }
});

test('el periodo es un rango de fechas: filtra por apertura y la tendencia cuenta hacia atrás desde su final', () => {
  const m = createModel(twoYears());
  m.setPeriod(m.MIN_D, m.minuteOf(14, 1));   // hasta el 28 de febrero de 2026: no entra la de marzo
  m.refilter();
  assert.equal(m.inPeriod(2), false);
  assert.equal(m.inPeriod(0), true);
  m.setPeriod(m.MIN_D, m.minuteOf(0, 20));   // hasta el 19 de enero de 2025: la 1, abierta el 1 de enero, es de los últimos 90 días
  assert.equal(m.trend([0]).now, 1);
  m.setPeriod(m.MIN_D, m.END_D);             // hasta la foto (marzo de 2026): ya es de hace más de un año
  assert.equal(m.trend([0]).now, 0);
  assert.equal(m.inPeriod(2), true);
});
