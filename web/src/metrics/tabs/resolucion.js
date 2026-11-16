// Resolución (resolution.js). Una pregunta por bloque: cuánto tardamos, en qué se va el tiempo y
// qué módulos tardan más (qué escalamos y a quién, en tabs/escalados.js). Los tiempos, de lo resuelto y en tiempo natural; el de
// cada estado, la media por resuelta (model.js, stats rt). Entre empresas no se compara (resolutionCmp es
// para personas).
import { esc } from '../../ui/html.js';
import { num, dec, pct, dur } from '../format.js';
import { COMPANIES, CARDS } from '../model.js';
import { BETTER_MIN } from '../rules.js';
import { blockHead } from '../pieces.js';
import { personVsTeam, expectedAvg } from '../peers.js';
import { ttrBlocks, bestOf, resolutionParts, partValue, partWorse, resolvedPair, modulesBySide } from '../resolution.js';
import { WORSE_NOTE, MONTH_NOTE, opt, optDur, avgOf } from './common.js';

const STATES = [['En cola', 'En Asignada: sin coger o de vuelta a la cola. Incluye lo que espera a otros sin pasar a Pendiente.'], ['En curso', 'En En curso.'],
  ['Espera cliente', 'En Pendiente del centro o del cliente.'], ['Espera tercero', 'En Pendiente de un tercero.'], ['Otro motivo', 'En Pendiente por otro motivo o sin motivo.']];
// Cuánto tardan: lo resuelto sin escalar, escalado y todo, cada fila repartida entre los tramos de tiempo (suma el
// 100 %), con más color cuanto mayor su parte. Los tramos, en tres bloques (menos de 24 h, de 24 a 168 h y más de 168 h),
// cada uno con su total. Clic en una celda filtra ese tramo (y si está escalada o no). Comparando, una fila por lado
// y, en verde, quien resuelve más en menos de 24 h y menos en más de 168 h (en los totales de esos bloques).
const TTR_GROUPS = [['Menos de 24 h', [0, 1, 2, 3], 'high'], ['De 24 a 168 h', [4, 5], null], ['Más de 168 h', [6, 7], 'low']];
// Mes a mes (por mes de apertura): lo resuelto de lo recibido ese mes y cuánto tardó, todo, sin escalar y escalado.
// En ocre, lo que va claramente peor que el total (rules.js, con al menos MIN_ISSUES resueltas).
// Cada dato: [nombre, parte (a todo, n sin escalar, e escalado), valor, formato, mejor, nota].
const RES_MONTH = [
  ['Volumen', [['Resueltas', 'a', (s) => s.resolved, num, null, 'De las recibidas ese mes, las ya resueltas.'],
    ['% escaladas', 'a', (s) => s.escShare, (v) => pct(v), null, 'De las resueltas, las que han estado en Pendiente de un tercero.']]],
  ['Media de resolución', [['Todas', 'a', (s) => s.avg, dur, 'low', 'De la apertura a la resolución.'], ['Sin escalar', 'n', (s) => s.avg, dur, 'low', ''], ['Escaladas', 'e', (s) => s.avg, dur, 'low', '']]],
  ['Resueltas en < 24 h', [['Sin escalar', 'n', (s) => s.d1, (v) => pct(v), 'high', ''], ['Escaladas', 'e', (s) => s.d1, (v) => pct(v), 'high', '']]],
  ['Más de 168 h', [['Sin escalar', 'n', (s) => s.w7, (v) => pct(v), 'low', ''], ['Escaladas', 'e', (s) => s.w7, (v) => pct(v), 'low', '']]],
];
// las medias de las fichas, en horas como todos los tiempos
const durOf = (s) => dur(s.v);
const RES_VOL = ['Resueltas', (s) => s.vol, (v, s) => (s.H > 1 ? dec(v) : num(v)), null, ''];
const RES_PAIR = [
  ['Media', (s) => (s.resolved ? s.avg : null), dur, 'low', 'De la apertura a la resolución.'],
  ['En < 24 h', (s) => (s.resolved ? s.d1 : null), (v) => pct(v), 'high', 'De las resueltas, las resueltas en menos de 24 horas.'],
];

