// Lo que comparten las pestañas de las Métricas: las preguntas, las notas, los atajos al modelo y a las
// gráficas, y las piezas de HTML que usan varias (tablas por mes o por lado, filas marcadas, cortes fijos,
// reparto por tramos, tabla dinámica de calidad). createCommon las prepara una vez para un modelo (m), unas
// gráficas (ch) y el estado de la vista (ui); cada pestaña recibe ese conjunto y saca de él lo que necesita.
import { esc } from '../../ui/html.js';
import { num, dec, pct, dur, nice } from '../format.js';
import { COMPANIES, CARDS, ACTIVE_DAYS, share, slaText } from '../model.js';
import { SHIFTS, SHIFT_HOURS } from '../shifts.js';
import { pairTable as pairTableOf } from '../pair-table.js';
import { isPicked } from '../view.js';
import { MIN_ISSUES, WORSE, clearlyWorse, shade, HOT } from '../rules.js';
import { monthsIn as monthsOf, resolvedAt, startedAt } from '../flow.js';
import { late as lateOf, isOld, escalated as escalatedOf } from '../backlog.js';
import { blockHead, blocksOf } from '../pieces.js';
import { perHead as perHeadOf, solved as solvedOf } from '../resolution.js';

// el orden: primero las que se miran a diario (de Resumen a Histórico); el resto, de momento, en el de antes
export const TABS = [['resumen', 'Resumen'], ['hoy', 'Foto de hoy'], ['escalados', 'Escalados'], ['cliente', 'Pendiente de cliente'],
  ['entrada', 'Entrantes'], ['tiempos', 'Análisis tiempos'], ['calidad', 'Calidad'], ['ia', 'Uso de la IA'], ['historico', 'Histórico'],
  ['sla', 'SLAs'], ['modulos', 'Módulos y focos'], ['resolucion', 'Resolución'], ['turnos', 'Turnos']];
export const QUESTIONS = {
  resumen: ['¿Cómo vamos?', 'De un vistazo: en qué estado está lo abierto ahora y, de lo recibido en el periodo, el MTTR, el %IQA y el uso de la IA. El detalle, en cada pestaña.'],
  hoy: ['¿Cómo está hoy?', 'Cómo está el backlog ahora: en qué estado, desde cuándo, de qué y qué conviene vigilar. Lo recibido en el periodo y cómo ha ido el backlog día a día, en el Histórico.'],
  historico: ['¿Cómo ha ido en el periodo?', 'Lo recibido en las fechas elegidas: cada bloque responde a una pregunta con sus cifras clave (el detalle, en su pestaña), y cómo ha ido el backlog día a día.'],
  entrada: ['¿Qué nos entra?', 'Cuánto entra, cuánto se cierra y de qué tipo, mes a mes. Cada tabla lleva su total y los totales cuadran con las cifras de arriba.'],
  modulos: ['¿De dónde viene?', 'Los módulos, centros y problemas que concentran el trabajo, y lo que se repite.'],
  resolucion: ['¿Cómo lo resolvemos?', 'Cuánto tardamos, en qué se va el tiempo, y qué módulos tardan más. Tiempos de lo resuelto, en tiempo natural.'],
  cliente: ['¿Qué esperamos del cliente?', 'Lo que está ahora en Pendiente del centro o del cliente, a fecha de la última carga y sea cual sea el periodo: cuánto, desde cuándo, si lo estamos reclamando y por qué esperamos.'],
  tiempos: ['¿En qué se nos va el tiempo?', 'Lo que pasa de media cada fase, sin escalar y escalado, según el historial de cambios: en Actual, lo que llevan hasta hoy las que siguen abiertas; en Histórico, lo resuelto del periodo.'],
  calidad: ['¿Cómo de bien queda el trabajo?', 'La calidad del trabajo, empezando por el %IQA (la nota del agente de calidad, tarea #55). En construcción.'],
  escalados: ['¿Qué escalamos y a quién?', 'En Activas, lo escalado que sigue abierto (a fecha de la última carga, sea cual sea el periodo); en Histórico, lo escalado y resuelto del periodo. Cuánto tarda, a qué proyectos Jira se escala y los malos escalados: tickets que se descartan o pasan de un equipo a otro.'],
  sla: ['¿Empezamos a tiempo?', `En Actual, lo abierto ahora: qué se empezó en plazo y lo que sigue sin empezar, con lo que le queda. En Histórico, lo del periodo: si empezamos a tiempo (SLA de inicio: de la apertura al primer paso a En curso, en tiempo natural; ${slaText()}), si el trabajo queda bien hecho y si queda bien registrado.`],
  ia: ['¿Cuánto usamos la IA y cómo sale?', 'Por las marcas de IA de Remedy: en TAGS (IA_SOLVED…, IA_FAIL) y en las notas ([ACT IA], [INFORME IA], notas del agente de IA, [HITL_REVIEW_OK], [HITL_REVIEW_NOT_OK], [IA_FAIL]…). Una incidencia con IA puede estar revisada OK, con fallo o sin revisar.'],
  turnos: ['¿Cuándo entra y cuándo lo trabajamos?', `Por turnos: ${SHIFTS.map((s, k) => `${s.toLowerCase()} de ${SHIFT_HOURS[k]}`).join(', ')}. El turno se cuenta por la hora en que empieza: la noche del domingo es de fin de semana.`],
};

