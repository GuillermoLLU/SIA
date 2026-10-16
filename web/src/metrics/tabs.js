// Las pestañas de las Métricas. Siguen el orden en que se analiza el servicio y cada una responde
// a una pregunta (QUESTIONS): el Resumen las contesta todas de un vistazo y cada pestaña da el
// detalle. Reciben las issues que pasan los filtros (A) y devuelven su HTML. Se mira un lado (el
// equipo, una persona o varias); si se compara con otro, cada indicador es la diferencia de A
// respecto a B.
import { esc } from '../ui/html.js';
import { num, dec, pct, dur, nice, title, dateOf, MONTHS, DOWS } from './format.js';
import { COMPANIES, CARDS, MAJOR, IA_MARKS, SITUATIONS, ACTIVE_DAYS, share } from './model.js';
import { SHIFTS, SHIFT_HOURS, DAYS, MIN_ACTIONS } from './shifts.js';

export const TABS = [['resumen', 'Resumen'], ['hoy', 'Foto de hoy'], ['entrada', 'Entrada'], ['backlog', 'Backlog'], ['modulos', 'Módulos y focos'],
  ['resolucion', 'Resolución y escalados'], ['resolucion2', 'Resolución (propuesta)'], ['sla', 'SLA y calidad'], ['ia', 'IA'], ['turnos', 'Turnos']];
const QUESTIONS = {
  resumen: ['¿Cómo vamos?', 'Cada bloque responde a una pregunta con sus cifras clave; el detalle, en su pestaña.'],
  hoy: ['¿Qué hay que mover hoy?', 'Lo abierto ahora mismo, sea del mes que sea (no depende del periodo), en listas para actuar: lo urgente, lo que espera y lo que está parado.'],
  entrada: ['¿Qué nos entra?', 'Cuánto entra, cuánto se cierra y de qué tipo, mes a mes. Cada tabla lleva su total y los totales cuadran con las cifras de arriba.'],
  backlog: ['¿Qué tenemos pendiente?', 'Lo recibido en el periodo que sigue sin resolver: en qué punto está, desde cuándo y qué conviene vigilar.'],
  modulos: ['¿De dónde viene?', 'Los módulos, centros y problemas que concentran el trabajo, y lo que se repite.'],
  resolucion: ['¿Cómo lo resolvemos?', 'Cuánto tardamos, en qué se va el tiempo y qué escalamos a terceros.'],
  resolucion2: ['¿Cómo lo resolvemos?', 'Cuánto tardamos, en qué se va el tiempo, qué módulos tardan más y qué escalamos y a quién. Tiempos de lo resuelto, en tiempo natural.'],
  sla: ['¿Cómo de bien lo resolvemos?', 'Si empezamos a tiempo y si el trabajo queda bien hecho.'],
  ia: ['¿Cuánta IA usamos?', 'Dónde interviene ya la IA y el trabajo repetitivo en el que podría entrar.'],
  turnos: ['¿Cuándo entra y cuándo lo trabajamos?', `Por turnos: ${SHIFTS.map((s, k) => `${s.toLowerCase()} de ${SHIFT_HOURS[k]}`).join(', ')}. El turno se cuenta por la hora en que empieza: la noche del domingo es de fin de semana.`],
};

const MONTH_NOTE = 'Por mes de apertura. * mes incompleto: los últimos meses salen mejor de lo que acabarán, porque lo lento aún no se ha resuelto.';
const REMEDY = 'https://itx.onbmc.com/arsys/servlet/ViewFormServlet?server=onbmc-s&form=HPD:Help+Desk&qual=%271000000161%27%3D%22';
const incId = (id) => `INC${String(id).padStart(12, '0')}`;
const opt = (f) => (v) => (v == null ? '—' : f(v));

