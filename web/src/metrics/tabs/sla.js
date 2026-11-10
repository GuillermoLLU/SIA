// SLAs (sla.js). Dos vistas (ui.slaNow; metrics-view.js, data-sla-mode):
//   Actual     lo que sigue abierto, a fecha de la última carga y sea cual sea el periodo: si se empezó en plazo y,
//              lo que sigue sin empezar, cuánto le queda (o cuánto lleva fuera) de su plazo; abajo, su sábana
//   Histórico  lo recibido en el periodo (de partida). Tres preguntas: si empezamos a tiempo, si el trabajo queda bien
//              hecho y si queda bien registrado. Las tablas, como las de Resolución: una fila por corte con su total al
//              final y, en ocre, lo que va claramente peor que el total (rules.js, con al menos MIN_ISSUES issues).
import { esc } from '../../ui/html.js';
import { num, dec, pct, dur, nice } from '../format.js';
import { MIN_ISSUES, BETTER_MIN, clearlyWorse } from '../rules.js';
import { personVsTeam, expectedSla } from '../peers.js';
import { startBlocks, slaStats as slaStatsOf, slaPair as slaPairOf, commonModules } from '../sla.js';
import { WORSE_NOTE, MONTH_NOTE, opt, P1, optDur } from './common.js';
import { SHEET_COLS, sheetBody } from '../sheet.js';
import { afterDash } from './escalados.js';

const QUALITY_COLS = [
  ['Trabajo', [['Reabiertas', (s) => (s.n ? s.reop : null), P1, 'low', 'Volvieron de Resuelta a abierta.', 0],
    ['Devueltas a cola', (s) => (s.n ? s.bounce : null), P1, 'low', 'Pasaron de En curso a Asignada.', 1]]],
  ['Registro', [['Cerradas sin En curso', (s) => s.noIpDone, P1, 'low', 'De las cerradas, las que nunca pasaron por En curso.', 2],
    ['Escaladas sin Pendiente', (s) => s.escNoPend, P1, 'low', 'De las cerradas con ticket de tercero, las que nunca pasaron a Pendiente.', 3],
    ['Sin tipología', (s) => (s.n ? s.noCat : null), P1, 'low', 'Sin categorización 3 de Remedy.', 4],
    ['Título sin descripción', (s) => (s.n ? s.noDesc : null), P1, 'low', 'El título no dice cuál es el problema.', 5],
    ['Sin texto de resolución', (s) => (s.done ? s.noRes : null), P1, 'low', 'De las cerradas, las que no explican la solución.', 6]]],
];
const PAIR_VOL = ['Incidencias', (s) => s.vol, (v, s) => (s.H > 1 ? dec(v) : num(v)), null, ''];
const qualityDefs = (co) => QUALITY_COLS.flatMap(([, d]) => d).filter((d) => !co || d[5] !== 5).map((d) => d.slice(0, 5));
const BY_N = (x) => x.n;
// el nombre de cada prioridad en plural, para sus KPIs («% Críticas a tiempo»)
const PLURAL = { CRITICAL: 'Críticas', HIGH: 'Altas', MEDIUM: 'Medias', LOW: 'Bajas' };
// los KPIs se pinchan para filtrar sus incidencias (data-kf: uno o varios «dim:clave» con |; otra vez, lo quita;
// metrics-view.js). De una prioridad, esa prioridad; reabiertas y devueltas, q:0 y q:1. Dentro
// o fuera, con el interruptor de arriba, no se filtra: cambia el % de los KPIs (ui.slaOut)
const KF = { prio: (p) => `pr:${p}`, reop: 'q:0', bounce: 'q:1' };

