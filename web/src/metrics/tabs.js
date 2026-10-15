// Las pestañas de las Métricas. Siguen el orden en que se analiza el servicio y cada una responde
// a una pregunta (QUESTIONS): el Resumen las contesta todas de un vistazo y cada pestaña da el
// detalle. Reciben las issues que pasan los filtros (A) y devuelven su HTML. Se mira un lado (el
// equipo, una persona o varias); si se compara con otro, cada indicador es la diferencia de A
// respecto a B.
import { esc } from '../ui/html.js';
import { num, dec, pct, dur, nice, title, dateOf, MONTHS, DOWS } from './format.js';
import { CARDS, MAJOR, IA_MARKS, share } from './model.js';
import { SHIFTS, SHIFT_HOURS, DAYS, MIN_ACTIONS } from './shifts.js';

export const TABS = [['resumen', 'Resumen'], ['hoy', 'Foto de hoy'], ['carga', 'Entrada y backlog'], ['backlog', 'Backlog'], ['reparto', 'Reparto'], ['modulos', 'Módulos y focos'],
  ['resolucion', 'Resolución y escalados'], ['sla', 'SLA y calidad'], ['ia', 'IA'], ['turnos', 'Turnos']];
const QUESTIONS = {
  resumen: ['¿Cómo vamos?', 'Cada bloque responde a una pregunta con sus cifras clave; el detalle, en su pestaña.'],
  hoy: ['¿Qué hay que mover hoy?', 'Lo abierto ahora mismo, sea del mes que sea (no depende del periodo), en listas para actuar: lo urgente, lo que espera y lo que está parado.'],
  carga: ['¿Qué tenemos?', 'Lo que entra, cuánto se cierra y lo que queda pendiente: de qué tipo, en qué situación y desde cuándo. Cada tabla lleva su total y los totales cuadran con las cifras de arriba.'],
  backlog: ['¿Qué tenemos encima?', 'Lo que sigue abierto, cuánto lleva esperando, a qué espera y si la pila crece o baja.'],
  reparto: ['¿Qué nos entra?', 'Cuánto entra, en qué meses, con qué prioridad y de qué tipo.'],
  modulos: ['¿De dónde viene?', 'Los módulos, centros y problemas que concentran el trabajo, y lo que se repite.'],
  resolucion: ['¿Cómo lo resolvemos?', 'Cuánto tardamos, en qué se va el tiempo y qué escalamos a terceros.'],
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
  const { card, legend, kpi, kpis, kpiCo, diff, bars, orderedBars, monthly, lines, ranking, compare, heat, matrix, timeBars, movers, mini, day, split } = ch;
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

  // Entran y salen, de lo recibido en el periodo: mes a mes o, si el periodo es un solo mes, día a día.
  // Recibidas, resueltas en ese tramo, el saldo y lo que quedaba abierto al cerrarlo.
  const FLOW = [['Recibidas', (s) => num(s.in), (s) => s.in], ['Resueltas', (s) => num(s.out), (s) => s.out, 'high'],
    ['Saldo', (s) => `${s.out - s.in > 0 ? '+' : ''}${num(s.out - s.in)}`, (s) => s.out - s.in, 'high', 'Resueltas menos recibidas: en positivo, la pila baja; en negativo, crece.'],
    ['Pendientes al cierre', (s) => num(s.open), (s) => s.open, 'low', 'De lo recibido desde el inicio del periodo, lo que seguía abierto al acabar el mes o el día.']];
  const minOf = (y, mo, d = 1) => (Date.UTC(y, mo, d) - BASE) / 6e4;
  const flowUnits = () => {
    const y = m.data.meta.year;
    if (S.from !== S.to) return monthsIn().map((k) => ({ label: MONTHS[k] + (k === LASTM ? '*' : ''), from: minOf(y, k), to: minOf(y, k + 1), f: `month:${k}` }));
    const last = Math.min(new Date(Date.UTC(y, S.from + 1, 0)).getUTCDate(), S.from === LASTM ? new Date(BASE + m.SNAP * 6e4).getUTCDate() : 31);
    return Array.from({ length: last }, (_, j) => ({ label: `${j + 1} ${MONTHS[S.from]}`, from: minOf(y, S.from, j + 1), to: minOf(y, S.from, j + 2) }));
  };
  const flow = (A) => {
    const units = flowUnits(), T = bySide(A);
    const per = [0, 1].map((k) => units.map((u) => {
      const x = { in: 0, out: 0, open: 0 };
      for (const i of T[k]) {
        const r = resAt(i);
        if (C.rep[i] >= u.from && C.rep[i] < u.to) x.in++;
        if (r != null && r >= u.from && r < u.to) { x.out++; if (C.rep[i] < u.from) x.prev++; }
        if (C.rep[i] < u.to && (r == null || r >= u.to)) x.open++;
      }
      return { ...x, n: x.in + x.out + x.open };
    }));
    return table(S.from === S.to ? 'Día' : 'Mes', FLOW, units.map((u, j) => `<tr ${u.f ? `class="mt-clk" data-f="${u.f}"` : ''}><td>${u.label}</td>${FLOW.map((d) => `<td class="mt-num">${cell([per[0][j], per[1][j]], d)}</td>`).join('')}</tr>`).join(''));
  };

  // Lo abierto por tarjeta: lo de cada lado y, aparte (si se mira una empresa, no personas), lo que aún
  // no tiene responsable. Una PRIO cuenta en PRIO y en su SGA o SISU; el total, una vez.
  const backlogTable = () => {
    const cos = CO(), bk = CARDS.map(() => [0, 0, 0]), tot = [0, 0, 0], orphans = !S.sides.some((x) => x?.people);
    for (let i = 0; i < N; i++) {
      if (!OPEN[i] || !inPeriod(i)) continue;
      const k = SIDE[i] < 2 ? SIDE[i] : !C.as[i] ? 2 : -1;
      if (k < 0) continue;
      tot[k]++;
      for (const c of cardsOf(i)) bk[c][k]++;
    }
    const cols = orphans ? [...cos, 2] : cos, sum = (row) => cols.reduce((a, k) => a + row[k], 0);
    return `<table><thead><tr><th>Tarjeta</th>${cos.map((k) => `<th class="mt-num"><span class="mt-sw mt-c${k}"></span>${esc(name(k))}</th>`).join('')}${orphans ? '<th class="mt-num"><span class="mt-sw mt-c2"></span>Sin responsable</th>' : ''}<th class="mt-num">Total</th></tr></thead><tbody>${CARDS.map((c, j) => `<tr class="mt-clk ${isSel('tj', j) ? 'mt-sel' : ''}" data-f="tj:${j}"><td>${c}</td>${cols.map((k) => `<td class="mt-num">${num(bk[j][k])}</td>`).join('')}<td class="mt-num"><b>${num(sum(bk[j]))}</b></td></tr>`).join('')}
      <tr class="mt-grp"><td>Total</td>${cols.map((k) => `<td class="mt-num">${num(tot[k])}</td>`).join('')}<td class="mt-num">${num(sum(tot))}</td></tr></tbody></table>`;
  };

  // --- Resumen: un bloque por pregunta, con sus cifras clave y el paso a su pestaña. Cada cifra es la
  // de lo que se mira y, al comparar, al lado, la diferencia con el otro lado.
  const fig = (label, ST, fmt, val, better, tip) => {
    const a = ST[CO()[0]];
    return `<div class="mt-fig" ${tip ? `data-tip="${esc(tip)}"` : ''}><span>${esc(label)}</span><b>${a.n ? fmt(a) : '—'}</b>${CMP() ? diff(ST[0], ST[1], fmt, val, better) : ''}</div>`;
  };
  const answer = (tab, figs) => `<section class="mt-card mt-ans"><header><h3>${QUESTIONS[tab][0]}</h3><button class="mt-go" data-go="${tab}">${TABS.find(([k]) => k === tab)[1]} →</button></header><div class="mt-figs">${figs.join('')}</div></section>`;
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

  // --- Lo pendiente. Su situación: en curso, sin empezar (Asignada) o en espera (Pendiente) de un tercero,
  // del cliente o por otro motivo; las cinco suman todo lo abierto.
  const ST_ = (s) => DI.status.indexOf(s), [ASSIGNED, IN_PROGRESS, PENDING] = ['ASSIGNED', 'IN_PROGRESS', 'PENDING'].map(ST_);
  const R_ = (r) => DI.reason.indexOf(r), VENDOR = R_('THIRD_PARTY_VENDOR_ACTION_REQD'), CLIENT = [R_('CLIENT_ACTION_REQUIRED'), R_('CUSTOMER_FOLLOW_UP_REQUIRED')];
  const SITUATION = [
    { label: 'En curso', test: (i) => C.st[i] === IN_PROGRESS, f: `st:${IN_PROGRESS}`, tip: 'Alguien está trabajando en ellas.' },
    { label: 'Sin empezar', test: (i) => C.st[i] === ASSIGNED, f: `st:${ASSIGNED}`, tip: 'En Asignada: nadie las está trabajando.' },
    { label: 'Espera tercero', test: (i) => C.st[i] === PENDING && C.rs[i] === VENDOR, f: `rs:${VENDOR}`, tip: 'En Pendiente por una acción de un tercero (desarrollo, proveedor…).' },
    { label: 'Espera cliente', test: (i) => C.st[i] === PENDING && CLIENT.includes(C.rs[i]), tip: 'En Pendiente por una acción o respuesta del centro o del cliente.' },
    { label: 'Espera otro motivo', test: (i) => C.st[i] === PENDING && C.rs[i] !== VENDOR && !CLIENT.includes(C.rs[i]), tip: 'En Pendiente con otro motivo o sin motivo informado.' },
  ];
  const AGES = [0, 1, 2, 3, 4].map((k) => ({ label: m.DIMS.age.label(k), test: (i) => m.DIMS.age.get(i) === k, f: `age:${k}` }));
  // lo que no tiene a nadie: abierto, de las tarjetas del equipo (SGA, SISU o PRIO) y del periodo, con los filtros
  const orphansIn = () => m.today(true).filter((i) => OPEN[i] && !C.as[i] && inPeriod(i) && cardsOf(i).some((k) => k < 3));
  // Las cifras de lo pendiente: el total, su situación (en curso, sin empezar y en espera suman el total) y,
  // aparte, lo que no ha pasado nunca a En curso y ya supera su SLA, lo escalado y lo que no tiene a nadie.
  const stockKpis = (T, ST) => {
    const openCount = (test) => T.map((l) => ({ n: l.length, v: l.filter((i) => OPEN[i] && test(i)).length }));
    const v = { val: (s) => s.v }, people = S.sides.some((s) => s?.people);
    return kpis(kpiCo('Pendientes', ST, (s) => num(s.open), { val: (s) => s.open, note: CMP() ? '' : `el backlog: sin resolver, de ${num(ST[CO()[0]].n)} recibidas en el periodo` }),
      kpiCo('En curso', openCount(SITUATION[0].test), (s) => num(s.v), { ...v, note: 'alguien trabajando en ellas' }),
      kpiCo('Sin empezar', openCount(SITUATION[1].test), (s) => num(s.v), { ...v, note: 'en Asignada: nadie las está trabajando' }),
      kpiCo('En espera', openCount((i) => C.st[i] === PENDING), (s) => num(s.v), { ...v, note: 'en Pendiente: de un tercero, del cliente…' }),
      kpiCo('Fuera de plazo', ST, (s) => num(s.waitKo), { val: (s) => s.waitKo, better: 'low', note: 'sin iniciar: nunca han pasado a En curso y ya superan su SLA' }),
      kpiCo('Escaladas', openCount((i) => C.vt[i]), (s) => num(s.v), { ...v, note: 'con ticket de tercero' }),
      people ? '' : kpi('Sin responsable', num(orphansIn().length), 'SGA, SISU o PRIO, sin nadie asignado', 'mt-t2'));
  };
  const PLURAL = { CRITICAL: 'Críticas', HIGH: 'Altas', MEDIUM: 'Medias', LOW: 'Bajas' };
  const late = (i) => { const l = m.SLA[C.pr[i]]; return OPEN[i] && C.ip[i] < 0 && l >= 0 && m.SNAP - C.rep[i] > l; };

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
    const row = (label, j, attrs = '') => `<tr ${attrs}><td>${label}</td>${defs.map((d) => `<td class="mt-num">${cell([per[0][j], per[1][j]], d)}</td>`).join('')}</tr>`;
    const groups = LEDGER_GROUPS.map(([l, n]) => [day ? l.replace('mes', 'día') : l, n]);
    return table(day ? 'Día' : 'Mes', defs, units.map((u, j) => row(u.label, j, u.f ? `class="mt-clk" data-f="${u.f}"` : u.after ? 'class="mt-mut"' : '')).join('') + row('Total', units.length, 'class="mt-tot"'), groups);
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
      const vsPrev = monthVsPrev();
      return grid(ask('resumen'),
        `<div class="mt-answers">${[
          answer('backlog', [
            fig('Abiertas ahora', ST, (s) => num(s.open), sv('open'), 'low'),
            fig('Sin iniciar y fuera de plazo', ST, (s) => num(s.waitKo), sv('waitKo'), 'low', 'Abiertas que nunca han pasado a En curso y ya superan el plazo de su prioridad.'),
            fig('Con más de 30 días', ST, (s) => num(s.open30), sv('open30'), 'low'),
            fig('PRIO abiertas', T.map((l) => ({ n: l.length, v: l.filter((i) => OPEN[i] && cardsOf(i).includes(2)).length })), (s) => num(s.v), sv('v'), 'low'),
            fig('Sin resolver de lo recibido', ST.map((s) => ({ n: s.n, v: s.n ? s.open / s.n : null })), sharePct, sv('v'), 'low')]),
          answer('reparto', [
            fig('Recibidas', ST, (s) => num(s.n), sv('n')),
            ...(vsPrev ? [fig(`${MONTHS[vsPrev[0]]} frente a ${MONTHS[vsPrev[0] - 1]}`, vsPrev[1], (s) => opt((v) => `${v > 0 ? '+' : ''}${pct(v)}`)(s.v), sv('v'), null, 'Variación de las recibidas en el último mes completo del periodo respecto al anterior.')] : []),
            fig('Al día', ST.map((s) => ({ n: s.n, v: s.n / d })), (s) => dec(s.v), sv('v'), null, 'Recibidas entre los días naturales del periodo.'),
            fig('Críticas o altas', ST, (s) => pct(s.crit + s.hi), (s) => s.crit + s.hi),
            fig('Peticiones de usuario', shareOf(T, (i) => C.sv[i] === REQ), sharePct, sv('v'))]),
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
      const R = (r) => DI.reason.indexOf(r);
      const VENDOR = R('THIRD_PARTY_VENDOR_ACTION_REQD'), CLIENT = [R('CLIENT_ACTION_REQUIRED'), R('CUSTOMER_FOLLOW_UP_REQUIRED')];
      const CRITICAL = DI.prio.indexOf('CRITICAL'), lm = C.lm, days = (min) => Math.floor(min / 1440);
      const idle = (i) => (lm ? now - lm[i] : null);   // sin ningún cambio desde hace (minutos); null con datos de antes de guardar el último cambio
      const IDLE = 5 * 1440;
      const late = (i) => { const l = m.SLA[C.pr[i]]; return C.ip[i] < 0 && l >= 0 && now - C.rep[i] > l; };
      const waits = (i) => (C.rs[i] === VENDOR ? 'v' : CLIENT.includes(C.rs[i]) ? 'c' : '');
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
    carga(A) {
      const T = bySide(A), ST = T.map(stats), d = days() || 1, sharePct = (s) => opt(pct)(s.v);
      const inA = (i) => SIDE[i] < 2;
      // lo que se cierra dentro del periodo, de cada lado, se abriera cuando se abriera
      const y = m.data.meta.year, from = minOf(y, S.from), to = minOf(y, S.to + 1);
      const closedIn = bySide(m.today()).map((l) => l.filter((i) => { const r = resAt(i); return r != null && r >= from && r < to; }).length);
      const op = A.filter((i) => OPEN[i]), people = S.sides.some((s) => s?.people), orphans = people ? [] : orphansIn();
      const CRITICAL = DI.prio.indexOf('CRITICAL');
      // filas de una dimensión: las n con más issues en `list` y, si hay más, «Resto» (así la tabla suma el total)
      const topRows = (dim, list, n) => {
        const g = group(dim, list), top = g.slice(0, n), keys = new Set(top.map((x) => x.k));
        const rows = top.map((x) => ({ label: m.DIMS[dim].label(x.k), test: (i) => C[dim][i] === x.k, f: `${dim}:${x.k}` }));
        return g.length > n ? [...rows, { label: `Resto (${g.length - n})`, test: (i) => !keys.has(C[dim][i]) }] : rows;
      };

      // lo que entra, mes a mes, por prioridad, tipo de servicio, tarjeta y tipo de operación
      const months = monthsIn().map((k) => ({ label: MONTHS[k] + (k === LASTM ? '*' : ''), test: (i) => MONTH[i] === k, f: `month:${k}` }));
      const inRows = [
        { head: 'Prioridad' }, ...PRIOS.map((p) => ({ label: nice(DI.prio[p]), test: (i) => C.pr[i] === p, f: `pr:${p}` })),
        { head: 'Tipo de servicio' }, ...topRows('sv', A, 4),
        { head: 'Tarjeta · una PRIO cuenta también en su SGA o SISU' }, ...CARDS.map((c, k) => ({ label: c, test: (i) => cardsOf(i).includes(k), f: `tj:${k}` })),
        { head: 'Tipo de operación' }, ...topRows('op', A, 7),
      ];
      const recibidas = { label: 'Recibidas', test: () => true };

      // lo pendiente: su situación y, aparte, lo que hay que vigilar
      // solo las situaciones que hay (una sin ninguna issue no aporta y quita sitio)
      const SIT = SITUATION.filter((x) => op.some(x.test));
      const pend = { label: 'Pendientes', test: inA };
      const stateRows = [
        ...SIT.map((s) => ({ ...s, test: (i) => inA(i) && s.test(i) })),
        { head: 'De lo pendiente, lo que conviene vigilar' },
        { label: 'Fuera de plazo', tip: 'Sin iniciar: nunca han pasado a En curso y ya superan su SLA.', test: (i) => inA(i) && late(i) },
        { label: 'Escaladas', tip: 'Con ticket de tercero.', test: (i) => inA(i) && C.vt[i] > 0 },
        { label: 'PRIO', test: (i) => inA(i) && cardsOf(i).includes(2), f: 'tj:2' },
        { label: 'Críticas', test: (i) => inA(i) && C.pr[i] === CRITICAL, f: `pr:${CRITICAL}` },
        ...(orphans.length ? [{ head: 'Aparte: SGA, SISU o PRIO sin nadie asignado' }, { label: 'Sin responsable', test: (i) => !C.as[i] }] : []),
      ];
      const prioRows = [{ head: 'Prioridad' }, ...PRIOS.map((p) => ({ label: nice(DI.prio[p]), test: (i) => C.pr[i] === p, f: `pr:${p}` })),
        { head: 'Tarjeta · una PRIO cuenta también en su SGA o SISU' }, ...CARDS.map((c, k) => ({ label: c, test: (i) => cardsOf(i).includes(k), f: `tj:${k}` }))];
      const modRows = topRows('mo', op, 12), esc3 = op.filter((i) => C.vt[i]);
      const st = { total: true, foot: pend, footTop: true };

      return grid(ask('carga'),
        section('Lo que entra', 'issues abiertas en el periodo'),
        kpis(kpiCo('Recibidas', ST, (s) => num(s.n), { val: (s) => s.n, note: 'abiertas en el periodo' }),
          kpiCo('Entran al día', ST.map((s) => ({ n: s.n, v: s.n / d })), (s) => dec(s.v), { val: (s) => s.v, note: 'de media, en días naturales' }),
          kpiCo('Cerramos al día', closedIn.map((v, k) => ({ n: v + ST[k].n, v: v / d })), (s) => dec(s.v), { val: (s) => s.v, better: 'high', note: 'de media, todo lo cerrado en el periodo' }),
          ...PRIOS.map((p) => kpiCo(`% ${PLURAL[DI.prio[p]] || nice(DI.prio[p])}`, ST.map((s) => ({ n: s.n, v: s.n ? s.prio[p] / s.n : null })), sharePct, { val: (s) => s.v, note: `SLA de inicio: ${slaLabel(p).split(' · ')[1]}` })),
          kpiCo('% Peticiones', shareOf(T, (i) => C.sv[i] === REQ), sharePct, { val: (s) => s.v, note: 'de usuario' })),
        card(S.from === S.to ? 'Día a día: lo que entra, lo que se cierra y lo que queda' : 'Mes a mes: lo que entra, lo que se cierra y lo que queda', ledger(A),
          { span: 's12', sub: `«Por cerrar»: de lo recibido cada mes, lo que sigue abierto hoy; su total son las pendientes de abajo. Pasa el ratón por una cabecera para ver qué cuenta.${S.from === S.to ? '' : ' Clic en un mes para filtrar; con un solo mes, día a día.'}` }),
        card('Qué entra cada mes', matrix(inRows, months, A, { total: true, share: true, foot: recibidas, footTop: true }),
          { span: 's12', sub: 'Recibidas de cada tipo cada mes; cada bloque suma las recibidas (salvo Tarjeta, donde una PRIO cuenta dos veces). * mes incompleto. Clic en una celda para filtrar.' }),

        section('Lo que queda pendiente', 'lo recibido en el periodo que sigue sin resolver'),
        stockKpis(T, ST),
        card('En qué situación está y desde cuándo', matrix(stateRows, AGES, [...op, ...orphans], { ...st, share: true, of: op.length }),
          { span: 's6', sub: 'Las situaciones suman las pendientes. Debajo, lo que conviene vigilar dentro de ellas, y aparte lo que no tiene responsable. Clic en una celda para filtrar.' }),
        card('Por prioridad y tarjeta', matrix(prioRows, SIT, op, st), { span: 's6', sub: 'En qué situación está lo pendiente de cada prioridad y tarjeta.' }),
        card('Por módulo: en qué situación', matrix(modRows, SIT, op, st), { span: 's6', sub: 'Los 12 módulos con más pendientes; «Resto», los demás. Clic en una celda para filtrar.' }),
        card('Por módulo: desde cuándo', matrix(modRows, AGES, op, st), { span: 's6', sub: 'Los mismos módulos, por lo que lleva abierto lo suyo.' }),
        card('Escaladas: a quién y desde cuándo', esc3.length ? matrix(topRows('vt', esc3, 10), AGES, esc3, { total: true, foot: { label: 'Escaladas', test: () => true }, footTop: true }) : '<p class="mt-mut mt-small">Nada escalado.</p>',
          { span: 's6', sub: 'Lo pendiente con ticket de tercero, por destino del escalado (prefijo del ticket).' }),
        card('Por centro: desde cuándo', matrix(topRows('ce', op, 10), AGES, op, st), { span: 's6', sub: 'Los 10 centros con más pendientes; «Resto», los demás.' }));
    },

    backlog(A) {
      const T = bySide(A), ST = T.map(stats), op = A.filter((i) => OPEN[i]);
      const oldest = op.slice().sort((a, b) => C.rep[a] - C.rep[b]).slice(0, ui.exp.old ? 100 : 15);
      const list = `<div class="mt-tablewrap"><table><thead><tr><th>Issue</th><th>Abierta</th><th>Título</th><th>Prioridad</th><th>Estado</th><th>Responsable</th></tr></thead><tbody>${oldest.map((i) => `<tr><td><a href="${REMEDY}${incId(C.id[i])}%22" target="_blank" rel="noopener">${incId(C.id[i])}</a></td><td>${dateOf(BASE, C.rep[i]).slice(0, 5)}</td><td>${esc(C.su[i])}</td><td>${nice(DI.prio[C.pr[i]])}</td><td>${nice(DI.status[C.st[i]])}${C.rs[i] ? ` · <span class="mt-mut">${esc(title(DI.reason[C.rs[i]]))}</span>` : ''}</td><td><span class="mt-pill mt-p${SIDE[i]}">${esc(m.DIMS.as.label(C.as[i]))}</span></td></tr>`).join('')}</tbody></table></div>${op.length > 15 ? `<button class="mt-more" data-exp="old">${ui.exp.old ? 'Ver menos' : 'Ver más'}</button>` : ''}`;
      const people = S.sides.some((s) => s?.people);
      return grid(ask('backlog'),
        stockKpis(T, ST),
        card(S.from === S.to ? 'Entran y salen, día a día' : 'Entran y salen, mes a mes', flow(A), { span: 's7', sub: S.from === S.to ? 'De lo recibido en el mes.' : 'De lo recibido en el periodo. Clic en un mes para filtrar; con un solo mes, se ve día a día.' }),
        card('Antigüedad de lo abierto', legend() + orderedBars('age', [0, 1, 2, 3, 4], { rows: op, id: 'op-age' }), { span: 's5', sub: 'Tiempo desde la apertura hasta la foto.' }),
        card('Módulo × antigüedad', heat('mo', 'age', 14, 5, { rows: op, skipR: noK, orderC: [0, 1, 2, 3, 4] }), { sub: 'Lo abierto hoy, por módulo y por cuánto lleva abierto. Clic en una celda para filtrar.' }),
        card('Módulo × motivo de espera', heat('mo', 'rs', 14, 8, { rows: op, skipR: noK }), { sub: 'A qué o a quién espera lo abierto en cada módulo («Sin dato»: sin motivo informado). Clic en una celda para filtrar.' }),
        card('Escaladas abiertas: a quién y desde cuándo', heat('vt', 'age', 10, 5, { rows: op.filter((i) => C.vt[i]), skipR: noK, orderC: [0, 1, 2, 3, 4] }), { span: 's12', sub: 'Lo abierto con ticket de tercero, por destino del escalado (prefijo del ticket) y antigüedad. Clic en una celda para filtrar.' }),
        card('Estado', legend() + bars('st', { id: 'op-st', rows: op, top: 4 }), { span: 's4' }),
        card('Prioridad', bars('pr', { id: 'op-pr', rows: op, top: 4 }), { span: 's4' }),
        card('Centros con más abiertas', bars('ce', { id: 'op-ce', rows: op, top: 8, skip: noK }), { span: 's4' }),
        card('Lo abierto, por tarjeta', backlogTable(), { span: 's12', sub: `Lo abierto hoy${people ? '' : ', tenga o no responsable'}. ${CARD_NOTE}` }),
        card('Las abiertas más antiguas', list, { span: 's12' }));
    },

    reparto(A) {
      const T = bySide(A), ST = T.map(stats), d = days() || 1;
      return grid(ask('reparto'),
        kpis(kpiCo('Recibidas', ST, (s) => num(s.n), { val: (s) => s.n }),
          kpiCo('Al día', ST.map((s) => ({ n: s.n, v: s.n / d })), (s) => dec(s.v), { val: (s) => s.v, note: 'días naturales del periodo' }),
          kpiCo('Críticas', ST, (s) => pct(s.crit, 1), { val: (s) => s.crit }),
          kpiCo('Críticas o altas', ST, (s) => pct(s.crit + s.hi), { val: (s) => s.crit + s.hi }),
          kpiCo('Peticiones de usuario', shareOf(T, (i) => C.sv[i] === REQ), (s) => pct(s.v), { val: (s) => s.v })),
        card('Issues por mes', legend() + monthly(A), { span: 's7', sub: 'Por fecha de apertura. * mes incompleto. Clic en un mes para filtrar.' }),
        card('Tarjeta', legend() + bars('tj', { top: 4 }), { span: 's5', sub: `${CARD_NOTE} Clic en una para ver todas las métricas solo de ella.` }),
        card('Prioridad × mes', heat('pr', 'month', 4, 12, { skipR: noK, orderR: PRIOS, orderC: monthsIn() }), { span: 's12', sub: 'Issues recibidas de cada prioridad cada mes. Clic en una celda para filtrar.' }),
        card('Tipo de servicio × mes', heat('sv', 'month', 6, 12, { skipR: noK, orderC: monthsIn() }), { span: 's7', sub: 'Incidencias frente a peticiones, mes a mes. Clic en una celda para filtrar.' }),
        card('Tipo de operación', compare('op'), { span: 's5', sub: 'Derivado del prefijo de la categoría de producto 2.' }));
    },

    modulos(A) {
      const gc = group('ce', A).filter((x) => x.k), tc = gc.reduce((a, x) => a + x.n, 0);
      let acc = 0, k80 = 0;
      for (const x of gc) { acc += x.n; k80++; if (acc >= tc * 0.8) break; }
      const sub = 'Cuanto más oscuro, más issues. Clic en una celda para filtrar por ambos.';
      return grid(ask('modulos'),
        card('Módulos / sistemas', ranking('mo', ['n', 'sh', 'mix', 'crit', 'sla', 'fr', 'avg', 'p90', 'd1', 'reop', 'vend', 'open', 'tr'], { id: 'md-mo', skip: noK, top: 15 }), { span: 's12', sub: 'Categoría de producto 3. Clic en una cabecera para ordenar; clic en un módulo para ver todas las métricas solo de ese módulo.' }),
        card('Centro × módulo', heat('ce', 'mo', 18, 14, { skipR: noK, skipC: noK }), { span: 's12', sub: `Los 18 centros y 14 módulos con más issues. ${sub}` }),
        card('Tema × módulo', heat('th', 'mo', 16, 14, { skipR: noTheme, skipC: noK }), { span: 's12', sub: `Temas detectados por palabras clave en el título; una issue puede estar en varios. ${sub}` }),
        card('Prioridad × módulo', heat('pr', 'mo', 4, 14, { skipR: noK, skipC: noK, orderR: PRIOS }), { span: 's12', sub }),
        card('Centros', ranking('ce', ['n', 'sh', 'mix', 'crit', 'avg', 'vend', 'tr', 'dl'], { skip: noK, top: 15 }), { span: 's12', sub: `${k80} centros de ${gc.length} concentran el 80 % del volumen. Clic en una cabecera para ordenar; clic en un centro para ver todas las métricas solo de ese centro.` }),
        card('Problemas que más se repiten', ranking('de', ['n', 'sh', 'avg', 'd1', 'reop', 'vend', 'tr'], { id: 'md-de', skip: noK, min: 5, top: 15 }), { span: 's12', sub: 'Mismo título tras quitar centro, criticidad y números: lo que vuelve una y otra vez y cuánto cuesta resolverlo. Clic en uno para ver todas las métricas solo de ese problema.' }),
        card('Módulos que suben y bajan', movers('mo', { skip: noK }), { sub: 'Últimos 90 días de la foto frente a los 90 anteriores.' }),
        card('Centros que suben y bajan', movers('ce', { skip: noK }), { sub: 'Últimos 90 días de la foto frente a los 90 anteriores.' }),
        card('Temas en los títulos', legend() + bars('th', { top: 14 }), { sub: 'Detectados por palabras clave; una issue puede estar en varios. «Sin tema» son títulos que no encajan en ninguno.' }),
        card('Major incidents por centro', bars('ce', { id: 'mi-ce', rows: A.filter((i) => C.fl[i] & MAJOR), top: 10, skip: noK }), { sub: 'Issues con la etiqueta de major incident en sus notas de trabajo.' }));
    },

    resolucion(A) {
      const ST = bySide(A).map(stats), tot = (s) => s.time.reduce((x, y) => x + y, 0) || 1;
      const known = group('vk', A, true).filter((x) => x.k && x.n >= 5);
      const kt = `<div class="mt-tablewrap ${ui.exp.known ? 'mt-scroll' : ''}"><table><thead><tr><th>Ticket</th><th class="mt-num">Incidencias</th><th class="mt-num">Centros</th>${CMP() ? '<th>Reparto</th>' : ''}<th>Primera</th><th>Última</th><th class="mt-num">Media resol.</th><th>Título más habitual</th></tr></thead><tbody>${known.slice(0, ui.exp.known ? 200 : 15).map((x) => {
        const ce = new Set(x.rows.map((i) => C.ce[i])).size, f = Math.min(...x.rows.map((i) => C.rep[i])), l = Math.max(...x.rows.map((i) => C.rep[i]));
        const ti = group('de', x.rows).find((y) => y.k);   // el título más habitual
        return `<tr class="mt-clk ${isSel('vk', x.k) ? 'mt-sel' : ''}" data-f="vk:${x.k}"><td><b>${esc(DI.vkey[x.k])}</b></td><td class="mt-num">${x.n}</td><td class="mt-num">${ce}</td>${CMP() ? `<td>${mini(x.t)}</td>` : ''}<td>${dateOf(BASE, f).slice(0, 5)}</td><td>${dateOf(BASE, l).slice(0, 5)}</td><td class="mt-num">${dur(stats(x.rows).avg)}</td><td class="mt-mut">${ti ? esc(m.DESCL[ti.k]) : ''}</td></tr>`;
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
