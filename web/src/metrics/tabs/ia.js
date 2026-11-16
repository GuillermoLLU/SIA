// IA: cuánto la usamos, dónde, cómo sale, quién la usa y qué se repite. Por las marcas de IA de cada issue
// (ia.js; en model.js, la dimensión ia). Comparando: entre empresas, cuánto usa la IA cada servicio, en qué
// trabajo, cómo le sale y cuánta gente la usa; entre personas (una frente a su equipo, ella incluida, o frente
// a otra), lo mismo de cada una, módulo a módulo en lo suyo y lo que tarda. Más uso, más revisadas OK y menos
// fallos, en verde; lo que no tiene un mejor, sin color. Entre empresas no se comparan tiempos (como en
// Resolución: cada una recibe trabajo distinto).
import { esc } from '../../ui/html.js';
import { num, dec, pct, dur } from '../format.js';
import { share } from '../model.js';
import { IA_NONE, iaStats as iaStatsOf, iaUse, iaMonths, iaTop } from '../ia.js';
import { MIN_ISSUES, BETTER_MIN, clearlyWorse } from '../rules.js';
import { monthsIn as monthsOf } from '../flow.js';
import { WORSE_NOTE, MONTH_NOTE, opt, P1 } from './common.js';

// el reparto de las de IA en una barra: revisadas OK, con fallo y sin revisar
const IA_SPLIT = [['Revisada OK', 'ok', 'mt-ia0'], ['Con fallo', 'fail', 'mt-ia1'], ['Sin revisar', 'unrev', 'mt-ia2']];
const iaBar = (s) => (s.ia ? `<div class="mt-hbar mt-iabar">${IA_SPLIT.map(([l, k, c]) => (s[k] ? `<i class="${c}" style="width:${(s[k] / s.ia * 100).toFixed(1)}%" data-tip="${esc(`${l}: ${num(s[k])} de ${num(s.ia)} (${pct(s[k] / s.ia, 1)})`)}"></i>` : '')).join('')}</div>` : '');
// Las cifras de arriba, una caja por pregunta: cuánto la usamos, cómo sale, quién la usa y dónde. Cada caja, su cifra
// grande y debajo el detalle.
const iaBox = (label, value, lines, extra = '') => `<div class="mt-iabox"><div class="mt-kpi-l">${label}</div><div class="mt-kpi-v">${value}</div>${extra}
  ${lines.map(([l, v, c]) => `<div class="mt-kpi-s">${c ? `<i class="${c}"></i>` : ''}<span>${l}</span><b>${v}</b></div>`).join('')}</div>`;
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

