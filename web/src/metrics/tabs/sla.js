// SLA y calidad (sla.js). Tres preguntas: si empezamos a tiempo, si el trabajo queda bien hecho y si queda
// bien registrado. Las tablas, como las de Resolución: una fila por corte con su total al final y, en ocre, lo
// que va claramente peor que el total (rules.js, con al menos MIN_ISSUES issues).
import { esc } from '../../ui/html.js';
import { num, dec, pct, dur, nice } from '../format.js';
import { MIN_ISSUES, BETTER_MIN, clearlyWorse } from '../rules.js';
import { personVsTeam, expectedSla } from '../peers.js';
import { startBlocks, slaStats as slaStatsOf, slaPair as slaPairOf, commonModules } from '../sla.js';
import { phasesOf, phasesChart, PHASES_NOTE } from '../phases.js';
import { WORSE_NOTE, MONTH_NOTE, opt, P1, optDur } from './common.js';

const QUALITY_COLS = [
  ['Trabajo', [['Reabiertas', (s) => (s.n ? s.reop : null), P1, 'low', 'Volvieron de Resuelta a abierta.', 0],
    ['Devueltas a cola', (s) => (s.n ? s.bounce : null), P1, 'low', 'Pasaron de En curso a Asignada.', 1]]],
  ['Registro', [['Cerradas sin En curso', (s) => s.noIpDone, P1, 'low', 'De las cerradas, las que nunca pasaron por En curso.', 2],
    ['Escaladas sin Pendiente', (s) => s.escNoPend, P1, 'low', 'De las cerradas con ticket de tercero, las que nunca pasaron a Pendiente.', 3],
    ['Sin tipología', (s) => (s.n ? s.noCat : null), P1, 'low', 'Sin categorización 3 de Remedy.', 4],
    ['Título sin descripción', (s) => (s.n ? s.noDesc : null), P1, 'low', 'El título no dice cuál es el problema.', 5],
    ['Sin texto de resolución', (s) => (s.done ? s.noRes : null), P1, 'low', 'De las cerradas, las que no explican la solución.', 6]]],
];
const PAIR_VOL = ['Issues', (s) => s.vol, (v, s) => (s.H > 1 ? dec(v) : num(v)), null, ''];
const qualityDefs = (co) => QUALITY_COLS.flatMap(([, d]) => d).filter((d) => !co || d[5] !== 5).map((d) => d.slice(0, 5));
const BY_N = (x) => x.n;

