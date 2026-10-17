// Las pestañas de las Métricas. Siguen el orden en que se analiza el servicio y cada una responde
// a una pregunta (QUESTIONS): el Resumen las contesta todas de un vistazo y cada pestaña da el
// detalle. Reciben las issues que pasan los filtros (A) y devuelven su HTML. Se mira un lado (el
// equipo, una persona o varias); si se compara con otro, cada indicador es la diferencia de A
// respecto a B.
import { esc } from '../ui/html.js';
import { num, dec, pct, dur, nice, title, dateOf, MONTHS, DOWS } from './format.js';
import { COMPANIES, CARDS, MAJOR, IA_MARKS, SITUATIONS, ACTIVE_DAYS, START_LIMITS, share } from './model.js';
import { SHIFTS, SHIFT_HOURS, DAYS, MIN_ACTIONS } from './shifts.js';

export const TABS = [['resumen', 'Resumen'], ['hoy', 'Foto de hoy'], ['entrada', 'Entrada'], ['backlog', 'Backlog'], ['modulos', 'Módulos y focos'],
  ['resolucion', 'Resolución y escalados'], ['sla', 'SLA y calidad'], ['ia', 'IA'], ['ia2', 'IA (propuesta)'], ['turnos', 'Turnos']];
const QUESTIONS = {
  resumen: ['¿Cómo vamos?', 'Cada bloque responde a una pregunta con sus cifras clave; el detalle, en su pestaña.'],
  hoy: ['¿Qué hay que mover hoy?', 'Lo abierto ahora mismo, sea del mes que sea (no depende del periodo), en listas para actuar: lo urgente, lo que espera y lo que está parado.'],
  entrada: ['¿Qué nos entra?', 'Cuánto entra, cuánto se cierra y de qué tipo, mes a mes. Cada tabla lleva su total y los totales cuadran con las cifras de arriba.'],
  backlog: ['¿Qué tenemos pendiente?', 'Lo recibido en el periodo que sigue sin resolver: en qué punto está, desde cuándo y qué conviene vigilar.'],
  modulos: ['¿De dónde viene?', 'Los módulos, centros y problemas que concentran el trabajo, y lo que se repite.'],
  resolucion: ['¿Cómo lo resolvemos?', 'Cuánto tardamos, en qué se va el tiempo, qué módulos tardan más y qué escalamos y a quién. Tiempos de lo resuelto, en tiempo natural.'],
  sla: ['¿Cómo de bien lo hacemos?', 'Si empezamos a tiempo (SLA de inicio: de la apertura al primer paso a En curso, en tiempo natural; crítica 15 min, alta 45 min, media 2 h, baja 8 h), si el trabajo queda bien hecho y si queda bien registrado.'],
  ia: ['¿Cuánta IA usamos?', 'Dónde interviene ya la IA y el trabajo repetitivo en el que podría entrar.'],
  ia2: ['¿Cuánto usamos la IA y cómo sale?', 'Por las marcas de IA de Remedy: en TAGS (IA_SOLVED…, IA_FAIL) y en las notas ([ACT IA], [INFORME IA], notas del agente de IA, [HITL_REVIEW_OK], [HITL_REVIEW_NOT_OK], [IA_FAIL]…). Una issue con IA puede estar revisada OK, con fallo o sin revisar.'],
  turnos: ['¿Cuándo entra y cuándo lo trabajamos?', `Por turnos: ${SHIFTS.map((s, k) => `${s.toLowerCase()} de ${SHIFT_HOURS[k]}`).join(', ')}. El turno se cuenta por la hora en que empieza: la noche del domingo es de fin de semana.`],
};

const MONTH_NOTE = 'Por mes de apertura. * mes incompleto: los últimos meses salen mejor de lo que acabarán, porque lo lento aún no se ha resuelto.';
const REMEDY = 'https://itx.onbmc.com/arsys/servlet/ViewFormServlet?server=onbmc-s&form=HPD:Help+Desk&qual=%271000000161%27%3D%22';
const incId = (id) => `INC${String(id).padStart(12, '0')}`;
const opt = (f) => (v) => (v == null ? '—' : f(v));