export const resolucionTab = (t) => {
  const { m, ch, ui, name, grid, ask, section, noK, selRow, monthRows, prioRows, monthBody, escd, solved, table, cardsOf, volume, teamNames, headsNote, pairTable, spreadHead, spreadRow, spreadWho, spreadCell } = t;
  const { S, CMP, isSel, stats, bySide } = m;
  const { card, kpi, kpis, kpiCo, scorecard } = ch;
  const ttrTable = (list) => {
    const R = list.filter(solved), cmp = CMP(), P = cmp ? bySide(R).slice(0, 2) : [R];
    const { blocks, max } = ttrBlocks(m, list, P);
    const share = (x, v) => v / (x.n || 1), sum = (x, ks) => ks.reduce((a, k) => a + x.c[k], 0);
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
    const body = blocks.map(([head, note, rowsB]) => rowsB.filter(([, x]) => R.some(x)).map(([label, x, f], j, arr) => `<tr class="mt-clk ${j ? '' : 'mt-gfirst'} ${selRow(f) ? 'mt-sel' : ''}" data-f="${f}">
      ${j ? '' : blockHead(head, note, arr.length)}<th class="mt-r">${esc(label)}</th>${cells(R.filter(x))}</tr>`).join('')).join('');
    return `<div class="mt-legend">${STATES.map(([l, x], k) => `<span data-tip="${esc(x)}"><i class="mt-time${k}"></i>${l}</span>`).join('')}</div>
      <div class="mt-tablewrap"><table class="mt-mx mt-restime"><colgroup><col style="width:10%"><col style="width:12%"><col style="width:7%"><col style="width:8%">${'<col style="width:8%">'.repeat(5)}<col></colgroup>
      <thead><tr><th colspan="2"></th><th class="mt-num">Resueltas</th><th class="mt-num" data-tip="De la apertura a la resolución.">Media</th>${STATES.map(([l, x]) => `<th class="mt-num" data-tip="${esc(`${x} Media por resuelta.`)}">${l}</th>`).join('')}<th>Reparto del tiempo</th></tr></thead>
      <tbody>${body}<tr class="mt-lead mt-lead-end"><th class="mt-r" colspan="2">Todas las resueltas</th>${cells(R)}</tr></tbody></table></div>`;
  };
  // --- Resolución, comparando personas: una persona frente a su equipo (ella incluida: model.js heads) o frente a
  // otra. Lo que tarda depende mucho del módulo, así que la tabla principal compara módulo a módulo y la media se pone
  // también frente a lo que tarda el equipo en esos mismos módulos. Sin lo que habla del tercero o del tipo de
  // problema (en qué se va el tiempo por tarjeta, escalados), que no dice cómo trabaja cada uno.
  // lo resuelto de cada lado en una lista, con el volumen (comparando con personas, una empresa por persona)
  const resPair = (lists) => resolvedPair(m, lists);
  const resModulesCmp = (A) => {
    const R = A.filter(solved), T = bySide(R), lead = S.sides[0].people || !S.sides[1].people ? 0 : 1;
    const { top, rest: restL, all } = modulesBySide(m, R, T, lead);
    const split = (l) => { const set = new Set(l); return resPair(T.map((x) => x.filter((i) => set.has(i)))); };
    const rows = top.map((x) => ({ label: m.DIMS.mo.label(x.k), x: split(x.rows), cls: `mt-clk ${isSel('mo', x.k) ? 'mt-sel' : ''}`, attrs: `data-f="mo:${x.k}"` }));
    if (restL.length) rows.push({ label: `Resto (${all - 15})`, x: split(restL), cls: 'mt-mut' });
    rows.push({ label: 'Todas las resueltas', x: resPair(T), cls: 'mt-tot' });
    return pairTable('Módulo', [RES_VOL, ...RES_PAIR,
      ['24 a 168 h', (s) => (s.resolved ? s.d7 : null), (v) => pct(v), null, 'De las resueltas, las que tardaron de 24 a 168 h.'],
      ['168 a 360 h', (s) => (s.resolved ? s.d15 : null), (v) => pct(v), 'low', 'De las resueltas, las que tardaron de 168 a 360 h.'],
      ['Escaladas', (s) => (s.resolved ? s.vend : null), (v) => pct(v), null, 'De las resueltas, las que han estado en Pendiente de un tercero.']], rows);
  };
  const resMonthlyCmp = (A) => {
    const T = bySide(A.filter(solved));
    const rows = monthRows().map(([label, x, f]) => ({ label, x: resPair(T.map((l) => l.filter(x))), cls: `mt-clk ${selRow(f) ? 'mt-sel' : ''}`, attrs: `data-f="${f}"` }));
    rows.push({ label: 'Total', x: resPair(T), cls: 'mt-tot' });
    return pairTable('Mes de apertura', [RES_VOL, ...RES_PAIR,
      ['Más de 168 h', (s) => (s.resolved ? s.w7 : null), (v) => pct(v), 'low', 'De las resueltas, las que tardaron más de 168 h.'],
      ['Escaladas', (s) => (s.resolved ? s.vend : null), (v) => pct(v), null, 'De las resueltas, las que han estado en Pendiente de un tercero.']], rows);
  };
  // La media de una persona frente a lo que tardaría su equipo con sus mismos módulos: la media del equipo en cada
  // módulo, con el peso que ese módulo tiene en lo suyo. Solo persona frente a empresa.
  const sameModules = (A) => {
    const pt = personVsTeam(m);
    if (!pt) return null;
    const { p, t: tm } = pt, { own, expected, n } = expectedAvg(m, bySide(A.filter(solved)), pt);
    const out = [];
    out[p] = { n: n[0], v: own }; out[tm] = { n: n[1], v: expected };
    const names = [];
    names[p] = name(p); names[tm] = `${COMPANIES[S.sides[tm].company]}, en sus módulos`;
    return kpiCo('Media frente a sus módulos', out, durOf, { val: (s) => s.v, better: 'low', names,
      note: `Lo que tardaría ${COMPANIES[S.sides[tm].company]} con los mismos módulos que ${name(p)}: la media del equipo en cada módulo, con el peso que ese módulo tiene en lo suyo.` });
  };
  const resolutionCmp = (A) => {
    const T = bySide(A), R = T.map((l) => l.filter(solved)), ST = T.map(stats), team = S.sides.some((x) => !x.people), each = team ? ' por persona' : '';
    const part = (f) => ST.map((s) => ({ n: s.resolved, v: s.resolved ? f(s) : null }));
    const wait = ST.map((s) => { const x = s.rt.reduce((a, b) => a + b, 0); return { n: s.resolved, v: x ? s.rt[3] / x : null }; });
    const esc1 = R.map((l) => ({ n: l.length, v: l.length ? l.filter(escd).length / l.length : null }));
    const P = (s) => opt(pct)(s.v), names = teamNames();
    return grid(ask('resolucion'),
      kpis(kpiCo(`Resueltas${each}`, volume(R), team ? (s) => dec(s.v) : (s) => num(s.v), { val: (s) => s.v, note: `de lo recibido en el periodo${team ? headsNote() : ''}`, names }),
        kpiCo('Media de resolución', part((s) => s.avg), durOf, { val: (s) => s.v, better: 'low', note: 'De la apertura a la resolución.' }),
        sameModules(A) || '',
        kpiCo('En < 24 h', part((s) => s.d1), P, { val: (s) => s.v, better: 'high', note: 'De las resueltas.' }),
        kpiCo('De 24 a 168 h', part((s) => s.d7), P, { val: (s) => s.v, note: 'De las resueltas.' }),
        kpiCo('De 168 a 360 h', part((s) => s.d15), P, { val: (s) => s.v, better: 'low', note: 'De las resueltas.' }),
        kpiCo('Escaladas', esc1, P, { val: (s) => s.v, note: 'De las resueltas, en Pendiente de un tercero en algún momento.' }),
        kpiCo('Esperando a terceros', wait, P, { val: (s) => s.v, note: 'Del tiempo de vida de lo resuelto, en Pendiente de un tercero.' })),
      section('¿Cuánto tardamos?'),
      card('Cuánto tardan', ttrTable(m.rows('tb')), { span: 's12', sub: 'Lo resuelto de cada uno, sin escalar, escalado y todo, repartido según lo que tardó (cada fila suma el 100 %). En verde, quien resuelve más en menos de 24 h y menos en más de 168 h. Clic en una celda para filtrar.' }),
      card('Mes a mes', resMonthlyCmp(A), { span: 's12', sub: `${MONTH_NOTE} En verde, quien va mejor (con al menos ${BETTER_MIN} resueltas cada uno).${m.perHead() && S.sides.some((x) => !x.people) ? ' Las resueltas de la empresa, la media por persona de su equipo.' : ''} Clic en un mes para filtrar.` }),
      section('¿Qué módulos tardan más?'),
      card('Módulo a módulo', resModulesCmp(A), { span: 's12', sub: `Los 15 módulos con más resueltas de ${esc(name(S.sides[0].people || !S.sides[1].people ? 0 : 1))}; cada uno, frente al otro en el mismo módulo. En verde, quien va mejor (con al menos ${BETTER_MIN} resueltas cada uno). Clic en un módulo para filtrar.` }));
  };
  const resolutionView = (A, note = '') => {
    const s = stats(A), R = A.filter(solved), rtTot = s.rt.reduce((a, b) => a + b, 0) || 1, on = s.resolved > 0;
    return grid(ask('resolucion'), note,
      kpis(kpi('Resueltas', num(s.resolved), `de ${num(s.n)} recibidas`), kpi('Media de resolución', avgOf(s), 'de la apertura a la resolución'),
        kpi('En < 24 h', on ? pct(s.d1) : '—', 'de las resueltas'), kpi('De 24 a 168 h', on ? pct(s.d7) : '—', 'de las resueltas'),
        kpi('De 168 a 360 h', on ? pct(s.d15) : '—', 'de las resueltas'), kpi('La que más tardó', on ? dur(s.mx) : '—', 'la resuelta más lenta'), kpi('Escaladas', on ? pct(R.filter(escd).length / R.length) : '—', 'de las resueltas, en Pendiente de un tercero en algún momento'),
        kpi('Esperando a terceros', on ? pct(s.rt[3] / rtTot) : '—', 'del tiempo de vida de lo resuelto')),
      section('¿Cuánto tardamos?'),
      card('Cuánto tardan', ttrTable(m.rows('tb')), { span: 's12', sub: 'Lo resuelto sin escalar, escalado y todo, repartido según lo que tardó (cada fila suma el 100 %); cada bloque, con su total. Clic en una celda para filtrar.' }),
      card('Mes a mes', resMonthly(A), { span: 's12', sub: `${MONTH_NOTE} ${WORSE_NOTE.replace('incidencias', 'resueltas')} Clic en un mes para filtrar.` }),
      section('¿En qué se va el tiempo?'),
      card('Por prioridad, escalado y tarjeta', timeTable(A), { span: 's12', sub: 'Lo que pasa de media cada resuelta en cada estado, según el historial de cambios. Clic en una fila para filtrar.' }),
      section('¿Qué módulos tardan más?'),
      card('', scorecard('mo', [['Volumen', ['n']], ['Cuánto tarda', ['avg', 'd1', 'd7', 'd15', 'mx']], ['En qué se va', ['tq', 'tc', 'tv']], ['Escalado', ['vend']]],
        { id: 'rs-mo', rows: m.rows('mo').filter(solved), skip: noK, refLabel: 'Todos los módulos', title: 'Módulos', n: ['Resueltas', 'Incidencias resueltas y su parte del total.'] }), { span: 's12' }));
  };

  return (A) => {
    if (CMP() && !m.perHead()) return m.alone((A1) => resolutionView(A1, `<p class="mt-note">Esta pestaña no compara empresas: cada una recibe trabajo distinto. Se ve solo ${esc(name(0))}.</p>`));
    if (CMP()) return resolutionCmp(A);
    return resolutionView(A);
  };
};