export const slaTab = (t) => {
  const { m, ch, ui, name, grid, ask, section, noK, slaPct, heads, monthRows, prioRows, monthBody, sideRows, escd, table, CARD_ROWS, teamNames, pairTable, spreadHead, spreadRow, spreadWho, spreadCell, qualityPivot } = t;
  const { C, DI, S, PRIOS, slaLabel, CMP, CO, stats, bySide } = m;
  const { card, kpi, kpis, kpiCo, scorecard } = ch;
  const INI = m.DIMS.ini.label;
  // el interruptor Dentro ⇄ Fuera (ui.slaOut): los KPIs del SLA dan el % de dentro o el de fuera (el que falta para el
  // 100 %: empezadas tarde o sin empezar pasado el plazo), de las mismas incidencias; las tablas, igual
  const OUT = () => !!ui.slaOut;
  const io = (v) => (v == null ? null : OUT() ? 1 - v : v);
  const SLA_L = () => (OUT() ? 'Fuera de SLA' : 'Dentro del SLA');
  const prioL = (p) => `% ${PLURAL[DI.prio[p]] || nice(DI.prio[p])} ${OUT() ? 'fuera de plazo' : 'a tiempo'}`;
  const prioD = (p) => `${OUT() ? 'empezadas después de' : 'empezadas en'} ${slaLabel(p).split(' · ')[1]}${OUT() ? ' o sin empezar pasado el plazo' : ''}`;
  const kfOn = (f) => f.split('|').every((x) => { const [d, k] = x.split(':'); return m.isSel(d, +k); });
  const pick = (f) => ({ attr: `data-kf="${f}"`, on: kfOn(f) });
  // un KPI de un solo lado que se pincha (como kpiCo con o.pick)
  const kpiF = (l, v, d, f) => { const on = kfOn(f);
    return kpi(l, v, d, `mt-clk${on ? ' mt-on' : ''}`, `data-kf="${f}" role="button" tabindex="0" aria-pressed="${on}" data-tip="${on ? 'Clic para quitar el filtro.' : 'Clic para ver solo estas.'}"`); };
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
      <tr><th colspan="${cmp ? 2 : 1}">Prioridad y plazo</th><th class="mt-num">Incidencias</th><th class="mt-num" data-tip="Empezadas dentro del plazo, de las empezadas y de las que siguen sin empezar pasado el plazo. Las cerradas sin pasar por En curso no cuentan.">Dentro</th>
      <th class="mt-num" data-tip="Empezadas tarde y abiertas que siguen sin empezar pasado el plazo.">Fuera</th><th class="mt-num" data-tip="Media de la apertura al primer paso a En curso.">Media</th>
      ${GROUPS.map(([, ks]) => ks.map((k, j) => `<th class="${j ? '' : 'mt-gsep'}">${k === 7 ? 'Abiertas' : k === 8 ? 'Cerradas' : INI(k)}</th>`).join('')).join('')}</tr></thead>
      <tbody>${body}</tbody></table></div>`;
  };
  const SLA_COLS = [
    ['Volumen', [['Incidencias', (s) => s.n, num, null, '']]],
    ['Dentro del SLA', [...PRIOS.map((p) => [nice(DI.prio[p]), (s) => s.byP[p], (v) => pct(v), 'high', slaLabel(p)]), ['Todas', (s) => s.sla, (v) => pct(v), 'high', 'Todas las prioridades.']]],
    ['Fuera de SLA', [['Incidencias', (s) => s.slaKo, num, null, 'Empezadas tarde y abiertas que siguen sin empezar pasado el plazo.'], ['Media hasta En curso', (s) => s.ip, dur, 'low', 'Media de la apertura al primer paso a En curso.']]],
  ];
  const slaStats = slaStatsOf(m);
  // mes a mes: filas por mes de apertura, con las columnas que se le pasen ([grupo, defs] como en qualityPivot)
  const monthPivot = (A, groups, st = stats) => {
    const defs = groups.flatMap(([, d]) => d), firsts = new Set(groups.map(([, d]) => d[0])), tot = st(A);
    const cells = (s, isTot) => defs.map((d) => {
      const v = d[1](s), w = d[1](tot), bad = !isTot && s.n >= MIN_ISSUES && clearlyWorse(v, w, d[3]);
      return `<td class="mt-num ${firsts.has(d) ? 'mt-gsep' : ''} ${bad ? 'mt-worse' : ''}" ${bad ? `data-tip="${esc(`Peor que el total: ${d[2](w)}`)}"` : ''}>${v == null ? '—' : d[2](v)}</td>`;
    }).join('');
    const body = monthBody(A, (l) => cells(st(l)), 'td', true);   // sin los meses vacíos
    return `<div class="mt-res-month">${table('Mes de apertura', defs.map((d) => [d[0], d[4]]), `${body}<tr class="mt-tot"><td>Total</td>${cells(tot, true)}</tr>`, groups.map(([g, d]) => [g, d.length]))}</div>`;
  };
  const slaView = (A, note = '', rowsOf = m.rows) => {
    const s = stats(A), byP = slaStats(A);
    return grid(ask('sla'), note,
      kpis(kpi(SLA_L(), s.sla == null ? '—' : pct(io(s.sla)), OUT() ? `${num(s.slaKo)} incidencias, todas las prioridades` : 'todas las prioridades'),
        // de cada prioridad, las empezadas (paso a En curso) dentro de su plazo, o las de fuera
        ...PRIOS.map((p) => { const v = io(byP.byP[p]); return kpiF(prioL(p), v == null ? '—' : pct(v), prioD(p), KF.prio(p)); }),
        kpi('Media hasta En curso', dur(s.ip), 'de la apertura al primer paso'), kpiF('Reabiertas', s.n ? P1(s.reop) : '—', 'volvieron de Resuelta a abierta', KF.reop),
        kpiF('Devueltas a cola', s.n ? P1(s.bounce) : '—', s.n ? `${num(Math.round(s.bounce * s.n))} pasaron de En curso a Asignada` : 'pasaron de En curso a Asignada', KF.bounce)),
      section('¿Empezamos a tiempo?'),
      card('Cuándo pasan a En curso', startTable(rowsOf('ini')), { span: 's12', sub: 'Por prioridad: el SLA de inicio y cómo se reparte (cada fila suma el 100 %) lo que tarda en pasar a En curso; en verde, los tramos dentro del plazo de esa prioridad. Clic en una celda para filtrar.' }),
      card('Mes a mes', monthPivot(A, SLA_COLS, slaStats), { span: 's12', sub: `${MONTH_NOTE} ${WORSE_NOTE} Clic en un mes para filtrar.` }),
      card('Por turno y día de entrada', qualityPivot(A, [['Turno', 'Por la hora de apertura.', [0, 1, 2].map((k) => [m.DIMS.tu.label(k), (i) => m.DIMS.tu.get(i) === k, `tu:${k}`])],
        ['Días', '', [0, 1].map((k) => [m.DIMS.we.label(k), (i) => m.DIMS.we.get(i) === k, `we:${k}`])]],
        [['Volumen', [['Incidencias', (x) => x.n, num, null, '']]], ['Dentro del SLA', [...PRIOS.slice(0, 2).map((p) => [nice(DI.prio[p]), (x) => x.byP?.[p] ?? null, (v) => pct(v), 'high', slaLabel(p)]), ['Todas', (x) => x.sla, (v) => pct(v), 'high', 'Todas las prioridades.']]],
          ['Hasta En curso', [['Media', (x) => x.ip, dur, 'low', 'Media de la apertura al primer paso a En curso.'], ['En su turno', (x) => x.inShift, (v) => pct(v), 'high', 'De las empezadas, las que pasaron a En curso en el mismo turno en que entraron.']]]], '', slaStats),
        { span: 's12', sub: `Según cuándo se abrió. ${WORSE_NOTE} Clic en una fila para filtrar.` }),
      section('¿Queda bien hecho y bien registrado?'),
      card('Por prioridad y tarjeta', qualityPivot(A, [['Prioridad', '', prioRows()], ['Tarjeta', 'Una PRIO cuenta también en su SGA o SISU.', CARD_ROWS()],
        ['Escalado', '', [['Sin escalar', (i) => !escd(i), 'es:0'], ['Escaladas', escd, 'es:1']]]], QUALITY_COLS),
        { span: 's12', sub: `Trabajo: lo que vuelve atrás. Registro: lo que falta o no se movió en Remedy. ${WORSE_NOTE} Clic en una cifra para ver esas incidencias.` }),
      card('Mes a mes', monthPivot(A, QUALITY_COLS), { span: 's12', sub: `${MONTH_NOTE} ${WORSE_NOTE} Clic en un mes para filtrar.` }),
      section('¿Dónde?'),
      card('', scorecard('mo', [['Volumen', ['n']], ['Empezar a tiempo', ['sla', 'slaKo', 'ip']], ['Trabajo', ['reop', 'bounce']], ['Registro', ['noIpDone', 'escNoPend', 'noCat', 'noDesc']]],
        { id: 'sq-mo', rows: rowsOf('mo'), skip: noK, refLabel: 'Todos los módulos', title: 'Módulos' }), { span: 's12' }),
      card('', scorecard('ce', [['Volumen', ['n']], ['Empezar a tiempo', ['sla', 'slaKo', 'ip']], ['Trabajo', ['reop', 'bounce']], ['Registro', ['noIpDone', 'escNoPend', 'noCat', 'noDesc']]],
        { id: 'sq-ce', rows: rowsOf('ce'), skip: noK, refLabel: 'Todos los centros', title: 'Centros' }), { span: 's12' }),
      sheetCard(A));
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
    const { p, t: tm } = pt, T = bySide(A), v = [], names = [];
    v[p] = { n: T[p].length, v: io(stats(T[p]).sla) }; v[tm] = { n: T[tm].length, v: io(expectedSla(m, T[p], T[tm])) };
    names[p] = name(p); names[tm] = `${name(tm)}, con ese trabajo`;
    return kpiCo(`${SLA_L()}, con el mismo trabajo`, v, (s) => opt(pct)(s.v), { val: (s) => s.v, better: OUT() ? 'low' : 'high', names,
      note: `Lo que cumpliría ${name(tm)} con el trabajo de ${name(p)}: su % ${OUT() ? 'fuera' : 'dentro'} del SLA en cada prioridad y módulo, con el peso que tiene cada uno en lo de ${name(p)}.` });
  };
  // stats de cada lado de una lista, con las issues por persona (comparando con personas, una empresa entre su equipo)
  const slaPair = (lists) => slaPairOf(m, lists);
  const PAIR_SLA = [['Dentro del SLA (altas)', (s) => s.byP[PRIOS[1]] ?? null, (v) => pct(v), 'high', slaLabel(PRIOS[1]), (s) => s.nP[PRIOS[1]]],
    ['Dentro del SLA (todas)', (s) => s.sla, (v) => pct(v), 'high', 'Todas las prioridades.'],
    ['Media hasta En curso', (s) => s.ip, dur, 'low', 'Media de la apertura al primer paso a En curso.']];
  const pairRows = (A, defs, total = 'Todas') => sideRows(A, defs, slaPair, total);
  const slaCmp = (A, note = '', rowsOf = m.rows) => {
    const pp = m.perHead(), co = !pp, T = bySide(A), ST = T.map(slaStats), names = teamNames();
    const fig = (label, f, fmt, better, note, kf) => kpiCo(label, ST.map((s) => ({ n: s.n, v: f(s) })), (s) => (s.v == null ? '—' : fmt(s.v)), { val: (s) => s.v, better, note, ...(kf ? { pick: pick(kf) } : {}) });
    const team = pp && S.sides.some((x) => !x.people), perNote = team ? ' Las incidencias de la empresa, por persona de su equipo.' : '';
    const greenNote = `En verde, quien va mejor (con al menos ${BETTER_MIN} incidencias cada uno).`;
    const months = monthRows();
    // de cada prioridad, el % empezado a tiempo
    const byPrio = PRIOS.map((p) => fig(prioL(p), (s) => io(s.byP[p]), (v) => pct(v), OUT() ? 'low' : 'high', `${prioD(p).replace(/^./, (c) => c.toUpperCase())}.`, KF.prio(p)));
    const reop = fig('Reabiertas', (s) => (s.n ? s.reop : null), (v) => pct(v), 'low', 'Volvieron de Resuelta a abierta.', KF.reop);
    const bounce = fig('Devueltas a cola', (s) => (s.n ? s.bounce : null), P1, 'low', 'Pasaron de En curso a Asignada.', KF.bounce);
    const kp = co
      ? [...byPrio, sameWork(A), reop, bounce]
      : [fig(SLA_L(), (s) => io(s.sla), (v) => pct(v), OUT() ? 'low' : 'high', OUT() ? 'Empezadas tarde o sin empezar pasado el plazo, de todas las prioridades.' : 'Todas las prioridades.'), ...byPrio, sameWork(A),
        fig('Hasta En curso', (s) => s.ip, dur, 'low', 'Media de la apertura al primer paso a En curso.'), reop, bounce];
    const common = () => commonModules(m, A, T, BETTER_MIN).map((x) => [m.DIMS.mo.label(x.k), (i) => C.mo[i] === x.k, `mo:${x.k}`]);
    return grid(ask('sla'), note,
      kpis(...kp.filter(Boolean)),
      section('¿Empezamos a tiempo?'),
      card('Cuándo pasan a En curso', startTable(rowsOf('ini')), { span: 's12', sub: `Por prioridad, una fila por cada uno: el SLA de inicio y cómo se reparte (cada fila suma el 100 %) lo que tarda en pasar a En curso; en verde, los tramos dentro del plazo. ${greenNote}${perNote}${pp ? ' Cuenta a la persona responsable actual de la incidencia.' : ''} Clic en una celda para filtrar.` }),
      card('Mes a mes', pairTable('Mes de apertura', [PAIR_VOL, ...PAIR_SLA, ...(pp ? qualityDefs(false).filter((d) => ['Cerradas sin En curso', 'Escaladas sin Pendiente'].includes(d[0])) : [])], pairRows(A, months, 'Total'), BY_N),
        { span: 's12', sub: `${MONTH_NOTE} ${greenNote}${perNote} Clic en un mes para filtrar.` }),
      section('¿Queda bien hecho y bien registrado?'),
      card('Por prioridad', pairTable('Prioridad', qualityDefs(co), pairRows(A, prioRows()), BY_N),
        { span: 's12', sub: `Trabajo: reabiertas y devueltas a cola. Registro: lo que falta o no se movió en Remedy.${co ? ' Sin «Título sin descripción»: se detecta con el diccionario de problemas de Indra, hecho con sus títulos.' : ''} ${greenNote} Clic en una fila para filtrar.` }),
      co ? section('¿Dónde?') : '',
      co ? card('Módulo a módulo', pairTable('Módulo', [PAIR_VOL, ...PAIR_SLA, qualityDefs(true)[0], qualityDefs(true)[2]], pairRows(A, common()), BY_N),
        { span: 's12', sub: `Los 15 módulos con más incidencias de los que tienen al menos ${BETTER_MIN} cada uno. ${greenNote} Clic en un módulo para filtrar.` }) : '',
      sheetCard(A));
  };

  // --- La sábana de lo que corre más prisa, en las dos vistas (de lo de la vista: lo del periodo o lo abierto ahora): lo
  // fuera de SLA (empezado tarde o sin empezar pasado el plazo) y lo sin empezar aún en plazo, de lo que menos plazo le
  // queda (o más lleva fuera) a lo que más. Las empezadas tarde, al final.
  const { SNAP, OPEN, SLA } = m;
  const stateOf = (i) => {
    const lim = SLA[C.pr[i]];
    if (lim < 0) return 'none';
    if (C.ip[i] >= 0) return C.ip[i] <= lim ? 'ok' : 'late';
    return OPEN[i] ? (SNAP - C.rep[i] <= lim ? 'waiting' : 'over') : 'none';   // cerrada sin En curso: no cuenta
  };
  const left = (i) => (C.ip[i] >= 0 ? SLA[C.pr[i]] - C.ip[i] : C.rep[i] + SLA[C.pr[i]] - SNAP);   // negativo: fuera
  const shared = (label) => SHEET_COLS.find(([l]) => l === label);
  const SITUATION = { waiting: 'Sin empezar, en plazo', over: 'Sin empezar, fuera de plazo', late: 'Empezada tarde' };
  const sheetCard = (A) => {
    const list = bySide(A)[CO()[0]].filter((i) => SITUATION[stateOf(i)]).sort((a, b) => (stateOf(a) === 'late') - (stateOf(b) === 'late') || left(a) - left(b));
    const sign = (i) => { const v = left(i); return stateOf(i) === 'late' ? `empezó ${dur(-v)} tarde` : v >= 0 ? `quedan ${dur(v)}` : `fuera desde hace ${dur(-v)}`; };
    const cols = [shared('Incidencia'), ['Título', (mm, i) => afterDash(mm.C.su[i])], shared('Prioridad'), shared('Estado'), shared('Responsable'), shared('Centro'), shared('Módulo'),
      ['Plazo', (mm, i) => slaLabel(mm.C.pr[i]).split(' · ')[1]], ['Situación', (mm, i) => SITUATION[stateOf(i)]], ['Para el plazo', (mm, i) => sign(i), 'num', (mm, i) => left(i)], shared('Antigüedad')];
    ui.slaSheet = { list, cols };   // lo que exporta el botón (metrics-view.js)
    const whose = CMP() ? ` Comparando, de ${esc(name(CO()[0]))}.` : '';
    return card('Lo que más prisa corre', sheetBody(m, list, { ui, id: 'sla-sheet', expanded: ui.exp['sla-sheet'], more: ch.more, empty: 'Nada fuera de SLA ni sin empezar con estos filtros.', cols }),
      { span: 's12', sub: `Lo fuera de SLA y lo que sigue sin empezar: primero lo sin empezar, de lo que menos plazo le queda (o más lleva fuera de él) a lo que más; al final, lo empezado tarde.${whose} Exportar a CSV las descarga todas, con su enlace a Remedy.` });
  };

  // Actual: los mismos cuadros, con lo abierto ahora (se abriera cuando se abriera): el periodo, todo lo cargado, el
  // tiempo de pintarlos, y solo lo abierto; luego, el periodo de antes
  const openNow = (view, note) => {
    const { d0, d1 } = S;
    m.setPeriod(m.MIN_D, m.END_D); m.refilter();
    try {
      const rowsOf = (dim) => m.rows(dim).filter((i) => OPEN[i]);
      return view(rowsOf(), note, rowsOf);
    } finally { m.setPeriod(d0, d1); m.refilter(); }
  };

  const modes = (now) => `<div class="mt-evo-picks"><div class="mt-seg mt-seg-sm" role="group" aria-label="Qué SLAs">${[['now', 'Actual', 'Lo que sigue abierto, a fecha de la última carga: no depende del periodo.'], ['past', 'Histórico', 'Lo recibido en el periodo.']]
    .map(([k, l, tip]) => { const a = (k === 'now') === now; return `<button class="mt-seg-b ${a ? 'mt-on' : ''}" data-sla-mode="${k}" aria-pressed="${a}" data-tip="${esc(tip)}">${l}</button>`; }).join('')}</div>${sides()}</div>`;
  // y a su derecha, el interruptor Dentro ⇄ Fuera de los KPIs (no filtra): clic en un lado, ese; en la palanca, el otro
  // (metrics-view.js, data-sla-side)
  const sides = () => {
    const cur = OUT() ? 'out' : 'in', lab = (k, l) => `<span class="${cur === k ? 'mt-on' : ''}" data-sla-side="${k}">${l}</span>`;
    return `<div class="mt-slasw mt-${cur}" role="switch" aria-checked="${cur === 'out'}" aria-label="KPIs fuera de SLA" tabindex="0" data-tip="${esc('Los KPIs de SLA: el % empezado dentro de su plazo o el % fuera (empezadas tarde o sin empezar pasado el plazo). No filtra.')}">${lab('in', 'Dentro de SLA')}<i data-sla-side="${cur === 'out' ? 'in' : 'out'}"></i>${lab('out', 'Fuera de SLA')}</div>`;
  };
  return (A) => {
    const now = !!ui.slaNow, pick = modes(now), view = CMP() ? slaCmp : slaView;
    return now ? openNow(view, pick) : view(A, pick);
  };
};