export const slaTab = (t) => {
  const { m, ch, name, grid, ask, section, noK, slaPct, heads, monthRows, prioRows, monthBody, sideRows, escd, table, CARD_ROWS, teamNames, pairTable, spreadHead, spreadRow, spreadWho, spreadCell, qualityPivot } = t;
  const { C, DI, S, PRIOS, slaLabel, CMP, stats, bySide } = m;
  const { card, kpi, kpis, kpiCo, scorecard } = ch;
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
  const SLA_COLS = [
    ['Volumen', [['Issues', (s) => s.n, num, null, '']]],
    ['Dentro del SLA', [...PRIOS.map((p) => [nice(DI.prio[p]), (s) => s.byP[p], (v) => pct(v), 'high', slaLabel(p)]), ['Todas', (s) => s.sla, (v) => pct(v), 'high', 'Todas las prioridades.']]],
    ['Fuera de SLA', [['Issues', (s) => s.slaKo, num, null, 'Empezadas tarde y abiertas que siguen sin empezar pasado el plazo.'], ['Media hasta En curso', (s) => s.ip, dur, 'low', 'Media de la apertura al primer paso a En curso.']]],
  ];
  const slaStats = slaStatsOf(m);
  // En qué se va el tiempo (phases.js), de lo que se mira: una fila por lado (comparando con personas, una empresa es
  // todo su equipo, como en el resto de la pestaña)
  const phases = phasesOf(m);
  const timesCard = (A) => {
    const rows = CMP() ? bySide(A).slice(0, 2).map((l, k) => ({ who: name(k), p: phases(l) })) : [{ who: name(m.CO()[0]), p: phases(A) }];
    return card('En qué se va el tiempo', phasesChart(rows, { jiraAt: m.data.meta.jira?.at }), { span: 's12', sub: PHASES_NOTE });
  };
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
  const slaView = (A, note = '') => {
    const s = stats(A);
    return grid(ask('sla'), note,
      kpis(kpi('Dentro del SLA', slaPct(s), 'todas las prioridades'), kpi('Fuera de SLA', num(s.slaKo), 'empezadas tarde o sin empezar pasado el plazo'),
        kpi('Media hasta En curso', dur(s.ip), 'de la apertura al primer paso'), kpi('Reabiertas', s.n ? P1(s.reop) : '—', 'volvieron de Resuelta a abierta'),
        kpi('Devueltas a cola', s.n ? P1(s.bounce) : '—', 'de En curso a Asignada'), kpi('Cerradas sin En curso', s.noIpDone == null ? '—' : P1(s.noIpDone), 'de las cerradas'),
        kpi('Escaladas sin Pendiente', s.escNoPend == null ? '—' : P1(s.escNoPend), 'de las cerradas escaladas'), kpi('Sin texto de resolución', s.done ? P1(s.noRes) : '—', 'de las cerradas')),
      section('¿En qué se va el tiempo?'), timesCard(A),
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
    const { p, t: tm } = pt, T = bySide(A), v = [], names = [];
    v[p] = { n: T[p].length, v: stats(T[p]).sla }; v[tm] = { n: T[tm].length, v: expectedSla(m, T[p], T[tm]) };
    names[p] = name(p); names[tm] = `${name(tm)}, con ese trabajo`;
    return kpiCo('Dentro del SLA, con el mismo trabajo', v, (s) => opt(pct)(s.v), { val: (s) => s.v, better: 'high', names,
      note: `Lo que cumpliría ${name(tm)} con el trabajo de ${name(p)}: su % dentro del SLA en cada prioridad y módulo, con el peso que tiene cada uno en lo de ${name(p)}.` });
  };
  // stats de cada lado de una lista, con las issues por persona (comparando con personas, una empresa entre su equipo)
  const slaPair = (lists) => slaPairOf(m, lists);
  const PAIR_SLA = [['Dentro del SLA (altas)', (s) => s.byP[PRIOS[1]] ?? null, (v) => pct(v), 'high', slaLabel(PRIOS[1]), (s) => s.nP[PRIOS[1]]],
    ['Dentro del SLA (todas)', (s) => s.sla, (v) => pct(v), 'high', 'Todas las prioridades.'],
    ['Media hasta En curso', (s) => s.ip, dur, 'low', 'Media de la apertura al primer paso a En curso.']];
  const pairRows = (A, defs, total = 'Todas') => sideRows(A, defs, slaPair, total);
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
        fig('Hasta En curso', (s) => s.ip, dur, 'low', 'Media de la apertura al primer paso a En curso.'),
        fig('Reabiertas', (s) => (s.n ? s.reop : null), (v) => pct(v), 'low', 'Volvieron de Resuelta a abierta.'),
        fig('Devueltas a cola', (s) => (s.n ? s.bounce : null), (v) => pct(v), 'low', 'Pasaron de En curso a Asignada.'),
        fig('Cerradas sin En curso', (s) => s.noIpDone, (v) => pct(v), 'low', 'De las cerradas, las que nunca pasaron por En curso.'),
        fig('Escaladas sin Pendiente', (s) => s.escNoPend, (v) => pct(v), 'low', 'De las cerradas con ticket de tercero, las que nunca pasaron a Pendiente.')];
    const common = () => commonModules(m, A, T, BETTER_MIN).map((x) => [m.DIMS.mo.label(x.k), (i) => C.mo[i] === x.k, `mo:${x.k}`]);
    return grid(ask('sla'),
      kpis(...kp.filter(Boolean)),
      section('¿En qué se va el tiempo?'), timesCard(A),
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

  return (A) => {
    if (CMP()) return slaCmp(A);
    return slaView(A);
  };
};
