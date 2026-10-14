// Las pestañas de las Métricas. Siguen el orden en que se analiza el servicio y cada una responde
// a una pregunta (QUESTIONS): el Resumen las contesta todas de un vistazo y cada pestaña da el
// detalle. Reciben las issues que pasan los filtros (A) y devuelven su HTML. Se mira un lado (el
// equipo, una persona o varias); si se compara con otro, cada indicador es la diferencia de A
// respecto a B.
import { esc } from '../ui/html.js';
import { num, dec, pct, dur, nice, title, dateOf, MONTHS, DOWS } from './format.js';
import { SCOPES, MAJOR, IA_MARKS, share } from './model.js';
import { SHIFTS, SHIFT_HOURS, DAYS, MIN_ACTIONS } from './shifts.js';

export const TABS = [['resumen', 'Resumen'], ['backlog', 'Backlog'], ['reparto', 'Reparto'], ['modulos', 'Módulos y focos'],
  ['resolucion', 'Resolución y escalados'], ['sla', 'SLA y calidad'], ['ia', 'IA'], ['turnos', 'Turnos']];
const QUESTIONS = {
  resumen: ['¿Cómo vamos?', 'Cada bloque responde a una pregunta con sus cifras clave; el detalle, en su pestaña.'],
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
  const { card, legend, kpi, kpis, kpiCo, diff, bars, orderedBars, monthly, lines, ranking, compare, heat, timeBars, movers, mini, day, split } = ch;
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
  const table = (first, defs, rowsHtml) => `<div class="mt-tablewrap"><table><thead><tr><th>${first}</th>${defs.map((d) => `<th class="mt-num" ${d[4] ? `data-tip="${esc(d[4])}"` : ''}>${d[0]}</th>`).join('')}</tr></thead><tbody>${rowsHtml}</tbody></table></div>`;
  const slices = (first, defs, A, cols) => table(first, cols.map((c) => SLICE[c]), defs.map(([label, test, f]) => {
    const st = bySide(A.filter(test)).map(stats);
    return `<tr ${f ? `class="mt-clk" data-f${f.includes('|') ? '2' : ''}="${f}"` : ''}><td>${label}</td>${cols.map((c) => `<td class="mt-num">${cell(st, SLICE[c])}</td>`).join('')}</tr>`;
  }).join(''));
  const byPrio = (A, cols, label = (p) => nice(DI.prio[p]), first = 'Prioridad') => slices(first, PRIOS.map((p) => [label(p), (i) => C.pr[i] === p, `pr:${p}`]), A, cols);
  const SCOPE_SHORT = ['Fuera de los filtros', 'SGA', 'SISU', 'Petición de usuario ECOM'];
  const byScope = (A, cols) => slices('Ámbito', [2, 1, 3, 0].map((k) => [`<span data-tip="${esc(SCOPES[k])}">${SCOPE_SHORT[k]}</span>`, (i) => C.sc[i] === k, `sc:${k}`]), A, cols);

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

  // Entran y salen, mes a mes, de lo recibido en el periodo: recibidas, resueltas ese mes, el saldo y
  // lo que quedaba abierto al cerrar el mes.
  const FLOW = [['Recibidas', (s) => num(s.in), (s) => s.in], ['Resueltas', (s) => num(s.out), (s) => s.out, 'high'],
    ['Saldo', (s) => `${s.out - s.in > 0 ? '+' : ''}${num(s.out - s.in)}`, (s) => s.out - s.in, 'high', 'Resueltas menos recibidas: en positivo, la pila baja; en negativo, crece.'],
    ['Pendientes al cierre del mes', (s) => num(s.open), (s) => s.open, 'low', 'De lo recibido desde el inicio del periodo, lo que seguía abierto el último día del mes.']];
  const flow = (A) => {
    const ms = monthsIn(), T = bySide(A);
    const per = [0, 1].map((k) => {
      const r = ms.map(() => ({ in: 0, out: 0, open: 0 }));
      for (const i of T[k]) {
        const a = MONTH[i] - S.from, rm = resAt(i) == null ? 99 : new Date(BASE + C.res[i] * 6e4).getUTCMonth();
        r[a].in++;
        if (rm <= S.to) r[rm - S.from].out++;
        for (let j = a; j < ms.length; j++) if (ms[j] < rm) r[j].open++;
      }
      return r.map((x) => ({ ...x, n: x.in + x.out + x.open }));
    });
    return table('Mes', FLOW, ms.map((k, j) => `<tr class="mt-clk" data-f="month:${k}"><td>${MONTHS[k]}${k === LASTM ? '*' : ''}</td>${FLOW.map((d) => `<td class="mt-num">${cell([per[0][j], per[1][j]], d)}</td>`).join('')}</tr>`).join(''));
  };

  // Lo abierto por ámbito: lo de cada lado y, aparte (si se mira una empresa, no personas), lo que aún
  // no tiene responsable.
  const backlogTable = () => {
    const cos = CO(), bk = SCOPES.map(() => [0, 0, 0]), orphans = !S.sides.some((x) => x?.people);
    for (let i = 0; i < N; i++) {
      if (!OPEN[i] || !inPeriod(i)) continue;
      if (SIDE[i] < 2) bk[C.sc[i]][SIDE[i]]++;
      else if (!C.as[i]) bk[C.sc[i]][2]++;
    }
    const cols = orphans ? [...cos, 2] : cos, tot = cols.map((k) => bk.reduce((a, x) => a + x[k], 0));
    return `<table><thead><tr><th>Ámbito</th>${cos.map((k) => `<th class="mt-num"><span class="mt-sw mt-c${k}"></span>${esc(name(k))}</th>`).join('')}${orphans ? '<th class="mt-num"><span class="mt-sw mt-c2"></span>Sin responsable</th>' : ''}<th class="mt-num">Total</th></tr></thead><tbody>${[2, 1, 3, 0].map((j) => `<tr class="mt-clk ${isSel('sc', j) ? 'mt-sel' : ''}" data-f="sc:${j}"><td>${SCOPES[j]}</td>${cols.map((k) => `<td class="mt-num">${num(bk[j][k])}</td>`).join('')}<td class="mt-num"><b>${num(cols.reduce((a, k) => a + bk[j][k], 0))}</b></td></tr>`).join('')}
      <tr class="mt-grp"><td>Total</td>${tot.map((v) => `<td class="mt-num">${num(v)}</td>`).join('')}<td class="mt-num">${num(tot.reduce((a, b) => a + b, 0))}</td></tr></tbody></table>`;
  };

  // --- Resumen: un bloque por pregunta, con sus cifras clave y el paso a su pestaña. Cada cifra es la
  // de lo que se mira y, al comparar, al lado, la diferencia con el otro lado.
  const fig = (label, ST, fmt, val, better, tip) => {
    const a = ST[CO()[0]];
    return `<div class="mt-fig" ${tip ? `data-tip="${esc(tip)}"` : ''}><span>${esc(label)}</span><b>${a.n ? fmt(a) : '—'}</b>${CMP() ? diff(ST[0], ST[1], fmt, val, better) : ''}</div>`;
  };
  const answer = (tab, figs) => `<section class="mt-card mt-ans"><header><h3>${QUESTIONS[tab][0]}</h3><button class="mt-go" data-go="${tab}">${TABS.find(([k]) => k === tab)[1]} →</button></header><div class="mt-figs">${figs.join('')}</div></section>`;
  const days = () => m.periodSlots().reduce((a, b) => a + b, 0) / 3;

  const VIEWS = {
    resumen(A) {
      const T = bySide(A), ST = T.map(stats), d = days() || 1, sv = (v) => (s) => s[v];
      const top = (dim, n) => group(dim, T[CO()[0]]).filter((x) => x.k).slice(0, n);
      const mods = top('mo', 3), ce = top('ce', 1);
      const inSet = (dim, ks) => (i) => ks.includes(C[dim][i]);
      const ia = shareOf(T, (i) => C.fl[i] & IA_MARKS), iaDone = ST.map((s) => ({ n: s.n, v: s.resolved ? s.ia / s.resolved : null }));
      const count = (b) => T.map((l) => ({ n: l.length, v: l.filter((i) => C.fl[i] & b).length }));
      const sharePct = (s) => opt(pct)(s.v);
      return grid(ask('resumen'),
        `<div class="mt-answers">${[
          answer('backlog', [
            fig('Abiertas ahora', ST, (s) => num(s.open), sv('open'), 'low'),
            fig('Sin iniciar y fuera de plazo', ST, (s) => num(s.waitKo), sv('waitKo'), 'low', 'Abiertas que nunca han pasado a En curso y ya superan el plazo de su prioridad.'),
            fig('Con más de 30 días', ST, (s) => num(s.open30), sv('open30'), 'low'),
            fig('Sin resolver de lo recibido', ST.map((s) => ({ n: s.n, v: s.n ? s.open / s.n : null })), sharePct, sv('v'), 'low')]),
          answer('reparto', [
            fig('Recibidas', ST, (s) => num(s.n), sv('n')),
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

    backlog(A) {
      const ST = bySide(A).map(stats), op = A.filter((i) => OPEN[i]);
      let orphan = 0; for (let i = 0; i < N; i++) if (OPEN[i] && !C.as[i] && inPeriod(i)) orphan++;
      const oldest = op.slice().sort((a, b) => C.rep[a] - C.rep[b]).slice(0, ui.exp.old ? 100 : 15);
      const list = `<div class="mt-tablewrap"><table><thead><tr><th>Issue</th><th>Abierta</th><th>Título</th><th>Prioridad</th><th>Estado</th><th>Responsable</th></tr></thead><tbody>${oldest.map((i) => `<tr><td><a href="${REMEDY}${incId(C.id[i])}%22" target="_blank" rel="noopener">${incId(C.id[i])}</a></td><td>${dateOf(BASE, C.rep[i]).slice(0, 5)}</td><td>${esc(C.su[i])}</td><td>${nice(DI.prio[C.pr[i]])}</td><td>${nice(DI.status[C.st[i]])}${C.rs[i] ? ` · <span class="mt-mut">${esc(title(DI.reason[C.rs[i]]))}</span>` : ''}</td><td><span class="mt-pill mt-p${SIDE[i]}">${esc(m.DIMS.as.label(C.as[i]))}</span></td></tr>`).join('')}</tbody></table></div>${op.length > 15 ? `<button class="mt-more" data-exp="old">${ui.exp.old ? 'Ver menos' : 'Ver más'}</button>` : ''}`;
      const people = S.sides.some((s) => s?.people);
      return grid(ask('backlog'),
        kpis(kpiCo('Abiertas ahora', ST, (s) => num(s.open), { val: (s) => s.open }),
          kpiCo('Sin iniciar y fuera de plazo', ST, (s) => num(s.waitKo), { val: (s) => s.waitKo, note: 'nunca han pasado a En curso' }),
          kpiCo('Con más de 30 días', ST, (s) => num(s.open30), { val: (s) => s.open30 }),
          people ? '' : kpi('Abiertas sin responsable', num(orphan), 'en todo el grupo, aún sin nadie asignado', 'mt-t2')),
        card('Entran y salen, mes a mes', flow(A), { span: 's7', sub: 'De lo recibido en el periodo. Clic en un mes para filtrar.' }),
        card('Antigüedad de lo abierto', legend() + orderedBars('age', [0, 1, 2, 3, 4], { rows: op, id: 'op-age' }), { span: 's5', sub: 'Tiempo desde la apertura hasta la foto.' }),
        card('Módulo × antigüedad', heat('mo', 'age', 14, 5, { rows: op, skipR: noK, orderC: [0, 1, 2, 3, 4] }), { sub: 'Lo abierto hoy, por módulo y por cuánto lleva abierto. Clic en una celda para filtrar.' }),
        card('Módulo × motivo de espera', heat('mo', 'rs', 14, 8, { rows: op, skipR: noK }), { sub: 'A qué o a quién espera lo abierto en cada módulo («Sin dato»: sin motivo informado). Clic en una celda para filtrar.' }),
        card('Estado', legend() + bars('st', { id: 'op-st', rows: op, top: 4 }), { span: 's4' }),
        card('Prioridad', bars('pr', { id: 'op-pr', rows: op, top: 4 }), { span: 's4' }),
        card('Centros con más abiertas', bars('ce', { id: 'op-ce', rows: op, top: 8, skip: noK }), { span: 's4' }),
        card('Lo abierto, por ámbito', backlogTable(), { span: 's12', sub: `Lo abierto hoy${people ? '' : ', tenga o no responsable'}. SISU y SGA son los filtros de Remedy con los que el equipo reconoce su backlog.` }),
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
        card('Ámbito', legend() + bars('sc', { top: 4 }), { span: 's5', sub: 'Según los filtros de Remedy con los que el equipo reconoce su backlog. Clic en un ámbito para ver todas las métricas solo ahí.' }),
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
        card('Por ámbito', byScope(A, cols)),
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
        card('Por ámbito', byScope(A, ['n', 'sla', 'fr', 'reop', 'bounce', 'noRes']), { span: 's12' }),
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
          kpiCo('Empezadas en su turno', ST, (s) => opt(pct)(s.inShift), { val: (s) => s.inShift, better: 'high', note: 'en el turno en que entran' })),
        card('Turno a turno', table('Turno', TCOLS, rowsHtml), { span: 's12', sub: 'Por el turno en que entra cada issue; el trabajo (resueltas, personas, acciones), por el turno en que se hace. Clic en una fila para filtrar. Pasa el ratón por una cabecera para ver cómo se calcula.' }),
        card('El día en 24 horas', curves, { span: 's12', sub: 'Issues que entran, que se empiezan (pasan a En curso) y que se resuelven en cada hora, en todo el periodo. Si la línea de las que entran va por encima, en esas horas se acumula trabajo.' }),
        card('¿Qué se queda para el turno siguiente?', split(['En su turno', 'En el siguiente', 'Más tarde', 'Sin pasar por En curso'], carryRows), { sub: 'De lo que entra en cada turno, cuándo se empieza. «Sin pasar por En curso»: abiertas sin empezar o cerradas sin ese paso.' }),
        card('Por día de la semana', slices('Día', DOWS.map((dw, k) => [dw, (i) => DOW[i] === k, `dow:${k}`]), A, ['n', 'sla', 'inShift', 'ip', 'avg'])),
        card('Cuándo llegan las issues', clockHeat(A, (i) => C.rep[i], true), { span: 's12', sub: 'Issues recibidas por día de la semana y hora. Cuanto más oscuro, más issues; las líneas marcan los cambios de turno. Clic en una celda para filtrar.' }),
        card('Cuándo se resuelven', clockHeat(A, resAt, false), { span: 's12', sub: 'Las mismas issues, por el día y la hora en que se resolvieron.' }));
    },
  };

  return { render: (tab, A) => VIEWS[tab](A) };
};