export const WORSE_NOTE = `En ocre, lo que va un ${Math.round(WORSE * 100)} % o más peor que el total (con al menos ${MIN_ISSUES} incidencias).`;
export const MONTH_NOTE = 'Por mes de apertura. * mes incompleto: los últimos meses salen mejor de lo que acabarán, porque lo lento aún no se ha resuelto.';
// la evolución día a día (periodos de un mes o menos)
export const DAY_NOTE = 'Por día de apertura. * día de la última carga, incompleto. Los últimos días salen mejor de lo que acabarán, porque lo lento aún no se ha resuelto. Un día con menos de 10 incidencias no se pinta.';
export const opt = (f) => (v) => (v == null ? '—' : f(v));
export const P1 = (v) => pct(v, 1);
export const optDur = (v) => (v == null ? '—' : dur(v));
export const avgOf = (s) => optDur(s.resolved ? s.avg : null);

export const createCommon = (m, ch, ui) => {
  const { C, DI, S, LASTM, PRIOS, MONTH, CMP, CO, NAMES, isSel, stats, group, bySide } = m;
  const name = (k) => NAMES()[k];
  const { diff } = ch;
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
  const monthRows = () => monthsIn().map((k) => [`${m.monthName(k)}${k === LASTM ? '*' : ''}`, (i) => MONTH[i] === k, `month:${k}`]);
  const prioRows = () => PRIOS.map((p) => [nice(DI.prio[p]), (i) => C.pr[i] === p, `pr:${p}`]);
  const asRows = (rows) => rows.map(([label, test, f]) => ({ label, test, f }));
  // una fila por mes con sus celdas (cells: de las issues del mes); el nombre del mes en `tag`
  // skipEmpty: sin los meses en que no hay ninguna de A
  const monthBody = (A, cells, tag = 'td', skipEmpty = false) => monthRows().filter(([, t]) => !skipEmpty || A.some(t)).map(([label, t, f]) => `<tr class="mt-clk ${selRow(f) ? 'mt-sel' : ''}" data-f="${f}"><${tag}${tag === 'th' ? ' class="mt-r"' : ''}>${label}</${tag}>${cells(A.filter(t))}</tr>`).join('');
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
    n: ['Incidencias', (s) => num(s.n), (s) => s.n], avg: ['Media resol.', (s) => dur(s.avg), (s) => s.avg, 'low'],
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
  const CARD_ROWS = () => CARDS.map((c, k) => [c, (i) => cardsOf(i).includes(k), `tj:${k}`]);
  const days = () => m.periodSlots().reduce((a, b) => a + b, 0) / 3;

  // filas de una dimensión: las n con más issues en `list` y, si hay más, «Resto» (así la tabla suma el total)
  const topRows = (dim, list, n) => {
    const { get, label } = m.DIMS[dim], g = group(dim, list), top = g.slice(0, n), keys = new Set(top.map((x) => x.k));
    const rows = top.map((x) => ({ label: label(x.k), test: (i) => get(i) === x.k, f: `${dim}:${x.k}` }));
    return g.length > n ? [...rows, { label: `Resto (${g.length - n})`, test: (i) => !keys.has(get(i)) }] : rows;
  };
  // El volumen de cada lado ({ n, v }, para kpiCo): su total o, comparando con alguna persona, la media por persona:
  // lo de cada lado (una empresa, todo su equipo: model.js, bySide y heads) entre sus personas. per: el divisor que se
  // le añade (los días, para «al día»). teamNames: el nombre de cada lado en esas cifras («Media de Indra»).
  const volume = (lists, per = 1) => lists.slice(0, 2).map((l, k) => {
    if (!m.perHead()) return { n: l.length, v: l.length / per };
    const H = m.heads(k).size;
    return { n: H, v: H ? l.length / H / per : null };
  });
  const teamNames = () => (m.perHead() ? [0, 1].map(sideLabel) : null);
  const headsNote = () => (m.perHead() ? ` · por persona: lo de cada lado entre sus personas; el equipo, quien ha tenido actividad en los ${ACTIVE_DAYS} días antes del final del periodo (${[0, 1].map((k) => `${teamNames()[k]}: ${m.heads(k).size}`).join(' · ')})` : '');

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
    return sideTable({ cols: '<th class="mt-num">Incidencias</th><th class="mt-num">%</th><th></th>', blocks: blocksOf(rowsDef), cells: (r) => cells(r.test, r.label), lead: { label: lead, cells: cells(null, lead) }, labelTip: true });
  };
  // La tabla de comparar de todas las pestañas (pair-table.js), con el nombre de cada lado. base: lo que cuenta para
  // marcar quién va mejor, si el dato no dice otra cosa (de serie, las resueltas).
  const pairTable = (first, defs, rows, base = (x) => x.resolved, groups = null) =>
    pairTableOf({ names: teamNames() || [name(0), name(1)], first, defs, rows, base, groups });

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

  // El selector de criticidad (Foto de hoy, Módulos y focos): un filtro de pr, una sola o todas (data-only, como el de
  // SISU o SGA: sale con los demás filtros y vale para todas las pestañas). Cada una, con cuántas hay en list, que debe
  // venir sin el propio filtro de prioridad, para que se vean todas aunque se esté mirando una.
  const prioPicker = (list) => {
    const opt1 = (label, k, n) => { const on = isPicked(m.S.f, 'pr', k);
      return `<button class="mt-seg-b ${on ? 'mt-on' : ''}" data-only="pr:${k ?? ''}" aria-pressed="${on}"${k == null ? '' : ' data-tip="Clic: solo esta. Ctrl+clic: sumarla o, si ya está, quitarla."'}>${esc(label)}${n == null ? '' : `<small>${num(n)}</small>`}</button>`; };
    return `<div class="mt-seg" role="group" aria-label="Prioridad">${opt1('Todas', null)}${m.PRIOS.map((p) => opt1(m.DIMS.pr.label(p), p, list.filter((i) => m.C.pr[i] === p).length)).join('')}</div>`;
  };

  return { m, ch, ui, name, noK, prioPicker, noTheme, REQ, slaPct, monthsIn, heads, sideLabel, selRow, monthRows, prioRows, asRows, monthBody, sideRows,
    late, old, escd, solved, resAt, startAt, shareOf, grid, ask, section, SLICE, cell, table, slices, cardsOf, CARD_ROWS, days, topRows,
    volume, teamNames, headsNote, sideTable, mixCmp, pairTable, spreadHead, spreadRow, spreadWho, spreadCell, qualityPivot };
};