export const createTabs = (m, ch, ui) => {
  const { C, DI, N, S, BASE, LASTM, PRIOS, slaLabel, MONTH, DOW, OPEN, SIDE, STYPE, CMP, CO, NAMES, isSel, stats, group, bySide, clock } = m;
  const name = (k) => NAMES()[k];
  const { card, legend, kpi, kpis, kpiCo, diff, bars, monthly, lines, ranking, heat, matrix, scorecard, day, split } = ch;
  const noK = (k) => k === 0;
  const noTheme = (k) => k === m.data.themes.length;
  const REQ = DI.svc.indexOf('USER_SERVICE_REQUEST');
  const slaPct = (s) => (s.sla == null ? '—' : pct(s.sla));
  const inPeriod = (i) => MONTH[i] >= S.from && MONTH[i] <= S.to;
  const monthsIn = () => Array.from({ length: S.to - S.from + 1 }, (_, j) => S.from + j);
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
  const table = (first, defs, rowsHtml, groups) => `<div class="mt-tablewrap"><table ${groups ? 'class="mt-fixed"' : ''}>${groups ? colgroup(groups) : ''}<thead>${groups ? `<tr class="mt-cgrp"><th></th>${groups.map(([l, n]) => `<th colspan="${n}">${l}</th>`).join('')}</tr>` : ''}<tr><th>${first}</th>${defs.map((d) => `<th class="mt-num" ${d[4] ? `data-tip="${esc(d[4])}"` : ''}>${d[0]}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
  const slices = (first, defs, A, cols) => table(first, cols.map((c) => SLICE[c]), defs.map(([label, test, f]) => {
    const st = bySide(A.filter(test)).map(stats);
    return `<tr ${f ? `class="mt-clk" data-f${f.includes('|') ? '2' : ''}="${f}"` : ''}><td>${label}</td>${cols.map((c) => `<td class="mt-num">${cell(st, SLICE[c])}</td>`).join('')}</tr>`;
  }).join(''));
  const cardsOf = (i) => m.DIMS.tj.get(i);
  // la ficha de los módulos: bloques de columnas (charts.js, scorecard)
  const MOD_GROUPS = [['Volumen', ['n', 'dl']], ['Cómo se atiende', ['sla', 'avg', 'd1', 'reop']], ['Qué trae', ['crit', 'vend']], ['Hoy', ['open']]];
  // y la de los centros: lo que más les falla (su módulo con más issues) y sus major incidents
  const CE_GROUPS = [['Volumen', ['n', 'dl']], ['Cómo se atiende', ['sla', 'avg']], ['Qué trae', ['top', 'crit', 'vend', 'mi']], ['Hoy', ['open']]];
  const centreExtra = (st, l) => {
    const g = group('mo', l).filter((x) => x.k);
    st.top = g.length ? { label: m.DIMS.mo.label(g[0].k), share: g[0].n / (l.length || 1) } : null;
    st.mi = l.filter((i) => C.fl[i] & MAJOR).length;
  };
  // y la de los problemas, por tema: cuánto se repiten, en cuántos centros y si se cierran siempre igual (esto, solo
  // de un problema: en un tema o en el total se mezclan problemas distintos)
  const PB_GROUPS = [['Volumen', ['n', 'dl', 'nce']], ['Cómo se resuelve', ['avg', 'd1', 'reop', 'vend', 'same']], ['Hoy', ['open']]];
  const problemExtra = (st, l) => {
    const ce = new Set(), rz = new Map();
    let done = 0;
    for (const i of l) { if (C.ce[i]) ce.add(C.ce[i]); if (!OPEN[i] && C.res[i] >= 0) { done++; if (C.rz[i]) rz.set(C.rz[i], (rz.get(C.rz[i]) || 0) + 1); } }
    st.nce = ce.size;
    st.same = done && l.every((i) => C.de[i] === C.de[l[0]]) ? Math.max(0, ...rz.values()) / done : null;
  };

  // Mapa de calor día de la semana × hora de un instante de cada issue (la apertura, la resolución…).
  const clockHeat = (list, at, clickable) => {
    const hh = Array.from({ length: 7 }, () => new Array(24).fill(0));
    for (const i of list) { const t = at(i); if (t != null) { const [d, h] = clock(t); hh[d][h]++; } }
    const mx = Math.max(1, ...hh.flat());
    return `<div class="mt-tablewrap"><table class="mt-hm mt-hours"><thead><tr><th></th>${hh[0].map((_, h) => `<th class="${h === 7 || h === 15 || h === 23 ? 'mt-shift' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${hh.map((r, d) => `<tr><th class="mt-r">${DOWS[d]}</th>${r.map((v, h) => {
      const a = v ? Math.round(6 + 94 * v / mx) : 0;
      return `<td class="${a > 50 ? 'mt-hot' : ''} ${h === 7 || h === 15 || h === 23 ? 'mt-shift' : ''}" style="--mt-a:${a}%" ${clickable ? `data-f2="dow:${d}|hour:${h}"` : ''} data-tip="${DOWS[d]} ${h}:00–${h}:59\n${num(v)} issues">${v || ''}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>`;
  };
  const startAt = (i) => (C.ip[i] >= 0 ? C.rep[i] + C.ip[i] : null);
  const resAt = (i) => (!OPEN[i] && C.res[i] >= 0 ? C.res[i] : null);

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
  // Último mes completo del periodo frente al anterior: [mes, { n, v } por lado] o null. Las del mes
  // anterior pueden quedar fuera del periodo.
  const monthVsPrev = () => {
    const lastFull = S.to === LASTM ? LASTM - 1 : S.to;
    if (lastFull < 1 || lastFull < S.from) return null;
    return [lastFull, bySide(m.today()).map((l) => {
      let a = 0, b = 0; for (const i of l) { if (MONTH[i] === lastFull) a++; else if (MONTH[i] === lastFull - 1) b++; }
      return { n: a + b, v: b ? (a - b) / b : null };
    })];
  };

  // --- Lo pendiente. Su situación (model.js, SITUATIONS): en curso, en Asignada sin tocar o devuelta, o en espera
  // (Pendiente) de un tercero, del cliente o por otro motivo; las seis suman todo lo abierto.
  const SIT_TIPS = ['Alguien está trabajando en ellas.', 'En Asignada y sin ningún movimiento desde que se abrieron: nadie las ha mirado.',
    'En Asignada, pero ya se trabajaron: pasaron por En curso o Pendiente, o tienen ticket de tercero. Están paradas en la cola.',
    'En Pendiente por una acción de un tercero (desarrollo, proveedor…).',
    'En Pendiente por una acción o respuesta del centro o del cliente.', 'En Pendiente con otro motivo o sin motivo informado.'];
  const SITUATION = SIT_TIPS.map((tip, k) => ({ label: SITUATIONS[k], test: (i) => m.DIMS.sit.get(i) === k, f: `sit:${k}`, tip }));
  // los dos tramos de antigüedad de más de 15 días, para filtrar con un clic
  const OLD15 = 'age:3|age:4';
  const AGES = [0, 1, 2, 3, 4].map((k) => ({ label: m.DIMS.age.label(k), test: (i) => m.DIMS.age.get(i) === k, f: `age:${k}` }));
  // filas de una dimensión: las n con más issues en `list` y, si hay más, «Resto» (así la tabla suma el total)
  const topRows = (dim, list, n) => {
    const { get, label } = m.DIMS[dim], g = group(dim, list), top = g.slice(0, n), keys = new Set(top.map((x) => x.k));
    const rows = top.map((x) => ({ label: label(x.k), test: (i) => get(i) === x.k, f: `${dim}:${x.k}` }));
    return g.length > n ? [...rows, { label: `Resto (${g.length - n})`, test: (i) => !keys.has(get(i)) }] : rows;
  };
  // lo que no tiene a nadie: abierto, de las tarjetas del equipo (SGA, SISU o PRIO) y del periodo, con los filtros
  const orphansIn = () => m.today(true).filter((i) => OPEN[i] && !C.as[i] && inPeriod(i) && cardsOf(i).some((k) => k < 3));
  // Lo pendiente, de un vistazo y en orden: el total; en qué punto está (en curso, sin tocar, devuelta y en espera de
  // un tercero, del cliente u otro motivo, que suman el total), en una barra; lo que conviene vigilar dentro
  // (se solapa: no se suma) y, aparte, lo de nuestras tarjetas que no tiene a nadie (no está en el total).
  // Solo con un lado: comparando, backlogCmp.
  const stockPanel = (T, ST) => {
    const k0 = CO()[0], people = S.sides.some((s) => s?.people), CRITICAL = DI.prio.indexOf('CRITICAL');
    const open = T[k0].filter((i) => OPEN[i]), count = (test) => open.filter(test).length;
    const sit = SITUATION.map((x, k) => ({ ...x, k, v: count(x.test) })).filter((x) => x.v);
    const share = (x) => (open.length ? x.v / open.length : 0);
    const bar = `<div class="mt-st-track">${sit.map((x) => {
      const p = share(x);
      return `<i class="mt-sit${x.k}" style="width:${(p * 100).toFixed(2)}%" data-f="${x.f}" data-tip="${esc(`${x.label}\n${num(x.v)} de ${num(open.length)} (${pct(p)})\n${x.tip}`)}">${p >= 0.07 ? pct(p) : ''}</i>`;
    }).join('')}</div>`;
    const watch = [
      ['Fuera de plazo', count(late), 'Nunca han pasado a En curso y ya superan el plazo de su prioridad.', 'sl:4'],
      ['Con más de 15 días', count((i) => m.SNAP - C.rep[i] > OLD), 'Llevan más de 15 días abiertas: si sube, el backlog envejece.', OLD15],
      ['Escaladas', count((i) => C.vt[i] > 0), 'Con ticket de tercero, estén en el estado que estén (por eso no coincide con «espera tercero»: algunas ya se están trabajando o han vuelto a la cola).', 'es:1'],
      ['Críticas', count((i) => C.pr[i] === CRITICAL), 'De prioridad crítica.', `pr:${CRITICAL}`],
      ['PRIO', count((i) => cardsOf(i).includes(2)), 'Priorizadas por negocio.', 'tj:2'],
    ];
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
  const late = (i) => { const l = m.SLA[C.pr[i]]; return OPEN[i] && C.ip[i] < 0 && l >= 0 && m.SNAP - C.rep[i] > l; };

  // Los tramos de la tabla mes a mes: los meses del periodo o, si es un solo mes, sus días (hasta la foto).
  const minOf = (y, mo, d = 1) => (Date.UTC(y, mo, d) - BASE) / 6e4;
  const flowUnits = () => {
    const y = m.data.meta.year;
    if (S.from !== S.to) return monthsIn().map((k) => ({ label: MONTHS[k] + (k === LASTM ? '*' : ''), from: minOf(y, k), to: minOf(y, k + 1), f: `month:${k}` }));
    const last = Math.min(new Date(Date.UTC(y, S.from + 1, 0)).getUTCDate(), S.from === LASTM ? new Date(BASE + m.SNAP * 6e4).getUTCDate() : 31);
    return Array.from({ length: last }, (_, j) => ({ label: `${j + 1} ${MONTHS[S.from]}`, from: minOf(y, S.from, j + 1), to: minOf(y, S.from, j + 2) }));
  };
  // lo cerrado dentro del periodo, por lado, se abriera cuando se abriera
  const closedInPeriod = () => {
    const y = m.data.meta.year, from = minOf(y, S.from), to = minOf(y, S.to + 1);
    return bySide(m.today()).map((l) => l.filter((i) => { const r = resAt(i); return r != null && r >= from && r < to; }));
  };
  // El volumen de cada lado ({ n, v }, para kpiCo): su total o, comparando con alguna persona, la media por persona:
  // lo de cada lado (una empresa, todo su equipo: model.js, bySide y heads) entre sus personas. per: el divisor que se
  // le añade (los días, para «al día»). teamNames: el nombre de cada lado en esas cifras («Media de Indra»).
  const volume = (lists, per = 1) => lists.slice(0, 2).map((l, k) => {
    if (!m.perHead()) return { n: l.length, v: l.length / per };
    const H = m.heads(k).size;
    return { n: H, v: H ? l.length / H / per : null };
  });
  const teamNames = () => (m.perHead() ? [0, 1].map((k) => (S.sides[k].people ? name(k) : `Media de ${COMPANIES[S.sides[k].company]}`)) : null);
  const headsNote = () => (m.perHead() ? ` · por persona: lo de cada lado entre sus personas; el equipo, quien ha tenido actividad en los ${ACTIVE_DAYS} días antes de la foto (${[0, 1].map((k) => `${teamNames()[k]}: ${m.heads(k).size}`).join(' · ')})` : '');

  // Mes a mes (o día a día con un solo mes): de lo recibido en cada tramo, cuánto se ha cerrado y cuánto
  // sigue abierto (por cerrar), y el movimiento del tramo: lo resuelto en él,
  // el saldo y lo que quedaba pendiente al cerrarlo. La fila Total cuadra con las cifras de arriba.
  // En dos bloques, de izquierda a derecha: lo recibido ese mes y qué ha sido de ello (cuánto se cerró
  // en el propio mes, cuánto hasta hoy y qué queda), y lo que pasó en el mes (lo resuelto, cuánto era de
  // meses anteriores, el saldo y la pila que quedó, con lo envejecido).
  const LEDGER_GROUPS = [['Lo recibido ese mes', 4], ['Lo que pasó en el mes', 5]];
  const LEDGER = [
    ['Recibidas', (s) => num(s.in), (s) => s.in, null, 'Issues abiertas en ese mes (o día).'],
    ['% cerrado en el mes', (s) => (s.in ? pct(s.same / s.in, 1) : '—'), (s) => (s.in ? s.same / s.in : null), 'high', 'De las recibidas en ese mes, las que se cerraron antes de acabar el mismo mes. Se puede comparar entre meses: cuanto más bajo, más se queda para después.'],
    ['% cerrado hasta hoy', (s) => (s.in ? pct(s.closed / s.in, 1) : '—'), (s) => (s.in ? s.closed / s.in : null), 'high', 'De las recibidas en ese mes, las que ya están resueltas, cerradas o canceladas hoy. En los meses pasados tiende al 100 %.'],
    ['Por cerrar', (s) => num(s.still), (s) => s.still, 'low', 'De las recibidas en ese mes, las que siguen sin resolver hoy. Su total es el backlog del periodo.'],
    ['Resueltas', (s) => num(s.out), (s) => s.out, 'high', 'Lo que se resolvió dentro de ese mes (o día), se abriera cuando se abriera dentro del periodo.'],
    ['De meses anteriores', (s) => num(s.prev), (s) => s.prev, null, 'De las resueltas en el mes, las que se abrieron en un mes anterior: el esfuerzo que se va en sacar backlog.'],
    ['Saldo', (s) => `${s.out - s.in > 0 ? '+' : ''}${num(s.out - s.in)}`, (s) => s.out - s.in, 'high', 'Resueltas menos recibidas en el mes: en positivo, la pila baja; en negativo, crece.'],
    ['Pendientes al cierre', (s) => num(s.open), (s) => s.open, 'low', 'De lo recibido desde el inicio del periodo, lo que seguía abierto al acabar el mes (o el día).'],
    ['Con más de 15 días', (s) => num(s.old), (s) => s.old, 'low', 'De las pendientes al cierre, las que ya llevaban más de 15 días abiertas: si sube, el backlog envejece.'],
  ];
  const OLD = 15 * 1440;
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
      ['% pendientes con más de 15 días', (s) => (s.open ? s.old / s.open : null), 'p', 'low', 'De lo pendiente al acabar el mes, lo que ya llevaba más de 15 días abierto: si sube, el backlog envejece.']]]],
    pp: [['Lo recibido ese mes', [
      ['Recibidas', (s) => s.in, 'v', null, 'Issues abiertas en ese mes.'],
      ['% cerrado en el mes', (s) => (s.in ? s.same / s.in : null), 'p', 'high', 'De las recibidas en ese mes, las cerradas antes de acabar el mismo mes.']]],
    ['Lo que pasó en el mes', [
      ['Resueltas', (s) => s.out, 'v', 'high', 'Lo resuelto en el mes, se abriera cuando se abriera.'],
      ['De meses anteriores', (s) => s.prev, 'v', 'warn', 'De lo resuelto en el mes, lo que se abrió en un mes anterior.'],
      ['Pendientes al cierre', (s) => s.open, 'v', null, 'Lo que seguía abierto al acabar el mes.'],
      ['Con más de 15 días', (s) => s.old, 'v', null, 'De las pendientes al cierre, las que ya llevaban más de 15 días abiertas.']]]],
  };
  const ledgerCmp = (units, per, day) => {
    const pp = m.perHead(), H = [0, 1].map((k) => (pp ? m.heads(k).size || 1 : 1)), groups = LEDGER_CMP[pp ? 'pp' : 'co'];
    const dayText = (t) => (day ? t.replace('pasó en el mes', 'pasó en el día').replace('ese mes', 'ese día').replace('en el mes', 'el mismo día').replace('meses anteriores', 'días anteriores').replace('acabar el mes', 'acabar el día').replace('el mismo mes', 'el mismo día') : t);
    const value = (d, x, k) => { const v = d[1](x); return v != null && d[2] === 'v' ? v / H[k] : v; };
    const show = (d, v, k) => (v == null ? '—' : d[2] === 'p' ? pct(v) : d[2] === 'n' || H[k] === 1 ? num(Math.round(v)) : dec(v));
    const sideName = (k) => (pp && !S.sides[k].people ? `Media de ${COMPANIES[S.sides[k].company]}` : name(k));
    const defs = groups.flatMap(([, d]) => d);
    const cells = (j) => defs.map((d, c) => {
      const v = [0, 1].map((k) => value(d, per[k][j], k)), t = v.map((x, k) => show(d, x, k));
      // el lado marcado: el que va mejor (verde) o, en 'warn', el más alto (naranja)
      // (comparando los valores redondeados como se ven: «0» y «0,0» son iguales)
      const r = (x) => Math.round(x * (d[2] === 'p' ? 100 : 10));
      const mark = d[3] && v[0] != null && v[1] != null && r(v[0]) !== r(v[1]) ? ((d[3] === 'low') === (v[0] < v[1]) ? 0 : 1) : -1;
      const cls = d[3] === 'warn' ? 'mt-warn' : 'mt-better', first = groups.some(([, g]) => g[0] === d);
      return [0, 1].map((k) => `<td class="mt-num ${k ? '' : first ? 'mt-gsep' : 'mt-msep'} ${mark === k ? cls : ''}">${t[k]}</td>`).join('');
    }).join('');
    const row = (label, j, attrs = '') => `<tr ${attrs}><td>${label}</td>${cells(j)}</tr>`;
    // los nombres, en una leyenda encima; en la cabecera, solo el color de cada lado (el nombre, al pasar el ratón)
    const side = (k) => `<th class="mt-led-side" data-tip="${esc(sideName(k))}"><i class="mt-c${k}"></i></th>`;
    return `<div class="mt-legend">${[0, 1].map((k) => `<span><i class="mt-c${k}"></i>${esc(sideName(k))}</span>`).join('')}</div><div class="mt-tablewrap"><table class="mt-fixed mt-led2"><colgroup><col class="mt-first">${'<col>'.repeat(defs.length * 2)}</colgroup><thead>
      <tr class="mt-cgrp"><th></th>${groups.map(([l, d]) => `<th colspan="${d.length * 2}">${dayText(l)}</th>`).join('')}</tr>
      <tr><th rowspan="2">${day ? 'Día' : 'Mes'}</th>${defs.map((d) => `<th class="mt-num mt-led-m" colspan="2" data-tip="${esc(dayText(d[4]))}">${dayText(d[0])}</th>`).join('')}</tr>
      <tr>${defs.map(() => side(0) + side(1)).join('')}</tr></thead><tbody>
      ${units.map((u, j) => row(u.label, j, u.f ? `class="mt-clk" data-f="${u.f}"` : u.after ? 'class="mt-mut"' : '')).join('')}${row('Total', units.length, 'class="mt-tot"')}</tbody></table></div>`;
  };
  // Qué entra, comparando: sin meses (eso está en Mes a mes), si los dos reciben lo mismo. Cada fila, cuántas tiene
  // cada lado (persona frente a empresa: la media por persona del equipo, model.js heads) y qué parte es de lo suyo,
  // con una barra a la misma escala en los dos. Sin verde ni rojo: recibir una cosa u otra no es mejor ni peor, es el
  // contexto para leer lo demás. rowsDef: los bloques y filas de la tabla dinámica de Qué entra cada mes.
  const mixCmp = (rowsDef, A, lead = 'Recibidas') => {
    const T = bySide(A), pp = m.perHead(), H = [0, 1].map((k) => (pp ? m.heads(k).size || 1 : 1));
    const sideName = (k) => (pp && !S.sides[k].people ? `Media de ${COMPANIES[S.sides[k].company]}` : name(k));
    const blocks = [];
    for (const r of rowsDef) { if (r.head) blocks.push({ head: r.head, note: r.note, rows: [] }); else blocks[blocks.length - 1].rows.push(r); }
    const cells = (test, label) => [0, 1].map((k) => {
      const c = test ? T[k].filter(test).length : T[k].length, sh = T[k].length ? c / T[k].length : 0, n = c / H[k];
      return `<td class="mt-num ${k ? 'mt-msep' : 'mt-gsep'}">${H[k] > 1 ? dec(n) : num(n)}</td><td class="mt-num mt-mix-p">${pct(sh)}</td>
        <td class="mt-mix-bar" data-tip="${esc(`${label} · ${sideName(k)}\n${H[k] > 1 ? `${dec(n)} por persona (${num(c)} en total)` : `${num(c)} issues`} · ${pct(sh, 1)} de lo suyo`)}"><i class="mt-c${k}" style="width:${(sh * 100).toFixed(1)}%"></i></td>`;
    }).join('');
    const sel = (f) => { const [d, k] = f.split(':'); return isSel(d, +k); };   // «Resto» no lleva filtro
    const body = blocks.map((b) => b.rows.map((r, j) => `<tr class="${r.f ? 'mt-clk' : ''} ${j ? '' : 'mt-gfirst'} ${r.f && sel(r.f) ? 'mt-sel' : ''}" ${r.f ? `data-f="${r.f}"` : ''}>
      ${j ? '' : `<th class="mt-gl" rowspan="${b.rows.length}">${esc(b.head)}${b.note ? `<small>${esc(b.note)}</small>` : ''}</th>`}<th class="mt-r" data-tip="${esc(r.label)}">${esc(r.label)}</th>${cells(r.test, r.label)}</tr>`).join('')).join('');
    const head = (k) => `<th colspan="3" class="mt-mix-side ${k ? '' : 'mt-gsep'}"><i class="mt-c${k}"></i>${esc(sideName(k))}</th>`;
    return `<div class="mt-tablewrap"><table class="mt-mx mt-mix2"><colgroup><col style="width:13%"><col style="width:21%">${'<col class="mt-mix-cn"><col class="mt-mix-cp"><col>'.repeat(2)}</colgroup>
      <thead><tr><th colspan="2"></th>${head(0)}${head(1)}</tr><tr><th colspan="2"></th>${'<th class="mt-num">Issues</th><th class="mt-num">%</th><th></th>'.repeat(2)}</tr></thead><tbody>
      <tr class="mt-lead"><th class="mt-r" colspan="2">${lead}${pp ? ' (por persona)' : ''}</th>${cells(null, lead)}</tr>${body}</tbody></table></div>`;
  };
  // Lo pendiente, comparando: no cuánto hay (depende de lo que entra), sino cómo está. Cada fila, por lado: sus issues
  // (con personas, la media por persona del equipo), qué parte son de sus pendientes y cuánto llevan abiertas de media.
  // En verde, el lado que va mejor solo en lo que depende de él (r.better): entre empresas, por el %; con personas, por
  // las issues (con 8–10 pendientes, una sola mueve el % diez puntos). Lo que espera a otros, sin color. La fila de las
  // pendientes, al final, como en el resto de tablas.
  const pendCmp = (rowsDef, op) => {
    const T = bySide(op), pp = m.perHead(), H = [0, 1].map((k) => (pp ? m.heads(k).size || 1 : 1));
    const sideName = (k) => (pp && !S.sides[k].people ? `Media de ${COMPANIES[S.sides[k].company]}` : name(k));
    const ageOf = (l) => (l.length ? l.reduce((a, i) => a + m.SNAP - C.rep[i], 0) / l.length / 1440 : null);   // en días
    // el lado con menos (el que va mejor), o -1 si se ven iguales o falta uno
    const lower = (a, b, same) => (a == null || b == null || same(a) === same(b) ? -1 : a < b ? 0 : 1);
    const blocks = [];
    for (const r of rowsDef) { if (r.head) blocks.push({ head: r.head, note: r.note, rows: [] }); else blocks[blocks.length - 1].rows.push(r); }
    const cells = (r) => {
      const v = [0, 1].map((k) => { const l = r.test ? T[k].filter(r.test) : T[k]; return { c: l.length / H[k], sh: T[k].length ? l.length / T[k].length : null, age: ageOf(l) }; });
      const main = r.better ? (pp ? lower(v[0].c, v[1].c, (x) => Math.round(x * 10)) : lower(v[0].sh, v[1].sh, (x) => Math.round(x * 100))) : -1;
      const old = r.better || !r.test ? lower(v[0].age, v[1].age, (x) => Math.round(x * 10)) : -1;
      const ok = (on) => (on ? 'mt-better' : '');
      return [0, 1].map((k) => `<td class="mt-num ${k ? 'mt-msep' : 'mt-gsep'} ${ok(pp && main === k)}">${H[k] > 1 ? dec(v[k].c) : num(v[k].c)}</td>
        <td class="mt-num mt-mix-p ${ok(!pp && main === k)}">${v[k].sh == null ? '—' : pct(v[k].sh)}</td><td class="mt-num ${ok(old === k)}">${v[k].age == null ? '—' : dec(v[k].age)}</td>`).join('');
    };
    const attrs = (r) => (r.f ? `data-f${r.f.includes('|') ? '2' : ''}="${r.f}" ${r.tip ? `data-tip="${esc(r.tip)}"` : ''}` : '');
    const sel = (f) => !f.includes('|') && isSel(f.split(':')[0], +f.split(':')[1]);
    const body = blocks.map((b) => b.rows.map((r, j) => `<tr class="${r.f ? 'mt-clk' : ''} ${j ? '' : 'mt-gfirst'} ${r.f && sel(r.f) ? 'mt-sel' : ''}" ${attrs(r)}>
      ${j ? '' : `<th class="mt-gl" rowspan="${b.rows.length}">${esc(b.head)}${b.note ? `<small>${esc(b.note)}</small>` : ''}</th>`}<th class="mt-r">${esc(r.label)}</th>${cells(r)}</tr>`).join('')).join('');
    const head = (k) => `<th colspan="3" class="mt-mix-side ${k ? '' : 'mt-gsep'}"><i class="mt-c${k}"></i>${esc(sideName(k))}</th>`;
    return `<div class="mt-tablewrap"><table class="mt-mx mt-mix2 mt-pend2"><colgroup><col style="width:13%"><col style="width:21%">${'<col class="mt-mix-cn"><col class="mt-mix-cp"><col>'.repeat(2)}</colgroup>
      <thead><tr><th colspan="2"></th>${head(0)}${head(1)}</tr><tr><th colspan="2"></th>${'<th class="mt-num">Issues</th><th class="mt-num">%</th><th class="mt-num" data-tip="Lo que llevan abiertas, de media, en días.">Antigüedad (días)</th>'.repeat(2)}</tr></thead><tbody>
      ${body}<tr class="mt-lead mt-lead-end"><th class="mt-r" colspan="2">Pendientes${pp ? ' (por persona)' : ''}</th>${cells({})}</tr></tbody></table></div>`;
  };
  // Backlog, comparando: las cifras de arriba, cómo está lo pendiente de cada uno y qué tiene pendiente. Sin lo que no
  // tiene responsable (no es de nadie: no hay con qué compararlo) ni las tablas de detalle por módulo, centro y escalado
  // (son para gestionar el propio backlog; para comparar un módulo o un centro, se filtra).
  const backlogCmp = (A) => {
    const T = bySide(A), P = T.map((l) => l.filter((i) => OPEN[i])), op = A.filter((i) => OPEN[i]), pp = m.perHead(), d = days() || 1;
    const H = [0, 1].map((k) => (pp ? m.heads(k).size || 1 : 1)), each = pp ? ' por persona' : '', names = teamNames();
    const CRITICAL = DI.prio.indexOf('CRITICAL'), old = (i) => m.SNAP - C.rep[i] > OLD, sit = (k) => (i) => m.DIMS.sit.get(i) === k;
    // lo que cumple algo, por lado: con personas, issues por persona; entre empresas, qué parte es de sus pendientes
    const part = (test) => [0, 1].map((k) => { const c = P[k].filter(test).length; return { n: P[k].length, v: pp ? c / H[k] : P[k].length ? c / P[k].length : null }; });
    const partFig = (label, test, better, note) => kpiCo(pp ? `${label}${each}` : `% ${label.toLowerCase()}`, part(test), pp ? (s) => dec(s.v) : (s) => pct(s.v), { val: (s) => s.v, better, note: `${note}${headsNote()}`, names });
    const age = [0, 1].map((k) => ({ n: P[k].length, v: P[k].length ? P[k].reduce((a, i) => a + m.SNAP - C.rep[i], 0) / P[k].length / 1440 : null }));
    const stock = [0, 1].map((k) => ({ n: T[k].length, v: P[k].length / (T[k].length / d) }));
    const pendRows = [
      { head: 'Situación', note: 'Suman las pendientes.' },
      ...SITUATION.map((x, k) => ({ ...x, better: k === 1 || k === 2 ? 'low' : null })).filter((x) => op.some(x.test)),
      { head: 'A vigilar', note: 'Dentro de las pendientes; se solapan.' },
      { label: 'Fuera de plazo', test: late, f: 'sl:4', better: 'low', tip: 'Nunca han pasado a En curso y ya superan el plazo de su prioridad.' },
      { label: 'Con más de 15 días', test: old, f: OLD15, better: 'low', tip: 'Llevan más de 15 días abiertas.' },
      { label: 'Escaladas', test: (i) => C.vt[i] > 0, f: 'es:1', tip: 'Con ticket de tercero, estén en el estado que estén.' },
      { label: 'Críticas', test: (i) => C.pr[i] === CRITICAL, f: `pr:${CRITICAL}` },
      { label: 'PRIO', test: (i) => cardsOf(i).includes(2), f: 'tj:2', tip: 'Priorizadas por negocio.' },
    ];
    const mixRows = [{ head: 'Prioridad' }, ...PRIOS.map((p) => ({ label: nice(DI.prio[p]), test: (i) => C.pr[i] === p, f: `pr:${p}` })),
      { head: 'Tarjeta', note: 'Una PRIO cuenta también en su SGA o SISU.' }, ...CARDS.map((c, k) => ({ label: c, test: (i) => cardsOf(i).includes(k), f: `tj:${k}` })),
      { head: 'Módulo' }, ...topRows('mo', op, 8)];
    return grid(ask('backlog'),
      kpis(kpiCo(`Pendientes${each}`, volume(P), pp ? (s) => dec(s.v) : (s) => num(s.v), { val: (s) => s.v, note: `sin resolver, de lo recibido en el periodo${headsNote()}`, names }),
        kpiCo('Días de entrada acumulados', stock, (s) => dec(s.v), { val: (s) => s.v, better: 'low', note: 'Las pendientes entre lo que entra al día: cuántos días de trabajo tiene acumulados cada uno. Así se compara quien recibe mucho con quien recibe poco.' }),
        kpiCo('Antigüedad media, en días', age, (s) => dec(s.v), { val: (s) => s.v, better: 'low', note: 'Lo que llevan abiertas las pendientes, de media.' }),
        partFig('Sin tocar', sit(1), 'low', 'En Asignada y sin ningún movimiento desde que se abrieron'),
        partFig('Fuera de plazo', late, 'low', 'Nunca han pasado a En curso y ya superan el plazo de su prioridad'),
        partFig('Con más de 15 días', old, 'low', 'Llevan más de 15 días abiertas'),
        partFig('Escaladas', (i) => C.vt[i] > 0, null, 'Con ticket de tercero: dependen de otros')),
      card('Cómo está lo pendiente', pendCmp(pendRows, op), { span: 's12', sub: `${pp ? 'Issues de cada uno; las de la empresa, la media por persona de su equipo.' : 'Qué parte de sus pendientes está en cada situación.'} En verde, quien va mejor en lo que depende de él; lo que espera a otros, sin color. Clic en una fila para filtrar.` }),
      card('Qué tiene pendiente cada uno', mixCmp(mixRows, op, 'Pendientes'), { span: 's12', sub: 'Los 8 módulos con más pendientes; «Resto», los demás. Clic en una fila para filtrar.' }));
  };
  const ledger = (A) => {
    const T = bySide(A), day = S.from === S.to, units = flowUnits();
    // si el periodo acaba antes de la foto, lo resuelto después también cuenta: así «resueltas» suma las
    // ya cerradas y «pendientes al cierre» acaba en lo que sigue abierto hoy
    const end = units.length ? units[units.length - 1].to : 0;
    if (end <= m.SNAP) units.push({ label: 'Después del periodo, hasta hoy', from: end, to: Infinity, after: true });
    const DAY_NAMES = { '% cerrado en el mes': '% cerrado el mismo día', 'De meses anteriores': 'De días anteriores' };
    const defs = day ? LEDGER.map((d) => (DAY_NAMES[d[0]] ? [DAY_NAMES[d[0]], ...d.slice(1)] : d)) : LEDGER;
    const per = [0, 1].map((k) => {
      const rowsK = units.map(() => ({ in: 0, closed: 0, still: 0, same: 0, out: 0, prev: 0, open: 0, old: 0 }));
      for (const i of T[k]) {
        const r = resAt(i);
        units.forEach((u, j) => {
          const x = rowsK[j];
          if (C.rep[i] >= u.from && C.rep[i] < u.to) { x.in++; if (OPEN[i]) x.still++; else x.closed++; if (r != null && r < u.to) x.same++; }
          if (r != null && r >= u.from && r < u.to) { x.out++; if (C.rep[i] < u.from) x.prev++; }
          if (C.rep[i] < u.to && (r == null || r >= u.to)) { x.open++; if (Math.min(u.to, m.SNAP) - C.rep[i] > OLD) x.old++; }
        });
      }
      const tot = rowsK.reduce((a, x) => ({ in: a.in + x.in, closed: a.closed + x.closed, still: a.still + x.still, same: a.same + x.same, out: a.out + x.out, prev: a.prev + x.prev }), { in: 0, closed: 0, still: 0, same: 0, out: 0, prev: 0 });
      const last = rowsK[rowsK.length - 1] || { open: 0, old: 0 };
      tot.open = last.open; tot.old = last.old;
      return [...rowsK, tot].map((x) => ({ ...x, n: x.in + x.out + x.open }));
    });
    if (CMP()) return ledgerCmp(units, per, day);
    const row = (label, j, attrs = '') => `<tr ${attrs}><td>${label}</td>${defs.map((d) => `<td class="mt-num">${cell([per[0][j], per[1][j]], d)}</td>`).join('')}</tr>`;
    const groups = LEDGER_GROUPS.map(([l, n]) => [day ? l.replace('mes', 'día') : l, n]);
    return table(day ? 'Día' : 'Mes', defs, units.map((u, j) => row(u.label, j, u.f ? `class="mt-clk" data-f="${u.f}"` : u.after ? 'class="mt-mut"' : '')).join('') + row('Total', units.length, 'class="mt-tot"'), groups);
  };

  // ¿De quién dependemos en cada módulo? Los 15 módulos con más issues: cuántas personas lo tocan, cuántas hacen
  // falta para llevar el 80 % (de la que más lleva a la que menos) y las tres que más llevan.
  const owners = (A) => {
    const g = group('mo', A.filter((i) => C.as[i]), true).filter((x) => x.k).slice(0, 15);
    const body = g.map((x) => {
      const by = group('as', x.rows);
      let sum = 0, n80 = 0;
      for (const p of by) { sum += p.n; n80++; if (sum >= 0.8 * x.n) break; }
      const top = by.slice(0, 3).map((p) => `<span class="mt-own ${isSel('as', p.k) ? 'mt-sel' : ''}" data-f="as:${p.k}" data-tip="${esc(`${m.DIMS.as.label(p.k)}\n${num(p.n)} de ${num(x.n)} issues de ${m.DIMS.mo.label(x.k)}`)}">${esc(m.DIMS.as.label(p.k))} <b>${pct(p.n / x.n)}</b></span>`).join('');
      return `<tr class="mt-clk ${isSel('mo', x.k) ? 'mt-sel' : ''}" data-f="mo:${x.k}"><td>${esc(m.DIMS.mo.label(x.k))}</td><td class="mt-num">${num(x.n)}</td><td class="mt-num">${by.length}</td><td class="mt-num">${n80}</td><td class="mt-owns">${top}</td></tr>`;
    }).join('');
    return g.length ? `<div class="mt-tablewrap"><table class="mt-owners"><thead><tr><th>Módulo</th><th class="mt-num">Issues</th><th class="mt-num" data-tip="Personas con alguna issue del módulo.">Personas</th>
      <th class="mt-num" data-tip="Cuántas personas, de la que más lleva a la que menos, suman el 80 % de las issues del módulo.">Llevan el 80 %</th><th>Quién lleva más</th></tr></thead><tbody>${body}</tbody></table></div>` : '<p class="mt-mut mt-small">Sin datos con estos filtros.</p>';
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

  // --- Resolución (propuesta). Una pregunta por bloque: cuánto tardamos, en qué se va el tiempo, qué módulos tardan
  // más y qué escalamos y a quién. Los tiempos, de lo resuelto y en tiempo natural; el de cada estado, la media por
  // resuelta (model.js, stats rt). Por ahora, de un solo lado: comparando, se ve el primero.
  const solved = (i) => m.DIMS.tb.get(i) < 8, escd = (i) => C.vt[i] > 0;
  const STATES = [['En cola', 'En Asignada: sin coger o de vuelta a la cola. Incluye lo que espera a otros sin pasar a Pendiente.'], ['En curso', 'En En curso.'],
    ['Espera cliente', 'En Pendiente del centro o del cliente.'], ['Espera tercero', 'En Pendiente de un tercero.'], ['Otro motivo', 'En Pendiente por otro motivo o sin motivo.']];
  const optDur = (v) => (v == null ? '—' : dur(v));
  const avgOf = (s) => optDur(s.resolved ? s.avg : null);
  // Cuánto tardan: lo resuelto sin escalar, escalado y todo, cada fila repartida entre los tramos de tiempo (suma el
  // 100 %), con más color cuanto mayor su parte. Los tramos, en tres bloques (menos de 24 h, de 1 a 7 días y más de 7),
  // cada uno con su total. Clic en una celda filtra ese tramo (y si está escalada o no). Comparando, una fila por lado
  // y, en verde, quien resuelve más en menos de 24 h y menos en más de 7 días (en los totales de esos bloques).
  const TTR_GROUPS = [['Menos de 24 h', [0, 1, 2, 3], 'high'], ['De 1 a 7 días', [4, 5], null], ['Más de 7 días', [6, 7], 'low']];
  const ttrTable = (list) => {
    const R = list.filter(solved), cmp = CMP(), P = cmp ? bySide(R).slice(0, 2) : [R];
    const KINDS = [['Sin escalar', (i) => !escd(i), 'es:0'], ['Escaladas', escd, 'es:1'], ['Todas las resueltas', null, null]];
    const blocks = KINDS.map(([label, t, f]) => P.map((L, k) => {
      const l = t ? L.filter(t) : L, c = new Array(8).fill(0);
      for (const i of l) c[m.DIMS.tb.get(i)]++;
      return { label, f, k, n: l.length, c, s: stats(l) };
    }));
    const lines = blocks.flat();
    const share = (x, v) => v / (x.n || 1), max = Math.max(0.01, ...lines.flatMap((x) => x.c.map((v) => share(x, v))));
    const sum = (x, ks) => ks.reduce((t, k) => t + x.c[k], 0);
    const shown = (x, ks) => Math.round(share(x, sum(x, ks)) * 100);
    const best = (x, o, ks, better) => cmp && better && x.n && o.n && shown(x, ks) !== shown(o, ks) && (better === 'high') === (shown(x, ks) > shown(o, ks));
    const who = (x) => (cmp ? ` · ${name(x.k)}` : '');
    // la fila de todas, sin color: es la suma de las otras dos
    const cellsOf = (x, o, last) => TTR_GROUPS.map(([g, ks, better]) => ks.map((k, j) => {
      const sh = share(x, x.c[k]), a = x.c[k] && !last ? Math.round(6 + 94 * sh / max) : 0, f = x.f ? `data-f2="${x.f}|tb:${k}"` : `data-f="tb:${k}"`;
      return `<td class="${j ? '' : 'mt-gsep'} ${a > 50 ? 'mt-hot' : ''}" style="--mt-a:${a}%" ${f} data-tip="${esc(`${x.label}${who(x)} · ${m.DIMS.tb.label(k)}\n${num(x.c[k])} de ${num(x.n)} (${pct(sh, 1)})`)}">${x.c[k] ? pct(sh) : ''}</td>`;
    }).join('') + `<td class="mt-total mt-ttr-sub ${best(x, o, ks, better) ? 'mt-better' : ''}" data-tip="${esc(`${x.label}${who(x)} · ${g.toLowerCase()}\n${num(sum(x, ks))} de ${num(x.n)}`)}">${pct(share(x, sum(x, ks)))}</td>`).join('');
    const head = (x, k, n) => (cmp ? `${k ? '' : `<th class="mt-r ${x.f ? 'mt-clk' : ''}" rowspan="${n}" ${x.f ? `data-f="${x.f}"` : ''}>${x.label}</th>`}<th class="mt-r mt-ttr-who" data-tip="${esc(name(k))}"><i class="mt-sw mt-c${k}"></i>${esc(name(k))}</th>`
      : `<th class="mt-r ${x.f ? 'mt-clk' : ''}" ${x.f ? `data-f="${x.f}"` : ''}>${x.label}</th>`);
    const body = blocks.map((pair, b) => pair.map((x, k) => {
      const last = b === blocks.length - 1;
      return `<tr class="${last && !k ? 'mt-tot' : last ? 'mt-tot2' : ''} ${cmp && !k ? 'mt-gfirst' : ''}">${head(x, k, pair.length)}<td class="mt-total mt-num">${num(x.n)}</td><td class="mt-total mt-num"><b>${avgOf(x.s)}</b></td>${cellsOf(x, pair[1 - k] || x, last)}</tr>`;
    }).join('')).join('');
    return `<div class="mt-tablewrap"><table class="mt-hm mt-ttr"><colgroup>${cmp ? '<col style="width:10%"><col style="width:11%">' : '<col style="width:14%">'}<col style="width:7%"><col style="width:8%">${TTR_GROUPS.map(([, ks]) => '<col>'.repeat(ks.length) + '<col class="mt-ttr-subc">').join('')}</colgroup><thead>
      <tr class="mt-cgrp"><th colspan="${cmp ? 4 : 3}"></th>${TTR_GROUPS.map(([g, ks]) => `<th colspan="${ks.length + 1}">${g}</th>`).join('')}</tr>
      <tr><th colspan="${cmp ? 2 : 1}"></th><th class="mt-num">Resueltas</th><th class="mt-num" data-tip="De la apertura a la resolución.">Media</th>${TTR_GROUPS.map(([, ks]) => ks.map((k, j) => `<th class="${j ? '' : 'mt-gsep'}">${m.DIMS.tb.label(k)}</th>`).join('') + '<th class="mt-ttr-sub">Total</th>').join('')}</tr></thead>
      <tbody>${body}</tbody></table></div>`;
  };
  // Mes a mes (por mes de apertura): lo resuelto de lo recibido ese mes y cuánto tardó, todo, sin escalar y escalado.
  // En ocre, lo que va claramente peor que el total (como en las fichas: un 15 % o más, con al menos MIN_RES resueltas).
  // Cada dato: [nombre, parte (a todo, n sin escalar, e escalado), valor, formato, mejor, nota].
  const MIN_RES = 30;
  const RES_MONTH = [
    ['Volumen', [['Resueltas', 'a', (s) => s.resolved, num, null, 'De las recibidas ese mes, las ya resueltas.'],
      ['% escaladas', 'a', (s) => s.escShare, (v) => pct(v), null, 'De las resueltas, las que tienen ticket de tercero.']]],
    ['Media de resolución', [['Todas', 'a', (s) => s.avg, dur, 'low', 'De la apertura a la resolución.'], ['Sin escalar', 'n', (s) => s.avg, dur, 'low', ''], ['Escaladas', 'e', (s) => s.avg, dur, 'low', '']]],
    ['Resueltas en < 24 h', [['Sin escalar', 'n', (s) => s.d1, (v) => pct(v), 'high', ''], ['Escaladas', 'e', (s) => s.d1, (v) => pct(v), 'high', '']]],
    ['Más de 7 días', [['Sin escalar', 'n', (s) => s.w7, (v) => pct(v), 'low', ''], ['Escaladas', 'e', (s) => s.w7, (v) => pct(v), 'low', '']]],
  ];
  const resMonthly = (A) => {
    const parts = (l) => {
      const r = l.filter(solved), e = r.filter(escd), a = stats(l);
      a.escShare = r.length ? e.length / r.length : null;
      return { a, n: stats(r.filter((i) => !escd(i))), e: stats(e) };
    };
    const defs = RES_MONTH.flatMap(([, d]) => d), firsts = new Set(RES_MONTH.map(([, d]) => d[0]));
    const val = (x, d) => { const s = x[d[1]]; return s.resolved ? d[2](s) : null; };
    const tot = parts(A);
    const worse = (x, d, v) => {
      const w = val(tot, d);
      if (!d[4] || v == null || w == null || x[d[1]].resolved < MIN_RES) return false;
      return d[4] === 'low' ? v > w * 1.15 : v < w * 0.85;
    };
    const cells = (x, isTot) => defs.map((d) => {
      const v = val(x, d), bad = !isTot && worse(x, d, v);
      return `<td class="mt-num ${firsts.has(d) ? 'mt-gsep' : ''} ${bad ? 'mt-worse' : ''}" ${bad ? `data-tip="${esc(`Peor que el total: ${d[3](val(tot, d))}`)}"` : ''}>${v == null ? '—' : d[3](v)}</td>`;
    }).join('');
    const body = monthsIn().map((k) => `<tr class="mt-clk ${isSel('month', k) ? 'mt-sel' : ''}" data-f="month:${k}"><td>${MONTHS[k]}${k === LASTM ? '*' : ''}</td>${cells(parts(A.filter((i) => MONTH[i] === k)))}</tr>`).join('');
    return `<div class="mt-res-month">${table('Mes de apertura', defs.map((d) => [d[0], 0, 0, 0, d[5]]), `${body}<tr class="mt-tot"><td>Total</td>${cells(tot, true)}</tr>`, RES_MONTH.map(([g, d]) => [g, d.length]))}</div>`;
  };
  // en qué se va el tiempo: por prioridad, escalada o no y tarjeta, la media y su reparto entre estados
  const timeTable = (A) => {
    const R = A.filter(solved);
    const blocks = [['Prioridad', '', PRIOS.map((p) => [nice(DI.prio[p]), (i) => C.pr[i] === p, `pr:${p}`])],
      ['Escalado', '', [['Sin escalar', (i) => !escd(i), 'es:0'], ['Escaladas', escd, 'es:1']]],
      ['Tarjeta', 'Una PRIO cuenta también en su SGA o SISU.', CARDS.map((c, k) => [c, (i) => cardsOf(i).includes(k), `tj:${k}`])]];
    const cells = (l) => {
      const s = stats(l), tot = s.rt.reduce((a, b) => a + b, 0) || 1;
      return `<td class="mt-num">${num(s.resolved)}</td><td class="mt-num"><b>${avgOf(s)}</b></td>${STATES.map((_, k) => `<td class="mt-num">${optDur(s.resolved ? s.rt[k] / s.resolved : null)}</td>`).join('')}
        <td class="mt-tbar">${s.resolved ? `<div class="mt-hbar">${s.rt.map((v, k) => `<i class="mt-time${k}" style="width:${(v / tot * 100).toFixed(1)}%" data-tip="${esc(`${STATES[k][0]}: ${pct(v / tot, 1)} del tiempo`)}"></i>`).join('')}</div>` : ''}</td>`;
    };
    const body = blocks.map(([head, note, rowsB]) => rowsB.filter(([, t]) => R.some(t)).map(([label, t, f], j, arr) => `<tr class="mt-clk ${j ? '' : 'mt-gfirst'} ${isSel(...f.split(':').map((x, n) => (n ? +x : x))) ? 'mt-sel' : ''}" data-f="${f}">
      ${j ? '' : `<th class="mt-gl" rowspan="${arr.length}">${head}${note ? `<small>${note}</small>` : ''}</th>`}<th class="mt-r">${esc(label)}</th>${cells(R.filter(t))}</tr>`).join('')).join('');
    return `<div class="mt-legend">${STATES.map(([l, t], k) => `<span data-tip="${esc(t)}"><i class="mt-time${k}"></i>${l}</span>`).join('')}</div>
      <div class="mt-tablewrap"><table class="mt-mx mt-restime"><colgroup><col style="width:10%"><col style="width:12%"><col style="width:7%"><col style="width:8%">${'<col style="width:8%">'.repeat(5)}<col></colgroup>
      <thead><tr><th colspan="2"></th><th class="mt-num">Resueltas</th><th class="mt-num" data-tip="De la apertura a la resolución.">Media</th>${STATES.map(([l, t]) => `<th class="mt-num" data-tip="${esc(`${t} Media por resuelta.`)}">${l}</th>`).join('')}<th>Reparto del tiempo</th></tr></thead>
      <tbody>${body}<tr class="mt-lead mt-lead-end"><th class="mt-r" colspan="2">Todas las resueltas</th>${cells(R)}</tr></tbody></table></div>`;
  };
  // la diferencia entre dos tiempos, con signo
  const durDiff = (a, b) => (a == null || b == null ? '—' : `${a >= b ? '+' : '−'}${dur(Math.abs(a - b))}`);
  // Unas veces se escala y otras no: problemas con al menos 20 resueltas, escalados entre el 20 % y el 80 % de las
  // veces, agrupados por su módulo principal (el módulo, de más a menos resueltas entre sus problemas). Por problema:
  // cuántas, qué parte se escala y lo que tarda sin escalar y escalado.
  const mixedEsc = () => {
    const g = group('de', m.rows('de').filter(solved), true).filter((x) => x.k && x.n >= 20)
      .map((x) => ({ ...x, e: x.rows.filter(escd) })).filter((x) => x.e.length >= 0.2 * x.n && x.e.length <= 0.8 * x.n);
    if (!g.length) return '<p class="mt-mut mt-small">Ninguno con estos filtros.</p>';
    const all = ui.exp['rs-mixed'], shown = all ? g : g.slice(0, 12);
    const byMo = new Map();
    for (const x of shown) { const mo = group('mo', x.rows).find((y) => y.k)?.k ?? 0; if (!byMo.has(mo)) byMo.set(mo, []); byMo.get(mo).push(x); }
    const mods = [...byMo].sort((a, b) => b[1].reduce((t, x) => t + x.n, 0) - a[1].reduce((t, x) => t + x.n, 0));
    const cells = (rows, e) => {
      const n = stats(rows.filter((i) => !escd(i))), s = stats(e), sh = e.length / (rows.length || 1);
      return `<td class="mt-num mt-gsep">${num(rows.length)}</td>
        <td class="mt-gsep"><div class="mt-sc-vol"><em>${pct(sh)}</em><span class="mt-bt"><i class="mt-time3" style="width:${(sh * 100).toFixed(1)}%"></i></span></div></td>
        <td class="mt-num mt-gsep">${avgOf(n)}</td><td class="mt-num">${avgOf(s)}</td><td class="mt-num mt-mut">${durDiff(s.resolved ? s.avg : null, n.resolved ? n.avg : null)}</td>
        <td class="mt-num mt-gsep">${n.resolved ? pct(n.d1) : '—'}</td><td class="mt-num">${s.resolved ? pct(s.d1) : '—'}</td>`;
    };
    const body = mods.map(([mo, xs]) => xs.map((x, j) => `<tr class="mt-clk ${j ? '' : 'mt-gfirst'} ${isSel('de', x.k) ? 'mt-sel' : ''}" data-f="de:${x.k}">
      ${j ? '' : `<th class="mt-gl" rowspan="${xs.length}">${esc(mo ? m.DIMS.mo.label(mo) : 'Sin módulo')}</th>`}<th class="mt-r" data-tip="${esc(DI.problem[x.k])}">${esc(DI.problem[x.k])}</th>${cells(x.rows, x.e)}</tr>`).join('')).join('');
    const allRows = shown.flatMap((x) => x.rows);
    return `<div class="mt-tablewrap"><table class="mt-mx mt-mixesc"><colgroup><col style="width:13%"><col style="width:21%"><col style="width:8%"><col style="width:15%"><col style="width:10%"><col style="width:10%"><col style="width:9%"><col style="width:7%"><col style="width:7%"></colgroup><thead>
      <tr class="mt-cgrp"><th colspan="2"></th><th colspan="2">Volumen</th><th colspan="3">Media de resolución</th><th colspan="2">En < 24 h</th></tr>
      <tr><th>Módulo principal</th><th>Problema</th><th class="mt-num">Resueltas</th><th data-tip="De las resueltas, las que tienen ticket de tercero.">Escaladas</th><th class="mt-num">Sin escalar</th><th class="mt-num">Escaladas</th><th class="mt-num" data-tip="Lo que tardan de más (o de menos) las escaladas.">Diferencia</th><th class="mt-num">Sin escalar</th><th class="mt-num">Escaladas</th></tr></thead>
      <tbody>${body}<tr class="mt-lead mt-lead-end"><th class="mt-r" colspan="2">${all || g.length <= 12 ? 'Todos estos problemas' : `Estos ${shown.length} problemas`}</th>${cells(allRows, allRows.filter(escd))}</tr></tbody></table></div>
      ${g.length > 12 ? `<button class="mt-more" data-exp="rs-mixed">${all ? 'Ver menos' : `Ver todos (${num(g.length)})`}</button>` : ''}`;
  };
  // Un mismo ticket, muchas incidencias: tickets de tercero con 5 o más incidencias ligadas, en dos bloques: con
  // alguna abierta y ya cerrados (de más a menos incidencias). Cuándo: la primera y la última incidencia y los días
  // entre una y otra (0: todas el mismo día).
  const ticketTable = (A) => {
    const known = group('vk', A, true).filter((x) => x.k && x.n >= 5).map((x) => ({ ...x, open: x.rows.filter((i) => OPEN[i]).length })).sort((a, b) => (b.open > 0) - (a.open > 0) || b.n - a.n);
    if (!known.length) return '<p class="mt-mut mt-small">Ninguno con estos filtros.</p>';
    const all = ui.exp['rs-known'], shown = known.slice(0, all ? 200 : 15);
    const row = (x, j, n, head) => {
      const ce = new Set(x.rows.map((i) => C.ce[i])).size, f = Math.min(...x.rows.map((i) => C.rep[i])), l = Math.max(...x.rows.map((i) => C.rep[i])), ti = group('de', x.rows).find((y) => y.k);
      const span = Math.floor(l / 1440) - Math.floor(f / 1440);
      return `<tr class="mt-clk ${j ? '' : 'mt-gfirst'} ${isSel('vk', x.k) ? 'mt-sel' : ''}" data-f="vk:${x.k}">${j ? '' : `<th class="mt-gl" rowspan="${n}">${head}</th>`}<th class="mt-r"><b>${esc(DI.vkey[x.k])}</b></th>
        <td class="mt-num mt-gsep">${num(x.n)}</td><td class="mt-num ${x.open ? 'mt-warnc' : ''}">${x.open || ''}</td><td class="mt-num">${num(ce)}</td>
        <td class="mt-num mt-gsep">${dateOf(BASE, f).slice(0, 5)}</td><td class="mt-num">${dateOf(BASE, l).slice(0, 5)}</td><td class="mt-num">${span ? num(span) : 'el mismo'}</td>
        <td class="mt-num mt-gsep">${avgOf(stats(x.rows))}</td><td class="mt-gsep mt-mut" data-tip="${ti ? esc(DI.problem[ti.k]) : ''}">${ti ? esc(DI.problem[ti.k]) : ''}</td></tr>`;
    };
    const parts = [['Con alguna abierta', shown.filter((x) => x.open)], ['Cerrados', shown.filter((x) => !x.open)]].filter(([, xs]) => xs.length);
    const body = parts.map(([head, xs]) => xs.map((x, j) => row(x, j, xs.length, head)).join('')).join('');
    const sum = (f) => shown.reduce((t, x) => t + f(x), 0);
    return `<div class="mt-tablewrap ${all ? 'mt-scroll' : ''}"><table class="mt-mx mt-tickets"><colgroup><col style="width:11%"><col style="width:15%"><col style="width:8%"><col style="width:7%"><col style="width:7%"><col style="width:7%"><col style="width:7%"><col style="width:7%"><col style="width:9%"><col></colgroup><thead>
      <tr class="mt-cgrp"><th colspan="2"></th><th colspan="3">Volumen</th><th colspan="3">Cuándo</th><th colspan="2">Resolución</th></tr>
      <tr><th>Estado</th><th>Ticket</th><th class="mt-num">Incidencias</th><th class="mt-num">Abiertas</th><th class="mt-num" data-tip="Centros distintos con alguna de esas incidencias.">Centros</th><th class="mt-num">Primera</th><th class="mt-num">Última</th><th class="mt-num" data-tip="Días entre la primera y la última incidencia.">Días</th><th class="mt-num">Media resol.</th><th>Problema más habitual</th></tr></thead>
      <tbody>${body}<tr class="mt-lead mt-lead-end"><th class="mt-r" colspan="2">${shown.length === known.length ? `Todos (${num(shown.length)} tickets)` : `Estos ${num(shown.length)} tickets`}</th><td class="mt-num mt-gsep">${num(sum((x) => x.n))}</td><td class="mt-num">${num(sum((x) => x.open)) || ''}</td><td colspan="6" class="mt-gsep"></td></tr></tbody></table></div>
      ${known.length > 15 ? `<button class="mt-more" data-exp="rs-known">${all ? 'Ver menos' : `Ver todos (${num(known.length)})`}</button>` : ''}`;
  };
  // --- Resolución, comparando personas: una persona frente a su equipo (ella incluida: model.js heads) o frente a
  // otra. Lo que tarda depende mucho del módulo, así que la tabla principal compara módulo a módulo y la media se pone
  // también frente a lo que tarda el equipo en esos mismos módulos. Sin lo que habla del tercero o del tipo de
  // problema (en qué se va el tiempo por tarjeta, escalados), que no dice cómo trabaja cada uno.
  const BETTER_MIN = 10;   // resueltas que necesita cada lado en una fila para marcar quién va mejor
  // Tabla de dos columnas por dato, una por lado (como Mes a mes en Entrada): los nombres en una leyenda encima, en la
  // cabecera solo el color. defs: [nombre, valor (x), formato (v, x), mejor, nota, cuántas cuentan para marcar (x; si no, base)]; rows: { label, attrs, cls, x:
  // [lado 0, lado 1] } o { head } (una fila de título que abre un bloque). En verde, el lado que va mejor, si los dos
  // tienen al menos BETTER_MIN resueltas.
  const pairTable = (first, defs, rows, base = (x) => x.resolved) => {
    const names = teamNames() || [name(0), name(1)];
    const cells = (r) => defs.map((d, c) => {
      const v = [0, 1].map((k) => d[1](r.x[k])), t = v.map((x, k) => (x == null ? '—' : d[2](x, r.x[k])));
      const ok = d[3] && r.x.every((x) => (d[5] || base)(x) >= BETTER_MIN) && v.every((x) => x != null) && t[0] !== t[1];
      const mark = ok ? ((d[3] === 'low') === (v[0] < v[1]) ? 0 : 1) : -1;
      return [0, 1].map((k) => `<td class="mt-num ${k ? 'mt-msep' : c ? 'mt-gsep' : ''} ${mark === k ? 'mt-better' : ''}">${t[k]}</td>`).join('');
    }).join('');
    const side = (k) => `<th class="mt-led-side" data-tip="${esc(names[k])}"><i class="mt-c${k}"></i></th>`;
    return `<div class="mt-legend">${[0, 1].map((k) => `<span><i class="mt-c${k}"></i>${esc(names[k])}</span>`).join('')}</div><div class="mt-tablewrap"><table class="mt-fixed mt-led2 mt-respair"><colgroup><col class="mt-first">${'<col>'.repeat(defs.length * 2)}</colgroup><thead>
      <tr><th rowspan="2">${first}</th>${defs.map((d) => `<th class="mt-num mt-led-m" colspan="2" ${d[4] ? `data-tip="${esc(d[4])}"` : ''}>${d[0]}</th>`).join('')}</tr>
      <tr>${defs.map(() => side(0) + side(1)).join('')}</tr></thead><tbody>
      ${rows.map((r) => (r.head ? `<tr class="mt-pair-h"><td colspan="${defs.length * 2 + 1}">${esc(r.head)}</td></tr>`
    : `<tr class="${r.cls || ''}" ${r.attrs || ''}><td class="mt-r" data-tip="${esc(r.label)}">${esc(r.label)}</td>${cells(r)}</tr>`)).join('')}</tbody></table></div>`;
  };
  // lo resuelto de cada lado en una lista, con el volumen (comparando con personas, una empresa por persona)
  const resPair = (lists) => {
    const H = [0, 1].map((k) => (m.perHead() ? m.heads(k).size || 1 : 1));
    return [0, 1].map((k) => { const s = stats(lists[k]); s.vol = s.resolved / H[k]; s.H = H[k]; return s; });
  };
  const RES_VOL = ['Resueltas', (s) => s.vol, (v, s) => (s.H > 1 ? dec(v) : num(v)), null, ''];
  const RES_PAIR = [
    ['Media', (s) => (s.resolved ? s.avg : null), dur, 'low', 'De la apertura a la resolución.'],
    ['En < 24 h', (s) => (s.resolved ? s.d1 : null), (v) => pct(v), 'high', 'De las resueltas, las resueltas en menos de 24 horas.'],
  ];
  const resModulesCmp = (A) => {
    const R = A.filter(solved), T = bySide(R), lead = S.sides[0].people || !S.sides[1].people ? 0 : 1, mine = new Set(T[lead]);
    const g = group('mo', R, true).filter((x) => x.k).map((x) => ({ ...x, own: x.rows.filter((i) => mine.has(i)).length }))
      .filter((x) => x.own).sort((a, b) => b.own - a.own || b.n - a.n);
    const top = g.slice(0, 15), restL = g.slice(15).flatMap((x) => x.rows);
    const split = (l) => { const set = new Set(l); return resPair(T.map((t) => t.filter((i) => set.has(i)))); };
    const rows = top.map((x) => ({ label: m.DIMS.mo.label(x.k), x: split(x.rows), cls: `mt-clk ${isSel('mo', x.k) ? 'mt-sel' : ''}`, attrs: `data-f="mo:${x.k}"` }));
    if (restL.length) rows.push({ label: `Resto (${g.length - 15})`, x: split(restL), cls: 'mt-mut' });
    rows.push({ label: 'Todas las resueltas', x: resPair(T), cls: 'mt-tot' });
    return pairTable('Módulo', [RES_VOL, ...RES_PAIR,
      ['1 a 7 días', (s) => (s.resolved ? s.d7 : null), (v) => pct(v), null, 'De las resueltas, las que tardaron de 1 a 7 días.'],
      ['7 a 15 días', (s) => (s.resolved ? s.d15 : null), (v) => pct(v), 'low', 'De las resueltas, las que tardaron de 7 a 15 días.'],
      ['Escaladas', (s) => (s.resolved ? s.vend : null), (v) => pct(v), null, 'De las resueltas, las que tienen ticket de tercero.']], rows);
  };
  const resMonthlyCmp = (A) => {
    const T = bySide(A.filter(solved)), month = (k) => resPair(T.map((l) => l.filter((i) => MONTH[i] === k)));
    const rows = monthsIn().map((k) => ({ label: `${MONTHS[k]}${k === LASTM ? '*' : ''}`, x: month(k), cls: `mt-clk ${isSel('month', k) ? 'mt-sel' : ''}`, attrs: `data-f="month:${k}"` }));
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
    const p = S.sides[0].people ? 0 : 1, t = 1 - p;
    if (!S.sides[p].people || S.sides[t].people) return null;
    const R = bySide(A.filter(solved)), mean = new Map(group('mo', R[t], true).map((x) => [x.k, stats(x.rows).avg]));
    const own = group('mo', R[p]), all = stats(R[t]).avg;
    const exp = own.length ? own.reduce((a, x) => a + x.n * (mean.get(x.k) ?? all), 0) / R[p].length : null;
    const out = [];
    out[p] = { n: R[p].length, v: R[p].length ? inDays(stats(R[p]).avg) : null }; out[t] = { n: R[t].length, v: inDays(exp) };
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
      card('Mes a mes', resMonthly(A), { span: 's12', sub: `${MONTH_NOTE} En ocre, lo que va un 15 % o más peor que el total (con al menos ${MIN_RES} resueltas). Clic en un mes para filtrar.` }),
      section('¿En qué se va el tiempo?'),
      card('Por prioridad, escalado y tarjeta', timeTable(A), { span: 's12', sub: 'Lo que pasa de media cada resuelta en cada estado, según el historial de cambios. Clic en una fila para filtrar.' }),
      section('¿Qué módulos tardan más?'),
      card('', scorecard('mo', [['Volumen', ['n']], ['Cuánto tarda', ['avg', 'd1', 'd7', 'd15', 'mx']], ['En qué se va', ['tq', 'tc', 'tv']], ['Escalado', ['vend']]],
        { id: 'rs-mo', rows: m.rows('mo').filter(solved), skip: noK, refLabel: 'Todos los módulos', title: 'Módulos', n: ['Resueltas', 'Issues resueltas y su parte del total.'] }), { span: 's12' }),
      section('¿Qué escalamos y a quién?'),
      card('', scorecard('vt', [['Volumen', ['n']], ['Cuánto tarda', ['avg', 'w7', 'tv']], ['Hoy', ['open']]],
        { id: 'rs-vt', rows: m.rows('vt').filter(escd), refLabel: 'Todo lo escalado', title: 'A quién escalamos', n: ['Escaladas', 'Issues con ticket de tercero y su parte de lo escalado.'], child: { dim: 'vp', top: 8, noun: 'proyectos Jira' } }), { span: 's12' }),
      card('Unas veces se escala y otras no', mixedEsc(), { span: 's12', sub: 'Problemas con al menos 20 resueltas que se escalan entre el 20 % y el 80 % de las veces, agrupados por su módulo principal: lo que tardan sin escalar y escalados. Clic en uno para filtrar.' }),
      card('Un mismo ticket, muchas incidencias', ticketTable(A), { span: 's12', sub: 'Tickets de tercero con 5 o más incidencias ligadas: arriba, los que aún tienen alguna abierta. Clic en uno para filtrar.' }));
  };

  // --- SLA y calidad. Tres preguntas: si empezamos a tiempo, si el trabajo queda bien hecho y si queda
  // bien registrado. Las tablas, como las de Resolución: una fila por corte con su total al final y, en ocre, lo que va
  // un 15 % o más peor que el total (con al menos MIN_RES issues). 
  const P1 = (v) => pct(v, 1);
  // un 15 % o más peor que el total y, en los %, al menos un punto (0,7 % frente a 0,5 % no se marca)
  const clearlyWorse = (v, w, better) => (better === 'low' ? v > w * 1.15 : v < w * 0.85) && (w > 1 || Math.abs(v - w) >= 0.01);
  const INI = m.DIMS.ini.label;
  // Cuándo pasan a En curso, por prioridad: cada fila repartida entre los tramos (suma el 100 %); los tramos que caen
  // dentro del plazo de esa prioridad, en verde. Clic en una celda filtra esa prioridad y ese tramo. Comparando, una
  // fila por lado (con personas, las issues de la empresa, por persona) y, en verde, quien empieza más a tiempo y antes
  // (con al menos BETTER_MIN issues cada uno).
  const startTable = (list) => {
    const cmp = CMP(), GROUPS = [['Pasan a En curso en…', [0, 1, 2, 3, 4, 5, 6]], [cmp ? 'Sin En curso' : 'Sin pasar a En curso', [7, 8]]];
    const P = cmp ? bySide(list).slice(0, 2) : [list], H = [0, 1].map((k) => (cmp && m.perHead() ? m.heads(k).size || 1 : 1));
    const line = (label, l, f, p, k) => {
      const c = new Array(9).fill(0);
      for (const i of l) c[m.DIMS.ini.get(i)]++;
      return { label, f, k, n: l.length, c, s: stats(l), lim: p == null ? -1 : START_LIMITS.indexOf(m.SLA[p]) };
    };
    const blocks = [...PRIOS.filter((p) => list.some((i) => C.pr[i] === p)).map((p) => P.map((l, k) => line(slaLabel(p), l.filter((i) => C.pr[i] === p), `pr:${p}`, p, k))),
      P.map((l, k) => line('Todas', l, null, null, k))];
    const share = (x, v) => v / (x.n || 1), max = Math.max(0.01, ...blocks.slice(0, -1).flat().flatMap((x) => x.c.map((v) => share(x, v))));
    const who = (x) => (cmp ? ` · ${name(x.k)}` : '');
    const cells = (x, last) => GROUPS.map(([, ks]) => ks.map((k, j) => {
      const sh = share(x, x.c[k]), a = x.c[k] && !last ? Math.round(6 + 94 * sh / max) : 0, ok = k <= x.lim;
      const f = x.f ? `data-f2="${x.f}|ini:${k}"` : `data-f="ini:${k}"`;
      return `<td class="${j ? '' : 'mt-gsep'} ${ok ? 'mt-insla' : ''} ${a > 50 ? 'mt-hot' : ''}" style="--mt-a:${a}%" ${f} data-tip="${esc(`${x.label}${who(x)} · ${INI(k)}${ok ? ' (dentro del SLA)' : ''}\n${num(x.c[k])} de ${num(x.n)} (${pct(sh, 1)})`)}">${x.c[k] ? pct(sh) : ''}</td>`;
    }).join('')).join('');
    // el lado que va mejor en una cifra (low: menos es mejor), comparando lo que se ve
    const better = (x, o, v, fmt, low) => cmp && o && x.n >= BETTER_MIN && o.n >= BETTER_MIN && v(x) != null && v(o) != null && fmt(x) !== fmt(o) && (low ? v(x) < v(o) : v(x) > v(o));
    const vol = (x, v) => (H[x.k] > 1 ? dec(v / H[x.k]) : num(v));
    const head = (x, n) => (cmp ? `${x.k ? '' : `<th class="mt-r ${x.f ? 'mt-clk' : ''}" rowspan="${n}" ${x.f ? `data-f="${x.f}"` : ''}>${x.label}</th>`}<th class="mt-r mt-ttr-who" data-tip="${esc(name(x.k))}"><i class="mt-sw mt-c${x.k}"></i>${esc(name(x.k))}</th>`
      : `<th class="mt-r ${x.f ? 'mt-clk' : ''}" ${x.f ? `data-f="${x.f}"` : ''}>${x.label}</th>`);
    const body = blocks.map((pair, b) => pair.map((x) => {
      const last = b === blocks.length - 1, o = pair[1 - x.k];
      return `<tr class="${last && !x.k ? 'mt-tot' : last ? 'mt-tot2' : ''} ${cmp && !x.k ? 'mt-gfirst' : ''}">${head(x, pair.length)}<td class="mt-total mt-num">${vol(x, x.n)}</td>
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
  // que va un 15 % o más peor que el total, con al menos MIN_RES issues.
  const qualityPivot = (A, blocks, groups, first = '', st = stats) => {
    const defs = groups.flatMap(([, d]) => d), firsts = new Set(groups.map(([, d]) => d[0])), tot = st(A);
    const worse = (s, d, v) => {
      const w = d[1](tot);
      return d[3] && v != null && w != null && s.n >= MIN_RES && clearlyWorse(v, w, d[3]);
    };
    const cells = (s, f, isTot) => defs.map((d) => {
      const v = d[1](s), bad = !isTot && worse(s, d, v), click = d[5] != null ? (f ? `data-f2="${f}|q:${d[5]}"` : `data-f="q:${d[5]}"`) : '';
      return `<td class="mt-num ${firsts.has(d) ? 'mt-gsep' : ''} ${bad ? 'mt-worse' : ''} ${click ? 'mt-clkc' : ''}" ${click} ${bad ? `data-tip="${esc(`Peor que el total: ${d[2](d[1](tot))}`)}"` : ''}>${v == null ? '—' : d[2](v)}</td>`;
    }).join('');
    const sel = (f) => !f.includes('|') && isSel(f.split(':')[0], +f.split(':')[1]);
    const body = blocks.map(([head, note, rowsB]) => rowsB.filter(([, t]) => A.some(t)).map(([label, t, f], j, arr) => `<tr class="${j ? '' : 'mt-gfirst'} ${f && sel(f) ? 'mt-sel' : ''}">
      ${j ? '' : `<th class="mt-gl" rowspan="${arr.length}">${head}${note ? `<small>${note}</small>` : ''}</th>`}<th class="mt-r ${f ? 'mt-clk' : ''}" ${f ? `data-f="${f}"` : ''}>${esc(label)}</th>${cells(st(A.filter(t)), f)}</tr>`).join('')).join('');
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
  // stats con el % dentro del SLA de cada prioridad (byP)
  const slaStats = (l) => { const s = stats(l); s.byP = []; s.nP = []; for (const p of PRIOS) { const t = stats(l.filter((i) => C.pr[i] === p)); s.byP[p] = t.sla; s.nP[p] = t.n; } return s; };
  // mes a mes: filas por mes de apertura, con las columnas que se le pasen ([grupo, defs] como en qualityPivot)
  const monthPivot = (A, groups, st = stats) => {
    const defs = groups.flatMap(([, d]) => d), firsts = new Set(groups.map(([, d]) => d[0])), tot = st(A);
    const cells = (s, isTot) => defs.map((d) => {
      const v = d[1](s), w = d[1](tot), bad = !isTot && d[3] && v != null && w != null && s.n >= MIN_RES && clearlyWorse(v, w, d[3]);
      return `<td class="mt-num ${firsts.has(d) ? 'mt-gsep' : ''} ${bad ? 'mt-worse' : ''}" ${bad ? `data-tip="${esc(`Peor que el total: ${d[2](w)}`)}"` : ''}>${v == null ? '—' : d[2](v)}</td>`;
    }).join('');
    const body = monthsIn().map((k) => `<tr class="mt-clk ${isSel('month', k) ? 'mt-sel' : ''}" data-f="month:${k}"><td>${MONTHS[k]}${k === LASTM ? '*' : ''}</td>${cells(st(A.filter((i) => MONTH[i] === k)))}</tr>`).join('');
    return `<div class="mt-res-month">${table('Mes de apertura', defs.map((d) => [d[0], 0, 0, 0, d[4]]), `${body}<tr class="mt-tot"><td>Total</td>${cells(tot, true)}</tr>`, groups.map(([g, d]) => [g, d.length]))}</div>`;
  };
  const PRIO_ROWS = () => PRIOS.map((p) => [nice(DI.prio[p]), (i) => C.pr[i] === p, `pr:${p}`]);
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
      card('Mes a mes', monthPivot(A, SLA_COLS, slaStats), { span: 's12', sub: `${MONTH_NOTE} En ocre, lo que va un 15 % o más peor que el total (con al menos ${MIN_RES} issues). Clic en un mes para filtrar.` }),
      card('Por turno y día de entrada', qualityPivot(A, [['Turno', 'Por la hora de apertura.', [0, 1, 2].map((k) => [m.DIMS.tu.label(k), (i) => m.DIMS.tu.get(i) === k, `tu:${k}`])],
        ['Días', '', [0, 1].map((k) => [m.DIMS.we.label(k), (i) => m.DIMS.we.get(i) === k, `we:${k}`])]],
        [['Volumen', [['Issues', (x) => x.n, num, null, '']]], ['Dentro del SLA', [...PRIOS.slice(0, 2).map((p) => [nice(DI.prio[p]), (x) => x.byP?.[p] ?? null, (v) => pct(v), 'high', slaLabel(p)]), ['Todas', (x) => x.sla, (v) => pct(v), 'high', 'Todas las prioridades.']]],
          ['Hasta En curso', [['Media', (x) => x.ip, dur, 'low', 'Media de la apertura al primer paso a En curso.'], ['En su turno', (x) => x.inShift, (v) => pct(v), 'high', 'De las empezadas, las que pasaron a En curso en el mismo turno en que entraron.']]]], '', slaStats),
        { span: 's12', sub: `Según cuándo se abrió. En ocre, lo que va un 15 % o más peor que el total (con al menos ${MIN_RES} issues). Clic en una fila para filtrar.` }),
      section('¿Queda bien hecho y bien registrado?'),
      card('Por prioridad y tarjeta', qualityPivot(A, [['Prioridad', '', PRIO_ROWS()], ['Tarjeta', 'Una PRIO cuenta también en su SGA o SISU.', CARD_ROWS()],
        ['Escalado', '', [['Sin escalar', (i) => !escd(i), 'es:0'], ['Escaladas', escd, 'es:1']]]], QUALITY_COLS),
        { span: 's12', sub: `Trabajo: lo que vuelve atrás. Registro: lo que falta o no se movió en Remedy. En ocre, lo que va un 15 % o más peor que el total (con al menos ${MIN_RES} issues). Clic en una cifra para ver esas issues.` }),
      card('Mes a mes', monthPivot(A, QUALITY_COLS), { span: 's12', sub: `${MONTH_NOTE} En ocre, lo que va un 15 % o más peor que el total (con al menos ${MIN_RES} issues). Clic en un mes para filtrar.` }),
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
  // si se empezó dentro del SLA (1), fuera (0) o no cuenta (null): lo mismo que stats (sla)
  const slaHit = (i) => {
    const l = m.SLA[C.pr[i]];
    if (l < 0) return null;
    if (C.ip[i] >= 0) return C.ip[i] <= l ? 1 : 0;
    return OPEN[i] && m.SNAP - C.rep[i] > l ? 0 : null;
  };
  // lo que cumpliría ref con el trabajo de work: su % dentro del SLA en cada prioridad y módulo (con menos de 5, el de
  // la prioridad), con el peso que tiene cada uno en work
  const slaWith = (work, ref) => {
    const cell = new Map(), prio = new Map(), add = (mp, k, v) => { const x = mp.get(k) || [0, 0]; x[0] += v; x[1]++; mp.set(k, x); };
    for (const i of ref) { const v = slaHit(i); if (v != null) { add(cell, `${C.pr[i]}:${C.mo[i]}`, v); add(prio, C.pr[i], v); } }
    let t = 0, n = 0;
    for (const i of work) {
      if (slaHit(i) == null) continue;
      const c = cell.get(`${C.pr[i]}:${C.mo[i]}`), x = c && c[1] >= 5 ? c : prio.get(C.pr[i]);
      if (x) { t += x[0] / x[1]; n++; }
    }
    return n ? t / n : null;
  };
  // «con el mismo trabajo»: el primer lado (o la persona, frente a su empresa) frente a lo que cumpliría el otro con su trabajo
  const sameWork = (A) => {
    const pp = m.perHead();
    const p = pp ? (S.sides[0].people ? 0 : 1) : 0, t = 1 - p;
    if (pp && (!S.sides[p].people || S.sides[t].people)) return '';
    const T = bySide(A), v = [], names = [];
    v[p] = { n: T[p].length, v: stats(T[p]).sla }; v[t] = { n: T[t].length, v: slaWith(T[p], T[t]) };
    names[p] = name(p); names[t] = `${name(t)}, con ese trabajo`;
    return kpiCo('Dentro del SLA, con el mismo trabajo', v, (s) => opt(pct)(s.v), { val: (s) => s.v, better: 'high', names,
      note: `Lo que cumpliría ${name(t)} con el trabajo de ${name(p)}: su % dentro del SLA en cada prioridad y módulo, con el peso que tiene cada uno en lo de ${name(p)}.` });
  };
  // stats de cada lado de una lista, con las issues por persona (comparando con personas, una empresa entre su equipo)
  const slaPair = (lists) => {
    const H = [0, 1].map((k) => (m.perHead() ? m.heads(k).size || 1 : 1));
    return [0, 1].map((k) => { const s = slaStats(lists[k]); s.vol = s.n / H[k]; s.H = H[k]; return s; });
  };
  const PAIR_VOL = ['Issues', (s) => s.vol, (v, s) => (s.H > 1 ? dec(v) : num(v)), null, ''];
  const PAIR_SLA = [['Dentro del SLA (altas)', (s) => s.byP[PRIOS[1]] ?? null, (v) => pct(v), 'high', slaLabel(PRIOS[1]), (s) => s.nP[PRIOS[1]]],
    ['Dentro del SLA (todas)', (s) => s.sla, (v) => pct(v), 'high', 'Todas las prioridades.'],
    ['Media hasta En curso', (s) => s.ip, dur, 'low', 'Media de la apertura al primer paso a En curso.']];
  const qualityDefs = (co) => QUALITY_COLS.flatMap(([, d]) => d).filter((d) => !co || d[5] !== 5).map((d) => d.slice(0, 5));
  // filas de una tabla por lado: [nombre, prueba, filtro]; la última, el total
  const pairRows = (A, defs, total = 'Todas') => {
    const T = bySide(A);
    return [...defs.filter(([, t]) => A.some(t)).map(([label, t, f]) => ({ label, x: slaPair(T.map((l) => l.filter(t))), cls: `mt-clk ${isSel(...f.split(':').map((x, n) => (n ? +x : x))) ? 'mt-sel' : ''}`, attrs: `data-f="${f}"` })),
      { label: total, x: slaPair(T), cls: 'mt-tot' }];
  };
  const BY_N = (x) => x.n;
  const slaCmp = (A) => {
    const pp = m.perHead(), co = !pp, T = bySide(A), ST = T.map(slaStats), names = teamNames();
    const fig = (label, f, fmt, better, note) => kpiCo(label, ST.map((s) => ({ n: s.n, v: f(s) })), (s) => (s.v == null ? '—' : fmt(s.v)), { val: (s) => s.v, better, note });
    const team = pp && S.sides.some((x) => !x.people), perNote = team ? ' Las issues de la empresa, por persona de su equipo.' : '';
    const greenNote = `En verde, quien va mejor (con al menos ${BETTER_MIN} issues cada uno).`;
    const months = monthsIn().map((k) => [`${MONTHS[k]}${k === LASTM ? '*' : ''}`, (i) => MONTH[i] === k, `month:${k}`]);
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
    const common = () => {
      const g = group('mo', A, true).filter((x) => x.k).map((x) => ({ ...x, both: T.slice(0, 2).every((l) => l.filter((i) => C.mo[i] === x.k).length >= BETTER_MIN) })).filter((x) => x.both).slice(0, 15);
      return g.map((x) => [m.DIMS.mo.label(x.k), (i) => C.mo[i] === x.k, `mo:${x.k}`]);
    };
    return grid(ask('sla'),
      kpis(...kp.filter(Boolean)),
      section('¿Empezamos a tiempo?'),
      card('Cuándo pasan a En curso', startTable(m.rows('ini')), { span: 's12', sub: `Por prioridad, una fila por cada uno: el SLA de inicio y cómo se reparte (cada fila suma el 100 %) lo que tarda en pasar a En curso; en verde, los tramos dentro del plazo. ${greenNote}${perNote}${pp ? ' Cuenta a la persona responsable actual de la issue.' : ''} Clic en una celda para filtrar.` }),
      card('Mes a mes', pairTable('Mes de apertura', [PAIR_VOL, ...PAIR_SLA, ...(pp ? qualityDefs(false).filter((d) => ['Cerradas sin En curso', 'Escaladas sin Pendiente'].includes(d[0])) : [])], pairRows(A, months, 'Total'), BY_N),
        { span: 's12', sub: `${MONTH_NOTE} ${greenNote}${perNote} Clic en un mes para filtrar.` }),
      co ? card('Por turno y día de entrada', pairTable('Cuándo entra', [PAIR_VOL, ['Dentro del SLA (críticas)', (s) => s.byP[PRIOS[0]] ?? null, (v) => pct(v), 'high', slaLabel(PRIOS[0]), (s) => s.nP[PRIOS[0]]], ...PAIR_SLA,
        ['En su turno', (s) => s.inShift, (v) => pct(v), 'high', 'De las empezadas, las que pasaron a En curso en el mismo turno en que entraron.']],
        pairRows(A, [...[0, 1, 2].map((k) => [m.DIMS.tu.label(k), (i) => m.DIMS.tu.get(i) === k, `tu:${k}`]), ...[0, 1].map((k) => [m.DIMS.we.label(k), (i) => m.DIMS.we.get(i) === k, `we:${k}`])]), BY_N),
        { span: 's12', sub: `Según cuándo se abrió. ${greenNote} Clic en una fila para filtrar.` }) : '',
      section('¿Queda bien hecho y bien registrado?'),
      card(co ? 'Por prioridad y tarjeta' : 'Por prioridad', pairTable(co ? 'Prioridad y tarjeta' : 'Prioridad', qualityDefs(co),
        pairRows(A, [...PRIO_ROWS(), ...(co ? CARD_ROWS() : [])]), BY_N),
        { span: 's12', sub: `Trabajo: reabiertas y devueltas a cola. Registro: lo que falta o no se movió en Remedy.${co ? ' Sin «Título sin descripción»: se detecta con el diccionario de problemas de Indra, hecho con sus títulos.' : ''} ${greenNote} Clic en una fila para filtrar.` }),
      co ? section('¿Dónde?') : '',
      co ? card('Módulo a módulo', pairTable('Módulo', [PAIR_VOL, ...PAIR_SLA, qualityDefs(true)[0], qualityDefs(true)[2]], pairRows(A, common()), BY_N),
        { span: 's12', sub: `Los 15 módulos con más issues de los que tienen al menos ${BETTER_MIN} cada uno. ${greenNote} Clic en un módulo para filtrar.` }) : '');
  };

  // --- IA (propuesta). Cuánto la usamos, dónde, cómo sale (lo que tarda frente al mismo problema sin IA), quién la
  // usa y qué se repite. Por las marcas de IA de cada issue (model.js, dimensión ia).
  const IA_OK = 0, IA_FAIL = 1, IA_NONE = 3, iaOf = (i) => m.DIMS.ia.get(i), withIa = (i) => iaOf(i) !== IA_NONE;
  // las cifras de IA de una lista: con IA, resueltas con la IA (IA_SOLVED), revisadas OK, con fallo y sin revisar (sobre
  // las de IA), y cuántas personas tienen issues y cuántas alguna con IA
  const iaStats = (l) => {
    let ia = 0, solved = 0, ok = 0, fail = 0;
    const users = new Set(), people = new Set();
    for (const i of l) {
      if (C.as[i]) people.add(C.as[i]);
      const k = iaOf(i); if (k === IA_NONE) continue;
      ia++; if (C.as[i]) users.add(C.as[i]); if (C.fl[i] & 32) solved++; if (k === IA_OK) ok++; else if (k === IA_FAIL) fail++;
    }
    const of = (v) => (ia ? v / ia : null);
    return { n: l.length, ia, solved, ok, fail, unrev: ia - ok - fail, users: users.size, people: people.size,
      share: l.length ? ia / l.length : null, okShare: of(ok), failShare: of(fail), unrevShare: of(ia - ok - fail) };
  };
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
    const by = group(dim, A.filter((i) => withIa(i) && m.DIMS[dim].get(i))), n = by.reduce((t, x) => t + x.n, 0);
    const sh = all ? by.length / all : 0;
    const rows = by.slice(0, 3).map((x) => {
      const l = m.DIMS[dim].label(x.k), p = x.n / n;
      return `<div class="mt-iarank" data-tip="${esc(`${l}\n${num(x.n)} ${x.n === 1 ? 'issue' : 'issues'} con IA: ${pct(p, 1)} de todas las de IA${tip ? `\n${tip(x)}` : ''}`)}"><span>${esc(l)}</span><b>${num(x.n)}</b><em>${pct(p)}</em>
        <span class="mt-bt"><i class="mt-ia0" style="width:${(p * 100).toFixed(1)}%"></i></span></div>`;
    }).join('');
    return `<div class="mt-iabox"><div class="mt-kpi-l">${label}</div><div class="mt-kpi-v">${num(by.length)} <small>de ${num(all)} ${noun}</small></div>
      <div class="mt-iause"><span class="mt-bt"><i class="mt-ia0" style="width:${(sh * 100).toFixed(1)}%"></i></span><em>${pct(sh)} ${of}</em></div>
      ${by.length ? `<div class="mt-iarank-h"></div>${rows}` : '<div class="mt-kpi-s"><span>Ninguna issue con IA</span></div>'}</div>`;
  };
  const iaHead = (A, s) => {
    const full = monthsIn().filter((k) => k !== LASTM), last = full.slice(-2).reverse();
    const monthShare = (k) => iaStats(A.filter((i) => MONTH[i] === k));
    const first = monthsIn().find((k) => A.some((i) => MONTH[i] === k && withIa(i)));
    const use = iaBox('Con IA, de lo recibido', s.share == null ? '—' : pct(s.share, 1), [['Issues con IA', num(s.ia)],
      ...last.map((k, j) => [`${j ? 'Mes anterior' : 'Último mes completo'} (${MONTHS[k]})`, opt((v) => pct(v, 1))(monthShare(k).share)]),
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
  // < 24 h y reabiertas). En ocre, lo que va un 15 % o más peor que el total, con al menos MIN_RES issues con IA. Los
  // meses sin IA, solo con lo recibido.
  const iaMonthly = (A) => {
    const part = (l) => ({ s: iaStats(l), r: stats(l.filter(withIa)) });
    const tot = part(A), N = tot.s.n || 1;
    const td = (v, fmt, bad = false, w = null) => `<td class="mt-num ${bad ? 'mt-worse' : ''}" ${bad ? `data-tip="${esc(`Peor que el total: ${fmt(w)}`)}"` : ''}>${v == null ? '' : fmt(v)}</td>`;
    const cells = (x, isTot) => {
      const { s, r } = x, T = tot.s, R = tot.r, on = s.ia > 0, res = r.resolved > 0;
      const bad = (v, w, b) => !isTot && s.ia >= MIN_RES && v != null && w != null && clearlyWorse(v, w, b);
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
    const body = monthsIn().map((k) => `<tr class="mt-clk ${isSel('month', k) ? 'mt-sel' : ''}" data-f="month:${k}"><th class="mt-r">${MONTHS[k]}${k === LASTM ? '*' : ''}</th>${cells(part(A.filter((i) => MONTH[i] === k)))}</tr>`).join('');
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
    return grid(ask('ia2'), note,
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
        { span: 's12', sub: `Lo resuelto, según sus marcas de IA. En ocre, lo que va un 15 % o más peor que el total (con al menos ${MIN_RES} issues). Clic en una fila para filtrar.` }),
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

  // --- IA, comparando. Entre empresas, cuánto usa la IA cada servicio, cómo le sale, dónde y cuánta gente la usa;
  // entre personas (una frente a su equipo, ella incluida, o frente a otra), lo mismo de cada una, módulo a módulo en lo
  // suyo. Más uso, más revisadas OK y menos fallos, en verde; lo que no tiene un mejor, sin color. Entre empresas no se
  // comparan tiempos de resolución (como en Resolución: cada una recibe trabajo distinto).
  // las cifras de IA de cada lado de una lista, con el volumen por persona (comparando con personas, la empresa entre su equipo)
  const iaPair = (lists) => {
    const H = [0, 1].map((k) => (m.perHead() ? m.heads(k).size || 1 : 1));
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
  };
  const iaRows = (A, defs, total = 'Total') => {
    const T = bySide(A);
    return [...defs.filter(([, t]) => A.some(t)).map(([label, t, f]) => ({ label, x: iaPair(T.map((l) => l.filter(t))), cls: `mt-clk ${f && isSel(...f.split(':').map((x, n) => (n ? +x : x))) ? 'mt-sel' : ''}`, attrs: f ? `data-f="${f}"` : '' })),
      { label: total, x: iaPair(T), cls: 'mt-tot' }];
  };
  // En qué trabajo la usamos: bloques de cortes (prioridad, tipo de servicio, escalado, tarjeta, turno y día de entrada),
  // cada uno con su título, y el total al final
  const iaWorkRows = (A) => {
    const sv = group('sv', A).filter((x) => x.k != null && DI.svc[x.k]).slice(0, 4).map((x) => [m.DIMS.sv.label(x.k), (i) => C.sv[i] === x.k, `sv:${x.k}`]);
    const blocks = [['Prioridad', PRIOS.map((p) => [nice(DI.prio[p]), (i) => C.pr[i] === p, `pr:${p}`])], ['Tipo de servicio', sv],
      ['Escalado', [['Sin escalar', (i) => !escd(i), 'es:0'], ['Escaladas', escd, 'es:1']]], ['Tarjeta', CARDS.map((c, k) => [c, (i) => cardsOf(i).includes(k), `tj:${k}`])],
      ['Turno de entrada', [0, 1, 2].map((k) => [m.DIMS.tu.label(k), (i) => m.DIMS.tu.get(i) === k, `tu:${k}`])], ['Día de entrada', [0, 1].map((k) => [m.DIMS.we.label(k), (i) => m.DIMS.we.get(i) === k, `we:${k}`])]];
    const T = bySide(A), all = iaPair(T);
    const out = [];
    for (const [head, defs] of blocks) {
      const r = defs.filter(([, t]) => A.some(t));
      if (!r.length) continue;
      out.push({ head });
      for (const [label, t, f] of r) {
        const x = iaPair(T.map((l) => l.filter(t))); x.forEach((y, k) => { y.part = all[k].ia ? y.ia / all[k].ia : null; });
        out.push({ label, x, cls: `mt-clk ${isSel(...f.split(':').map((v, n) => (n ? +v : v))) ? 'mt-sel' : ''}`, attrs: `data-f="${f}"` });
      }
    }
    all.forEach((y) => { y.part = y.ia ? 1 : null; });
    out.push({ label: 'Todo', x: all, cls: 'mt-tot' });
    return out;
  };
  // personas de cada lado según qué parte de sus issues lleva IA (solo entre empresas)
  const IA_USE = [['Sin IA', (s) => !s.ia], ['Menos del 5 %', (s) => s.ia && s.share < 0.05], ['Del 5 al 15 %', (s) => s.share >= 0.05 && s.share < 0.15], ['El 15 % o más', (s) => s.share >= 0.15]];
  const iaUseTable = (A) => {
    const P = bySide(A).slice(0, 2).map((l) => group('as', l.filter((i) => C.as[i]), true).filter((x) => x.k).map((x) => iaStats(x.rows)));
    const row = (label, t) => ({ label, x: P.map((ps) => ({ n: ps.length, c: ps.filter(t).length, ia: ps.filter(t).reduce((a, s) => a + s.ia, 0), all: ps.reduce((a, s) => a + s.ia, 0) })) });
    return pairTable('Parte de sus issues con IA', [['Personas', (x) => x.c, num, null, 'Personas con issues en el periodo.'],
      ['% de la gente', (x) => (x.n ? x.c / x.n : null), (v) => pct(v), null, 'De las personas con issues, las de este tramo.'],
      ['% de las de IA', (x) => (x.all ? x.ia / x.all : null), (v) => pct(v), null, 'De todas las issues con IA, las que llevan las personas de este tramo.']],
      [...IA_USE.map(([l, t]) => row(l, t)), { ...row('Todas', () => true), cls: 'mt-tot' }], (x) => x.n);
  };
  const iaCmp = (A) => {
    const pp = m.perHead(), co = !pp, T = bySide(A), ST = iaPair(T), names = teamNames(), team = pp && S.sides.some((x) => !x.people);
    // el color, solo si los dos lados tienen al menos BETTER_MIN en lo que cuenta esa cifra
    const fig = (label, f, fmt, better, note, n = (s) => s.n) => kpiCo(label, ST.map((s) => ({ n: n(s), v: f(s) })), (x) => (x.v == null ? '—' : fmt(x.v)),
      { val: (x) => x.v, better: ST.every((s) => n(s) >= BETTER_MIN) ? better : null, note, names });
    const P = (v) => pct(v), users = (s) => (s.people ? s.users / s.people : null);
    const mods = T.map((l) => new Set(l.filter(withIa).map((i) => C.mo[i]).filter(Boolean)).size);
    const greenNote = `En verde, quien va mejor (con al menos ${BETTER_MIN} issues cada uno; en cómo sale, ${BETTER_MIN} con IA).`, perNote = team ? ' Lo de la empresa, por persona de su equipo.' : '';
    const months = monthsIn().map((k) => [`${MONTHS[k]}${k === LASTM ? '*' : ''}`, (i) => MONTH[i] === k, `month:${k}`]);
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
      fig('Media con IA, en días', (s) => (s.avg == null ? null : s.avg / 1440), dec, 'low', 'De las resueltas con IA, de la apertura a la resolución.', (s) => s.r.resolved),
      co ? fig('Personas que la usan', users, P, 'high', 'De las personas con issues en el periodo, las que tienen alguna con IA.', (s) => s.people) : '',
      co ? kpiCo('Módulos donde se usa', mods.map((v) => ({ n: 1, v })), (x) => num(x.v), { val: (x) => x.v, note: 'Módulos con alguna issue con IA.' }) : ''];
    return grid(ask('ia2'),
      kpis(...kp.filter(Boolean)),
      section('¿Cuánto la usamos?'),
      card('Mes a mes', pairTable('Mes de apertura', [D.vol, D.ia, D.share, D.ok, D.fail, D.avg], iaRows(A, months), IA_N),
        { span: 's12', sub: `${MONTH_NOTE} ${greenNote}${perNote} Clic en un mes para filtrar.` }),
      section('¿En qué la usamos?'),
      card('En qué trabajo', pairTable('Corte', [D.vol, D.ia, D.share, ['% de las de IA', (x) => x.part, (v) => pct(v), null, 'De todas las issues con IA de cada uno, las de esta fila.'], D.ok, D.fail],
        iaWorkRows(A), IA_N), { span: 's12', sub: `Lo de cada uno por prioridad, tipo de servicio, escalado, tarjeta y cuándo entra: cuánto lleva IA y cómo sale. «% de las de IA»: dónde se reparte la IA de cada uno (cada bloque suma el 100 %, salvo tarjeta: una PRIO cuenta también en su SGA o SISU). ${greenNote}${perNote} Clic en una fila para filtrar.` }),
      pp && mr.length ? card('Módulo a módulo', pairTable('Módulo', [D.vol, D.ia, D.share, D.ok, D.fail, D.avg], iaRows(A, mr, 'Todo'), IA_N),
        { span: 's12', sub: `Los 15 módulos con más issues de ${esc(name(lead))}; cada uno, frente al otro en el mismo módulo. ${greenNote}${perNote} Clic en un módulo para filtrar.` }) : '',
      pp ? section('¿Cómo sale?') : '',
      pp ? card('Según cómo sale', pairTable('Uso de IA', [['Resueltas', (x) => x.r.resolved / x.H, perVol, null, ''], ['Media', (x) => (x.r.resolved ? x.r.avg : null), dur, 'low', 'De la apertura a la resolución.'],
        ['En < 24 h', (x) => (x.r.resolved ? x.r.d1 : null), (v) => pct(v), 'high', ''], ['Reabiertas', (x) => (x.r.n ? x.r.reop : null), (v) => pct(v, 1), 'low', 'Volvieron de Resuelta a abierta.'],
        ['Escaladas', (x) => (x.r.n ? x.r.vend : null), (v) => pct(v), null, 'Con ticket de tercero.']],
        [...[0, 1, 2, 3].map((k) => { const t = (i) => iaOf(i) === k, P2 = T.slice(0, 2).map((l) => stats(l.filter(t).filter(solved))); return { label: m.DIMS.ia.label(k), x: P2.map((r, j) => ({ r, H: ST[j].H })), cls: 'mt-clk', attrs: `data-f="ia:${k}"` }; }),
          { label: 'Todas las resueltas', x: T.slice(0, 2).map((l, j) => ({ r: stats(l.filter(solved)), H: ST[j].H })), cls: 'mt-tot' }], (x) => x.r.resolved),
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
      const vsPrev = monthVsPrev(), closedIn = closedInPeriod();
      return grid(ask('resumen'),
        `<div class="mt-answers">${[
          answer(['entrada', 'backlog'], [
            fig('Recibidas', ST, (s) => num(s.n), sv('n')),
            fig('Entran al día', ST.map((s) => ({ n: s.n, v: s.n / d })), (s) => dec(s.v), sv('v'), null, 'Recibidas entre los días naturales del periodo.'),
            fig('Cerramos al día', closedIn.map((l, k) => ({ n: l.length + ST[k].n, v: l.length / d })), (s) => dec(s.v), sv('v'), 'high', 'Todo lo cerrado en el periodo, entre sus días naturales.'),
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
            fig('Empezadas dentro del SLA', ST, slaPct, sv('sla'), 'high', 'Pasan a En curso dentro del plazo de su prioridad: crítica 15 min, alta 45 min, media 2 h, baja 8 h.'),
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
      const L = m.today(), op = L.filter((i) => OPEN[i]), T = bySide(op), cos = CO(), now = m.SNAP;
      const people = S.sides.some((x) => x?.people), one = S.sides.some((x) => x?.people?.size === 1) && !CMP();
      const CRITICAL = DI.prio.indexOf('CRITICAL'), lm = C.lm, days = (min) => Math.floor(min / 1440);
      const idle = (i) => (lm ? now - lm[i] : null);   // sin ningún cambio desde hace (minutos); null con datos de antes de guardar el último cambio
      const IDLE = 5 * 1440;
      const late = (i) => { const l = m.SLA[C.pr[i]]; return C.ip[i] < 0 && l >= 0 && now - C.rep[i] > l; };
      const waits = (i) => { const k = m.DIMS.sit.get(i); return k === 3 ? 'v' : k === 4 ? 'c' : ''; };
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
        const more = rowsIn.length > top ? `<button class="mt-more" data-exp="${id}">${all ? 'Ver menos' : `Ver todas (${num(rowsIn.length)})`}</button>` : '';
        return rowsIn.length ? `<div class="mt-tablewrap ${all ? 'mt-scroll' : ''}"><table class="mt-list"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>${more}` : '<p class="mt-mut mt-small">Ninguna.</p>';
      };
      const byAge = (a, b) => C.rep[a] - C.rep[b];
      const crit3 = L.filter((i) => C.pr[i] === CRITICAL && now - C.rep[i] <= 3 * 1440).sort((a, b) => C.rep[b] - C.rep[a]);
      const prio = op.filter((i) => cardsOf(i).includes(2)).sort(byAge);
      const lateL = op.filter(late).sort(byAge);
      const vendor = op.filter((i) => waits(i) === 'v').sort(byAge);
      const client = op.filter((i) => waits(i) === 'c').sort(byAge);
      const stale = lm ? op.filter((i) => idle(i) > IDLE).sort((a, b) => lm[a] - lm[b]) : [];
      const orphan = people ? [] : m.today(true).filter((i) => OPEN[i] && !C.as[i] && cardsOf(i).some((k) => k < 3)).sort(byAge);
      // quién tiene qué: lo abierto de cada persona
      const PCOLS = [['Abiertas', () => true], ['Asignada', (i) => DI.status[C.st[i]] === 'ASSIGNED'], ['En curso', (i) => DI.status[C.st[i]] === 'IN_PROGRESS'],
        ['Pendiente', (i) => DI.status[C.st[i]] === 'PENDING'], ['Críticas', (i) => C.pr[i] === CRITICAL], ['PRIO', (i) => cardsOf(i).includes(2)],
        ['Sin iniciar, fuera de plazo', late], ['Esperando a un tercero', (i) => waits(i) === 'v'], ['Esperando al cliente', (i) => waits(i) === 'c'],
        ['Más de 15 días', (i) => now - C.rep[i] > 15 * 1440], ...(lm ? [['Sin cambios en 5 días', (i) => idle(i) > IDLE]] : [])];
      const who = group('as', op, true).filter((x) => x.k).map((x) => ({ k: x.k, v: PCOLS.map(([, t]) => x.rows.filter(t).length) }));
      const tot = PCOLS.map(([, t]) => op.filter(t).length);
      const whoTable = `<div class="mt-tablewrap"><table><thead><tr><th>Persona</th>${PCOLS.map(([l]) => `<th class="mt-num">${l}</th>`).join('')}</tr></thead><tbody>${who.map((r) => `<tr class="mt-clk ${isSel('as', r.k) ? 'mt-sel' : ''}" data-f="as:${r.k}"><td>${CMP() ? `<i class="mt-sw mt-c${m.SIDE[op.find((i) => C.as[i] === r.k)]}"></i>` : ''}${esc(m.DIMS.as.label(r.k))}</td>${r.v.map((v) => `<td class="mt-num">${v || ''}</td>`).join('')}</tr>`).join('')}
        <tr class="mt-grp"><td>Total</td>${tot.map((v) => `<td class="mt-num">${num(v)}</td>`).join('')}</tr></tbody></table></div>`;
      const sub = (t) => `${t} Pasa el ratón por un título para leerlo entero.`;
      return grid(ask('hoy'),
        kpis(kpiCo('Abiertas', count(() => true), (s) => num(s.v), { val: (s) => s.v }),
          kpiCo('Críticas abiertas', count((i) => C.pr[i] === CRITICAL), (s) => num(s.v), { val: (s) => s.v }),
          kpiCo('PRIO abiertas', count((i) => cardsOf(i).includes(2)), (s) => num(s.v), { val: (s) => s.v }),
          kpiCo('Sin iniciar, fuera de plazo', count(late), (s) => num(s.v), { val: (s) => s.v, better: 'low' }),
          kpiCo('Esperando a un tercero', count((i) => waits(i) === 'v'), (s) => num(s.v), { val: (s) => s.v }),
          kpiCo('Esperando al cliente', count((i) => waits(i) === 'c'), (s) => num(s.v), { val: (s) => s.v }),
          lm ? kpiCo('Sin cambios en 5 días', count((i) => idle(i) > IDLE), (s) => num(s.v), { val: (s) => s.v, better: 'low' }) : '',
          people ? '' : kpi('Sin asignar', num(orphan.length), 'SGA, SISU o PRIO, sin nadie', 'mt-t2')),
        lm ? '' : '<p class="mt-note">Para ver lo que lleva días sin cambios, carga de nuevo el CSV: los datos guardados son de antes de que se leyera el último cambio de cada issue.</p>',
        card('Quién tiene qué', whoTable, { span: 's12', sub: 'Lo abierto de cada persona. Clic en una persona para ver todas las métricas solo de ella.' }),
        card('Críticas de los últimos 3 días', list('hoy-crit', crit3), { span: 's12', sub: sub('Todas las críticas abiertas en los 3 últimos días, resueltas o no, de la más reciente a la más antigua.') }),
        card('PRIO abiertas', list('hoy-prio', prio), { span: 's12', sub: sub('Priorizadas por negocio, de la más antigua a la más reciente.') }),
        card('Sin iniciar y fuera de plazo', list('hoy-late', lateL), { span: 's12', sub: sub('Abiertas que nunca han pasado a En curso y ya superan el plazo de su prioridad.') }),
        ...(people ? [] : [card('Sin asignar', list('hoy-orphan', orphan), { span: 's12', sub: sub('En SGA, SISU o PRIO, sin responsable.') })]),
        card('Sin cambios desde hace más de 5 días', lm ? list('hoy-stale', stale) : '<p class="mt-mut mt-small">Carga de nuevo el CSV para verlo.</p>', { span: 's12', sub: sub('Abiertas en las que nadie ha tocado nada en 5 días, de la más parada a la menos.') }),
        card('Esperando a un tercero', list('hoy-vendor', vendor), { span: 's12', sub: sub('Pendientes de una acción de un tercero (desarrollo, proveedor…), con su ticket.') }),
        card('Esperando al cliente', list('hoy-client', client), { span: 's12', sub: sub('Pendientes de una acción o de una respuesta del centro o del cliente.') }),
        card('Todo lo abierto', list('hoy-all', op.slice().sort(byAge), { top: 15 }), { span: 's12', sub: sub('La sábana del backlog: todo lo abierto, de lo más antiguo a lo más reciente.') }));
    },

    // ¿Qué tenemos? Lo que entra, cómo se va cerrando y lo que queda pendiente, con tablas que cuadran:
    // cada una con su total, y los totales iguales a las cifras de arriba.
    entrada(A) {
      const T = bySide(A), ST = T.map(stats), d = days() || 1, sharePct = (s) => opt(pct)(s.v);
      const closedIn = closedInPeriod(), each = m.perHead() ? ' por persona' : '';
      // lo que entra, mes a mes, por prioridad, tipo de servicio, tarjeta y tipo de operación
      const months = monthsIn().map((k) => ({ label: MONTHS[k] + (k === LASTM ? '*' : ''), test: (i) => MONTH[i] === k, f: `month:${k}` }));
      const inRows = [
        { head: 'Prioridad' }, ...PRIOS.map((p) => ({ label: nice(DI.prio[p]), test: (i) => C.pr[i] === p, f: `pr:${p}` })),
        { head: 'Tipo de servicio' }, ...topRows('sv', A, 4),
        { head: 'Tarjeta', note: 'Una PRIO cuenta también en su SGA o SISU.' }, ...CARDS.map((c, k) => ({ label: c, test: (i) => cardsOf(i).includes(k), f: `tj:${k}` })),
        { head: 'Tipo de operación' }, ...topRows('op', A, 7),
      ];
      return grid(ask('entrada'),
        kpis(kpiCo(`Recibidas${each}`, volume(T), (s) => num(Math.round(s.v)), { val: (s) => Math.round(s.v), note: `abiertas en el periodo${headsNote()}`, names: teamNames() }),
          kpiCo(`Entran al día${each}`, volume(T, d), (s) => dec(s.v), { val: (s) => s.v, note: `de media, en días naturales${headsNote()}`, names: teamNames() }),
          kpiCo(`Cerramos al día${each}`, volume(closedIn, d), (s) => dec(s.v), { val: (s) => s.v, note: `de media, todo lo cerrado en el periodo${headsNote()}`, names: teamNames() }),
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
      const CRITICAL = DI.prio.indexOf('CRITICAL');
      // lo pendiente: su situación y, aparte, lo que hay que vigilar
      // solo las situaciones que hay (una sin ninguna issue no aporta y quita sitio)
      const SIT = SITUATION.filter((x) => op.some(x.test));
      const pend = { label: 'Pendientes', test: inA };
      const stateRows = [
        { head: 'Situación', note: 'Suman las pendientes.' },
        ...SIT.map((s) => ({ ...s, test: (i) => inA(i) && s.test(i) })),
        { head: 'A vigilar', note: 'Dentro de las pendientes.' },
        { label: 'Fuera de plazo', tip: 'Sin iniciar: nunca han pasado a En curso y ya superan su SLA.', test: (i) => inA(i) && late(i), f: 'sl:4' },
        { label: 'Escaladas', tip: 'Con ticket de tercero.', test: (i) => inA(i) && C.vt[i] > 0, f: 'es:1' },
        { label: 'PRIO', test: (i) => inA(i) && cardsOf(i).includes(2), f: 'tj:2' },
        { label: 'Críticas', test: (i) => inA(i) && C.pr[i] === CRITICAL, f: `pr:${CRITICAL}` },
        ...(orphans.length ? [{ head: 'Aparte', note: 'SGA, SISU o PRIO sin nadie asignado.' }, { label: 'Sin responsable', test: (i) => !C.as[i] }] : []),
      ];
      const prioRows = [{ head: 'Prioridad' }, ...PRIOS.map((p) => ({ label: nice(DI.prio[p]), test: (i) => C.pr[i] === p, f: `pr:${p}` })),
        { head: 'Tarjeta', note: 'Una PRIO cuenta también en su SGA o SISU.' }, ...CARDS.map((c, k) => ({ label: c, test: (i) => cardsOf(i).includes(k), f: `tj:${k}` }))];
      const modRows = topRows('mo', op, 12), esc3 = op.filter((i) => C.vt[i]);
      const st = { total: true, foot: pend };

      return grid(ask('backlog'),
        stockPanel(T, ST),
        card('En qué situación está y desde cuándo', matrix(stateRows, AGES, [...op, ...orphans], { ...st, share: true, of: op.length, corner: 'Antigüedad →' }),
          { span: 's6', sub: 'Las situaciones suman las pendientes. Debajo, lo que conviene vigilar dentro de ellas, y aparte lo que no tiene responsable. Clic en una celda para filtrar.' }),
        card('Por prioridad y tarjeta', matrix(prioRows, SIT, op, { ...st, corner: 'Situación →' }), { span: 's6', sub: 'En qué situación está lo pendiente de cada prioridad y tarjeta.' }),
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
      const ia = A.filter((i) => C.fl[i] & IA_MARKS), T = bySide(A), TI = bySide(ia);
      const count = (label, b, note) => kpiCo(label, T.map((l) => ({ n: l.length, v: l.filter((i) => C.fl[i] & b).length })), (s) => num(s.v), { val: (s) => s.v, note });
      const extra = (s, l) => { s.req = share(l, (i) => C.sv[i] === REQ); s.rep = share(l, (i) => C.rz[i] > 0); };
      const SI = TI.map(stats), SN = T.map((l) => stats(l.filter((i) => !(C.fl[i] & IA_MARKS))));
      return grid(ask('ia'),
        kpis(count('Issues con alguna marca de IA', IA_MARKS, 'en TAGS o en notas'), count('Con marca IA_SOLVED…', 32, 'en TAGS'), count('Con intervención de IA', 2048, 'notas [ACT IA], [INFORME IA]…'),
          count('Revisión humana OK', 4096, '[HITL_REVIEW_OK] en notas'), count('IA fallida o no OK', 8192 | 64, 'IA_FAIL, HITL no OK…'),
          kpiCo('Media con IA', SI, (s) => dur(s.avg), { val: (s) => s.avg }), kpiCo('Media sin IA', SN, (s) => dur(s.avg), { val: (s) => s.avg })),
        section('Issues donde ya interviene la IA', `${num(ia.length)} issues con alguna marca de IA`),
        card('Por mes', legend() + monthly(ia), { span: 's4' }),
        card('Por módulo', bars('mo', { id: 'ia-mo', rows: ia, top: 10 }), { span: 's4' }),
        card('Por tema', bars('th', { id: 'ia-th', rows: ia, top: 10 }), { span: 's4' }),
        card('Por centro', bars('ce', { id: 'ia-ce', rows: ia, top: 10 }), { span: 's4' }),
        card('Por tipología', bars('k3', { id: 'ia-k3', rows: ia, top: 10 }), { span: 's4' }),
        card('Resultado', bars('fl', { id: 'ia-fl', rows: ia, top: 15, skip: (x) => ![5, 6, 11, 12, 13].includes(x) }), { span: 's4', sub: 'Marcas de IA presentes en esas issues.' }),
        section('Trabajo repetitivo, donde la IA podría entrar'),
        card('Temas: volumen, rapidez y repetición', ranking('th', ['n', 'mix', 'req', 'rep', 'avg', 'd1', 'vend'], { id: 'rep-th', extra, top: 27 }),
          { span: 's12', sub: '«% peticiones» = tipo de servicio Petición de usuario. «% resolución repetida» = issues cuyo texto de resolución se ha usado 4 veces o más.' }),
        card('Tipología: volumen, rapidez y repetición', ranking('k3', ['n', 'mix', 'req', 'rep', 'avg', 'd1', 'vend'], { id: 'rep-k3', extra, top: 15, min: 50 }), { span: 's12' }),
        card('Títulos que más se repiten', bars('de', { id: 'rep-de', top: 15, skip: noK })),
        card('Resoluciones que más se repiten', bars('rz', { id: 'rep-rz', top: 15, skip: noK })));
    },

    ia2(A) {
      if (CMP()) return iaCmp(A);
      return iaView(A);
    },

    turnos(A) {
      const T = bySide(A), ST = T.map(stats), cos = CO(), slots = m.periodSlots();
      // por tipo de turno (0–2 laborables, 3–5 fin de semana): sus indicadores y el trabajo hecho en él
      const perType = (l) => {
        const by = slots.map(() => []), w = m.shiftWork(l);
        for (const i of l) by[STYPE[i]].push(i);
        return by.map((li, t) => ({ ...stats(li), perTurn: slots[t] ? li.length / slots[t] : null, worked: w[t].turns, resTurn: w[t].turns ? w[t].resolved / w[t].turns : null, people: w[t].people, perPerson: w[t].perPerson }));
      };
      const per = [0, 1].map((k) => (cos.includes(k) ? perType(T[k]) : null));
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
      const hours = (l, at) => { const v = new Array(24).fill(0); for (const i of l) { const t = at(i); if (t != null) v[clock(t)[1]]++; } return v; };
      const curves = cos.map((k) => `${CMP() ? `<p class="mt-small"><span class="mt-sw mt-c${k}"></span><b>${esc(name(k))}</b></p>` : ''}${day([
        { label: 'Entran', cls: 'mt-l-in', v: hours(T[k], (i) => C.rep[i]) },
        { label: 'Se empiezan', cls: `mt-l-st${k}`, v: hours(T[k], startAt) },
        { label: 'Se resuelven', cls: `mt-l-rs${k}`, v: hours(T[k], resAt) }])}`).join('');
      // qué se queda para el turno siguiente
      const carried = cos.map((k) => m.carry(T[k]));
      const carryRows = SHIFTS.flatMap((sn, j) => cos.map((k) => ({ label: sn, k, v: carried[cos.indexOf(k)][j].map((v, x) => v + carried[cos.indexOf(k)][j + 3][x]) })));
      return grid(ask('turnos'),
        kpis(...SHIFTS.map((sn, k) => kpiCo(`Entran de ${sn.toLowerCase()}`, shareOf(T, (i) => STYPE[i] % 3 === k), (s) => pct(s.v), { val: (s) => s.v, note: SHIFT_HOURS[k] })),
          kpiCo('Entran en fin de semana', shareOf(T, (i) => STYPE[i] >= 3), (s) => pct(s.v), { val: (s) => s.v }),
          kpiCo('Empezadas en su turno', ST, (s) => opt(pct)(s.inShift), { val: (s) => s.inShift, better: 'high', note: 'en el turno en que entran' }),
          kpiCo('Resueltas en su turno', ST, (s) => opt(pct)(s.resInShift), { val: (s) => s.resInShift, better: 'high', note: 'en el turno en que entran' })),
        card('Turno a turno', table('Turno', TCOLS, rowsHtml), { span: 's12', sub: 'Por el turno en que entra cada issue; el trabajo (resueltas, personas, acciones), por el turno en que se hace. Clic en una fila para filtrar. Pasa el ratón por una cabecera para ver cómo se calcula.' }),
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