export const createTabs = (m, ch, ui) => {
  const { C, DI, N, S, BASE, LASTM, PRIOS, slaLabel, MONTH, DOW, OPEN, SIDE, STYPE, CMP, CO, NAMES, isSel, stats, group, bySide, clock } = m;
  const name = (k) => NAMES()[k];
  const { card, legend, kpi, kpis, kpiCo, diff, bars, orderedBars, monthly, lines, ranking, compare, heat, matrix, scorecard, timeBars, mini, day, split } = ch;
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
    n: ['Issues', (s) => num(s.n), (s) => s.n], fr: ['1.ª actuación (media)', (s) => dur(s.fr), (s) => s.fr, 'low'],
    f30: ['1.ª act. en < 30 min', (s) => pct(s.f30), (s) => s.f30, 'high'], f120: ['1.ª act. en < 2 h', (s) => pct(s.f120), (s) => s.f120, 'high'],
    avg: ['Media resol.', (s) => dur(s.avg), (s) => s.avg, 'low'], p90: ['El 90 %, en menos de', (s) => dur(s.p90), (s) => s.p90, 'low'],
    h4: ['Resueltas en < 4 h', (s) => pct(s.h4), (s) => s.h4, 'high'], d1: ['en < 24 h', (s) => pct(s.d1), (s) => s.d1, 'high'], d3: ['en < 72 h', (s) => pct(s.d3), (s) => s.d3, 'high'],
    reop: ['Reabiertas', (s) => pct(s.reop, 1), (s) => s.reop, 'low'], bounce: ['Devueltas a cola', (s) => pct(s.bounce, 1), (s) => s.bounce, 'low'],
    noCat: ['Sin tipología', (s) => pct(s.noCat, 1), (s) => s.noCat, 'low'], noDesc: ['Título sin descripción', (s) => pct(s.noDesc, 1), (s) => s.noDesc, 'low'],
    noRes: ['Sin texto de resolución', (s) => pct(s.noRes, 1), (s) => s.noRes, 'low'],
    sla: ['Dentro de SLA', slaPct, (s) => s.sla, 'high'], ip: ['Media hasta En curso', (s) => dur(s.ip), (s) => s.ip, 'low'], ip90: ['El 90 %, En curso en menos de', (s) => dur(s.ip90), (s) => s.ip90, 'low'],
    slaKo: ['Fuera de SLA', (s) => num(s.slaKo), (s) => s.slaKo], waitKo: ['Sin iniciar y fuera de plazo', (s) => num(s.waitKo), (s) => s.waitKo],
    noIp: ['Cerradas sin pasar por En curso', (s) => pct(s.noIp, 1), (s) => s.noIp],
    inShift: ['Empezadas en su turno', (s) => opt(pct)(s.inShift), (s) => s.inShift, 'high'],
    vend: ['Con ticket de tercero', (s) => pct(s.vend), (s) => s.vend], pend: ['Pasan por pendiente', (s) => pct(s.pend), (s) => s.pend], crit: ['Críticas', (s) => pct(s.crit, 1), (s) => s.crit],
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
  const byPrio = (A, cols, label = (p) => nice(DI.prio[p]), first = 'Prioridad') => slices(first, PRIOS.map((p) => [label(p), (i) => C.pr[i] === p, `pr:${p}`]), A, cols);
  const cardsOf = (i) => m.DIMS.tj.get(i);
  const byCard = (A, cols) => slices('Tarjeta', CARDS.map((c, k) => [c, (i) => cardsOf(i).includes(k), `tj:${k}`]), A, cols);
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
  const CARD_NOTE = 'SGA y SISU, por los filtros de Remedy del equipo; PRIO, priorizada por negocio, cuenta además en su SGA o SISU.';

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
      team ? card('Quién lleva cada módulo', owners(A), { span: 's12', sub: 'De lo recibido en el periodo con responsable: cuántas personas tocan cada módulo, cuántas llevan entre todas el 80 % y quién lleva más. Si lo llevan pocas, el conocimiento está concentrado en ellas. Clic en un módulo o en una persona para filtrar.' }) : '',
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
  // cuánto tardan: un tramo por fila, partido en sin escalar y escaladas, a la misma escala
  const ttrSplit = (list) => {
    const by = Array.from({ length: 8 }, () => [0, 0]);
    let n = 0;
    for (const i of list) { const k = m.DIMS.tb.get(i); if (k < 8) { by[k][escd(i) ? 1 : 0]++; n++; } }
    const max = Math.max(1, ...by.map(([a, b]) => a + b)), w = (v) => (v / max * 100).toFixed(2), sh = (v) => v / (n || 1);
    return `<div class="mt-legend"><span><i class="mt-c0"></i>Sin escalar</span><span><i class="mt-time3"></i>Escaladas</span></div>${by.map(([a, b], k) => `<div class="mt-br ${isSel('tb', k) ? 'mt-sel' : ''}" data-f="tb:${k}"
      data-tip="${esc(`${m.DIMS.tb.label(k)}\n${num(a + b)} resueltas (${pct(sh(a + b), 1)})\nSin escalar: ${num(a)} · Escaladas: ${num(b)}`)}"><span class="mt-bl">${m.DIMS.tb.label(k)}</span>
      <span class="mt-bt"><i class="mt-c0" style="width:${w(a)}%"></i><i class="mt-time3" style="width:${w(b)}%"></i></span><span class="mt-bv">${num(a + b)}</span><span class="mt-bp">${pct(sh(a + b))}</span></div>`).join('')}`;
  };
  // mes a mes (por mes de apertura): lo resuelto de lo que entró ese mes, cuánto tardó y cuánto se escaló
  const RES_MONTH = [['Resueltas', 'De las recibidas ese mes, las ya resueltas.'], ['Media', 'De la apertura a la resolución.'], ['En < 24 h', 'De las resueltas, las resueltas en menos de 24 horas.'],
    ['> 7 días', 'De las resueltas, las que tardaron más de 7 días.'], ['% escaladas', 'De las resueltas, las que tienen ticket de tercero.'], ['Media sin escalar', ''], ['Media escaladas', '']];
  const resMonthly = (A) => {
    const cells = (l) => {
      const s = stats(l), r = l.filter(solved), e = r.filter(escd), on = s.resolved > 0;
      return [num(s.resolved), avgOf(s), on ? pct(s.d1) : '—', on ? pct(s.w7) : '—', on ? pct(e.length / r.length) : '—', avgOf(stats(r.filter((i) => !escd(i)))), avgOf(stats(e))]
        .map((v, j) => `<td class="mt-num">${j === 1 ? `<b>${v}</b>` : v}</td>`).join('');
    };
    const body = monthsIn().map((k) => `<tr class="mt-clk ${isSel('month', k) ? 'mt-sel' : ''}" data-f="month:${k}"><td>${MONTHS[k]}${k === LASTM ? '*' : ''}</td>${cells(A.filter((i) => MONTH[i] === k))}</tr>`).join('');
    return table('Mes de apertura', RES_MONTH.map(([l, t]) => [l, 0, 0, 0, t]), `${body}<tr class="mt-tot"><td>Total</td>${cells(A)}</tr>`);
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
    const e = R.filter(escd), noPv = e.length ? e.filter((i) => !C.tPv[i]).length / e.length : 0, noIp = R.length ? R.filter((i) => C.ip[i] < 0).length / R.length : 0;
    return `<p class="mt-note">Ojo al leerla: el ${pct(noPv)} de lo escalado nunca pasa a Pendiente de un tercero, así que su espera cuenta como cola; y el ${pct(noIp)} de lo resuelto nunca pasa por En curso, así que su trabajo también cuenta como cola.</p>
      <div class="mt-legend">${STATES.map(([l, t], k) => `<span data-tip="${esc(t)}"><i class="mt-time${k}"></i>${l}</span>`).join('')}</div>
      <div class="mt-tablewrap"><table class="mt-mx mt-restime"><colgroup><col style="width:10%"><col style="width:12%"><col style="width:7%"><col style="width:8%">${'<col style="width:8%">'.repeat(5)}<col></colgroup>
      <thead><tr><th colspan="2"></th><th class="mt-num">Resueltas</th><th class="mt-num" data-tip="De la apertura a la resolución.">Media</th>${STATES.map(([l, t]) => `<th class="mt-num" data-tip="${esc(`${t} Media por resuelta.`)}">${l}</th>`).join('')}<th>Reparto del tiempo</th></tr></thead>
      <tbody>${body}<tr class="mt-lead mt-lead-end"><th class="mt-r" colspan="2">Todas las resueltas</th>${cells(R)}</tr></tbody></table></div>`;
  };
  // unas veces se escala y otras no: problemas con al menos 20 resueltas, escalados entre el 20 % y el 80 % de las veces
  const mixedEsc = () => {
    const g = group('de', m.rows('de').filter(solved), true).filter((x) => x.k && x.n >= 20)
      .map((x) => ({ ...x, e: x.rows.filter(escd) })).filter((x) => x.e.length >= 0.2 * x.n && x.e.length <= 0.8 * x.n);
    const all = ui.exp['rs-mixed'], shown = all ? g : g.slice(0, 12);
    const body = shown.map((x) => {
      const mo = group('mo', x.rows).find((y) => y.k), sh = x.e.length / x.n;
      return `<tr class="mt-clk ${isSel('de', x.k) ? 'mt-sel' : ''}" data-f="de:${x.k}"><td>${esc(DI.problem[x.k])}</td><td class="mt-mut">${mo ? esc(m.DIMS.mo.label(mo.k)) : ''}</td><td class="mt-num">${num(x.n)}</td>
        <td><div class="mt-sc-vol"><em>${pct(sh)}</em><span class="mt-bt"><i class="mt-time3" style="width:${(sh * 100).toFixed(1)}%"></i></span></div></td>
        <td class="mt-num">${avgOf(stats(x.rows.filter((i) => !escd(i))))}</td><td class="mt-num">${avgOf(stats(x.e))}</td></tr>`;
    }).join('');
    return g.length ? `<div class="mt-tablewrap"><table class="mt-mixesc"><thead><tr><th>Problema</th><th>Módulo principal</th><th class="mt-num">Resueltas</th><th>Escaladas</th><th class="mt-num">Media sin escalar</th><th class="mt-num">Media escaladas</th></tr></thead><tbody>${body}</tbody></table></div>
      ${g.length > 12 ? `<button class="mt-more" data-exp="rs-mixed">${all ? 'Ver menos' : `Ver todos (${num(g.length)})`}</button>` : ''}` : '<p class="mt-mut mt-small">Ninguno con estos filtros.</p>';
  };
  // tickets de tercero con muchas incidencias: primero los que aún tienen alguna abierta
  const ticketTable = (A) => {
    const known = group('vk', A, true).filter((x) => x.k && x.n >= 5).map((x) => ({ ...x, open: x.rows.filter((i) => OPEN[i]).length })).sort((a, b) => (b.open > 0) - (a.open > 0) || b.n - a.n);
    const all = ui.exp['rs-known'];
    const body = known.slice(0, all ? 200 : 15).map((x) => {
      const ce = new Set(x.rows.map((i) => C.ce[i])).size, f = Math.min(...x.rows.map((i) => C.rep[i])), l = Math.max(...x.rows.map((i) => C.rep[i])), ti = group('de', x.rows).find((y) => y.k);
      return `<tr class="mt-clk ${isSel('vk', x.k) ? 'mt-sel' : ''}" data-f="vk:${x.k}"><td><b>${esc(DI.vkey[x.k])}</b></td><td class="mt-num">${x.n}</td><td class="mt-num ${x.open ? 'mt-warnc' : ''}">${x.open || ''}</td><td class="mt-num">${ce}</td><td>${dateOf(BASE, f).slice(0, 5)}</td><td>${dateOf(BASE, l).slice(0, 5)}</td><td class="mt-num">${avgOf(stats(x.rows))}</td><td class="mt-mut">${ti ? esc(DI.problem[ti.k]) : ''}</td></tr>`;
    }).join('');
    return known.length ? `<div class="mt-tablewrap ${all ? 'mt-scroll' : ''}"><table><thead><tr><th>Ticket</th><th class="mt-num">Incidencias</th><th class="mt-num">Abiertas</th><th class="mt-num">Centros</th><th>Primera</th><th>Última</th><th class="mt-num">Media resol.</th><th>Problema más habitual</th></tr></thead><tbody>${body}</tbody></table></div>
      ${known.length > 15 ? `<button class="mt-more" data-exp="rs-known">${all ? 'Ver menos' : `Ver todos (${num(known.length)})`}</button>` : ''}` : '<p class="mt-mut mt-small">Ninguno con estos filtros.</p>';
  };
  const noPvExtra = (st, l) => { const r = l.filter(solved); st.noPv = r.length ? r.filter((i) => !C.tPv[i]).length / r.length : null; };
  const resolutionView = (A, note = '') => {
    const s = stats(A), R = A.filter(solved), rtTot = s.rt.reduce((a, b) => a + b, 0) || 1, on = s.resolved > 0;
    return grid(ask('resolucion2'), note,
      kpis(kpi('Resueltas', num(s.resolved), `de ${num(s.n)} recibidas`), kpi('Media de resolución', avgOf(s), 'de la apertura a la resolución'),
        kpi('Resueltas en < 24 h', on ? pct(s.d1) : '—'), kpi('Más de 7 días', on ? pct(s.w7) : '—', 'lo lento: pesa mucho en la media'),
        kpi('El 90 %, en menos de', optDur(on ? s.p90 : null)), kpi('Escaladas', on ? pct(R.filter(escd).length / R.length) : '—', 'de las resueltas, con ticket de tercero'),
        kpi('Esperando a terceros', on ? pct(s.rt[3] / rtTot) : '—', 'del tiempo de vida de lo resuelto')),
      section('¿Cuánto tardamos?'),
      card('Cuánto tardan', ttrSplit(m.rows('tb')), { span: 's5', sub: 'Resueltas por lo que tardaron, de la apertura a la resolución. Clic en un tramo para filtrar.' }),
      card('Mes a mes', resMonthly(A), { span: 's7', sub: `${MONTH_NOTE} Clic en un mes para filtrar.` }),
      section('¿En qué se va el tiempo?'),
      card('Por prioridad, escalado y tarjeta', timeTable(A), { span: 's12', sub: 'Lo que pasa de media cada resuelta en cada estado, según el historial de cambios. Clic en una fila para filtrar.' }),
      section('¿Qué módulos tardan más?'),
      card('', scorecard('mo', [['Volumen', ['n']], ['Cuánto tarda', ['avg', 'd1', 'w7', 'p90']], ['En qué se va', ['tq', 'tc', 'tv']], ['Escalado', ['vend']]],
        { id: 'rs-mo', rows: m.rows('mo').filter(solved), skip: noK, refLabel: 'Todos los módulos', title: 'Módulos', n: ['Resueltas', 'Issues resueltas y su parte del total.'] }), { span: 's12' }),
      section('¿Qué escalamos y a quién?'),
      card('', scorecard('vt', [['Volumen', ['n']], ['Cuánto tarda', ['avg', 'w7']], ['La espera', ['tv', 'noPv']], ['Hoy', ['open']]],
        { id: 'rs-vt', rows: m.rows('vt').filter(escd), extra: noPvExtra, refLabel: 'Todo lo escalado', title: 'A quién escalamos', n: ['Escaladas', 'Issues con ticket de tercero y su parte de lo escalado.'], child: { dim: 'vp', top: 8, noun: 'proyectos Jira' } }), { span: 's12' }),
      card('Unas veces se escala y otras no', mixedEsc(), { span: 's12', sub: 'Problemas con al menos 20 resueltas que se escalan entre el 20 % y el 80 % de las veces: el mismo problema se trata de dos formas. Candidatos a un procedimiento común o a la IA. Clic en uno para filtrar.' }),
      card('Un mismo ticket, muchas incidencias', ticketTable(A), { span: 's12', sub: 'Tickets de tercero con 5 o más incidencias ligadas; arriba, los que aún tienen alguna abierta. Clic en uno para filtrar.' }));
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
    resolucion(A) {
      const ST = bySide(A).map(stats), tot = (s) => s.time.reduce((x, y) => x + y, 0) || 1;
      const known = group('vk', A, true).filter((x) => x.k && x.n >= 5);
      const kt = `<div class="mt-tablewrap ${ui.exp.known ? 'mt-scroll' : ''}"><table><thead><tr><th>Ticket</th><th class="mt-num">Incidencias</th><th class="mt-num">Centros</th>${CMP() ? '<th>Reparto</th>' : ''}<th>Primera</th><th>Última</th><th class="mt-num">Media resol.</th><th>Título más habitual</th></tr></thead><tbody>${known.slice(0, ui.exp.known ? 200 : 15).map((x) => {
        const ce = new Set(x.rows.map((i) => C.ce[i])).size, f = Math.min(...x.rows.map((i) => C.rep[i])), l = Math.max(...x.rows.map((i) => C.rep[i]));
        const ti = group('de', x.rows).find((y) => y.k);   // el título más habitual
        return `<tr class="mt-clk ${isSel('vk', x.k) ? 'mt-sel' : ''}" data-f="vk:${x.k}"><td><b>${esc(DI.vkey[x.k])}</b></td><td class="mt-num">${x.n}</td><td class="mt-num">${ce}</td>${CMP() ? `<td>${mini(x.t)}</td>` : ''}<td>${dateOf(BASE, f).slice(0, 5)}</td><td>${dateOf(BASE, l).slice(0, 5)}</td><td class="mt-num">${dur(stats(x.rows).avg)}</td><td class="mt-mut">${ti ? esc(DI.problem[ti.k]) : ''}</td></tr>`;
      }).join('')}</tbody></table></div>${known.length > 15 ? `<button class="mt-more" data-exp="known">${ui.exp.known ? 'Ver menos' : `Ver todos (${num(known.length)})`}</button>` : ''}`;
      const cols = ['n', 'avg', 'p90', 'd1', 'vend', 'pend'];
      return grid(ask('resolucion'),
        kpis(kpiCo('Media de resolución', ST, (s) => dur(s.avg), { val: (s) => s.avg, better: 'low' }),
          kpiCo('El 90 %, en menos de', ST, (s) => dur(s.p90), { val: (s) => s.p90, better: 'low' }),
          kpiCo('Resueltas en < 4 h', ST, (s) => pct(s.h4), { val: (s) => s.h4, better: 'high' }),
          kpiCo('Resueltas en < 24 h', ST, (s) => pct(s.d1), { val: (s) => s.d1, better: 'high' }),
          kpiCo('Con ticket de tercero', ST, (s) => pct(s.vend), { val: (s) => s.vend }),
          kpiCo('Tiempo esperando a terceros', ST, (s) => pct(s.time[3] / tot(s)), { val: (s) => s.time[3] / tot(s), note: 'del tiempo de vida' })),
        card('Cuánto tardan en resolverse', legend() + orderedBars('tb', [0, 1, 2, 3, 4, 5, 6, 7, 8]), { sub: 'Desde la apertura hasta la última resolución, en tiempo natural (cuenta noches y fines de semana). Clic en un tramo para filtrar.' }),
        card('En qué se va el tiempo', `${timeBars(ST)}<p class="mt-mut mt-small">Suma del tiempo que las issues pasan en cada estado hasta resolverse, según el historial de cambios. «En cola» incluye el tiempo que vuelven a estar asignadas tras un pendiente. Todo el tiempo de una issue se cuenta a su responsable actual.</p>`, { sub: 'Reparto del tiempo total de vida de las issues por estado.' }),
        card('Por prioridad', byPrio(A, cols)),
        card('Con y sin ticket de tercero', slices('', [['Con ticket de tercero', (i) => C.vt[i]], ['Sin ticket', (i) => !C.vt[i]]], A, ['n', 'avg', 'p90', 'd1', 'pend']), { sub: 'Lo que se escala tarda más: aquí, cuánto.' }),
        card('Evolución de la media de resolución', legend() + lines(A, (s) => s.avg, dur), { sub: MONTH_NOTE }),
        card('Por tarjeta', byCard(A, cols), { sub: CARD_NOTE }),
        card('Por módulo / sistema', ranking('mo', ['n', 'mix', 'avg', 'p90', 'h4', 'd1', 'vend', 'pend'], { id: 'rv-mo', skip: noK, min: 30, top: 15 }), { span: 's12', sub: 'Módulos con al menos 30 issues. Clic en una cabecera para ordenar.' }),
        section('Escalados a terceros'),
        card('A quién se escala', legend() + bars('vt', { top: 12, skip: noK }), { span: 's5', sub: 'Prefijo escrito en el campo «Vendor Ticket Number», tal cual. Solo issues con ticket.' }),
        card('Proyectos Jira que reciben más', ranking('vp', ['n', 'mix', 'crit', 'avg', 'p90', 'pend'], { skip: noK, top: 12 }), { span: 's7', sub: 'Por la clave que aparece en el ticket de tercero (p. ej. SGAEWMSAP-7037 → SGAEWMSAP).' }),
        card('Un mismo ticket, muchas incidencias', kt, { span: 's12', sub: 'Tickets de desarrollo a los que se han ligado 5 o más incidencias. Clic en uno para ver esas incidencias en todas las métricas.' }));
    },

    resolucion2(A) {
      if (CMP()) return m.alone((A1) => resolutionView(A1, `<p class="mt-note">Esta propuesta aún no compara: se ve solo ${esc(name(0))}.</p>`));
      return resolutionView(A);
    },

    sla(A) {
      const ST = bySide(A).map(stats), byP = (p) => bySide(A.filter((i) => C.pr[i] === p)).map(stats);
      return grid(ask('sla'),
        kpis(kpiCo('Empezadas dentro del SLA', ST, slaPct, { val: (s) => s.sla, better: 'high', note: 'todas las prioridades' }),
          ...PRIOS.map((p) => kpiCo(slaLabel(p), byP(p), slaPct, { val: (s) => s.sla, better: 'high', note: 'dentro del SLA' })),
          kpiCo('Reabiertas', ST, (s) => pct(s.reop, 1), { val: (s) => s.reop, better: 'low' }),
          kpiCo('Cerradas sin explicar la solución', ST, (s) => pct(s.noRes, 1), { val: (s) => s.noRes, better: 'low' })),
        section('Empezar a tiempo'),
        card('SLA de inicio por prioridad', byPrio(A, ['n', 'sla', 'ip', 'ip90', 'slaKo', 'waitKo', 'noIp'], slaLabel, 'Prioridad y SLA'), { span: 's12', sub: 'De la apertura de la issue al primer paso a En curso, en tiempo natural. «Fuera de SLA» suma las iniciadas tarde y las abiertas que siguen sin iniciar pasado el plazo; las cerradas sin pasar por En curso no entran en el %.' }),
        card('Cómo se inician respecto al SLA', legend() + orderedBars('sl', [0, 1, 2, 3, 4, 5, 6]), { sub: 'Cuánto tarda cada issue en pasar a En curso comparado con el plazo de su prioridad. Clic en un tramo para filtrar.' }),
        card('Evolución del % dentro del SLA', legend() + lines(A, (s) => s.sla, (v) => pct(v)), { sub: MONTH_NOTE }),
        card('Primera actuación por prioridad', byPrio(A, ['n', 'fr', 'f30', 'f120']), { span: 's12', sub: 'Primera actuación: el primer cambio de estado real desde la apertura.' }),
        section('Trabajo bien hecho'),
        card('Calidad por prioridad', byPrio(A, ['n', 'reop', 'bounce', 'noCat', 'noDesc', 'noRes']), { span: 's12', sub: 'Reabiertas: volvieron de Resuelta a abierta. Devueltas: pasaron de En curso a Asignada.' }),
        card('Evolución de las reabiertas', legend() + lines(A, (s) => s.reop, (v) => pct(v, 1)), { sub: MONTH_NOTE }),
        card('Evolución de las cerradas sin explicar la solución', legend() + lines(A, (s) => s.noRes, (v) => pct(v, 1)), { sub: MONTH_NOTE }),
        card('Por tarjeta', byCard(A, ['n', 'sla', 'fr', 'reop', 'bounce', 'noRes']), { span: 's12', sub: CARD_NOTE }),
        card('Por módulo / sistema', ranking('mo', ['n', 'mix', 'sla', 'slaKo', 'fr', 'reop', 'bounce', 'noCat', 'noRes'], { id: 'sla-mo', skip: noK, min: 30, sort: 'slaKo', top: 15 }), { span: 's12', sub: 'Módulos con al menos 30 issues, de más a menos fuera de SLA. Clic en una cabecera para ordenar.' }),
        card('Cómo se tipifica', compare('k3', { top: 12 }), { sub: 'Categorización 3 de Remedy, tal cual está informada.' }),
        card('Resoluciones que más se repiten', bars('rz', { top: 12, skip: noK }), { sub: 'Textos de resolución idénticos (salvo números) usados 4 veces o más.' }));
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
