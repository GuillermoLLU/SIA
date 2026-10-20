// Las pestañas de las Métricas. Siguen el orden en que se analiza el servicio y cada una responde
// a una pregunta (QUESTIONS): el Resumen las contesta todas de un vistazo y cada pestaña da el
// detalle. Reciben las issues que pasan los filtros (A) y devuelven su HTML. Se mira un lado (el
// equipo, una persona o varias); si se compara con otro, cada indicador es la diferencia de A
// respecto a B.
import { esc } from '../ui/html.js';
import { num, dec, pct, dur, nice, title, dateOf, MONTHS, DOWS } from './format.js';
import { COMPANIES, CARDS, ACTIVE_DAYS, share, slaText } from './model.js';
import { IA_MARKS, IA_NONE, iaStats as iaStatsOf, iaUse } from './ia.js';
import { SHIFTS, SHIFT_HOURS, DAYS, MIN_ACTIONS } from './shifts.js';
import { pairTable as pairTableOf } from './pair-table.js';
import { OLD_DAYS, IDLE_DAYS, RECENT_CRIT_DAYS, MIN_ISSUES, BETTER_MIN, OWNERS_SHARE, MIXED_ESC, TICKET_MIN, WORSE, clearlyWorse, shade, HOT } from './rules.js';
import { monthsIn as monthsOf, resolvedAt, startedAt, closedInPeriod as closedIn, ledger as ledgerOf, monthVsPrev as monthVsPrevOf } from './flow.js';
import { situations, ages, OLD_FILTER, late as lateOf, isOld, escalated as escalatedOf, orphansIn as orphansOf, watchList, pendingCells, backlogFigures } from './backlog.js';
import { centreExtra as centreExtraOf, problemExtra as problemExtraOf, owners as ownersOf } from './focus.js';
import { personVsTeam, expectedAvg, expectedSla } from './peers.js';
import { todayLists } from './today.js';
import { blockHead, blocksOf } from './pieces.js';
import { perHead as perHeadOf, solved as solvedOf, ttrBlocks, bestOf, resolutionParts, partValue, partWorse, mixedEscalation, tickets, resolvedPair, modulesBySide } from './resolution.js';
import { startBlocks, slaStats as slaStatsOf, slaPair as slaPairOf, commonModules } from './sla.js';
import { perShiftType, byHour, carryRows as carryRowsOf, clockMatrix } from './turns.js';
import { iaMonths, iaTop } from './ia.js';

export const TABS = [['resumen', 'Resumen'], ['hoy', 'Foto de hoy'], ['entrada', 'Entrada'], ['backlog', 'Backlog'], ['modulos', 'Módulos y focos'],
  ['resolucion', 'Resolución y escalados'], ['sla', 'SLA y calidad'], ['ia', 'IA'], ['turnos', 'Turnos']];
const QUESTIONS = {
  resumen: ['¿Cómo vamos?', 'Cada bloque responde a una pregunta con sus cifras clave; el detalle, en su pestaña.'],
  hoy: ['¿Qué hay que mover hoy?', 'Lo abierto ahora mismo, sea del mes que sea (no depende del periodo), en listas para actuar: lo urgente, lo que espera y lo que está parado.'],
  entrada: ['¿Qué nos entra?', 'Cuánto entra, cuánto se cierra y de qué tipo, mes a mes. Cada tabla lleva su total y los totales cuadran con las cifras de arriba.'],
  backlog: ['¿Qué tenemos pendiente?', 'Lo recibido en el periodo que sigue sin resolver: en qué punto está, desde cuándo y qué conviene vigilar.'],
  modulos: ['¿De dónde viene?', 'Los módulos, centros y problemas que concentran el trabajo, y lo que se repite.'],
  resolucion: ['¿Cómo lo resolvemos?', 'Cuánto tardamos, en qué se va el tiempo, qué módulos tardan más y qué escalamos y a quién. Tiempos de lo resuelto, en tiempo natural.'],
  sla: ['¿Cómo de bien lo hacemos?', `Si empezamos a tiempo (SLA de inicio: de la apertura al primer paso a En curso, en tiempo natural; ${slaText()}), si el trabajo queda bien hecho y si queda bien registrado.`],
  ia: ['¿Cuánto usamos la IA y cómo sale?', 'Por las marcas de IA de Remedy: en TAGS (IA_SOLVED…, IA_FAIL) y en las notas ([ACT IA], [INFORME IA], notas del agente de IA, [HITL_REVIEW_OK], [HITL_REVIEW_NOT_OK], [IA_FAIL]…). Una issue con IA puede estar revisada OK, con fallo o sin revisar.'],
  turnos: ['¿Cuándo entra y cuándo lo trabajamos?', `Por turnos: ${SHIFTS.map((s, k) => `${s.toLowerCase()} de ${SHIFT_HOURS[k]}`).join(', ')}. El turno se cuenta por la hora en que empieza: la noche del domingo es de fin de semana.`],
};

const WORSE_NOTE = `En ocre, lo que va un ${Math.round(WORSE * 100)} % o más peor que el total (con al menos ${MIN_ISSUES} issues).`;
const MONTH_NOTE = 'Por mes de apertura. * mes incompleto: los últimos meses salen mejor de lo que acabarán, porque lo lento aún no se ha resuelto.';
const REMEDY = 'https://itx.onbmc.com/arsys/servlet/ViewFormServlet?server=onbmc-s&form=HPD:Help+Desk&qual=%271000000161%27%3D%22';
const incId = (id) => `INC${String(id).padStart(12, '0')}`;
const opt = (f) => (v) => (v == null ? '—' : f(v));