export const iaTab = (t) => {
  const { m, ch, name, grid, ask, section, noK, REQ, heads, selRow, monthRows, prioRows, monthBody, sideRows, escd, solved, volume, teamNames, headsNote, pairTable, qualityPivot } = t;
  const { C, DI, S, CMP, stats, group, bySide } = m;
  const { card, kpis, kpiCo, scorecard } = ch;
  const iaOf = (i) => m.DIMS.ia.get(i), withIa = (i) => iaOf(i) !== IA_NONE;
  const iaStats = (l) => iaStatsOf(l, C);
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
      ...last.map((x, j) => [`${j ? 'Mes anterior' : 'Último mes completo'} (${m.monthName(x.k)})`, opt((v) => pct(v, 1))(x.share)]),
      ['Primer mes con IA', first == null ? '—' : m.monthName(first)]]);
    const how = iaBox(`Cómo sale, de las ${num(s.ia)} con IA`, s.ia ? `${pct(s.okShare)} OK` : '—',
      [...IA_SPLIT.map(([l, k, c]) => [l, s.ia ? `${pct(s[`${k}Share`])} · ${num(s[k])}` : '—', c]), ['Resueltas por la IA (IA_SOLVED)', num(s.solved)]], iaBar(s));
    const mods = new Set(A.map((i) => C.mo[i]).filter(Boolean)).size;
    const who = iaRank('Personas que la usan', 'as', A, s.people, 'personas', 'del equipo');
    const where = iaRank('Módulos donde se usa', 'mo', A, mods, 'módulos', 'de los módulos',
      (x) => { const n = A.filter((i) => C.mo[i] === x.k).length; return `${pct(x.n / n, 1)} de las ${num(n)} issues del módulo`; });
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
      <tr>${GROUPS.flatMap(([, c]) => c).map(([l, x]) => `<th class="${l === 'Reparto' ? '' : 'mt-num'}" ${x ? `data-tip="${esc(x)}"` : ''}>${l}</th>`).join('')}</tr></thead>
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

  // las cifras de IA de cada lado de una lista, con el volumen por persona (comparando con personas, la empresa entre su equipo)
  const iaPair = (lists) => {
    const H = heads();
    return [0, 1].map((k) => {
      const s = iaStats(lists[k]), r = stats(lists[k].filter(withIa));
      return { ...s, r, H: H[k], vol: s.n / H[k], iaVol: s.ia / H[k], avg: r.resolved ? r.avg : null, reop: s.ia ? r.reop : null };
    });
  };
  const iaRows = (A, defs, total = 'Total') => sideRows(A, defs, iaPair, total);
  // En qué trabajo la usamos: una tabla con un bloque por corte (prioridad, tipo de servicio, escalado), como Qué recibe
  // cada uno, y el total al final. Sin turnos, día de entrada ni tarjetas: cada empresa los organiza a su manera y no se
  // comparan. part: de todas las de IA de cada lado, las de la fila.
  const iaWorkRows = (A) => {
    const T = bySide(A), all = iaPair(T);
    const sv = group('sv', A).filter((x) => x.k != null && DI.svc[x.k]).slice(0, 4).map((x) => [m.DIMS.sv.label(x.k), (i) => C.sv[i] === x.k, `sv:${x.k}`]);
    const row = ([label, x, f]) => {
      const y = iaPair(T.map((l) => l.filter(x))); y.forEach((z, k) => { z.part = all[k].ia ? z.ia / all[k].ia : null; });
      return { label, x: y, cls: `mt-clk ${selRow(f) ? 'mt-sel' : ''}`, attrs: `data-f="${f}"` };
    };
    const blocks = [['Prioridad', prioRows()],
      ['Tipo de servicio', sv, 'Los cuatro con más issues.'],
      ['Escalado', [['Sin escalar', (i) => !escd(i), 'es:0'], ['Escaladas', escd, 'es:1']], 'Con ticket de tercero.']]
      .map(([head, defs, note]) => ({ head, note, rows: defs.filter(([, x]) => A.some(x)).map(row) })).filter((b) => b.rows.length);
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
        [...[0, 1, 2, 3].map((k) => { const x = (i) => iaOf(i) === k, P2 = T.slice(0, 2).map((l) => stats(l.filter(x).filter(solved))); return { label: m.DIMS.ia.label(k), x: P2.map((r, j) => ({ r, H: ST[j].H })), cls: 'mt-clk', attrs: `data-f="ia:${k}"` }; }),
          { label: 'Todas las resueltas', x: T.slice(0, 2).map((l, j) => ({ r: stats(l.filter(solved)), H: ST[j].H })), cls: 'mt-tot' }], (x) => x.r.resolved, [['Volumen', 1], ['Resolución', 2], ['Seguimiento', 2]]),
        { span: 's12', sub: `Lo resuelto de cada uno, según sus marcas de IA. ${greenNote}${perNote} Clic en una fila para filtrar.` }) : '',
      co ? section('¿Quién la usa?') : '',
      co ? card('Personas según su uso', iaUseTable(A), { span: 's12', sub: 'Las personas de cada empresa con issues en el periodo, según qué parte de las suyas lleva IA, y qué parte de todas las de IA llevan.' }) : '');
  };

  return (A) => {
    if (CMP()) return iaCmp(A);
    return iaView(A);
  };
};