export const createTabs = (m, ch, ui) => {
  const { C, DI, S, BASE, LASTM, PRIOS, CRIT, slaLabel, MONTH, DOW, OPEN, SIDE, STYPE, CMP, CO, NAMES, isSel, stats, group, bySide } = m;
  const name = (k) => NAMES()[k];
  const { card, legend, kpi, kpis, kpiCo, diff, more, lines, heat, matrix, scorecard, day, split } = ch;
  const noK = (k) => k === 0;
  const noTheme = (k) => k === m.data.themes.length;
  const REQ = DI.svc.indexOf('USER_SERVICE_REQUEST');
  const slaPct = (s) => (s.sla == null ? '—' : pct(s.sla));
  const monthsIn = () => monthsOf(S);
  const heads = () => perHeadOf(m);   // el divisor de cada lado: sus personas, comparando con personas; si no, 1
  // el nombre de cada lado; comparando con personas, la empresa es la media de su equipo («Media de Indra»)
  const sideLabel = (k) => (m.perHead() && !S.sides[k].people ? `Media de ${COMPANIES[S.sides[k].company]}` : name(k));
  // si una fila con filtro f está marcada (los filtros dobles «a|b» y las filas sin filtro, no)
  const selRow = (f) => !!f && !f.includes('|') && isSel(f.split(':')[0], +f.split(':')[1]);
  // filas de corte, [nombre, prueba, filtro]: por mes de apertura y por prioridad
  const monthRows = () => monthsIn().map((k) => [`${MONTHS[k]}${k === LASTM ? '*' : ''}`, (i) => MONTH[i] === k, `month:${k}`]);
  const prioRows = () => PRIOS.map((p) => [nice(DI.prio[p]), (i) => C.pr[i] === p, `pr:${p}`]);
  const asRows = (rows) => rows.map(([label, test, f]) => ({ label, test, f }));
  // una fila por mes con sus celdas (cells: de las issues del mes); el nombre del mes en `tag`
  const monthBody = (A, cells, tag = 'td') => monthRows().map(([label, t, f]) => `<tr class="mt-clk ${selRow(f) ? 'mt-sel' : ''}" data-f="${f}"><${tag}${tag === 'th' ? ' class="mt-r"' : ''}>${label}</${tag}>${cells(A.filter(t))}</tr>`).join('');
  // filas de una tabla por lado (pair: lo de cada lado de una lista): una por corte y, al final, el total
  const sideRows = (A, defs, pair, total) => {
    const T = bySide(A);
    return [...defs.filter(([, t]) => A.some(t)).map(([label, t, f]) => ({ label, x: pair(T.map((l) => l.filter(t))), cls: `mt-clk ${selRow(f) ? 'mt-sel' : ''}`, attrs: f ? `data-f="${f}"` : '' })),
      { label: total, x: pair(T), cls: 'mt-tot' }];
  };
  const late = lateOf(m), old = isOld(m), escd = escalatedOf(m), solved = solvedOf(m), resAt = resolvedAt(m), startAt = startedAt(m);
  // lo de cada lado que cumple algo: { n, v } con v la proporción (para kpiCo y las cifras del resumen)
  const shareOf = (T, test) => T.map((l) => ({ n: l.length, v: share(l, test) }));

  const grid = (...parts) => `<div class="mt-grid">${parts.join('')}</div>`;
  const ask = (tab) => `<p class="mt-ask"><b>${QUESTIONS[tab][0]}</b><span>${QUESTIONS[tab][1]}</span></p>`;
  const section = (t, small = '') => `<h2 class="mt-sec">${t}${small ? `<small>${small}</small>` : ''}</h2>`;

  // Tabla de cortes fijos (prioridad, ámbito, turno, día…): una fila por corte; la diferencia entre los lados o el valor del único que se mira.
  const SLICE = {
    n: ['Issues', (s) => num(s.n), (s) => s.n], avg: ['Media resol.', (s) => dur(s.avg), (s) => s.avg, 'low'],
    sla: ['Dentro de SLA', slaPct, (s) => s.sla, 'high'], ip: ['Media hasta En curso', (s) => dur(s.ip), (s) => s.ip, 'low'],
    inShift: ['Empezadas en su turno', (s) => opt(pct)(s.inShift), (s) => s.inShift, 'high'],
  };
  const cell = (st, [, f, v, bt]) => (CMP() ? diff(st[0], st[1], f, v, bt) : (st[CO()[0]].n ? f(st[CO()[0]]) : '—'));
  // groups: [título, columnas] de una fila de cabecera por encima, para agrupar columnas; entonces las
  // columnas van todas igual de anchas y con una línea entre grupos
  const colgroup = (groups) => `<colgroup><col class="mt-first">${groups.map(([, n]) => Array.from({ length: n }, (_, j) => `<col${j ? '' : ' class="mt-gsep"'}>`).join('')).join('')}</colgroup>`;
  // heads: [nombre, nota] de cada columna
  const table = (first, heads, rowsHtml, groups) => `<div class="mt-tablewrap"><table ${groups ? 'class="mt-fixed"' : ''}>${groups ? colgroup(groups) : ''}<thead>${groups ? `<tr class="mt-cgrp"><th></th>${groups.map(([l, n]) => `<th colspan="${n}">${l}</th>`).join('')}</tr>` : ''}<tr><th>${first}</th>${heads.map(([l, tip]) => `<th class="mt-num" ${tip ? `data-tip="${esc(tip)}"` : ''}>${l}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
  const slices = (first, defs, A, cols) => table(first, cols.map((c) => [SLICE[c][0], SLICE[c][4]]), defs.map(([label, test, f]) => {
    const st = bySide(A.filter(test)).map(stats);
    return `<tr ${f ? `class="mt-clk" data-f${f.includes('|') ? '2' : ''}="${f}"` : ''}><td>${label}</td>${cols.map((c) => `<td class="mt-num">${cell(st, SLICE[c])}</td>`).join('')}</tr>`;
  }).join(''));
  const cardsOf = (i) => m.DIMS.tj.get(i);
  // la ficha de los módulos: bloques de columnas (charts.js, scorecard)
  const MOD_GROUPS = [['Volumen', ['n', 'dl']], ['Cómo se atiende', ['sla', 'avg', 'd1', 'reop']], ['Qué trae', ['crit', 'vend']], ['Hoy', ['open']]];
  // y la de los centros: lo que más les falla (su módulo con más issues) y sus major incidents
  const CE_GROUPS = [['Volumen', ['n', 'dl']], ['Cómo se atiende', ['sla', 'avg']], ['Qué trae', ['top', 'crit', 'vend', 'mi']], ['Hoy', ['open']]];
  const centreExtra = centreExtraOf(m);
  // y la de los problemas, por tema: cuánto se repiten, en cuántos centros y si se cierran siempre igual (esto, solo
  // de un problema: en un tema o en el total se mezclan problemas distintos)
  const PB_GROUPS = [['Volumen', ['n', 'dl', 'nce']], ['Cómo se resuelve', ['avg', 'd1', 'reop', 'vend', 'same']], ['Hoy', ['open']]];
  const problemExtra = problemExtraOf(m);

  // Mapa de calor día de la semana × hora de un instante de cada issue (la apertura, la resolución…).
  const clockHeat = (list, at, clickable) => {
    const { hh, max: mx } = clockMatrix(m, list, at);
    return `<div class="mt-tablewrap"><table class="mt-hm mt-hours"><thead><tr><th></th>${hh[0].map((_, h) => `<th class="${h === 7 || h === 15 || h === 23 ? 'mt-shift' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${hh.map((r, d) => `<tr><th class="mt-r">${DOWS[d]}</th>${r.map((v, h) => {
      const a = shade(v, mx);
      return `<td class="${a > HOT ? 'mt-hot' : ''} ${h === 7 || h === 15 || h === 23 ? 'mt-shift' : ''}" style="--mt-a:${a}%" ${clickable ? `data-f2="dow:${d}|hour:${h}"` : ''} data-tip="${DOWS[d]} ${h}:00–${h}:59\n${num(v)} issues">${v || ''}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>`;
  };
  // --- Resumen: un bloque por pregunta, con sus cifras clave y el paso a su pestaña. Cada cifra es la
  // de lo que se mira y, al comparar, al lado, la diferencia con el otro lado.
  const fig = (label, ST, fmt, val, better, tip) => {
    const a = ST[CO()[0]];
    return `<div class="mt-fig" ${tip ? `data-tip="${esc(tip)}"` : ''}><span>${esc(label)}</span><b>${a.n ? fmt(a) : '—'}</b>${CMP() ? diff(ST[0], ST[1], fmt, val, better) : ''}</div>`;
  };
  // tabs: su pestaña o varias (un botón a cada una); title: la pregunta, si no es la de la primera
  const answer = (tabs, figs, title) => {
    const list = [].concat(tabs);
    return `<section class="mt-card mt-ans"><header><h3>${title || QUESTIONS[list[0]][0]}</h3><span class="mt-gos">${list.map((t) => `<button class="mt-go" data-go="${t}">${TABS.find(([k]) => k === t)[1]} →</button>`).join('')}</span></header><div class="mt-figs">${figs.join('')}</div></section>`;
  };
  const days = () => m.periodSlots().reduce((a, b) => a + b, 0) / 3;

  // --- Lo pendiente (backlog.js): su situación, los tramos de antigüedad y lo que conviene vigilar.
  const SITUATION = situations(m), AGES = ages(m), orphansIn = () => orphansOf(m);
  // filas de una dimensión: las n con más issues en `list` y, si hay más, «Resto» (así la tabla suma el total)
  const topRows = (dim, list, n) => {
    const { get, label } = m.DIMS[dim], g = group(dim, list), top = g.slice(0, n), keys = new Set(top.map((x) => x.k));
    const rows = top.map((x) => ({ label: label(x.k), test: (i) => get(i) === x.k, f: `${dim}:${x.k}` }));
    return g.length > n ? [...rows, { label: `Resto (${g.length - n})`, test: (i) => !keys.has(get(i)) }] : rows;
  };
  // Lo pendiente, de un vistazo y en orden: el total; en qué punto está (en curso, sin tocar, devuelta y en espera de
  // un tercero, del cliente u otro motivo, que suman el total), en una barra; lo que conviene vigilar dentro
  // (se solapa: no se suma) y, aparte, lo de nuestras tarjetas que no tiene a nadie (no está en el total).
  // Solo con un lado: comparando, backlogCmp.
  const stockPanel = (T, ST) => {
    const k0 = CO()[0], people = S.sides.some((s) => s?.people);
    const open = T[k0].filter((i) => OPEN[i]), count = (test) => open.filter(test).length;
    const sit = SITUATION.map((x, k) => ({ ...x, k, v: count(x.test) })).filter((x) => x.v);
    const share = (x) => (open.length ? x.v / open.length : 0);
    const bar = `<div class="mt-st-track">${sit.map((x) => {
      const p = share(x);
      return `<i class="mt-sit${x.k}" style="width:${(p * 100).toFixed(2)}%" data-f="${x.f}" data-tip="${esc(`${x.label}\n${num(x.v)} de ${num(open.length)} (${pct(p)})\n${x.tip}`)}">${p >= 0.07 ? pct(p) : ''}</i>`;
    }).join('')}</div>`;
    const watch = watchList(m).map(([l, test, tip, f]) => [l, count(test), tip, f]);
    const total = `<section class="mt-st mt-st-total"><h4>Pendientes</h4><div class="mt-st-big"><b>${num(ST[k0].open)}</b></div>
      <p>sin resolver, de ${num(ST[k0].n)} recibidas en el periodo</p></section>`;
    const where = `<section class="mt-st mt-st-where"><h4>¿En qué punto están?<small>suman las pendientes</small></h4>
      <div class="mt-st-row">${bar}</div>
      <div class="mt-st-legend">${sit.map((x) => `<div class="mt-clk" data-f="${x.f}" data-tip="${esc(x.tip)}"><span><i class="mt-sit${x.k}"></i>${x.label}</span><b>${num(x.v)}</b><em>${pct(share(x))}</em></div>`).join('')}</div></section>`;
    const watchHtml = `<section class="mt-st mt-st-watch"><h4>A vigilar<small>dentro de las pendientes; se solapan</small></h4>
      ${watch.map(([l, v, tip, f]) => `<div class="mt-st-item mt-clk" data-f${f.includes('|') ? '2' : ''}="${f}" data-tip="${esc(tip)}"><span>${l}</span><b>${num(v)}</b></div>`).join('')}</section>`;
    const apart = people ? '' : `<section class="mt-st mt-st-apart"><h4>Aparte</h4><div class="mt-st-big"><b>${num(orphansIn().length)}</b></div>
      <p><b>Sin responsable</b>: de SGA, SISU o PRIO y sin nadie asignado. No están en las pendientes.</p></section>`;
    return `<div class="mt-stock ${people ? 'mt-st-noapart' : ''}">${total}${where}${watchHtml}${apart}</div>`;
  };
  const PLURAL = { CRITICAL: 'Críticas', HIGH: 'Altas', MEDIUM: 'Medias', LOW: 'Bajas' };
  // El volumen de cada lado ({ n, v }, para kpiCo): su total o, comparando con alguna persona, la media por persona:
  // lo de cada lado (una empresa, todo su equipo: model.js, bySide y heads) entre sus personas. per: el divisor que se
  // le añade (los días, para «al día»). teamNames: el nombre de cada lado en esas cifras («Media de Indra»).
  const volume = (lists, per = 1) => lists.slice(0, 2).map((l, k) => {
    if (!m.perHead()) return { n: l.length, v: l.length / per };
    const H = m.heads(k).size;
    return { n: H, v: H ? l.length / H / per : null };
  });
  const teamNames = () => (m.perHead() ? [0, 1].map(sideLabel) : null);
  const headsNote = () => (m.perHead() ? ` · por persona: lo de cada lado entre sus personas; el equipo, quien ha tenido actividad en los ${ACTIVE_DAYS} días antes de la foto (${[0, 1].map((k) => `${teamNames()[k]}: ${m.heads(k).size}`).join(' · ')})` : '');

  // Mes a mes (o día a día con un solo mes): de lo recibido en cada tramo, cuánto se ha cerrado y cuánto
  // sigue abierto (por cerrar), y el movimiento del tramo: lo resuelto en él,
  // el saldo y lo que quedaba pendiente al cerrarlo. La fila Total cuadra con las cifras de arriba.
  // En dos bloques, de izquierda a derecha: lo recibido ese mes y qué ha sido de ello (cuánto se cerró
  // en el propio mes, cuánto hasta hoy y qué queda), y lo que pasó en el mes (lo resuelto, cuánto era de
  // meses anteriores, el saldo y la pila que quedó, con lo envejecido).
  const LEDGER_GROUPS = [['Lo recibido ese mes', 4], ['Lo que pasó en el mes', 5]];
  // Cada dato: [nombre, cómo se ve, nota]. De un solo lado (comparando, ledgerCmp).
  const LEDGER = [
    ['Recibidas', (s) => num(s.in), 'Issues abiertas en ese mes (o día).'],
    ['% cerrado en el mes', (s) => (s.in ? pct(s.same / s.in, 1) : '—'), 'De las recibidas en ese mes, las que se cerraron antes de acabar el mismo mes. Se puede comparar entre meses: cuanto más bajo, más se queda para después.'],
    ['% cerrado hasta hoy', (s) => (s.in ? pct(s.closed / s.in, 1) : '—'), 'De las recibidas en ese mes, las que ya están resueltas, cerradas o canceladas hoy. En los meses pasados tiende al 100 %.'],
    ['Por cerrar', (s) => num(s.still), 'De las recibidas en ese mes, las que siguen sin resolver hoy. Su total es el backlog del periodo.'],
    ['Resueltas', (s) => num(s.out), 'Lo que se resolvió dentro de ese mes (o día), se abriera cuando se abriera dentro del periodo.'],
    ['De meses anteriores', (s) => num(s.prev), 'De las resueltas en el mes, las que se abrieron en un mes anterior: el esfuerzo que se va en sacar backlog.'],
    ['Saldo', (s) => `${s.out - s.in > 0 ? '+' : ''}${num(s.out - s.in)}`, 'Resueltas menos recibidas en el mes: en positivo, la pila baja; en negativo, crece.'],
    ['Pendientes al cierre', (s) => num(s.open), 'De lo recibido desde el inicio del periodo, lo que seguía abierto al acabar el mes (o el día).'],
    [`Con más de ${OLD_DAYS} días`, (s) => num(s.old), `De las pendientes al cierre, las que ya llevaban más de ${OLD_DAYS} días abiertas: si sube, el backlog envejece.`],
  ];
  // Comparando: cada dato en dos columnas, una por lado, con su valor (no la diferencia). Entre empresas, lo que
  // depende de cuánto entra va en relación a lo que entra, para poder compararlo; con personas, el volumen es la
  // media por persona (la de la empresa, de todo su equipo: model.js, heads) y los % no cambian. En verde, el lado
  // que va mejor, solo en lo que tiene un mejor; en naranja ('warn'), el que más saca de meses anteriores: un aviso de
  // que se abre más de lo que se cierra. Cada dato: [nombre, valor, tipo (p %, n número, v volumen), mejor, nota].
  const LEDGER_CMP = {
    co: [['Lo recibido ese mes', [
      ['Recibidas', (s) => s.in, 'n', null, 'Issues abiertas en ese mes.'],
      ['% cerrado en el mes', (s) => (s.in ? s.same / s.in : null), 'p', 'high', 'De las recibidas en ese mes, las cerradas antes de acabar el mismo mes.'],
      ['% cerrado hasta hoy', (s) => (s.in ? s.closed / s.in : null), 'p', 'high', 'De las recibidas en ese mes, las que ya están resueltas, cerradas o canceladas hoy.']]],
    ['Lo que pasó en el mes', [
      ['Resueltas por cada 100 recibidas', (s) => (s.in ? s.out / s.in * 100 : null), 'n', 'high', 'Más de 100: se resolvió más de lo que entró y la pila bajó; menos de 100, creció.'],
      ['% de meses anteriores', (s) => (s.out ? s.prev / s.out : null), 'p', 'warn', 'De lo resuelto en el mes, lo que se abrió en un mes anterior: el esfuerzo en sacar backlog.'],
      [`% pendientes con más de ${OLD_DAYS} días`, (s) => (s.open ? s.old / s.open : null), 'p', 'low', `De lo pendiente al acabar el mes, lo que ya llevaba más de ${OLD_DAYS} días abierto: si sube, el backlog envejece.`]]]],
    pp: [['Lo recibido ese mes', [
      ['Recibidas', (s) => s.in, 'v', null, 'Issues abiertas en ese mes.'],
      ['% cerrado en el mes', (s) => (s.in ? s.same / s.in : null), 'p', 'high', 'De las recibidas en ese mes, las cerradas antes de acabar el mismo mes.']]],
    ['Lo que pasó en el mes', [
      ['Resueltas', (s) => s.out, 'v', 'high', 'Lo resuelto en el mes, se abriera cuando se abriera.'],
      ['De meses anteriores', (s) => s.prev, 'v', 'warn', 'De lo resuelto en el mes, lo que se abrió en un mes anterior.'],
      ['Pendientes al cierre', (s) => s.open, 'v', null, 'Lo que seguía abierto al acabar el mes.'],
      [`Con más de ${OLD_DAYS} días`, (s) => s.old, 'v', null, `De las pendientes al cierre, las que ya llevaban más de ${OLD_DAYS} días abiertas.`]]]],
  };
  const ledgerCmp = (units, per, day) => {
    const pp = m.perHead(), H = heads(), groups = LEDGER_CMP[pp ? 'pp' : 'co'];
    const dayText = (t) => (day ? t.replace('pasó en el mes', 'pasó en el día').replace('ese mes', 'ese día').replace('en el mes', 'el mismo día').replace('meses anteriores', 'días anteriores').replace('acabar el mes', 'acabar el día').replace('el mismo mes', 'el mismo día') : t);
    // los volúmenes ('v'), por persona; el resto, tal cual. En ocre ('warn'), el que más saca de meses anteriores.
    const defs = groups.flatMap(([, d]) => d).map(([l, f, type, better, note]) => [dayText(l),
      (x) => { const v = f(x.s); return v != null && type === 'v' ? v / x.H : v; },
      (v, x) => (type === 'p' ? pct(v) : type === 'n' || x.H === 1 ? num(Math.round(v)) : dec(v)), better, dayText(note)]);
    const row = (label, j, u = {}) => ({ label, x: [0, 1].map((k) => ({ s: per[k][j], H: H[k] })), cls: u.f ? 'mt-clk' : u.after ? 'mt-mut' : '', attrs: u.f ? `data-f="${u.f}"` : '' });
    return pairTable(day ? 'Día' : 'Mes', defs, [...units.map((u, j) => row(u.label, j, u)), { ...row('Total', units.length), cls: 'mt-tot' }],
      () => Infinity, groups.map(([l, d]) => [dayText(l), d.length]));
  };
  // Qué entra, comparando: sin meses (eso está en Mes a mes), si los dos reciben lo mismo. Cada fila, cuántas tiene
  // cada lado (persona frente a empresa: la media por persona del equipo, model.js heads) y qué parte es de lo suyo,
  // con una barra a la misma escala en los dos. Sin verde ni rojo: recibir una cosa u otra no es mejor ni peor, es el
  // contexto para leer lo demás. rowsDef: los bloques y filas de la tabla dinámica de Qué entra cada mes.
  // La tabla de dos lados con el título del bloque a la izquierda y tres columnas por lado (cols: sus cabeceras):
  // cells(r), las celdas de una fila; lead, la fila de totales (arriba o, con leadAtEnd, abajo); rowAttrs(r) y
  // labelTip, lo que lleva cada fila además de su filtro.
  const sideTable = ({ cls, cols, blocks, cells, lead, leadAtEnd = false, rowAttrs = (r) => (r.f ? `data-f="${r.f}"` : ''), labelTip = false }) => {
    const body = blocks.map((b) => b.rows.map((r, j) => `<tr class="${r.f ? 'mt-clk' : ''} ${j ? '' : 'mt-gfirst'} ${selRow(r.f) ? 'mt-sel' : ''}" ${rowAttrs(r)}>
      ${j ? '' : blockHead(b.head, b.note, b.rows.length)}<th class="mt-r"${labelTip ? ` data-tip="${esc(r.label)}"` : ''}>${esc(r.label)}</th>${cells(r)}</tr>`).join('')).join('');
    const head = (k) => `<th colspan="3" class="mt-mix-side ${k ? '' : 'mt-gsep'}"><i class="mt-c${k}"></i>${esc(sideLabel(k))}</th>`;
    const leadRow = `<tr class="mt-lead${leadAtEnd ? ' mt-lead-end' : ''}"><th class="mt-r" colspan="2">${lead.label}${m.perHead() ? ' (por persona)' : ''}</th>${lead.cells}</tr>`;
    return `<div class="mt-tablewrap"><table class="mt-mx mt-mix2${cls ? ` ${cls}` : ''}"><colgroup><col style="width:13%"><col style="width:21%">${'<col class="mt-mix-cn"><col class="mt-mix-cp"><col>'.repeat(2)}</colgroup>
      <thead><tr><th colspan="2"></th>${head(0)}${head(1)}</tr><tr><th colspan="2"></th>${cols.repeat(2)}</tr></thead><tbody>
      ${leadAtEnd ? body + leadRow : leadRow + body}</tbody></table></div>`;
  };
  // Qué entra, comparando: sin meses (eso está en Mes a mes), si los dos reciben lo mismo. Cada fila, cuántas tiene
  // cada lado (persona frente a empresa: la media por persona del equipo, model.js heads) y qué parte es de lo suyo,
  // con una barra a la misma escala en los dos. Sin verde ni rojo: recibir una cosa u otra no es mejor ni peor, es el
  // contexto para leer lo demás. rowsDef: los bloques y filas de la tabla dinámica de Qué entra cada mes.
  const mixCmp = (rowsDef, A, lead = 'Recibidas') => {
    const T = bySide(A), H = heads();
    const cells = (test, label) => [0, 1].map((k) => {
      const c = test ? T[k].filter(test).length : T[k].length, sh = T[k].length ? c / T[k].length : 0, n = c / H[k];
      return `<td class="mt-num ${k ? 'mt-msep' : 'mt-gsep'}">${H[k] > 1 ? dec(n) : num(n)}</td><td class="mt-num mt-mix-p">${pct(sh)}</td>
        <td class="mt-mix-bar" data-tip="${esc(`${label} · ${sideLabel(k)}\n${H[k] > 1 ? `${dec(n)} por persona (${num(c)} en total)` : `${num(c)} issues`} · ${pct(sh, 1)} de lo suyo`)}"><i class="mt-c${k}" style="width:${(sh * 100).toFixed(1)}%"></i></td>`;
    }).join('');
    return sideTable({ cols: '<th class="mt-num">Issues</th><th class="mt-num">%</th><th></th>', blocks: blocksOf(rowsDef), cells: (r) => cells(r.test, r.label), lead: { label: lead, cells: cells(null, lead) }, labelTip: true });
  };
  // Lo pendiente, comparando: no cuánto hay (depende de lo que entra), sino cómo está. Cada fila, por lado: sus issues
  // (con personas, la media por persona del equipo), qué parte son de sus pendientes y cuánto llevan abiertas de media.
  // En verde, el lado que va mejor solo en lo que depende de él (r.better): entre empresas, por el %; con personas, por
  // las issues (con 8–10 pendientes, una sola mueve el % diez puntos). Lo que espera a otros, sin color. La fila de las
  // pendientes, al final, como en el resto de tablas.
  const pendCmp = (rowsDef, op) => {
    const T = bySide(op), pp = m.perHead(), H = heads();
    const cells = (r) => {
      const { v, main, old } = pendingCells(m, T, H, pp, r);
      const ok = (on) => (on ? 'mt-better' : '');
      return [0, 1].map((k) => `<td class="mt-num ${k ? 'mt-msep' : 'mt-gsep'} ${ok(pp && main === k)}">${H[k] > 1 ? dec(v[k].c) : num(v[k].c)}</td>
        <td class="mt-num mt-mix-p ${ok(!pp && main === k)}">${v[k].sh == null ? '—' : pct(v[k].sh)}</td><td class="mt-num ${ok(old === k)}">${v[k].age == null ? '—' : dec(v[k].age)}</td>`).join('');
    };
    const rowAttrs = (r) => (r.f ? `data-f${r.f.includes('|') ? '2' : ''}="${r.f}" ${r.tip ? `data-tip="${esc(r.tip)}"` : ''}` : '');
    return sideTable({ cls: 'mt-pend2', cols: '<th class="mt-num">Issues</th><th class="mt-num">%</th><th class="mt-num" data-tip="Lo que llevan abiertas, de media, en días.">Antigüedad (días)</th>',
      blocks: blocksOf(rowsDef), cells, lead: { label: 'Pendientes', cells: cells({}) }, leadAtEnd: true, rowAttrs });
  };
  // Backlog, comparando: las cifras de arriba, cómo está lo pendiente de cada uno y qué tiene pendiente. Sin lo que no
  // tiene responsable (no es de nadie: no hay con qué compararlo) ni las tablas de detalle por módulo, centro y escalado
  // (son para gestionar el propio backlog; para comparar un módulo o un centro, se filtra). Sin tarjetas: cada empresa
  // las usa a su manera.
  const backlogCmp = (A) => {
    const T = bySide(A), P = T.map((l) => l.filter((i) => OPEN[i])), op = A.filter((i) => OPEN[i]), pp = m.perHead(), d = days() || 1;
    const H = heads(), each = pp ? ' por persona' : '', names = teamNames();
    const sit = (k) => (i) => m.DIMS.sit.get(i) === k;
    const { part, age, stock } = backlogFigures(m, T, P, H, pp, d);
    const partFig = (label, test, better, note) => kpiCo(pp ? `${label}${each}` : `% ${label.toLowerCase()}`, part(test), pp ? (s) => dec(s.v) : (s) => pct(s.v), { val: (s) => s.v, better, note: `${note}${headsNote()}`, names });
    const pendRows = [
      { head: 'Situación', note: 'Suman las pendientes.' },
      ...SITUATION.map((x, k) => ({ ...x, better: k === 1 || k === 2 ? 'low' : null })).filter((x) => op.some(x.test)),
      { head: 'A vigilar', note: 'Dentro de las pendientes; se solapan.' },
      { label: 'Fuera de plazo', test: late, f: 'sl:4', better: 'low', tip: 'Nunca han pasado a En curso y ya superan el plazo de su prioridad.' },
      { label: `Con más de ${OLD_DAYS} días`, test: old, f: OLD_FILTER, better: 'low', tip: `Llevan más de ${OLD_DAYS} días abiertas.` },
      { label: 'Escaladas', test: escd, f: 'es:1', tip: 'Con ticket de tercero, estén en el estado que estén.' },
      { label: 'Críticas', test: (i) => C.pr[i] === CRIT, f: `pr:${CRIT}` },
    ];
    const mixRows = [{ head: 'Prioridad' }, ...asRows(prioRows()), { head: 'Módulo' }, ...topRows('mo', op, 8)];
    return grid(ask('backlog'),
      kpis(kpiCo(`Pendientes${each}`, volume(P), pp ? (s) => dec(s.v) : (s) => num(s.v), { val: (s) => s.v, note: `sin resolver, de lo recibido en el periodo${headsNote()}`, names }),
        kpiCo('Días de entrada acumulados', stock, (s) => dec(s.v), { val: (s) => s.v, better: 'low', note: 'Las pendientes entre lo que entra al día: cuántos días de trabajo tiene acumulados cada uno. Así se compara quien recibe mucho con quien recibe poco.' }),
        kpiCo('Antigüedad media, en días', age, (s) => dec(s.v), { val: (s) => s.v, better: 'low', note: 'Lo que llevan abiertas las pendientes, de media.' }),
        partFig('Sin tocar', sit(1), 'low', 'En Asignada y sin ningún movimiento desde que se abrieron'),
        partFig('Fuera de plazo', late, 'low', 'Nunca han pasado a En curso y ya superan el plazo de su prioridad'),
        partFig(`Con más de ${OLD_DAYS} días`, old, 'low', `Llevan más de ${OLD_DAYS} días abiertas`),
        partFig('Escaladas', escd, null, 'Con ticket de tercero: dependen de otros')),
      card('Cómo está lo pendiente', pendCmp(pendRows, op), { span: 's12', sub: `${pp ? 'Issues de cada uno; las de la empresa, la media por persona de su equipo.' : 'Qué parte de sus pendientes está en cada situación.'} En verde, quien va mejor en lo que depende de él; lo que espera a otros, sin color. Clic en una fila para filtrar.` }),
      card('Qué tiene pendiente cada uno', mixCmp(mixRows, op, 'Pendientes'), { span: 's12', sub: 'Los 8 módulos con más pendientes; «Resto», los demás. Clic en una fila para filtrar.' }));
  };
  const ledger = (A) => {
    const { units, per, day } = ledgerOf(m, A);
    if (CMP()) return ledgerCmp(units, per, day);
    const DAY_NAMES = { '% cerrado en el mes': '% cerrado el mismo día', 'De meses anteriores': 'De días anteriores' };
    const defs = day ? LEDGER.map((d) => (DAY_NAMES[d[0]] ? [DAY_NAMES[d[0]], ...d.slice(1)] : d)) : LEDGER;
    const row = (label, j, attrs = '') => `<tr ${attrs}><td>${label}</td>${defs.map(([, f]) => `<td class="mt-num">${f(per[0][j])}</td>`).join('')}</tr>`;
    const groups = LEDGER_GROUPS.map(([l, n]) => [day ? l.replace('mes', 'día') : l, n]);
    return table(day ? 'Día' : 'Mes', defs.map(([l, , tip]) => [l, tip]), units.map((u, j) => row(u.label, j, u.f ? `class="mt-clk" data-f="${u.f}"` : u.after ? 'class="mt-mut"' : '')).join('') + row('Total', units.length, 'class="mt-tot"'), groups);
  };

  // ¿De quién dependemos en cada módulo? Los 15 módulos con más issues: cuántas personas lo tocan, cuántas hacen
  // falta para llevar OWNERS_SHARE (de la que más lleva a la que menos) y las tres que más llevan.
  const OWNERS_PCT = Math.round(OWNERS_SHARE * 100);
  const owners = (A) => {
    const g = ownersOf(m, A);
    const body = g.map((x) => {
      const top = x.top.map((p) => `<span class="mt-own ${isSel('as', p.k) ? 'mt-sel' : ''}" data-f="as:${p.k}" data-tip="${esc(`${m.DIMS.as.label(p.k)}\n${num(p.n)} de ${num(x.n)} issues de ${m.DIMS.mo.label(x.k)}`)}">${esc(m.DIMS.as.label(p.k))} <b>${pct(p.n / x.n)}</b></span>`).join('');
      return `<tr class="mt-clk ${isSel('mo', x.k) ? 'mt-sel' : ''}" data-f="mo:${x.k}"><td>${esc(m.DIMS.mo.label(x.k))}</td><td class="mt-num">${num(x.n)}</td><td class="mt-num">${x.people}</td><td class="mt-num">${x.n80}</td><td class="mt-owns">${top}</td></tr>`;
    }).join('');
    return g.length ? `<div class="mt-tablewrap"><table class="mt-owners"><thead><tr><th>Módulo</th><th class="mt-num">Issues</th><th class="mt-num" data-tip="Personas con alguna issue del módulo.">Personas</th>
      <th class="mt-num" data-tip="Cuántas personas, de la que más lleva a la que menos, suman el ${OWNERS_PCT} % de las issues del módulo.">Llevan el ${OWNERS_PCT} %</th><th>Quién lleva más</th></tr></thead><tbody>${body}</tbody></table></div>` : '<p class="mt-mut mt-small">Sin datos con estos filtros.</p>';
  };

  // Módulos y focos de un solo lado; note: un aviso arriba
  const modulesView = (A, note = '') => {
    const team = !S.sides[0].people;
    return grid(ask('modulos'), note,
      card('', scorecard('ce', CE_GROUPS, { id: 'md-ce', skip: noK, refLabel: 'Todos los centros', extra: centreExtra, title: 'Centros' }), { span: 's12' }),
      card('', scorecard('mo', MOD_GROUPS, { id: 'md-mo', skip: noK, refLabel: 'Todos los módulos', title: 'Módulos' }), { span: 's12' }),
      team ? card('Quién lleva cada módulo', owners(A), { span: 's12', sub: 'De lo recibido en el periodo con responsable: cuántas personas tocan cada módulo, cuántas llevan entre todas el 80 % y quién lleva más. Clic en un módulo o en una persona para filtrar.' }) : '',
      card('', heat('ce', 'mo', 18, 14, { skipR: noK, skipC: noK, title: true }), { span: 's12' }),
      card('', heat('tp', 'mo', 16, 14, { skipR: noTheme, skipC: noK, title: true }), { span: 's12' }),
      card('', heat('pr', 'mo', 4, 14, { skipR: noK, skipC: noK, orderR: PRIOS, title: true }), { span: 's12' }),
      card('', scorecard('tp', PB_GROUPS, { id: 'md-pb', refLabel: 'Todos los problemas', extra: problemExtra, title: 'Problemas', top: 14, child: { dim: 'de', top: 8, noun: 'problemas' } }), { span: 's12' }));
  };

  // --- Resolución. Una pregunta por bloque: cuánto tardamos, en qué se va el tiempo, qué módulos tardan más y qué
  // escalamos y a quién. Los tiempos, de lo resuelto y en tiempo natural; el de cada estado, la media por resuelta
  // (model.js, stats rt). Entre empresas no se compara (resolutionCmp es para personas).
  const STATES = [['En cola', 'En Asignada: sin coger o de vuelta a la cola. Incluye lo que espera a otros sin pasar a Pendiente.'], ['En curso', 'En En curso.'],
    ['Espera cliente', 'En Pendiente del centro o del cliente.'], ['Espera tercero', 'En Pendiente de un tercero.'], ['Otro motivo', 'En Pendiente por otro motivo o sin motivo.']];
  const optDur = (v) => (v == null ? '—' : dur(v));
  const avgOf = (s) => optDur(s.resolved ? s.avg : null);
  // Cuánto tardan: lo resuelto sin escalar, escalado y todo, cada fila repartida entre los tramos de tiempo (suma el
  // 100 %), con más color cuanto mayor su parte. Los tramos, en tres bloques (menos de 24 h, de 1 a 7 días y más de 7),
  // cada uno con su total. Clic en una celda filtra ese tramo (y si está escalada o no). Comparando, una fila por lado
  // y, en verde, quien resuelve más en menos de 24 h y menos en más de 7 días (en los totales de esos bloques).
  const TTR_GROUPS = [['Menos de 24 h', [0, 1, 2, 3], 'high'], ['De 1 a 7 días', [4, 5], null], ['Más de 7 días', [6, 7], 'low']];
  // Las tablas de reparto por tramos (Cuánto tardan, Cuándo pasan a En curso): bloques de filas (comparando, una por
  // lado) y, en cada tramo, su parte, más oscura cuanto mayor (la fila de todas, sin color). Las piezas comunes: la
  // cabecera de la fila (comparando, el corte en la primera y el lado con su color en cada una), la clase de la fila,
  // el lado tras el nombre en las notas y la celda de un tramo.
  const spreadHead = (x, n, cmp) => (cmp ? `${x.k ? '' : `<th class="mt-r ${x.f ? 'mt-clk' : ''}" rowspan="${n}" ${x.f ? `data-f="${x.f}"` : ''}>${x.label}</th>`}<th class="mt-r mt-ttr-who" data-tip="${esc(name(x.k))}"><i class="mt-sw mt-c${x.k}"></i>${esc(name(x.k))}</th>`
    : `<th class="mt-r ${x.f ? 'mt-clk' : ''}" ${x.f ? `data-f="${x.f}"` : ''}>${x.label}</th>`);
  const spreadRow = (x, last, cmp) => `${last && !x.k ? 'mt-tot' : last ? 'mt-tot2' : ''} ${cmp && !x.k ? 'mt-gfirst' : ''}`;
  const spreadWho = (x, cmp) => (cmp ? ` · ${name(x.k)}` : '');
  const spreadCell = (x, k, max, last, cls, f, tip) => {
    const sh = x.c[k] / (x.n || 1), a = last ? 0 : shade(sh, max);
    return `<td class="${cls} ${a > HOT ? 'mt-hot' : ''}" style="--mt-a:${a}%" ${f} data-tip="${esc(tip(sh))}">${x.c[k] ? pct(sh) : ''}</td>`;
  };
  const ttrTable = (list) => {
    const R = list.filter(solved), cmp = CMP(), P = cmp ? bySide(R).slice(0, 2) : [R];
    const { blocks, max } = ttrBlocks(m, list, P);
    const share = (x, v) => v / (x.n || 1), sum = (x, ks) => ks.reduce((t, k) => t + x.c[k], 0);
    const best = (x, o, ks, better) => cmp && bestOf(x, o, ks, better);
    // la fila de todas, sin color: es la suma de las otras dos
    const cellsOf = (x, o, last) => TTR_GROUPS.map(([g, ks, better]) => ks.map((k, j) => spreadCell(x, k, max, last, j ? '' : 'mt-gsep', x.f ? `data-f2="${x.f}|tb:${k}"` : `data-f="tb:${k}"`,
      (sh) => `${x.label}${spreadWho(x, cmp)} · ${m.DIMS.tb.label(k)}\n${num(x.c[k])} de ${num(x.n)} (${pct(sh, 1)})`)).join('')
      + `<td class="mt-total mt-ttr-sub ${best(x, o, ks, better) ? 'mt-better' : ''}" data-tip="${esc(`${x.label}${spreadWho(x, cmp)} · ${g.toLowerCase()}\n${num(sum(x, ks))} de ${num(x.n)}`)}">${pct(share(x, sum(x, ks)))}</td>`).join('');
    const body = blocks.map((pair, b) => pair.map((x, k) => {
      const last = b === blocks.length - 1;
      return `<tr class="${spreadRow(x, last, cmp)}">${spreadHead(x, pair.length, cmp)}<td class="mt-total mt-num">${num(x.n)}</td><td class="mt-total mt-num"><b>${avgOf(x.s)}</b></td>${cellsOf(x, pair[1 - k] || x, last)}</tr>`;
    }).join('')).join('');
    return `<div class="mt-tablewrap"><table class="mt-hm mt-ttr"><colgroup>${cmp ? '<col style="width:10%"><col style="width:11%">' : '<col style="width:14%">'}<col style="width:7%"><col style="width:8%">${TTR_GROUPS.map(([, ks]) => '<col>'.repeat(ks.length) + '<col class="mt-ttr-subc">').join('')}</colgroup><thead>
      <tr class="mt-cgrp"><th colspan="${cmp ? 4 : 3}"></th>${TTR_GROUPS.map(([g, ks]) => `<th colspan="${ks.length + 1}">${g}</th>`).join('')}</tr>
      <tr><th colspan="${cmp ? 2 : 1}"></th><th class="mt-num">Resueltas</th><th class="mt-num" data-tip="De la apertura a la resolución.">Media</th>${TTR_GROUPS.map(([, ks]) => ks.map((k, j) => `<th class="${j ? '' : 'mt-gsep'}">${m.DIMS.tb.label(k)}</th>`).join('') + '<th class="mt-ttr-sub">Total</th>').join('')}</tr></thead>
      <tbody>${body}</tbody></table></div>`;
  };
  // Mes a mes (por mes de apertura): lo resuelto de lo recibido ese mes y cuánto tardó, todo, sin escalar y escalado.
  // En ocre, lo que va claramente peor que el total (rules.js, con al menos MIN_ISSUES resueltas).
  // Cada dato: [nombre, parte (a todo, n sin escalar, e escalado), valor, formato, mejor, nota].
  const RES_MONTH = [
    ['Volumen', [['Resueltas', 'a', (s) => s.resolved, num, null, 'De las recibidas ese mes, las ya resueltas.'],
      ['% escaladas', 'a', (s) => s.escShare, (v) => pct(v), null, 'De las resueltas, las que tienen ticket de tercero.']]],
    ['Media de resolución', [['Todas', 'a', (s) => s.avg, dur, 'low', 'De la apertura a la resolución.'], ['Sin escalar', 'n', (s) => s.avg, dur, 'low', ''], ['Escaladas', 'e', (s) => s.avg, dur, 'low', '']]],
    ['Resueltas en < 24 h', [['Sin escalar', 'n', (s) => s.d1, (v) => pct(v), 'high', ''], ['Escaladas', 'e', (s) => s.d1, (v) => pct(v), 'high', '']]],
    ['Más de 7 días', [['Sin escalar', 'n', (s) => s.w7, (v) => pct(v), 'low', ''], ['Escaladas', 'e', (s) => s.w7, (v) => pct(v), 'low', '']]],
  ];
  const resMonthly = (A) => {
    const parts = resolutionParts(m), val = partValue;
    const defs = RES_MONTH.flatMap(([, d]) => d), firsts = new Set(RES_MONTH.map(([, d]) => d[0]));
    const tot = parts(A);
    const cells = (x, isTot) => defs.map((d) => {
      const v = val(x, d), bad = !isTot && partWorse(x, d, v, tot);
      return `<td class="mt-num ${firsts.has(d) ? 'mt-gsep' : ''} ${bad ? 'mt-worse' : ''}" ${bad ? `data-tip="${esc(`Peor que el total: ${d[3](val(tot, d))}`)}"` : ''}>${v == null ? '—' : d[3](v)}</td>`;
    }).join('');
    const body = monthBody(A, (l) => cells(parts(l)));
    return `<div class="mt-res-month">${table('Mes de apertura', defs.map((d) => [d[0], d[5]]), `${body}<tr class="mt-tot"><td>Total</td>${cells(tot, true)}</tr>`, RES_MONTH.map(([g, d]) => [g, d.length]))}</div>`;
  };
  // en qué se va el tiempo: por prioridad, escalada o no y tarjeta, la media y su reparto entre estados
  const timeTable = (A) => {
    const R = A.filter(solved);
    const blocks = [['Prioridad', '', prioRows()],
      ['Escalado', '', [['Sin escalar', (i) => !escd(i), 'es:0'], ['Escaladas', escd, 'es:1']]],
      ['Tarjeta', 'Una PRIO cuenta también en su SGA o SISU.', CARDS.map((c, k) => [c, (i) => cardsOf(i).includes(k), `tj:${k}`])]];
    const cells = (l) => {
      const s = stats(l), tot = s.rt.reduce((a, b) => a + b, 0) || 1;
      return `<td class="mt-num">${num(s.resolved)}</td><td class="mt-num"><b>${avgOf(s)}</b></td>${STATES.map((_, k) => `<td class="mt-num">${optDur(s.resolved ? s.rt[k] / s.resolved : null)}</td>`).join('')}
        <td class="mt-tbar">${s.resolved ? `<div class="mt-hbar">${s.rt.map((v, k) => `<i class="mt-time${k}" style="width:${(v / tot * 100).toFixed(1)}%" data-tip="${esc(`${STATES[k][0]}: ${pct(v / tot, 1)} del tiempo`)}"></i>`).join('')}</div>` : ''}</td>`;
    };
    const body = blocks.map(([head, note, rowsB]) => rowsB.filter(([, t]) => R.some(t)).map(([label, t, f], j, arr) => `<tr class="mt-clk ${j ? '' : 'mt-gfirst'} ${selRow(f) ? 'mt-sel' : ''}" data-f="${f}">
      ${j ? '' : blockHead(head, note, arr.length)}<th class="mt-r">${esc(label)}</th>${cells(R.filter(t))}</tr>`).join('')).join('');
    return `<div class="mt-legend">${STATES.map(([l, t], k) => `<span data-tip="${esc(t)}"><i class="mt-time${k}"></i>${l}</span>`).join('')}</div>
      <div class="mt-tablewrap"><table class="mt-mx mt-restime"><colgroup><col style="width:10%"><col style="width:12%"><col style="width:7%"><col style="width:8%">${'<col style="width:8%">'.repeat(5)}<col></colgroup>
      <thead><tr><th colspan="2"></th><th class="mt-num">Resueltas</th><th class="mt-num" data-tip="De la apertura a la resolución.">Media</th>${STATES.map(([l, t]) => `<th class="mt-num" data-tip="${esc(`${t} Media por resuelta.`)}">${l}</th>`).join('')}<th>Reparto del tiempo</th></tr></thead>
      <tbody>${body}<tr class="mt-lead mt-lead-end"><th class="mt-r" colspan="2">Todas las resueltas</th>${cells(R)}</tr></tbody></table></div>`;
  };
  // la diferencia entre dos tiempos, con signo
  const durDiff = (a, b) => (a == null || b == null ? '—' : `${a >= b ? '+' : '−'}${dur(Math.abs(a - b))}`);
  // Unas veces se escala y otras no: problemas con al menos MIXED_ESC.min resueltas, escalados entre MIXED_ESC.from y
  // MIXED_ESC.to de las veces, agrupados por su módulo principal (el módulo, de más a menos resueltas entre sus problemas). Por problema:
  // cuántas, qué parte se escala y lo que tarda sin escalar y escalado.
  const mixedEsc = () => {
    const all = ui.exp['rs-mixed'], { all: total, shown, groups: mods } = mixedEscalation(m, all ? 0 : 12);
    if (!total) return '<p class="mt-mut mt-small">Ninguno con estos filtros.</p>';
    const cells = (rows, e) => {
      const n = stats(rows.filter((i) => !escd(i))), s = stats(e), sh = e.length / (rows.length || 1);
      return `<td class="mt-num mt-gsep">${num(rows.length)}</td>
        <td class="mt-gsep"><div class="mt-sc-vol"><em>${pct(sh)}</em><span class="mt-bt"><i class="mt-time3" style="width:${(sh * 100).toFixed(1)}%"></i></span></div></td>
        <td class="mt-num mt-gsep">${avgOf(n)}</td><td class="mt-num">${avgOf(s)}</td><td class="mt-num mt-mut">${durDiff(s.resolved ? s.avg : null, n.resolved ? n.avg : null)}</td>
        <td class="mt-num mt-gsep">${n.resolved ? pct(n.d1) : '—'}</td><td class="mt-num">${s.resolved ? pct(s.d1) : '—'}</td>`;
    };
    const body = mods.map(([mo, xs]) => xs.map((x, j) => `<tr class="mt-clk ${j ? '' : 'mt-gfirst'} ${isSel('de', x.k) ? 'mt-sel' : ''}" data-f="de:${x.k}">
      ${j ? '' : blockHead(mo ? m.DIMS.mo.label(mo) : 'Sin módulo', '', xs.length)}<th class="mt-r" data-tip="${esc(DI.problem[x.k])}">${esc(DI.problem[x.k])}</th>${cells(x.rows, x.e)}</tr>`).join('')).join('');
    const allRows = shown.flatMap((x) => x.rows);
    return `<div class="mt-tablewrap"><table class="mt-mx mt-mixesc"><colgroup><col style="width:13%"><col style="width:21%"><col style="width:8%"><col style="width:15%"><col style="width:10%"><col style="width:10%"><col style="width:9%"><col style="width:7%"><col style="width:7%"></colgroup><thead>
      <tr class="mt-cgrp"><th colspan="2"></th><th colspan="2">Volumen</th><th colspan="3">Media de resolución</th><th colspan="2">En < 24 h</th></tr>
      <tr><th>Módulo principal</th><th>Problema</th><th class="mt-num">Resueltas</th><th data-tip="De las resueltas, las que tienen ticket de tercero.">Escaladas</th><th class="mt-num">Sin escalar</th><th class="mt-num">Escaladas</th><th class="mt-num" data-tip="Lo que tardan de más (o de menos) las escaladas.">Diferencia</th><th class="mt-num">Sin escalar</th><th class="mt-num">Escaladas</th></tr></thead>
      <tbody>${body}<tr class="mt-lead mt-lead-end"><th class="mt-r" colspan="2">${all || total <= 12 ? 'Todos estos problemas' : `Estos ${shown.length} problemas`}</th>${cells(allRows, allRows.filter(escd))}</tr></tbody></table></div>
      ${more('rs-mixed', total, 12)}`;
  };
  // Un mismo ticket, muchas incidencias: tickets de tercero con TICKET_MIN o más incidencias ligadas, en dos bloques: con
  // alguna abierta y ya cerrados (de más a menos incidencias). Cuándo: la primera y la última incidencia y los días
  // entre una y otra (0: todas el mismo día).
  const ticketTable = (A) => {
    const known = tickets(m, A);
    if (!known.length) return '<p class="mt-mut mt-small">Ninguno con estos filtros.</p>';
    const all = ui.exp['rs-known'], shown = known.slice(0, all ? 200 : 15);
    const row = (x, j, n, head) => `<tr class="mt-clk ${j ? '' : 'mt-gfirst'} ${isSel('vk', x.k) ? 'mt-sel' : ''}" data-f="vk:${x.k}">${j ? '' : blockHead(head, '', n)}<th class="mt-r"><b>${esc(DI.vkey[x.k])}</b></th>
        <td class="mt-num mt-gsep">${num(x.n)}</td><td class="mt-num ${x.open ? 'mt-warnc' : ''}">${x.open || ''}</td><td class="mt-num">${num(x.centres)}</td>
        <td class="mt-num mt-gsep">${dateOf(BASE, x.first).slice(0, 5)}</td><td class="mt-num">${dateOf(BASE, x.last).slice(0, 5)}</td><td class="mt-num">${x.span ? num(x.span) : 'el mismo'}</td>
        <td class="mt-num mt-gsep">${avgOf(stats(x.rows))}</td><td class="mt-gsep mt-mut" data-tip="${x.problem ? esc(DI.problem[x.problem]) : ''}">${x.problem ? esc(DI.problem[x.problem]) : ''}</td></tr>`;
    const parts = [['Con alguna abierta', shown.filter((x) => x.open)], ['Cerrados', shown.filter((x) => !x.open)]].filter(([, xs]) => xs.length);
    const body = parts.map(([head, xs]) => xs.map((x, j) => row(x, j, xs.length, head)).join('')).join('');
    const sum = (f) => shown.reduce((t, x) => t + f(x), 0);
    return `<div class="mt-tablewrap ${all ? 'mt-scroll' : ''}"><table class="mt-mx mt-tickets"><colgroup><col style="width:11%"><col style="width:15%"><col style="width:8%"><col style="width:7%"><col style="width:7%"><col style="width:7%"><col style="width:7%"><col style="width:7%"><col style="width:9%"><col></colgroup><thead>
      <tr class="mt-cgrp"><th colspan="2"></th><th colspan="3">Volumen</th><th colspan="3">Cuándo</th><th colspan="2">Resolución</th></tr>
      <tr><th>Estado</th><th>Ticket</th><th class="mt-num">Incidencias</th><th class="mt-num">Abiertas</th><th class="mt-num" data-tip="Centros distintos con alguna de esas incidencias.">Centros</th><th class="mt-num">Primera</th><th class="mt-num">Última</th><th class="mt-num" data-tip="Días entre la primera y la última incidencia.">Días</th><th class="mt-num">Media resol.</th><th>Problema más habitual</th></tr></thead>
      <tbody>${body}<tr class="mt-lead mt-lead-end"><th class="mt-r" colspan="2">${shown.length === known.length ? `Todos (${num(shown.length)} tickets)` : `Estos ${num(shown.length)} tickets`}</th><td class="mt-num mt-gsep">${num(sum((x) => x.n))}</td><td class="mt-num">${num(sum((x) => x.open)) || ''}</td><td colspan="6" class="mt-gsep"></td></tr></tbody></table></div>
      ${more('rs-known', known.length, 15)}`;
  };
  // --- Resolución, comparando personas: una persona frente a su equipo (ella incluida: model.js heads) o frente a
  // otra. Lo que tarda depende mucho del módulo, así que la tabla principal compara módulo a módulo y la media se pone
  // también frente a lo que tarda el equipo en esos mismos módulos. Sin lo que habla del tercero o del tipo de
  // problema (en qué se va el tiempo por tarjeta, escalados), que no dice cómo trabaja cada uno.
  // La tabla de comparar de todas las pestañas (pair-table.js), con el nombre de cada lado. base: lo que cuenta para
  // marcar quién va mejor, si el dato no dice otra cosa (aquí, las resueltas).
  const pairTable = (first, defs, rows, base = (x) => x.resolved, groups = null) =>
    pairTableOf({ names: teamNames() || [name(0), name(1)], first, defs, rows, base, groups });
  // lo resuelto de cada lado en una lista, con el volumen (comparando con personas, una empresa por persona)
  const resPair = (lists) => resolvedPair(m, lists);
  const RES_VOL = ['Resueltas', (s) => s.vol, (v, s) => (s.H > 1 ? dec(v) : num(v)), null, ''];
  const RES_PAIR = [
    ['Media', (s) => (s.resolved ? s.avg : null), dur, 'low', 'De la apertura a la resolución.'],
    ['En < 24 h', (s) => (s.resolved ? s.d1 : null), (v) => pct(v), 'high', 'De las resueltas, las resueltas en menos de 24 horas.'],
  ];
  const resModulesCmp = (A) => {
    const R = A.filter(solved), T = bySide(R), lead = S.sides[0].people || !S.sides[1].people ? 0 : 1;
    const { top, rest: restL, all } = modulesBySide(m, R, T, lead);
    const split = (l) => { const set = new Set(l); return resPair(T.map((t) => t.filter((i) => set.has(i)))); };
    const rows = top.map((x) => ({ label: m.DIMS.mo.label(x.k), x: split(x.rows), cls: `mt-clk ${isSel('mo', x.k) ? 'mt-sel' : ''}`, attrs: `data-f="mo:${x.k}"` }));
    if (restL.length) rows.push({ label: `Resto (${all - 15})`, x: split(restL), cls: 'mt-mut' });
    rows.push({ label: 'Todas las resueltas', x: resPair(T), cls: 'mt-tot' });
    return pairTable('Módulo', [RES_VOL, ...RES_PAIR,
      ['1 a 7 días', (s) => (s.resolved ? s.d7 : null), (v) => pct(v), null, 'De las resueltas, las que tardaron de 1 a 7 días.'],
      ['7 a 15 días', (s) => (s.resolved ? s.d15 : null), (v) => pct(v), 'low', 'De las resueltas, las que tardaron de 7 a 15 días.'],
      ['Escaladas', (s) => (s.resolved ? s.vend : null), (v) => pct(v), null, 'De las resueltas, las que tienen ticket de tercero.']], rows);
  };
  const resMonthlyCmp = (A) => {
    const T = bySide(A.filter(solved));
    const rows = monthRows().map(([label, t, f]) => ({ label, x: resPair(T.map((l) => l.filter(t))), cls: `mt-clk ${selRow(f) ? 'mt-sel' : ''}`, attrs: `data-f="${f}"` }));
    rows.push({ label: 'Total', x: resPair(T), cls: 'mt-tot' });
    return pairTable('Mes de apertura', [RES_VOL, ...RES_PAIR,
      ['Más de 7 días', (s) => (s.resolved ? s.w7 : null), (v) => pct(v), 'low', 'De las resueltas, las que tardaron más de 7 días.'],
      ['Escaladas', (s) => (s.resolved ? s.vend : null), (v) => pct(v), null, 'De las resueltas, las que tienen ticket de tercero.']], rows);
  };
  // La media de una persona frente a lo que tardaría su equipo con sus mismos módulos: la media del equipo en cada
  // módulo, con el peso que ese módulo tiene en lo suyo. Solo persona frente a empresa.
  // las medias de las fichas, en días con un decimal: «+1 día 6 h» no cabe en una ficha estrecha
  const inDays = (v) => (v == null ? null : v / 1440), days1 = (s) => (s.v == null ? '—' : dec(s.v));
  const sameModules = (A) => {
    const pt = personVsTeam(m);
    if (!pt) return null;
    const { p, t } = pt, { own, expected, n } = expectedAvg(m, bySide(A.filter(solved)), pt);
    const out = [];
    out[p] = { n: n[0], v: inDays(own) }; out[t] = { n: n[1], v: inDays(expected) };
    const names = [];
    names[p] = name(p); names[t] = `${COMPANIES[S.sides[t].company]}, en sus módulos`;
    return kpiCo('Media frente a sus módulos, en días', out, days1, { val: (s) => s.v, better: 'low', names,
      note: `Lo que tardaría ${COMPANIES[S.sides[t].company]} con los mismos módulos que ${name(p)}: la media del equipo en cada módulo, con el peso que ese módulo tiene en lo suyo.` });
  };
  const resolutionCmp = (A) => {
    const T = bySide(A), R = T.map((l) => l.filter(solved)), ST = T.map(stats), team = S.sides.some((x) => !x.people), each = team ? ' por persona' : '';
    const part = (f) => ST.map((s) => ({ n: s.resolved, v: s.resolved ? f(s) : null }));
    const wait = ST.map((s) => { const t = s.rt.reduce((a, b) => a + b, 0); return { n: s.resolved, v: t ? s.rt[3] / t : null }; });
    const esc1 = R.map((l) => ({ n: l.length, v: l.length ? l.filter(escd).length / l.length : null }));
    const P = (s) => opt(pct)(s.v), names = teamNames();
    return grid(ask('resolucion'),
      kpis(kpiCo(`Resueltas${each}`, volume(R), team ? (s) => dec(s.v) : (s) => num(s.v), { val: (s) => s.v, note: `de lo recibido en el periodo${team ? headsNote() : ''}`, names }),
        kpiCo('Media de resolución, en días', part((s) => inDays(s.avg)), days1, { val: (s) => s.v, better: 'low', note: 'De la apertura a la resolución.' }),
        sameModules(A) || '',
        kpiCo('En < 24 h', part((s) => s.d1), P, { val: (s) => s.v, better: 'high', note: 'De las resueltas.' }),
        kpiCo('De 1 a 7 días', part((s) => s.d7), P, { val: (s) => s.v, note: 'De las resueltas.' }),
        kpiCo('De 7 a 15 días', part((s) => s.d15), P, { val: (s) => s.v, better: 'low', note: 'De las resueltas.' }),
        kpiCo('Escaladas', esc1, P, { val: (s) => s.v, note: 'De las resueltas, con ticket de tercero.' }),
        kpiCo('Esperando a terceros', wait, P, { val: (s) => s.v, note: 'Del tiempo de vida de lo resuelto, en Pendiente de un tercero.' })),
      section('¿Cuánto tardamos?'),
      card('Cuánto tardan', ttrTable(m.rows('tb')), { span: 's12', sub: 'Lo resuelto de cada uno, sin escalar, escalado y todo, repartido según lo que tardó (cada fila suma el 100 %). En verde, quien resuelve más en menos de 24 h y menos en más de 7 días. Clic en una celda para filtrar.' }),
      card('Mes a mes', resMonthlyCmp(A), { span: 's12', sub: `${MONTH_NOTE} En verde, quien va mejor (con al menos ${BETTER_MIN} resueltas cada uno).${m.perHead() && S.sides.some((x) => !x.people) ? ' Las resueltas de la empresa, la media por persona de su equipo.' : ''} Clic en un mes para filtrar.` }),
      section('¿Qué módulos tardan más?'),
      card('Módulo a módulo', resModulesCmp(A), { span: 's12', sub: `Los 15 módulos con más resueltas de ${esc(name(S.sides[0].people || !S.sides[1].people ? 0 : 1))}; cada uno, frente al otro en el mismo módulo. En verde, quien va mejor (con al menos ${BETTER_MIN} resueltas cada uno). Clic en un módulo para filtrar.` }));
  };
  const resolutionView = (A, note = '') => {
    const s = stats(A), R = A.filter(solved), rtTot = s.rt.reduce((a, b) => a + b, 0) || 1, on = s.resolved > 0;
    return grid(ask('resolucion'), note,
      kpis(kpi('Resueltas', num(s.resolved), `de ${num(s.n)} recibidas`), kpi('Media de resolución', avgOf(s), 'de la apertura a la resolución'),
        kpi('En < 24 h', on ? pct(s.d1) : '—', 'de las resueltas'), kpi('De 1 a 7 días', on ? pct(s.d7) : '—', 'de las resueltas'),
        kpi('De 7 a 15 días', on ? pct(s.d15) : '—', 'de las resueltas'), kpi('La que más tardó', on ? `${dec(s.mx / 1440)} días` : '—', 'la resuelta más lenta'), kpi('Escaladas', on ? pct(R.filter(escd).length / R.length) : '—', 'de las resueltas, con ticket de tercero'),
        kpi('Esperando a terceros', on ? pct(s.rt[3] / rtTot) : '—', 'del tiempo de vida de lo resuelto')),
      section('¿Cuánto tardamos?'),
      card('Cuánto tardan', ttrTable(m.rows('tb')), { span: 's12', sub: 'Lo resuelto sin escalar, escalado y todo, repartido según lo que tardó (cada fila suma el 100 %); cada bloque, con su total. Clic en una celda para filtrar.' }),
      card('Mes a mes', resMonthly(A), { span: 's12', sub: `${MONTH_NOTE} ${WORSE_NOTE.replace('issues', 'resueltas')} Clic en un mes para filtrar.` }),
      section('¿En qué se va el tiempo?'),
      card('Por prioridad, escalado y tarjeta', timeTable(A), { span: 's12', sub: 'Lo que pasa de media cada resuelta en cada estado, según el historial de cambios. Clic en una fila para filtrar.' }),
      section('¿Qué módulos tardan más?'),
      card('', scorecard('mo', [['Volumen', ['n']], ['Cuánto tarda', ['avg', 'd1', 'd7', 'd15', 'mx']], ['En qué se va', ['tq', 'tc', 'tv']], ['Escalado', ['vend']]],
        { id: 'rs-mo', rows: m.rows('mo').filter(solved), skip: noK, refLabel: 'Todos los módulos', title: 'Módulos', n: ['Resueltas', 'Issues resueltas y su parte del total.'] }), { span: 's12' }),
      section('¿Qué escalamos y a quién?'),
      card('', scorecard('vt', [['Volumen', ['n']], ['Cuánto tarda', ['avg', 'w7', 'tv']], ['Hoy', ['open']]],
        { id: 'rs-vt', rows: m.rows('vt').filter(escd), refLabel: 'Todo lo escalado', title: 'A quién escalamos', n: ['Escaladas', 'Issues con ticket de tercero y su parte de lo escalado.'], child: { dim: 'vp', top: 8, noun: 'proyectos Jira' } }), { span: 's12' }),
      card('Unas veces se escala y otras no', mixedEsc(), { span: 's12', sub: `Problemas con al menos ${MIXED_ESC.min} resueltas que se escalan entre el ${pct(MIXED_ESC.from)} y el ${pct(MIXED_ESC.to)} de las veces, agrupados por su módulo principal: lo que tardan sin escalar y escalados. Clic en uno para filtrar.` }),
      card('Un mismo ticket, muchas incidencias', ticketTable(A), { span: 's12', sub: `Tickets de tercero con ${TICKET_MIN} o más incidencias ligadas: arriba, los que aún tienen alguna abierta. Clic en uno para filtrar.` }));
  };

  // --- SLA y calidad. Tres preguntas: si empezamos a tiempo, si el trabajo queda bien hecho y si queda
  // bien registrado. Las tablas, como las de Resolución: una fila por corte con su total al final y, en ocre, lo que va
  // claramente peor que el total (rules.js, con al menos MIN_ISSUES issues).
  const P1 = (v) => pct(v, 1);
  const INI = m.DIMS.ini.label;
  // Cuándo pasan a En curso, por prioridad: cada fila repartida entre los tramos (suma el 100 %); los tramos que caen
  // dentro del plazo de esa prioridad, en verde. Clic en una celda filtra esa prioridad y ese tramo. Comparando, una
  // fila por lado (con personas, las issues de la empresa, por persona) y, en verde, quien empieza más a tiempo y antes
  // (con al menos BETTER_MIN issues cada uno).
  const startTable = (list) => {
    const cmp = CMP(), GROUPS = [['Pasan a En curso en…', [0, 1, 2, 3, 4, 5, 6]], [cmp ? 'Sin En curso' : 'Sin pasar a En curso', [7, 8]]];
    const P = cmp ? bySide(list).slice(0, 2) : [list], H = heads();
    const { blocks, max } = startBlocks(m, list, P);
    const cells = (x, last) => GROUPS.map(([, ks]) => ks.map((k, j) => {
      const ok = k <= x.lim;
      return spreadCell(x, k, max, last, `${j ? '' : 'mt-gsep'} ${ok ? 'mt-insla' : ''}`, x.f ? `data-f2="${x.f}|ini:${k}"` : `data-f="ini:${k}"`,
        (sh) => `${x.label}${spreadWho(x, cmp)} · ${INI(k)}${ok ? ' (dentro del SLA)' : ''}\n${num(x.c[k])} de ${num(x.n)} (${pct(sh, 1)})`);
    }).join('')).join('');
    // el lado que va mejor en una cifra (low: menos es mejor), comparando lo que se ve
    const better = (x, o, v, fmt, low) => cmp && o && x.n >= BETTER_MIN && o.n >= BETTER_MIN && v(x) != null && v(o) != null && fmt(x) !== fmt(o) && (low ? v(x) < v(o) : v(x) > v(o));
    const vol = (x, v) => (H[x.k] > 1 ? dec(v / H[x.k]) : num(v));
    const body = blocks.map((pair, b) => pair.map((x) => {
      const last = b === blocks.length - 1, o = pair[1 - x.k];
      return `<tr class="${spreadRow(x, last, cmp)}">${spreadHead(x, pair.length, cmp)}<td class="mt-total mt-num">${vol(x, x.n)}</td>
        <td class="mt-total mt-num ${better(x, o, (y) => y.s.sla, (y) => slaPct(y.s)) ? 'mt-better' : ''}"><b>${slaPct(x.s)}</b></td><td class="mt-total mt-num">${vol(x, x.s.slaKo)}</td>
        <td class="mt-total mt-num ${better(x, o, (y) => y.s.ip, (y) => optDur(y.s.ip), true) ? 'mt-better' : ''}">${optDur(x.s.ip)}</td>${cells(x, last)}</tr>`;
    }).join('')).join('');
    return `<div class="mt-tablewrap"><table class="mt-hm mt-ttr mt-start"><colgroup>${cmp ? '<col style="width:9%"><col style="width:10%">' : '<col style="width:12%">'}<col style="width:6%"><col style="width:7%"><col style="width:6%"><col style="width:8%">${'<col>'.repeat(9)}</colgroup><thead>
      <tr class="mt-cgrp"><th colspan="${cmp ? 2 : 1}"></th><th colspan="4">SLA de inicio</th>${GROUPS.map(([g, ks]) => `<th colspan="${ks.length}">${g}</th>`).join('')}</tr>
      <tr><th colspan="${cmp ? 2 : 1}">Prioridad y plazo</th><th class="mt-num">Issues</th><th class="mt-num" data-tip="Empezadas dentro del plazo, de las empezadas y de las que siguen sin empezar pasado el plazo. Las cerradas sin pasar por En curso no cuentan.">Dentro</th>
      <th class="mt-num" data-tip="Empezadas tarde y abiertas que siguen sin empezar pasado el plazo.">Fuera</th><th class="mt-num" data-tip="Media de la apertura al primer paso a En curso.">Media</th>
      ${GROUPS.map(([, ks]) => ks.map((k, j) => `<th class="${j ? '' : 'mt-gsep'}">${k === 7 ? 'Abiertas' : k === 8 ? 'Cerradas' : INI(k)}</th>`).join('')).join('')}</tr></thead>
      <tbody>${body}</tbody></table></div>`;
  };
  // Tabla dinámica de calidad: bloques de filas (cada fila, [nombre, prueba, filtro]) por grupos de columnas (cada una,
  // [nombre, valor de stats, formato, mejor, nota, marca de calidad para el clic]), con el total al final. En ocre, lo
  // que va claramente peor que el total, con al menos MIN_ISSUES issues.
  const qualityPivot = (A, blocks, groups, first = '', st = stats) => {
    const defs = groups.flatMap(([, d]) => d), firsts = new Set(groups.map(([, d]) => d[0])), tot = st(A);
    const worse = (s, d, v) => s.n >= MIN_ISSUES && clearlyWorse(v, d[1](tot), d[3]);
    const cells = (s, f, isTot) => defs.map((d) => {
      const v = d[1](s), bad = !isTot && worse(s, d, v), click = d[5] != null ? (f ? `data-f2="${f}|q:${d[5]}"` : `data-f="q:${d[5]}"`) : '';
      return `<td class="mt-num ${firsts.has(d) ? 'mt-gsep' : ''} ${bad ? 'mt-worse' : ''} ${click ? 'mt-clkc' : ''}" ${click} ${bad ? `data-tip="${esc(`Peor que el total: ${d[2](d[1](tot))}`)}"` : ''}>${v == null ? '—' : d[2](v)}</td>`;
    }).join('');
    const body = blocks.map(([head, note, rowsB]) => rowsB.filter(([, t]) => A.some(t)).map(([label, t, f], j, arr) => `<tr class="${j ? '' : 'mt-gfirst'} ${selRow(f) ? 'mt-sel' : ''}">
      ${j ? '' : blockHead(head, note, arr.length)}<th class="mt-r ${f ? 'mt-clk' : ''}" ${f ? `data-f="${f}"` : ''}>${esc(label)}</th>${cells(st(A.filter(t)), f)}</tr>`).join('')).join('');
    return `<div class="mt-tablewrap"><table class="mt-mx mt-qpivot"><colgroup><col style="width:10%"><col style="width:13%">${'<col>'.repeat(defs.length)}</colgroup><thead>
      <tr class="mt-cgrp"><th colspan="2"></th>${groups.map(([g, d]) => `<th colspan="${d.length}">${g}</th>`).join('')}</tr>
      <tr><th colspan="2">${first}</th>${defs.map((d) => `<th class="mt-num" ${d[4] ? `data-tip="${esc(d[4])}"` : ''}>${d[0]}</th>`).join('')}</tr></thead>
      <tbody>${body}<tr class="mt-lead mt-lead-end"><th class="mt-r" colspan="2">Todas</th>${cells(tot, null, true)}</tr></tbody></table></div>`;
  };
  const QUALITY_COLS = [
    ['Trabajo', [['Reabiertas', (s) => (s.n ? s.reop : null), P1, 'low', 'Volvieron de Resuelta a abierta.', 0],
      ['Devueltas a cola', (s) => (s.n ? s.bounce : null), P1, 'low', 'Pasaron de En curso a Asignada.', 1]]],
    ['Registro', [['Cerradas sin En curso', (s) => s.noIpDone, P1, 'low', 'De las cerradas, las que nunca pasaron por En curso.', 2],
      ['Escaladas sin Pendiente', (s) => s.escNoPend, P1, 'low', 'De las cerradas con ticket de tercero, las que nunca pasaron a Pendiente.', 3],
      ['Sin tipología', (s) => (s.n ? s.noCat : null), P1, 'low', 'Sin categorización 3 de Remedy.', 4],
      ['Título sin descripción', (s) => (s.n ? s.noDesc : null), P1, 'low', 'El título no dice cuál es el problema.', 5],
      ['Sin texto de resolución', (s) => (s.done ? s.noRes : null), P1, 'low', 'De las cerradas, las que no explican la solución.', 6]]],
  ];
  const SLA_COLS = [
    ['Volumen', [['Issues', (s) => s.n, num, null, '']]],
    ['Dentro del SLA', [...PRIOS.map((p) => [nice(DI.prio[p]), (s) => s.byP[p], (v) => pct(v), 'high', slaLabel(p)]), ['Todas', (s) => s.sla, (v) => pct(v), 'high', 'Todas las prioridades.']]],
    ['Fuera de SLA', [['Issues', (s) => s.slaKo, num, null, 'Empezadas tarde y abiertas que siguen sin empezar pasado el plazo.'], ['Media hasta En curso', (s) => s.ip, dur, 'low', 'Media de la apertura al primer paso a En curso.']]],
  ];
  const slaStats = slaStatsOf(m);
  // mes a mes: filas por mes de apertura, con las columnas que se le pasen ([grupo, defs] como en qualityPivot)
  const monthPivot = (A, groups, st = stats) => {
    const defs = groups.flatMap(([, d]) => d), firsts = new Set(groups.map(([, d]) => d[0])), tot = st(A);
    const cells = (s, isTot) => defs.map((d) => {
      const v = d[1](s), w = d[1](tot), bad = !isTot && s.n >= MIN_ISSUES && clearlyWorse(v, w, d[3]);
      return `<td class="mt-num ${firsts.has(d) ? 'mt-gsep' : ''} ${bad ? 'mt-worse' : ''}" ${bad ? `data-tip="${esc(`Peor que el total: ${d[2](w)}`)}"` : ''}>${v == null ? '—' : d[2](v)}</td>`;
    }).join('');
    const body = monthBody(A, (l) => cells(st(l)));
    return `<div class="mt-res-month">${table('Mes de apertura', defs.map((d) => [d[0], d[4]]), `${body}<tr class="mt-tot"><td>Total</td>${cells(tot, true)}</tr>`, groups.map(([g, d]) => [g, d.length]))}</div>`;
  };
  const CARD_ROWS = () => CARDS.map((c, k) => [c, (i) => cardsOf(i).includes(k), `tj:${k}`]);
  const slaView = (A, note = '') => {
    const s = stats(A);
    return grid(ask('sla'), note,
      kpis(kpi('Dentro del SLA', slaPct(s), 'todas las prioridades'), kpi('Fuera de SLA', num(s.slaKo), 'empezadas tarde o sin empezar pasado el plazo'),
        kpi('Media hasta En curso', s.ip == null ? '—' : `${dec(s.ip / 1440)} días`, 'de la apertura al primer paso'), kpi('Reabiertas', s.n ? P1(s.reop) : '—', 'volvieron de Resuelta a abierta'),
        kpi('Devueltas a cola', s.n ? P1(s.bounce) : '—', 'de En curso a Asignada'), kpi('Cerradas sin En curso', s.noIpDone == null ? '—' : P1(s.noIpDone), 'de las cerradas'),
        kpi('Escaladas sin Pendiente', s.escNoPend == null ? '—' : P1(s.escNoPend), 'de las cerradas escaladas'), kpi('Sin texto de resolución', s.done ? P1(s.noRes) : '—', 'de las cerradas')),
      section('¿Empezamos a tiempo?'),
      card('Cuándo pasan a En curso', startTable(m.rows('ini')), { span: 's12', sub: 'Por prioridad: el SLA de inicio y cómo se reparte (cada fila suma el 100 %) lo que tarda en pasar a En curso; en verde, los tramos dentro del plazo de esa prioridad. Clic en una celda para filtrar.' }),
      card('Mes a mes', monthPivot(A, SLA_COLS, slaStats), { span: 's12', sub: `${MONTH_NOTE} ${WORSE_NOTE} Clic en un mes para filtrar.` }),
      card('Por turno y día de entrada', qualityPivot(A, [['Turno', 'Por la hora de apertura.', [0, 1, 2].map((k) => [m.DIMS.tu.label(k), (i) => m.DIMS.tu.get(i) === k, `tu:${k}`])],
        ['Días', '', [0, 1].map((k) => [m.DIMS.we.label(k), (i) => m.DIMS.we.get(i) === k, `we:${k}`])]],
        [['Volumen', [['Issues', (x) => x.n, num, null, '']]], ['Dentro del SLA', [...PRIOS.slice(0, 2).map((p) => [nice(DI.prio[p]), (x) => x.byP?.[p] ?? null, (v) => pct(v), 'high', slaLabel(p)]), ['Todas', (x) => x.sla, (v) => pct(v), 'high', 'Todas las prioridades.']]],
          ['Hasta En curso', [['Media', (x) => x.ip, dur, 'low', 'Media de la apertura al primer paso a En curso.'], ['En su turno', (x) => x.inShift, (v) => pct(v), 'high', 'De las empezadas, las que pasaron a En curso en el mismo turno en que entraron.']]]], '', slaStats),
        { span: 's12', sub: `Según cuándo se abrió. ${WORSE_NOTE} Clic en una fila para filtrar.` }),
      section('¿Queda bien hecho y bien registrado?'),
      card('Por prioridad y tarjeta', qualityPivot(A, [['Prioridad', '', prioRows()], ['Tarjeta', 'Una PRIO cuenta también en su SGA o SISU.', CARD_ROWS()],
        ['Escalado', '', [['Sin escalar', (i) => !escd(i), 'es:0'], ['Escaladas', escd, 'es:1']]]], QUALITY_COLS),
        { span: 's12', sub: `Trabajo: lo que vuelve atrás. Registro: lo que falta o no se movió en Remedy. ${WORSE_NOTE} Clic en una cifra para ver esas issues.` }),
      card('Mes a mes', monthPivot(A, QUALITY_COLS), { span: 's12', sub: `${MONTH_NOTE} ${WORSE_NOTE} Clic en un mes para filtrar.` }),
      section('¿Dónde?'),
      card('', scorecard('mo', [['Volumen', ['n']], ['Empezar a tiempo', ['sla', 'slaKo', 'ip']], ['Trabajo', ['reop', 'bounce']], ['Registro', ['noIpDone', 'escNoPend', 'noCat', 'noDesc']]],
        { id: 'sq-mo', skip: noK, refLabel: 'Todos los módulos', title: 'Módulos' }), { span: 's12' }),
      card('', scorecard('ce', [['Volumen', ['n']], ['Empezar a tiempo', ['sla', 'slaKo', 'ip']], ['Trabajo', ['reop', 'bounce']], ['Registro', ['noIpDone', 'escNoPend', 'noCat', 'noDesc']]],
        { id: 'sq-ce', skip: noK, refLabel: 'Todos los centros', title: 'Centros' }), { span: 's12' }));
  };

  // --- SLA y calidad, comparando. Entre empresas, cómo atiende cada servicio el mismo tipo de trabajo (cada una
  // recibe trabajo distinto: el SLA, por prioridad, y también con el mismo trabajo); entre personas, cómo trabaja
  // cada uno (una persona frente a su equipo, ella incluida, o frente a otra). Todo cuenta a la persona responsable
  // actual de la issue.
  // «con el mismo trabajo»: el primer lado (o la persona, frente a su empresa) frente a lo que cumpliría el otro con
  // su trabajo (peers.js)
  const sameWork = (A) => {
    const pp = m.perHead(), pt = pp ? personVsTeam(m) : { p: 0, t: 1 };
    if (!pt) return '';
    const { p, t } = pt, T = bySide(A), v = [], names = [];
    v[p] = { n: T[p].length, v: stats(T[p]).sla }; v[t] = { n: T[t].length, v: expectedSla(m, T[p], T[t]) };
    names[p] = name(p); names[t] = `${name(t)}, con ese trabajo`;
    return kpiCo('Dentro del SLA, con el mismo trabajo', v, (s) => opt(pct)(s.v), { val: (s) => s.v, better: 'high', names,
      note: `Lo que cumpliría ${name(t)} con el trabajo de ${name(p)}: su % dentro del SLA en cada prioridad y módulo, con el peso que tiene cada uno en lo de ${name(p)}.` });
  };
  // stats de cada lado de una lista, con las issues por persona (comparando con personas, una empresa entre su equipo)
  const slaPair = (lists) => slaPairOf(m, lists);
  const PAIR_VOL = ['Issues', (s) => s.vol, (v, s) => (s.H > 1 ? dec(v) : num(v)), null, ''];
  const PAIR_SLA = [['Dentro del SLA (altas)', (s) => s.byP[PRIOS[1]] ?? null, (v) => pct(v), 'high', slaLabel(PRIOS[1]), (s) => s.nP[PRIOS[1]]],
    ['Dentro del SLA (todas)', (s) => s.sla, (v) => pct(v), 'high', 'Todas las prioridades.'],
    ['Media hasta En curso', (s) => s.ip, dur, 'low', 'Media de la apertura al primer paso a En curso.']];
  const qualityDefs = (co) => QUALITY_COLS.flatMap(([, d]) => d).filter((d) => !co || d[5] !== 5).map((d) => d.slice(0, 5));
  const pairRows = (A, defs, total = 'Todas') => sideRows(A, defs, slaPair, total);
  const BY_N = (x) => x.n;
  const slaCmp = (A) => {
    const pp = m.perHead(), co = !pp, T = bySide(A), ST = T.map(slaStats), names = teamNames();
    const fig = (label, f, fmt, better, note) => kpiCo(label, ST.map((s) => ({ n: s.n, v: f(s) })), (s) => (s.v == null ? '—' : fmt(s.v)), { val: (s) => s.v, better, note });
    const team = pp && S.sides.some((x) => !x.people), perNote = team ? ' Las issues de la empresa, por persona de su equipo.' : '';
    const greenNote = `En verde, quien va mejor (con al menos ${BETTER_MIN} issues cada uno).`;
    const months = monthRows();
    const kp = co
      ? [...PRIOS.map((p) => fig(`Dentro del SLA · ${nice(DI.prio[p])}`, (s) => s.byP[p], (v) => pct(v), 'high', slaLabel(p))), sameWork(A),
        fig('Reabiertas', (s) => (s.n ? s.reop : null), (v) => pct(v), 'low', 'Volvieron de Resuelta a abierta.'),
        fig('Cerradas sin En curso', (s) => s.noIpDone, (v) => pct(v), 'low', 'De las cerradas, las que nunca pasaron por En curso.'),
        fig('Escaladas sin Pendiente', (s) => s.escNoPend, (v) => pct(v), 'low', 'De las cerradas con ticket de tercero, las que nunca pasaron a Pendiente.')]
      : [fig('Dentro del SLA', (s) => s.sla, (v) => pct(v), 'high', 'Todas las prioridades.'), fig('Dentro del SLA · Alta', (s) => s.byP[PRIOS[1]], (v) => pct(v), 'high', slaLabel(PRIOS[1])), sameWork(A),
        fig('Hasta En curso, en días', (s) => (s.ip == null ? null : s.ip / 1440), dec, 'low', 'Media de la apertura al primer paso a En curso.'),
        fig('Reabiertas', (s) => (s.n ? s.reop : null), (v) => pct(v), 'low', 'Volvieron de Resuelta a abierta.'),
        fig('Devueltas a cola', (s) => (s.n ? s.bounce : null), (v) => pct(v), 'low', 'Pasaron de En curso a Asignada.'),
        fig('Cerradas sin En curso', (s) => s.noIpDone, (v) => pct(v), 'low', 'De las cerradas, las que nunca pasaron por En curso.'),
        fig('Escaladas sin Pendiente', (s) => s.escNoPend, (v) => pct(v), 'low', 'De las cerradas con ticket de tercero, las que nunca pasaron a Pendiente.')];
    const common = () => commonModules(m, A, T, BETTER_MIN).map((x) => [m.DIMS.mo.label(x.k), (i) => C.mo[i] === x.k, `mo:${x.k}`]);
    return grid(ask('sla'),
      kpis(...kp.filter(Boolean)),
      section('¿Empezamos a tiempo?'),
      card('Cuándo pasan a En curso', startTable(m.rows('ini')), { span: 's12', sub: `Por prioridad, una fila por cada uno: el SLA de inicio y cómo se reparte (cada fila suma el 100 %) lo que tarda en pasar a En curso; en verde, los tramos dentro del plazo. ${greenNote}${perNote}${pp ? ' Cuenta a la persona responsable actual de la issue.' : ''} Clic en una celda para filtrar.` }),
      card('Mes a mes', pairTable('Mes de apertura', [PAIR_VOL, ...PAIR_SLA, ...(pp ? qualityDefs(false).filter((d) => ['Cerradas sin En curso', 'Escaladas sin Pendiente'].includes(d[0])) : [])], pairRows(A, months, 'Total'), BY_N),
        { span: 's12', sub: `${MONTH_NOTE} ${greenNote}${perNote} Clic en un mes para filtrar.` }),
      section('¿Queda bien hecho y bien registrado?'),
      card('Por prioridad', pairTable('Prioridad', qualityDefs(co), pairRows(A, prioRows()), BY_N),
        { span: 's12', sub: `Trabajo: reabiertas y devueltas a cola. Registro: lo que falta o no se movió en Remedy.${co ? ' Sin «Título sin descripción»: se detecta con el diccionario de problemas de Indra, hecho con sus títulos.' : ''} ${greenNote} Clic en una fila para filtrar.` }),
      co ? section('¿Dónde?') : '',
      co ? card('Módulo a módulo', pairTable('Módulo', [PAIR_VOL, ...PAIR_SLA, qualityDefs(true)[0], qualityDefs(true)[2]], pairRows(A, common()), BY_N),
        { span: 's12', sub: `Los 15 módulos con más issues de los que tienen al menos ${BETTER_MIN} cada uno. ${greenNote} Clic en un módulo para filtrar.` }) : '');
  };

  // --- IA. Cuánto la usamos, dónde, cómo sale, quién la usa y qué se repite. Por las marcas de IA de cada
  // issue (ia.js; en model.js, la dimensión ia).
  const iaOf = (i) => m.DIMS.ia.get(i), withIa = (i) => iaOf(i) !== IA_NONE;
  const iaStats = (l) => iaStatsOf(l, C);
  // el reparto de las de IA en una barra: revisadas OK, con fallo y sin revisar
  const IA_SPLIT = [['Revisada OK', 'ok', 'mt-ia0'], ['Con fallo', 'fail', 'mt-ia1'], ['Sin revisar', 'unrev', 'mt-ia2']];
  const iaBar = (s) => (s.ia ? `<div class="mt-hbar mt-iabar">${IA_SPLIT.map(([l, k, c]) => (s[k] ? `<i class="${c}" style="width:${(s[k] / s.ia * 100).toFixed(1)}%" data-tip="${esc(`${l}: ${num(s[k])} de ${num(s.ia)} (${pct(s[k] / s.ia, 1)})`)}"></i>` : '')).join('')}</div>` : '');
  // Las cifras de arriba, una caja por pregunta: cuánto la usamos, cómo sale, quién la usa y dónde. Cada caja, su cifra
  // grande y debajo el detalle.
  const iaBox = (label, value, lines, extra = '') => `<div class="mt-iabox"><div class="mt-kpi-l">${label}</div><div class="mt-kpi-v">${value}</div>${extra}
    ${lines.map(([l, v, c]) => `<div class="mt-kpi-s">${c ? `<i class="${c}"></i>` : ''}<span>${l}</span><b>${v}</b></div>`).join('')}</div>`;
  // Quién y dónde: cuántos la usan de cuántos (con su barra) y los tres que más issues con IA tienen, cada uno con su
  // barra: la parte que lleva de todas las issues con IA.
  const iaRank = (label, dim, A, all, noun, of, tip) => {
    const { count, share: sh, top } = iaTop(m, A, dim, all);
    const rows = top.map((x) => {
      const l = m.DIMS[dim].label(x.k);
      return `<div class="mt-iarank" data-tip="${esc(`${l}\n${num(x.n)} ${x.n === 1 ? 'issue' : 'issues'} con IA: ${pct(x.p, 1)} de todas las de IA${tip ? `\n${tip(x)}` : ''}`)}"><span>${esc(l)}</span><b>${num(x.n)}</b><em>${pct(x.p)}</em>
        <span class="mt-bt"><i class="mt-ia0" style="width:${(x.p * 100).toFixed(1)}%"></i></span></div>`;
    }).join('');
    return `<div class="mt-iabox"><div class="mt-kpi-l">${label}</div><div class="mt-kpi-v">${num(count)} <small>de ${num(all)} ${noun}</small></div>
      <div class="mt-iause"><span class="mt-bt"><i class="mt-ia0" style="width:${(sh * 100).toFixed(1)}%"></i></span><em>${pct(sh)} ${of}</em></div>
      ${count ? `<div class="mt-iarank-h"></div>${rows}` : '<div class="mt-kpi-s"><span>Ninguna issue con IA</span></div>'}</div>`;
  };
  const iaHead = (A, s) => {
    const { last, first } = iaMonths(m, A, monthsOf);
    const use = iaBox('Con IA, de lo recibido', s.share == null ? '—' : pct(s.share, 1), [['Issues con IA', num(s.ia)],
      ...last.map((x, j) => [`${j ? 'Mes anterior' : 'Último mes completo'} (${MONTHS[x.k]})`, opt((v) => pct(v, 1))(x.share)]),
      ['Primer mes con IA', first == null ? '—' : MONTHS[first]]]);
    const how = iaBox(`Cómo sale, de las ${num(s.ia)} con IA`, s.ia ? `${pct(s.okShare)} OK` : '—',
      [...IA_SPLIT.map(([l, k, c]) => [l, s.ia ? `${pct(s[`${k}Share`])} · ${num(s[k])}` : '—', c]), ['Resueltas por la IA (IA_SOLVED)', num(s.solved)]], iaBar(s));
    const mods = new Set(A.map((i) => C.mo[i]).filter(Boolean)).size;
    const who = iaRank('Personas que la usan', 'as', A, s.people, 'personas', 'del equipo');
    const where = iaRank('Módulos donde se usa', 'mo', A, mods, 'módulos', 'de los módulos',
      (x) => { const t = A.filter((i) => C.mo[i] === x.k).length; return `${pct(x.n / t, 1)} de las ${num(t)} issues del módulo`; });
    return `<div class="mt-iaboxes">${use}${how}${who}${where}</div>`;
  };
  // Mes a mes, por mes de apertura, como las fichas de ¿Dónde? (el título dentro de la tabla y bloques de columnas):
  // cuánto se usa (issues, % de lo recibido y personas), cómo sale (reparto en barra y %) y lo resuelto con IA (media,
  // < 24 h y reabiertas). En ocre, lo que va claramente peor que el total, con al menos MIN_ISSUES issues con IA. Los
  // meses sin IA, solo con lo recibido.
  const iaMonthly = (A) => {
    const part = (l) => ({ s: iaStats(l), r: stats(l.filter(withIa)) });
    const tot = part(A), N = tot.s.n || 1;
    const td = (v, fmt, bad = false, w = null) => `<td class="mt-num ${bad ? 'mt-worse' : ''}" ${bad ? `data-tip="${esc(`Peor que el total: ${fmt(w)}`)}"` : ''}>${v == null ? '' : fmt(v)}</td>`;
    const cells = (x, isTot) => {
      const { s, r } = x, T = tot.s, R = tot.r, on = s.ia > 0, res = r.resolved > 0;
      const bad = (v, w, b) => !isTot && s.ia >= MIN_ISSUES && clearlyWorse(v, w, b);
      return `<td><div class="mt-sc-vol"><em>${pct(s.n / N, 1)}</em><span class="mt-sc-bar"><i style="width:${(s.n / N * 100).toFixed(1)}%"></i></span><b>${num(s.n)}</b></div></td>
        <td class="mt-num">${on ? num(s.ia) : '<span class="mt-mut">0</span>'}</td>${td(on ? s.share : null, (v) => pct(v, 1))}${td(on ? s.users : null, num)}
        <td class="mt-tbar">${iaBar(s)}</td>${td(on ? s.okShare : null, (v) => pct(v))}${td(on ? s.failShare : null, (v) => pct(v), bad(s.failShare, T.failShare, 'low'), T.failShare)}${td(on ? s.unrevShare : null, (v) => pct(v))}
        ${td(res ? r.resolved : null, num)}${td(res ? r.avg : null, dur, res && bad(r.avg, R.avg, 'low'), R.avg)}
        ${td(res ? r.d1 : null, (v) => pct(v), res && bad(r.d1, R.d1, 'high'), R.d1)}${td(on ? r.reop : null, P1, on && bad(r.reop, R.reop, 'low'), R.reop)}`;
    };
    const GROUPS = [['Volumen', [['Recibidas', 'Issues recibidas en el mes y su parte del total.']]],
      ['Con IA', [['Issues', 'Con alguna marca de IA.'], ['% recib.', 'De lo recibido en el mes.'], ['Personas', 'Personas con alguna issue con IA ese mes.']]],
      ['Cómo sale, de las de IA', [['Reparto', 'Revisadas OK, con fallo y sin revisar.'], ['<i class="mt-sw mt-ia0"></i>OK', 'Con revisión humana OK y sin fallo.'],
        ['<i class="mt-sw mt-ia1"></i>Con fallo', 'Con alguna marca de fallo o de revisión no OK.'], ['<i class="mt-sw mt-ia2"></i>Sin revisar', 'Con marca de IA, sin revisión ni fallo.']]],
      ['Lo resuelto con IA', [['Resueltas', ''], ['Media', 'De la apertura a la resolución.'], ['< 24 h', 'Resueltas en menos de 24 horas.'], ['Reabiertas', 'De las de IA, las que volvieron de Resuelta a abierta.']]]];
    const W = { Recibidas: 15, Reparto: 10, Media: 9 };
    const cols = GROUPS.map(([, c]) => c.map(([l], j) => `<col class="${j ? '' : 'mt-gsep'}" ${W[l] ? `style="width:${W[l]}%"` : ''}>`).join('')).join('');
    const body = monthBody(A, (l) => cells(part(l)), 'th');
    return `<div class="mt-tablewrap"><table class="mt-sc mt-iamonth"><colgroup><col style="width:10%">${cols}</colgroup>
      <thead><tr class="mt-cgrp"><th rowspan="2" class="mt-sc-title">Mes a mes</th>${GROUPS.map(([g, c]) => `<th colspan="${c.length}">${g}</th>`).join('')}</tr>
      <tr>${GROUPS.flatMap(([, c]) => c).map(([l, t]) => `<th class="${l === 'Reparto' ? '' : 'mt-num'}" ${t ? `data-tip="${esc(t)}"` : ''}>${l}</th>`).join('')}</tr></thead>
      <tbody>${body}<tr class="mt-sc-ref"><th class="mt-r">Total</th>${cells(tot, true)}</tr></tbody></table></div>`;
  };
  const iaView = (A, note = '') => {
    const s = iaStats(A), R = A.filter(solved);
    const extra = (st, l) => {
      const x = iaStats(l); st.iaS = x; st.iaN = x.ia; st.iaShare = x.share; st.iaOk = x.okShare; st.iaFail = x.failShare; st.iaUnrev = x.unrevShare;
      st.req = share(l, (i) => C.sv[i] === REQ); st.rep = share(l, (i) => C.rz[i] > 0);
    };
    // de cada resolución, además, el módulo en el que más se usa
    const rzExtra = (st, l) => { extra(st, l); const g = group('mo', l).filter((x) => x.k); st.top = g.length ? { label: m.DIMS.mo.label(g[0].k), share: g[0].n / (l.length || 1) } : null; };
    const mix = { iaMix: (r) => iaBar(r.iaS) };
    return grid(ask('ia'), note,
      iaHead(A, s),
      section('¿Cuánto la usamos?'),
      card('', iaMonthly(A), { span: 's12' }),
      section('¿Dónde?'),
      card('', scorecard('mo', [['Volumen', ['n']], ['Con IA', ['iaN', 'iaShare']], ['Cómo sale', ['iaOk', 'iaFail']], ['Resolución', ['avg', 'd1']]],
        { id: 'ia-mo', skip: noK, refLabel: 'Todos los módulos', title: 'Módulos', extra, sort: 'iaN' }), { span: 's12' }),
      card('', scorecard('tp', [['Volumen', ['n']], ['Con IA', ['iaN', 'iaShare']], ['Cómo sale', ['iaOk', 'iaFail']], ['Resolución', ['avg', 'd1']]],
        { id: 'ia-tp', refLabel: 'Todos los temas', title: 'Temas', extra, sort: 'iaN', top: 14 }), { span: 's12' }),
      section('¿Cómo sale?'),
      card('Según cómo sale', qualityPivot(R, [['Con IA', '', [0, 1, 2].map((k) => [m.DIMS.ia.label(k), (i) => iaOf(i) === k, `ia:${k}`])], ['Sin IA', '', [['Sin IA', (i) => iaOf(i) === IA_NONE, `ia:${IA_NONE}`]]]],
        [['Volumen', [['Resueltas', (x) => x.resolved, num, null, '']]], ['Resolución', [['Media', (x) => (x.resolved ? x.avg : null), dur, 'low', 'De la apertura a la resolución.'], ['En < 24 h', (x) => (x.resolved ? x.d1 : null), (v) => pct(v), 'high', '']]],
          ['Después', [['Reabiertas', (x) => (x.n ? x.reop : null), P1, 'low', 'Volvieron de Resuelta a abierta.'], ['Escaladas', (x) => (x.n ? x.vend : null), (v) => pct(v), null, 'Con ticket de tercero.']]]]),
        { span: 's12', sub: `Lo resuelto, según sus marcas de IA. ${WORSE_NOTE} Clic en una fila para filtrar.` }),
      section('¿Quién la usa?'),
      card('', scorecard('as', [['Volumen', ['n']], ['Con IA', ['iaN', 'iaShare']], ['Cómo sale', ['iaMix', 'iaOk', 'iaFail', 'iaUnrev']], ['Resolución', ['avg', 'd1']]],
        { id: 'ia-as', skip: noK, refLabel: 'Todas las personas', title: 'Personas', extra, sort: 'iaN', top: 15, cell: mix }), { span: 's12' }),
      section('¿Qué se repite?'),
      card('', scorecard('tp', [['Volumen', ['n']], ['Qué es', ['req']], ['Repetición', ['rep']], ['Con IA', ['iaN', 'iaShare']], ['Resolución', ['avg', 'd1', 'vend']]],
        { id: 'ia-rep', refLabel: 'Todos los temas', title: 'Temas', extra, top: 14, child: { dim: 'de', top: 8, noun: 'problemas' } }), { span: 's12' }),
      card('', scorecard('rz', [['Volumen', ['n']], ['Dónde', ['top']], ['Con IA', ['iaN', 'iaShare']], ['Resolución', ['avg', 'd1']]],
        { id: 'ia-rz', skip: noK, refLabel: 'Todas las resoluciones repetidas', title: 'Resoluciones', extra: rzExtra, top: 15,
          rows: m.rows('rz').filter((i) => C.rz[i] > 0),
          n: ['Veces', 'Issues cerradas con este texto (idéntico salvo números, usado 4 veces o más) y su parte de todas las repetidas.'], heads: { top: ['Módulo principal', 'El módulo con más issues cerradas con este texto y su parte.'] } }), { span: 's12' }));
  };

  // --- IA, comparando. Entre empresas, cuánto usa la IA cada servicio, en qué trabajo, cómo le sale y cuánta gente la
  // usa; entre personas (una frente a su equipo, ella incluida, o frente a otra), lo mismo de cada una, módulo a módulo
  // en lo suyo y lo que tarda. Más uso, más revisadas OK y menos fallos, en verde; lo que no tiene un mejor, sin color.
  // Entre empresas no se comparan tiempos (como en Resolución: cada una recibe trabajo distinto).
  // las cifras de IA de cada lado de una lista, con el volumen por persona (comparando con personas, la empresa entre su equipo)
  const iaPair = (lists) => {
    const H = heads();
    return [0, 1].map((k) => {
      const s = iaStats(lists[k]), r = stats(lists[k].filter(withIa));
      return { ...s, r, H: H[k], vol: s.n / H[k], iaVol: s.ia / H[k], avg: r.resolved ? r.avg : null, reop: s.ia ? r.reop : null };
    });
  };
  const IA_N = (x) => x.n, IA_K = (x) => x.ia, perVol = (v, x) => (x.H > 1 ? dec(v) : num(v));
  const IA_PAIR = {
    vol: ['Recibidas', (x) => x.vol, perVol, null, 'Issues recibidas.'],
    ia: ['Con IA', (x) => x.iaVol, perVol, null, 'Issues con alguna marca de IA.'],
    share: ['% con IA', (x) => (x.n ? x.share : null), (v) => pct(v, 1), 'high', 'De lo recibido, lo que tiene alguna marca de IA.', IA_N],
    ok: ['Revisadas OK', (x) => x.okShare, (v) => pct(v), 'high', 'De las de IA, con revisión humana OK y sin fallo.', IA_K],
    fail: ['Con fallo', (x) => x.failShare, (v) => pct(v), 'low', 'De las de IA, con alguna marca de fallo o de revisión no OK.', IA_K],
    unrev: ['Sin revisar', (x) => x.unrevShare, (v) => pct(v), null, 'De las de IA, sin revisión ni fallo.', IA_K],
    avg: ['Media con IA', (x) => x.avg, dur, 'low', 'De las resueltas con IA, de la apertura a la resolución.', (x) => x.r.resolved],
    part: ['% de su IA', (x) => x.part, (v) => pct(v), null, 'De todas las issues con IA de cada uno, las de esta fila.'],
  };
  const IA_GROUPS = [['Volumen', 1], ['Uso de IA', 3], ['Cómo sale, de las de IA', 2]];
  const iaRows = (A, defs, total = 'Total') => sideRows(A, defs, iaPair, total);
  // En qué trabajo la usamos: una tabla con un bloque por corte (prioridad, tipo de servicio, escalado), como Qué recibe
  // cada uno, y el total al final. Sin turnos, día de entrada ni tarjetas: cada empresa los organiza a su manera y no se
  // comparan. part: de todas las de IA de cada lado, las de la fila.
  const iaWorkRows = (A) => {
    const T = bySide(A), all = iaPair(T);
    const sv = group('sv', A).filter((x) => x.k != null && DI.svc[x.k]).slice(0, 4).map((x) => [m.DIMS.sv.label(x.k), (i) => C.sv[i] === x.k, `sv:${x.k}`]);
    const row = ([label, t, f]) => {
      const x = iaPair(T.map((l) => l.filter(t))); x.forEach((y, k) => { y.part = all[k].ia ? y.ia / all[k].ia : null; });
      return { label, x, cls: `mt-clk ${selRow(f) ? 'mt-sel' : ''}`, attrs: `data-f="${f}"` };
    };
    const blocks = [['Prioridad', prioRows()],
      ['Tipo de servicio', sv, 'Los cuatro con más issues.'],
      ['Escalado', [['Sin escalar', (i) => !escd(i), 'es:0'], ['Escaladas', escd, 'es:1']], 'Con ticket de tercero.']]
      .map(([head, defs, note]) => ({ head, note, rows: defs.filter(([, t]) => A.some(t)).map(row) })).filter((b) => b.rows.length);
    all.forEach((y) => { y.part = y.ia ? 1 : null; });
    return [...blocks, { label: 'Todo', x: all, cls: 'mt-tot' }];
  };
  // personas de cada lado según qué parte de sus issues lleva IA (ia.js, iaUse; solo entre empresas)
  const iaUseTable = (A) => {
    const U = bySide(A).slice(0, 2).map((l) => iaUse(group('as', l.filter((i) => C.as[i]), true).filter((x) => x.k).map((x) => iaStats(x.rows))));
    const tot = U.map((u) => ({ n: u[0].n, c: u[0].n, ia: u[0].all, all: u[0].all }));
    return pairTable('Parte de sus issues con IA', [['Personas', (x) => x.c, num, null, 'Personas con issues en el periodo.'],
      ['% de la gente', (x) => (x.n ? x.c / x.n : null), (v) => pct(v), null, 'De las personas con issues, las de este tramo.'],
      ['% de las de IA', (x) => (x.all ? x.ia / x.all : null), (v) => pct(v), null, 'De todas las issues con IA, las que llevan las personas de este tramo.']],
      [...U[0].map((u, j) => ({ label: u.label, x: [u, U[1][j]] })), { label: 'Todas', x: tot, cls: 'mt-tot' }], (x) => x.n);
  };
  const iaCmp = (A) => {
    const pp = m.perHead(), co = !pp, T = bySide(A), ST = iaPair(T), names = teamNames(), team = pp && S.sides.some((x) => !x.people);
    // el color, solo si los dos lados tienen al menos BETTER_MIN en lo que cuenta esa cifra
    const fig = (label, f, fmt, better, note, n = (s) => s.n) => kpiCo(label, ST.map((s) => ({ n: n(s), v: f(s) })), (x) => (x.v == null ? '—' : fmt(x.v)),
      { val: (x) => x.v, better: ST.every((s) => n(s) >= BETTER_MIN) ? better : null, note, names });
    const P = (v) => pct(v), users = (s) => (s.people ? s.users / s.people : null);
    const mods = T.map((l) => new Set(l.filter(withIa).map((i) => C.mo[i]).filter(Boolean)).size);
    const greenNote = `En verde, quien va mejor (con al menos ${BETTER_MIN} issues cada uno; en cómo sale, ${BETTER_MIN} con IA).`, perNote = team ? ' Lo de la empresa, por persona de su equipo.' : '';
    const months = monthRows();
    const D = IA_PAIR;
    // módulos (solo con personas): los 15 con más issues de la persona
    const lead = S.sides[0].people || !S.sides[1].people ? 0 : 1, mine = new Set(T[lead]);
    const modRows = () => group('mo', A, true).filter((x) => x.k).map((x) => ({ ...x, own: x.rows.filter((i) => mine.has(i)).length })).filter((x) => x.own)
      .sort((a, b) => b.own - a.own).slice(0, 15).map((x) => [m.DIMS.mo.label(x.k), (i) => C.mo[i] === x.k, `mo:${x.k}`]);
    const mr = pp ? modRows() : [];
    const kp = [
      fig('Con IA, de lo recibido', (s) => (s.n ? s.share : null), (v) => pct(v, 1), 'high', 'De lo recibido, lo que tiene alguna marca de IA.'),
      kpiCo(`Issues con IA${team ? ' por persona' : ''}`, volume(T.map((l) => l.filter(withIa))), team ? (x) => dec(x.v) : (x) => num(x.v), { val: (x) => x.v, note: `con alguna marca de IA${team ? headsNote() : ''}`, names }),
      fig('Revisadas OK', (s) => s.okShare, P, 'high', 'De las de IA, con revisión humana OK y sin fallo.', (s) => s.ia),
      fig('Con fallo', (s) => s.failShare, P, 'low', 'De las de IA, con alguna marca de fallo o de revisión no OK.', (s) => s.ia),
      fig('Sin revisar', (s) => s.unrevShare, P, null, 'De las de IA, sin revisión ni fallo.', (s) => s.ia),
      pp ? fig('Media con IA, en días', (s) => (s.avg == null ? null : s.avg / 1440), dec, 'low', 'De las resueltas con IA, de la apertura a la resolución.', (s) => s.r.resolved) : '',
      co ? fig('Personas que la usan', users, P, 'high', 'De las personas con issues en el periodo, las que tienen alguna con IA.', (s) => s.people) : '',
      co ? kpiCo('Módulos donde se usa', mods.map((v) => ({ n: 1, v })), (x) => num(x.v), { val: (x) => x.v, note: 'Módulos con alguna issue con IA.' }) : ''];
    return grid(ask('ia'),
      kpis(...kp.filter(Boolean)),
      section('¿Cuánto la usamos?'),
      card('Mes a mes', pairTable('Mes de apertura', [D.vol, D.ia, D.share, D.ok, D.fail, ...(pp ? [D.avg] : [])], iaRows(A, months), IA_N, [['Volumen', 1], ['Uso de IA', 2], ['Cómo sale, de las de IA', 2], ...(pp ? [['Resolución', 1]] : [])]),
        { span: 's12', sub: `${MONTH_NOTE} ${greenNote}${perNote} Clic en un mes para filtrar.` }),
      section('¿En qué trabajo la usamos?'),
      card('En qué trabajo', pairTable('Corte', [D.vol, D.ia, D.share, D.part, D.ok, D.fail], iaWorkRows(A), IA_N, IA_GROUPS),
        { span: 's12', sub: `«% de su IA»: de todas las issues con IA de cada uno, las de esta fila (cada bloque suma el 100 %). ${greenNote}${perNote} Clic en una fila para filtrar.` }),
      pp && mr.length ? card('Módulo a módulo', pairTable('Módulo', [D.vol, D.ia, D.share, D.ok, D.fail, D.avg], iaRows(A, mr, 'Todo'), IA_N, [['Volumen', 1], ['Uso de IA', 2], ['Cómo sale, de las de IA', 2], ['Resolución', 1]]),
        { span: 's12', sub: `Los 15 módulos con más issues de ${esc(name(lead))}; cada uno, frente al otro en el mismo módulo. ${greenNote}${perNote} Clic en un módulo para filtrar.` }) : '',
      pp ? section('¿Cómo sale?') : '',
      pp ? card('Según cómo sale', pairTable('Uso de IA', [['Resueltas', (x) => x.r.resolved / x.H, perVol, null, ''], ['Media', (x) => (x.r.resolved ? x.r.avg : null), dur, 'low', 'De la apertura a la resolución.'],
        ['En < 24 h', (x) => (x.r.resolved ? x.r.d1 : null), (v) => pct(v), 'high', ''], ['Reabiertas', (x) => (x.r.n ? x.r.reop : null), (v) => pct(v, 1), 'low', 'Volvieron de Resuelta a abierta.'],
        ['Escaladas', (x) => (x.r.n ? x.r.vend : null), (v) => pct(v), null, 'Con ticket de tercero.']],
        [...[0, 1, 2, 3].map((k) => { const t = (i) => iaOf(i) === k, P2 = T.slice(0, 2).map((l) => stats(l.filter(t).filter(solved))); return { label: m.DIMS.ia.label(k), x: P2.map((r, j) => ({ r, H: ST[j].H })), cls: 'mt-clk', attrs: `data-f="ia:${k}"` }; }),
          { label: 'Todas las resueltas', x: T.slice(0, 2).map((l, j) => ({ r: stats(l.filter(solved)), H: ST[j].H })), cls: 'mt-tot' }], (x) => x.r.resolved, [['Volumen', 1], ['Resolución', 2], ['Seguimiento', 2]]),
        { span: 's12', sub: `Lo resuelto de cada uno, según sus marcas de IA. ${greenNote}${perNote} Clic en una fila para filtrar.` }) : '',
      co ? section('¿Quién la usa?') : '',
      co ? card('Personas según su uso', iaUseTable(A), { span: 's12', sub: 'Las personas de cada empresa con issues en el periodo, según qué parte de las suyas lleva IA, y qué parte de todas las de IA llevan.' }) : '');
  };

  const VIEWS = {
    resumen(A) {
      const T = bySide(A), ST = T.map(stats), d = days() || 1, sv = (v) => (s) => s[v];
      const top = (dim, n) => group(dim, T[CO()[0]]).filter((x) => x.k).slice(0, n);
      const mods = top('mo', 3), ce = top('ce', 1);
      const inSet = (dim, ks) => (i) => ks.includes(C[dim][i]);
      const ia = shareOf(T, (i) => C.fl[i] & IA_MARKS), iaDone = ST.map((s) => ({ n: s.n, v: s.resolved ? s.ia / s.resolved : null }));
      const count = (b) => T.map((l) => ({ n: l.length, v: l.filter((i) => C.fl[i] & b).length }));
      const sharePct = (s) => opt(pct)(s.v);
      // último mes completo del periodo frente al anterior (las del mes anterior pueden quedar fuera del periodo)
      const vsPrev = monthVsPrevOf(m), closed = closedIn(m);
      return grid(ask('resumen'),
        `<div class="mt-answers">${[
          answer(['entrada', 'backlog'], [
            fig('Recibidas', ST, (s) => num(s.n), sv('n')),
            fig('Entran al día', ST.map((s) => ({ n: s.n, v: s.n / d })), (s) => dec(s.v), sv('v'), null, 'Recibidas entre los días naturales del periodo.'),
            fig('Cerramos al día', closed.map((l, k) => ({ n: l.length + ST[k].n, v: l.length / d })), (s) => dec(s.v), sv('v'), 'high', 'Todo lo cerrado en el periodo, entre sus días naturales.'),
            ...(vsPrev ? [fig(`${MONTHS[vsPrev[0]]} frente a ${MONTHS[vsPrev[0] - 1]}`, vsPrev[1], (s) => opt((v) => `${v > 0 ? '+' : ''}${pct(v)}`)(s.v), sv('v'), null, 'Variación de las recibidas en el último mes completo del periodo respecto al anterior.')] : []),
            fig('Pendientes', ST, (s) => num(s.open), sv('open'), 'low', 'Lo recibido en el periodo que sigue sin resolver.'),
            fig('Fuera de plazo', ST, (s) => num(s.waitKo), sv('waitKo'), 'low', 'Pendientes que nunca han pasado a En curso y ya superan el plazo de su prioridad.')], '¿Qué tenemos?'),
          answer('modulos', [
            ...mods.map((x) => fig(m.DIMS.mo.label(x.k), shareOf(T, (i) => C.mo[i] === x.k), sharePct, sv('v'), null, 'Su parte de lo recibido.')),
            ...(mods.length > 1 ? [fig(`Los ${mods.length} primeros módulos`, shareOf(T, inSet('mo', mods.map((x) => x.k))), sharePct, sv('v'))] : []),
            ...ce.map((x) => fig(`Centro con más: ${m.DIMS.ce.label(x.k)}`, shareOf(T, (i) => C.ce[i] === x.k), sharePct, sv('v')))]),
          answer('resolucion', [
            fig('Media de resolución', ST, (s) => dur(s.avg), sv('avg'), 'low'),
            fig('Resueltas en menos de 24 h', ST, (s) => pct(s.d1), sv('d1'), 'high'),
            fig('El 90 %, en menos de', ST, (s) => dur(s.p90), sv('p90'), 'low'),
            fig('Escaladas a terceros', ST, (s) => pct(s.vend), sv('vend'), null, 'Con ticket de tercero (desarrollo, proveedor…).')]),
          answer('sla', [
            fig('Empezadas dentro del SLA', ST, slaPct, sv('sla'), 'high', `Pasan a En curso dentro del plazo de su prioridad: ${slaText()}.`),
            fig('Primera actuación, de media', ST, (s) => dur(s.fr), sv('fr'), 'low'),
            fig('Reabiertas', ST, (s) => pct(s.reop, 1), sv('reop'), 'low'),
            fig('Cerradas sin explicar la solución', ST, (s) => pct(s.noRes, 1), sv('noRes'), 'low')]),
          answer('ia', [
            fig('Con alguna marca de IA', ia, (s) => pct(s.v, 1), sv('v'), 'high'),
            fig('De las resueltas, con IA', iaDone, (s) => opt((v) => pct(v, 1))(s.v), sv('v'), 'high'),
            fig('Revisión humana OK', count(4096), (s) => num(s.v), sv('v')),
            fig('IA fallida o revisión no OK', count(8192 | 64), (s) => num(s.v), sv('v'))]),
          answer('turnos', [
            ...SHIFTS.map((sn, k) => fig(`Entran de ${sn.toLowerCase()}`, shareOf(T, (i) => STYPE[i] % 3 === k), sharePct, sv('v'))),
            fig('En fin de semana', shareOf(T, (i) => STYPE[i] >= 3), sharePct, sv('v')),
            fig('Empezadas en el turno en que entran', ST, (s) => opt(pct)(s.inShift), sv('inShift'), 'high')]),
        ].join('')}</div>`,
        card('Evolución mes a mes', `${CMP() ? legend() : ''}<div class="mt-trio">
          <div><p class="mt-small"><b>Issues recibidas</b></p>${lines(A, (s) => s.n, num, { height: 170 })}</div>
          <div><p class="mt-small"><b>Empezadas dentro del SLA</b></p>${lines(A, (s) => s.sla, (v) => pct(v), { height: 170 })}</div>
          <div><p class="mt-small"><b>Media de resolución</b></p>${lines(A, (s) => s.avg, dur, { height: 170 })}</div></div>`, { span: 's12', sub: `${MONTH_NOTE} Un mes con menos de 10 issues no se pinta.` }));
    },

    hoy() {
      const { op, lm, idle, waits, late, prio, stale, people, one, crit: crit3, prioList, lateList: lateL, vendor, client, staleList: stale3, orphan, all, cols: PCOLS, who, tot } = todayLists(m);
      const T = bySide(op), now = m.SNAP, days = (min) => Math.floor(min / 1440);
      const count = (test) => T.map((l) => ({ n: l.length || 1, v: l.filter(test).length }));
      // una lista de issues: cada fila con su enlace a Remedy
      const list = (id, rowsIn, o = {}) => {
        const top = o.top || 10, all = ui.exp[id], shown = all ? rowsIn.slice(0, 500) : rowsIn.slice(0, top);
        const head = ['Issue', 'Abierta', 'Título', 'Prioridad', 'Tarjeta', 'Estado', ...(one ? [] : ['Responsable']), 'Antigüedad', ...(lm ? ['Sin cambios'] : []), 'Ticket de tercero'];
        const body = shown.map((i) => `<tr><td><a href="${REMEDY}${incId(C.id[i])}%22" target="_blank" rel="noopener">${incId(C.id[i])}</a></td><td>${dateOf(BASE, C.rep[i]).slice(0, 5)}</td>
          <td class="mt-subj" data-tip="${esc(C.su[i])}">${esc(C.su[i])}</td><td>${nice(DI.prio[C.pr[i]])}</td><td>${cardsOf(i).filter((k) => k < 3).map((k) => CARDS[k]).join(' · ')}</td>
          <td>${nice(DI.status[C.st[i]])}${C.rs[i] ? ` · <span class="mt-mut">${esc(title(DI.reason[C.rs[i]]))}</span>` : ''}</td>
          ${one ? '' : `<td><span class="mt-pill mt-p${SIDE[i]}">${esc(m.DIMS.as.label(C.as[i]))}</span></td>`}
          <td class="mt-num">${days(now - C.rep[i])} d</td>${lm ? `<td class="mt-num">${days(idle(i))} d</td>` : ''}<td>${C.vk[i] ? esc(DI.vkey[C.vk[i]]) : C.vt[i] ? esc(m.DIMS.vt.label(C.vt[i])) : ''}</td></tr>`).join('');
        return rowsIn.length ? `<div class="mt-tablewrap ${all ? 'mt-scroll' : ''}"><table class="mt-list"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>${more(id, rowsIn.length, top)}` : '<p class="mt-mut mt-small">Ninguna.</p>';
      };
      // quién tiene qué: lo abierto de cada persona
      const whoTable = `<div class="mt-tablewrap"><table><thead><tr><th>Persona</th>${PCOLS.map(([l]) => `<th class="mt-num">${l}</th>`).join('')}</tr></thead><tbody>${who.map((r) => `<tr class="mt-clk ${isSel('as', r.k) ? 'mt-sel' : ''}" data-f="as:${r.k}"><td>${CMP() ? `<i class="mt-sw mt-c${m.SIDE[op.find((i) => C.as[i] === r.k)]}"></i>` : ''}${esc(m.DIMS.as.label(r.k))}</td>${r.v.map((v) => `<td class="mt-num">${v || ''}</td>`).join('')}</tr>`).join('')}
        <tr class="mt-grp"><td>Total</td>${tot.map((v) => `<td class="mt-num">${num(v)}</td>`).join('')}</tr></tbody></table></div>`;
      const sub = (t) => `${t} Pasa el ratón por un título para leerlo entero.`;
      return grid(ask('hoy'),
        kpis(kpiCo('Abiertas', count(() => true), (s) => num(s.v), { val: (s) => s.v }),
          kpiCo('Críticas abiertas', count((i) => C.pr[i] === CRIT), (s) => num(s.v), { val: (s) => s.v }),
          kpiCo('PRIO abiertas', count(prio), (s) => num(s.v), { val: (s) => s.v }),
          kpiCo('Sin iniciar, fuera de plazo', count(late), (s) => num(s.v), { val: (s) => s.v, better: 'low' }),
          kpiCo('Esperando a un tercero', count((i) => waits(i) === 'v'), (s) => num(s.v), { val: (s) => s.v }),
          kpiCo('Esperando al cliente', count((i) => waits(i) === 'c'), (s) => num(s.v), { val: (s) => s.v }),
          lm ? kpiCo(`Sin cambios en ${IDLE_DAYS} días`, count(stale), (s) => num(s.v), { val: (s) => s.v, better: 'low' }) : '',
          people ? '' : kpi('Sin asignar', num(orphan.length), 'SGA, SISU o PRIO, sin nadie', 'mt-t2')),
        lm ? '' : '<p class="mt-note">Para ver lo que lleva días sin cambios, carga de nuevo el CSV: los datos guardados son de antes de que se leyera el último cambio de cada issue.</p>',
        card('Quién tiene qué', whoTable, { span: 's12', sub: 'Lo abierto de cada persona. Clic en una persona para ver todas las métricas solo de ella.' }),
        card(`Críticas de los últimos ${RECENT_CRIT_DAYS} días`, list('hoy-crit', crit3), { span: 's12', sub: sub(`Todas las críticas abiertas en los ${RECENT_CRIT_DAYS} últimos días, resueltas o no, de la más reciente a la más antigua.`) }),
        card('PRIO abiertas', list('hoy-prio', prioList), { span: 's12', sub: sub('Priorizadas por negocio, de la más antigua a la más reciente.') }),
        card('Sin iniciar y fuera de plazo', list('hoy-late', lateL), { span: 's12', sub: sub('Abiertas que nunca han pasado a En curso y ya superan el plazo de su prioridad.') }),
        ...(people ? [] : [card('Sin asignar', list('hoy-orphan', orphan), { span: 's12', sub: sub('En SGA, SISU o PRIO, sin responsable.') })]),
        card(`Sin cambios desde hace más de ${IDLE_DAYS} días`, lm ? list('hoy-stale', stale3) : '<p class="mt-mut mt-small">Carga de nuevo el CSV para verlo.</p>', { span: 's12', sub: sub(`Abiertas en las que nadie ha tocado nada en ${IDLE_DAYS} días, de la más parada a la menos.`) }),
        card('Esperando a un tercero', list('hoy-vendor', vendor), { span: 's12', sub: sub('Pendientes de una acción de un tercero (desarrollo, proveedor…), con su ticket.') }),
        card('Esperando al cliente', list('hoy-client', client), { span: 's12', sub: sub('Pendientes de una acción o de una respuesta del centro o del cliente.') }),
        card('Todo lo abierto', list('hoy-all', all, { top: 15 }), { span: 's12', sub: sub('La sábana del backlog: todo lo abierto, de lo más antiguo a lo más reciente.') }));
    },

    // ¿Qué tenemos? Lo que entra, cómo se va cerrando y lo que queda pendiente, con tablas que cuadran:
    // cada una con su total, y los totales iguales a las cifras de arriba.
    entrada(A) {
      const T = bySide(A), ST = T.map(stats), d = days() || 1, sharePct = (s) => opt(pct)(s.v);
      const closed = closedIn(m), each = m.perHead() ? ' por persona' : '';
      // lo que entra, mes a mes, por prioridad, tipo de servicio, tarjeta y tipo de operación; comparando, sin tarjeta
      // (cada empresa las usa a su manera: no se comparan)
      const months = asRows(monthRows());
      const inRows = [
        { head: 'Prioridad' }, ...asRows(prioRows()),
        { head: 'Tipo de servicio' }, ...topRows('sv', A, 4),
        ...(CMP() ? [] : [{ head: 'Tarjeta', note: 'Una PRIO cuenta también en su SGA o SISU.' }, ...CARDS.map((c, k) => ({ label: c, test: (i) => cardsOf(i).includes(k), f: `tj:${k}` }))]),
        { head: 'Tipo de operación' }, ...topRows('op', A, 7),
      ];
      return grid(ask('entrada'),
        kpis(kpiCo(`Recibidas${each}`, volume(T), (s) => num(Math.round(s.v)), { val: (s) => Math.round(s.v), note: `abiertas en el periodo${headsNote()}`, names: teamNames() }),
          kpiCo(`Entran al día${each}`, volume(T, d), (s) => dec(s.v), { val: (s) => s.v, note: `de media, en días naturales${headsNote()}`, names: teamNames() }),
          kpiCo(`Cerramos al día${each}`, volume(closed, d), (s) => dec(s.v), { val: (s) => s.v, note: `de media, todo lo cerrado en el periodo${headsNote()}`, names: teamNames() }),
          ...PRIOS.map((p) => kpiCo(`% ${PLURAL[DI.prio[p]] || nice(DI.prio[p])}`, ST.map((s) => ({ n: s.n, v: s.n ? s.prio[p] / s.n : null })), sharePct, { val: (s) => s.v, note: `SLA de inicio: ${slaLabel(p).split(' · ')[1]}` })),
          kpiCo('% Peticiones', shareOf(T, (i) => C.sv[i] === REQ), sharePct, { val: (s) => s.v, note: 'de usuario' })),
        card(S.from === S.to ? 'Día a día: lo que entra, lo que se cierra y lo que queda' : 'Mes a mes: lo que entra, lo que se cierra y lo que queda', ledger(A),
          { span: 's12', sub: CMP() ? '' : `«Por cerrar»: de lo recibido cada mes, lo que sigue abierto hoy; su total son las pendientes de la pestaña Backlog. Pasa el ratón por una cabecera para ver qué cuenta.${S.from === S.to ? '' : ' Clic en un mes para filtrar; con un solo mes, día a día.'}` }),
        CMP() ? card('Qué recibe cada uno', mixCmp(inRows, A), { span: 's12' })
          : card('Qué entra cada mes', matrix(inRows, months, A, { total: true, share: true, foot: { label: 'Recibidas', test: () => true }, footTop: true, corner: 'Mes de apertura →' }),
            { span: 's12', sub: 'Recibidas de cada tipo cada mes; cada bloque suma las recibidas (salvo Tarjeta, donde una PRIO cuenta dos veces). * mes incompleto. Clic en una celda para filtrar.' }));
    },

    backlog(A) {
      if (CMP()) return backlogCmp(A);
      const T = bySide(A), ST = T.map(stats), inA = (i) => SIDE[i] < 2;
      const op = A.filter((i) => OPEN[i]), people = S.sides.some((s) => s?.people), orphans = people ? [] : orphansIn();
      // lo pendiente: su situación y, aparte, lo que hay que vigilar
      // solo las situaciones que hay (una sin ninguna issue no aporta y quita sitio)
      const SIT = SITUATION.filter((x) => op.some(x.test));
      const pend = { label: 'Pendientes', test: inA };
      const stateRows = [
        { head: 'Situación', note: 'Suman las pendientes.' },
        ...SIT.map((s) => ({ ...s, test: (i) => inA(i) && s.test(i) })),
        { head: 'A vigilar', note: 'Dentro de las pendientes.' },
        { label: 'Fuera de plazo', tip: 'Sin iniciar: nunca han pasado a En curso y ya superan su SLA.', test: (i) => inA(i) && late(i), f: 'sl:4' },
        { label: 'Escaladas', tip: 'Con ticket de tercero.', test: (i) => inA(i) && escd(i), f: 'es:1' },
        { label: 'PRIO', test: (i) => inA(i) && cardsOf(i).includes(2), f: 'tj:2' },
        { label: 'Críticas', test: (i) => inA(i) && C.pr[i] === CRIT, f: `pr:${CRIT}` },
        ...(orphans.length ? [{ head: 'Aparte', note: 'SGA, SISU o PRIO sin nadie asignado.' }, { label: 'Sin responsable', test: (i) => !C.as[i] }] : []),
      ];
      const prioCards = [{ head: 'Prioridad' }, ...asRows(prioRows()), { head: 'Tarjeta', note: 'Una PRIO cuenta también en su SGA o SISU.' }, ...asRows(CARD_ROWS())];
      const modRows = topRows('mo', op, 12), esc3 = op.filter(escd);
      const st = { total: true, foot: pend };

      return grid(ask('backlog'),
        stockPanel(T, ST),
        card('En qué situación está y desde cuándo', matrix(stateRows, AGES, [...op, ...orphans], { ...st, share: true, of: op.length, corner: 'Antigüedad →' }),
          { span: 's6', sub: 'Las situaciones suman las pendientes. Debajo, lo que conviene vigilar dentro de ellas, y aparte lo que no tiene responsable. Clic en una celda para filtrar.' }),
        card('Por prioridad y tarjeta', matrix(prioCards, SIT, op, { ...st, corner: 'Situación →' }), { span: 's6', sub: 'En qué situación está lo pendiente de cada prioridad y tarjeta.' }),
        card('Por módulo: en qué situación', matrix(modRows, SIT, op, { ...st, corner: 'Módulo · situación →' }), { span: 's6', sub: 'Los 12 módulos con más pendientes; «Resto», los demás. Clic en una celda para filtrar.' }),
        card('Por módulo: desde cuándo', matrix(modRows, AGES, op, { ...st, corner: 'Módulo · antigüedad →' }), { span: 's6', sub: 'Los mismos módulos, por lo que lleva abierto lo suyo.' }),
        card('Escaladas: a quién y desde cuándo', esc3.length ? matrix(topRows('vt', esc3, 10), AGES, esc3, { total: true, foot: { label: 'Escaladas', test: () => true }, corner: 'Destino · antigüedad →' }) : '<p class="mt-mut mt-small">Nada escalado.</p>',
          { span: 's6', sub: 'Lo pendiente con ticket de tercero, por destino del escalado (prefijo del ticket).' }),
        card('Por centro: desde cuándo', matrix(topRows('ce', op, 10), AGES, op, { ...st, corner: 'Centro · antigüedad →' }), { span: 's6', sub: 'Los 10 centros con más pendientes; «Resto», los demás.' }));
    },

    // Módulos y focos no compara empresas: cada una recibe trabajo distinto y no comparten backlog. Comparando
    // empresas, se ve solo la primera; con personas, qué toca cada uno (en qué se ha especializado frente al equipo).
    modulos(A) {
      if (CMP() && !m.perHead()) return m.alone((A1) => modulesView(A1, `<p class="mt-note">Esta pestaña no compara empresas: cada una recibe trabajo distinto. Se ve solo ${esc(name(0))}.</p>`));
      if (CMP()) {
        const rowsDef = [{ head: 'Módulo' }, ...topRows('mo', A, 12), { head: 'Centro' }, ...topRows('ce', A, 8), { head: 'Tema', note: 'El principal del título.' }, ...topRows('tp', A, 8)];
        return grid(ask('modulos'), card('Qué toca cada uno', mixCmp(rowsDef, A, 'Issues'),
          { span: 's12', sub: `En qué se ha especializado cada uno: sus issues de cada módulo, centro y tema y qué parte son de lo suyo${m.perHead() && S.sides.some((x) => !x.people) ? '; las de la empresa, la media por persona de su equipo' : ''}. Clic en una fila para filtrar.` }));
      }
      return modulesView(A);
    },
    sla(A) {
      if (CMP()) return slaCmp(A);
      return slaView(A);
    },

    resolucion(A) {
      if (CMP() && !m.perHead()) return m.alone((A1) => resolutionView(A1, `<p class="mt-note">Esta pestaña no compara empresas: cada una recibe trabajo distinto. Se ve solo ${esc(name(0))}.</p>`));
      if (CMP()) return resolutionCmp(A);
      return resolutionView(A);
    },

    ia(A) {
      if (CMP()) return iaCmp(A);
      return iaView(A);
    },

    turnos(A) {
      const T = bySide(A), ST = T.map(stats), cos = CO(), slots = m.periodSlots();
      // por tipo de turno (0–2 laborables, 3–5 fin de semana): sus indicadores y el trabajo hecho en él (turns.js)
      const per = [0, 1].map((k) => (cos.includes(k) ? perShiftType(m, T[k], slots) : null));
      const TCOLS = [
        ['Entran', (s) => num(s.n), (s) => s.n],
        ['Entran por turno', (s) => opt(dec)(s.perTurn), (s) => s.perTurn, null, 'Media de issues que entran en cada turno de este tipo del periodo.'],
        ['Empezadas dentro del SLA', slaPct, (s) => s.sla, 'high'],
        ['Empezadas en su turno', (s) => opt(pct)(s.inShift), (s) => s.inShift, 'high', 'De las que se empezaron, las que pasaron a En curso en el mismo turno en que entraron.'],
        ['Resueltas en su turno', (s) => opt(pct)(s.resInShift), (s) => s.resInShift, 'high', 'De las resueltas, las que se resolvieron en el mismo turno en que entraron.'],
        ['Media hasta En curso', (s) => dur(s.ip), (s) => s.ip, 'low'],
        ['Turnos con actividad', (s) => num(s.worked), (s) => s.worked, null, 'Turnos de este tipo en que se empezó o resolvió alguna issue.'],
        ['Resueltas por turno', (s) => opt(dec)(s.resTurn), (s) => s.resTurn, 'high', 'Issues resueltas en cada turno con actividad, de media.'],
        ['Personas activas', (s) => opt(dec)(s.people), (s) => s.people, null, `Personas que hacen al menos ${MIN_ACTIONS} acciones (empezar o resolver) en el turno, de media. Cuenta al responsable actual de cada issue.`],
        ['Acciones por persona', (s) => opt(dec)(s.perPerson), (s) => s.perPerson, null, 'Issues empezadas o resueltas por cada persona activa y turno, de media.'],
      ];
      // con una sola persona a un lado, cuántas personas hay activas no dice nada
      if (S.sides.some((x) => x?.people?.size === 1)) TCOLS.splice(TCOLS.findIndex((d) => d[0] === 'Personas activas'), 1);
      const rowsHtml = DAYS.map((dl, w) => `<tr class="mt-grp"><td colspan="${TCOLS.length + 1}">${dl}</td></tr>${SHIFTS.map((sn, k) => {
        const t = k + 3 * w, st = [per[0]?.[t], per[1]?.[t]].map((x) => x || { n: 0 });
        return `<tr class="mt-clk" data-f2="tu:${k}|we:${w}"><td>${sn} <span class="mt-mut">· ${SHIFT_HOURS[k]}</span></td>${TCOLS.map((d) => `<td class="mt-num">${cell(st, d)}</td>`).join('')}</tr>`;
      }).join('')}`).join('');
      // el día en 24 horas: entran, se empiezan y se resuelven, por hora
      const hours = (l, at) => byHour(m, l, at);
      const curves = cos.map((k) => `${CMP() ? `<p class="mt-small"><span class="mt-sw mt-c${k}"></span><b>${esc(name(k))}</b></p>` : ''}${day([
        { label: 'Entran', cls: 'mt-l-in', v: hours(T[k], (i) => C.rep[i]) },
        { label: 'Se empiezan', cls: `mt-l-st${k}`, v: hours(T[k], startAt) },
        { label: 'Se resuelven', cls: `mt-l-rs${k}`, v: hours(T[k], resAt) }])}`).join('');
      // qué se queda para el turno siguiente
      const carryRows = carryRowsOf(m, T, cos);
      return grid(ask('turnos'),
        kpis(...SHIFTS.map((sn, k) => kpiCo(`Entran de ${sn.toLowerCase()}`, shareOf(T, (i) => STYPE[i] % 3 === k), (s) => pct(s.v), { val: (s) => s.v, note: SHIFT_HOURS[k] })),
          kpiCo('Entran en fin de semana', shareOf(T, (i) => STYPE[i] >= 3), (s) => pct(s.v), { val: (s) => s.v }),
          kpiCo('Empezadas en su turno', ST, (s) => opt(pct)(s.inShift), { val: (s) => s.inShift, better: 'high', note: 'en el turno en que entran' }),
          kpiCo('Resueltas en su turno', ST, (s) => opt(pct)(s.resInShift), { val: (s) => s.resInShift, better: 'high', note: 'en el turno en que entran' })),
        card('Turno a turno', table('Turno', TCOLS.map((d) => [d[0], d[4]]), rowsHtml), { span: 's12', sub: 'Por el turno en que entra cada issue; el trabajo (resueltas, personas, acciones), por el turno en que se hace. Clic en una fila para filtrar. Pasa el ratón por una cabecera para ver cómo se calcula.' }),
        card('El día en 24 horas', curves, { span: 's12', sub: 'Issues que entran, que se empiezan (pasan a En curso) y que se resuelven en cada hora, en todo el periodo. Si la línea de las que entran va por encima, en esas horas se acumula trabajo.' }),
        card('¿Qué se queda para el turno siguiente?', split(['En su turno', 'En el siguiente', 'Más tarde', 'Sin pasar por En curso'], carryRows), { span: 's12', sub: 'De lo que entra en cada turno, cuándo se empieza. «Sin pasar por En curso»: abiertas sin empezar o cerradas sin ese paso.' }),
        card('Prioridad por turno', heat('pr', 'tu', 4, 3, { skipR: noK, orderR: PRIOS, orderC: [0, 1, 2] }), { sub: 'Issues que entran de cada prioridad en cada turno. Clic en una celda para filtrar.' }),
        card('Por día de la semana', slices('Día', DOWS.map((dw, k) => [dw, (i) => DOW[i] === k, `dow:${k}`]), A, ['n', 'sla', 'inShift', 'ip', 'avg'])),
        card('Cuándo llegan las issues', clockHeat(A, (i) => C.rep[i], true), { span: 's12', sub: 'Issues recibidas por día de la semana y hora. Cuanto más oscuro, más issues; las líneas marcan los cambios de turno. Clic en una celda para filtrar.' }),
        card('Cuándo se resuelven', clockHeat(A, resAt, false), { span: 's12', sub: 'Las mismas issues, por el día y la hora en que se resolvieron.' }));
    },
  };

  return { render: (tab, A) => VIEWS[tab](A) };
};
