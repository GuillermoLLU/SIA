// Las pestañas de las Métricas, una por área del servicio. Cada una recibe
// las issues que pasan los filtros (A) y devuelve su HTML. Con los dos lados
// (A frente a B: empresas o personas), cada indicador es la diferencia de A
// respecto a B; con uno, sus valores.
import { esc } from '../ui/html.js';
import { num, pct, dur, nice, title, dateOf, MONTHS, DOWS } from './format.js';
import { SCOPES, MAJOR, IA_MARKS, share } from './model.js';

export const TABS = [['resumen', 'Resumen'], ['reparto', 'Reparto'], ['respuesta', 'Respuesta'], ['sla', 'SLA de inicio'], ['resolucion', 'Resolución'],
  ['backlog', 'Backlog'], ['escalados', 'Escalados'], ['calidad', 'Calidad del trabajo'], ['focos', 'Focos'], ['modulos', 'Módulos'],
  ['cobertura', 'Cobertura horaria'], ['ia', 'IA']];

const MONTH_NOTE = 'Por mes de apertura. * mes incompleto: los últimos meses salen mejor de lo que acabarán, porque lo lento aún no se ha resuelto.';
const REMEDY = 'https://itx.onbmc.com/arsys/servlet/ViewFormServlet?server=onbmc-s&form=HPD:Help+Desk&qual=%271000000161%27%3D%22';
const incId = (id) => `INC${String(id).padStart(12, '0')}`;

export const createTabs = (m, ch, ui) => {
  const { C, DI, N, S, BASE, LASTM, PRIOS, slaLabel, MONTH, DOW, HOUR, OPEN, SIDE, CMP, CO, NAMES, isSel, rows, stats, group, bySide } = m;
  const name = (k) => NAMES()[k];
  const { card, legend, kpi, kpis, kpiCo, diff, bars, orderedBars, monthly, lines, ranking, compare, heat, timeBars, movers, mini } = ch;
  const noK = (k) => k === 0;
  const noTheme = (k) => k === m.data.themes.length;
  const REQ = DI.svc.indexOf('USER_SERVICE_REQUEST');
  const slaPct = (s) => (s.sla == null ? '—' : pct(s.sla));
  const inPeriod = (i) => MONTH[i] >= S.from && MONTH[i] <= S.to;

  // Tabla de cortes fijos (prioridad, ámbito, franja, día): una fila por corte; la diferencia entre los lados o el valor del único que se mira.
  const SLICE = {
    n: ['Issues', (s) => num(s.n), (s) => s.n], fr: ['1.ª actuación (media)', (s) => dur(s.fr), (s) => s.fr, 'low'],
    f30: ['1.ª act. en < 30 min', (s) => pct(s.f30), (s) => s.f30, 'high'], f120: ['1.ª act. en < 2 h', (s) => pct(s.f120), (s) => s.f120, 'high'],
    avg: ['Media resol.', (s) => dur(s.avg), (s) => s.avg, 'low'], p90: ['P90 resol.', (s) => dur(s.p90), (s) => s.p90, 'low'],
    h4: ['Resueltas en < 4 h', (s) => pct(s.h4), (s) => s.h4, 'high'], d1: ['en < 24 h', (s) => pct(s.d1), (s) => s.d1, 'high'], d3: ['en < 72 h', (s) => pct(s.d3), (s) => s.d3, 'high'],
    reop: ['Reabiertas', (s) => pct(s.reop, 1), (s) => s.reop, 'low'], bounce: ['Devueltas a cola', (s) => pct(s.bounce, 1), (s) => s.bounce, 'low'],
    noCat: ['Sin tipología', (s) => pct(s.noCat, 1), (s) => s.noCat, 'low'], noDesc: ['Título sin descripción', (s) => pct(s.noDesc, 1), (s) => s.noDesc, 'low'],
    noRes: ['Sin texto de resolución', (s) => pct(s.noRes, 1), (s) => s.noRes, 'low'],
    sla: ['Dentro de SLA', slaPct, (s) => s.sla, 'high'], ip: ['Media hasta En curso', (s) => dur(s.ip), (s) => s.ip, 'low'], ip90: ['P90 hasta En curso', (s) => dur(s.ip90), (s) => s.ip90, 'low'],
    slaKo: ['Fuera de SLA', (s) => num(s.slaKo), (s) => s.slaKo], waitKo: ['Sin iniciar y fuera de plazo', (s) => num(s.waitKo), (s) => s.waitKo],
    noIp: ['Cerradas sin pasar por En curso', (s) => pct(s.noIp, 1), (s) => s.noIp],
    vend: ['Con ticket de tercero', (s) => pct(s.vend), (s) => s.vend], pend: ['Pasan por pendiente', (s) => pct(s.pend), (s) => s.pend], crit: ['Críticas', (s) => pct(s.crit, 1), (s) => s.crit],
  };
  const cell = (st, [, f, v, bt]) => (CMP() ? diff(st[0], st[1], f, v, bt) : f(st[CO()[0]]));
  const slices = (first, defs, A, cols) => `<div class="mt-tablewrap"><table><thead><tr><th>${first}</th>${cols.map((c) => `<th class="mt-num">${SLICE[c][0]}</th>`).join('')}</tr></thead><tbody>${defs.map(([label, test, f]) => {
    const st = bySide(A.filter(test)).map(stats);
    return `<tr ${f ? `class="mt-clk" data-f="${f}"` : ''}><td>${label}</td>${cols.map((c) => `<td class="mt-num">${cell(st, SLICE[c])}</td>`).join('')}</tr>`;
  }).join('')}</tbody></table></div>`;
  const byPrio = (A, cols, label = (p) => nice(DI.prio[p]), first = 'Prioridad') => slices(first, PRIOS.map((p) => [label(p), (i) => C.pr[i] === p, `pr:${p}`]), A, cols);
  const byScope = (A, cols) => slices('Ámbito', [2, 1, 3, 0].map((k) => [SCOPES[k], (i) => C.sc[i] === k, `sc:${k}`]), A, cols);
  const byMonthT = (A, cols) => slices('Mes', MONTHS.map((mm, k) => [mm + (k === LASTM ? '*' : ''), (i) => MONTH[i] === k, `month:${k}`]).filter((_, k) => k >= S.from && k <= S.to), A, cols);
  const HOURS = [['Laborable · 6 a 14 h', (i) => DOW[i] < 5 && HOUR[i] >= 6 && HOUR[i] < 14], ['Laborable · 14 a 22 h', (i) => DOW[i] < 5 && HOUR[i] >= 14 && HOUR[i] < 22],
    ['Laborable · 22 a 6 h', (i) => DOW[i] < 5 && (HOUR[i] >= 22 || HOUR[i] < 6)], ['Sábado y domingo', (i) => DOW[i] >= 5]];
  const byHours = (A, cols) => slices('Cuándo se abre', HOURS, A, cols);

  // Cuadro de indicadores del resumen.
  const METRICS = [
    ['Respuesta y resolución', [
      ['Media hasta la primera actuación', (s) => dur(s.fr), (s) => s.fr, 'low', 'Hasta el primer cambio de estado real.'],
      ['Primera actuación en menos de 30 min', (s) => pct(s.f30), (s) => s.f30, 'high'],
      ['Dentro del SLA de inicio', slaPct, (s) => s.sla, 'high', 'Pasan a En curso dentro del plazo de su prioridad: crítica 15 min, alta 45 min, media 2 h, baja 8 h.'],
      ['Media de resolución', (s) => dur(s.avg), (s) => s.avg, 'low', 'Desde la apertura hasta la última resolución. Horas naturales.'],
      ['P90 de resolución', (s) => dur(s.p90), (s) => s.p90, 'low', 'El 90 % se resuelve en menos de este tiempo.'],
      ['Resueltas en menos de 4 h', (s) => pct(s.h4), (s) => s.h4, 'high'], ['Resueltas en menos de 24 h', (s) => pct(s.d1), (s) => s.d1, 'high']]],
    ['Calidad del trabajo', [
      ['Reabiertas', (s) => pct(s.reop, 1), (s) => s.reop, 'low', 'Volvieron de Resuelta a un estado abierto.'],
      ['Devueltas a la cola', (s) => pct(s.bounce, 1), (s) => s.bounce, 'low', 'Pasaron de En curso a Asignada al menos una vez.'],
      ['Sin tipología informada', (s) => pct(s.noCat, 1), (s) => s.noCat, 'low'],
      ['Título que no describe el problema', (s) => pct(s.noDesc, 1), (s) => s.noDesc, 'low', 'El título solo indica centro y módulo.'],
      ['Cerradas sin texto de resolución', (s) => pct(s.noRes, 1), (s) => s.noRes, 'low']]],
    ['Carga y dependencias', [
      ['Issues', (s) => num(s.n), (s) => s.n], ['Críticas', (s) => pct(s.crit, 1), (s) => s.crit], ['Críticas o altas', (s) => pct(s.crit + s.hi), (s) => s.crit + s.hi],
      ['Pasan por «pendiente»', (s) => pct(s.pend), (s) => s.pend], ['Con ticket de tercero', (s) => pct(s.vend), (s) => s.vend]]],
    ['Backlog', [['Abiertas ahora', (s) => num(s.open), (s) => s.open], ['Abiertas con más de 30 días', (s) => num(s.open30), (s) => s.open30]]],
  ];
  const scorecard = (ST) => {
    const cmp = CMP(), cos = CO();
    return `<table><thead><tr><th></th>${cmp ? `<th class="mt-num">${esc(name(0))} respecto a ${esc(name(1))}</th>` : cos.map((k) => `<th class="mt-num"><span class="mt-sw mt-c${k}"></span>${esc(name(k))}</th>`).join('')}</tr></thead><tbody>${METRICS.map(([g, list]) =>
      `<tr class="mt-grp"><td colspan="${cmp ? 2 : cos.length + 1}">${g}</td></tr>${list.map(([l, f, val, bt, tip]) => `<tr><td ${tip ? `data-tip="${esc(tip)}"` : ''}>${l}</td>${cmp ? `<td class="mt-num">${diff(ST[0], ST[1], f, val, bt)}</td>` : cos.map((k) => `<td class="mt-num">${ST[k].n ? f(ST[k]) : '—'}</td>`).join('')}</tr>`).join('')}`).join('')}</tbody></table>`;
  };

  // Lo abierto por ámbito: lo de cada lado y, aparte, lo que aún no tiene responsable.
  const backlogTable = () => {
    const cos = CO(), bk = SCOPES.map(() => [0, 0, 0]);
    for (let i = 0; i < N; i++) {
      if (!OPEN[i] || !inPeriod(i)) continue;
      if (SIDE[i] < 2) bk[C.sc[i]][SIDE[i]]++;
      else if (!C.as[i]) bk[C.sc[i]][2]++;
    }
    const cols = [...cos, 2], tot = cols.map((k) => bk.reduce((a, x) => a + x[k], 0));
    return `<table><thead><tr><th>Ámbito</th>${cos.map((k) => `<th class="mt-num"><span class="mt-sw mt-c${k}"></span>${esc(name(k))}</th>`).join('')}<th class="mt-num"><span class="mt-sw mt-c2"></span>Sin responsable</th><th class="mt-num">Total</th></tr></thead><tbody>${[2, 1, 3, 0].map((j) => `<tr class="mt-clk ${isSel('sc', j) ? 'mt-sel' : ''}" data-f="sc:${j}"><td>${SCOPES[j]}</td>${cols.map((k) => `<td class="mt-num">${num(bk[j][k])}</td>`).join('')}<td class="mt-num"><b>${num(cols.reduce((a, k) => a + bk[j][k], 0))}</b></td></tr>`).join('')}
      <tr class="mt-grp"><td>Total</td>${tot.map((v) => `<td class="mt-num">${num(v)}</td>`).join('')}<td class="mt-num">${num(tot.reduce((a, b) => a + b, 0))}</td></tr></tbody></table>`;
  };
  const section = (t, small = '') => `<h2 class="mt-sec">${t}${small ? `<small>${small}</small>` : ''}</h2>`;
  const grid = (...parts) => `<div class="mt-grid">${parts.join('')}</div>`;

  const VIEWS = {
    resumen(A) {
      const ST = bySide(A).map(stats);
      return grid(kpis(kpiCo('Issues', ST, (s) => num(s.n), { val: (s) => s.n }),
          kpiCo('Primera actuación', ST, (s) => dur(s.fr), { val: (s) => s.fr, better: 'low' }),
          kpiCo('Media de resolución', ST, (s) => dur(s.avg), { val: (s) => s.avg, better: 'low' }),
          kpiCo('Resueltas en < 24 h', ST, (s) => pct(s.d1), { val: (s) => s.d1, better: 'high' }),
          kpiCo('Reabiertas', ST, (s) => pct(s.reop, 1), { val: (s) => s.reop, better: 'low' }),
          kpiCo('Abiertas ahora', ST, (s) => num(s.open), { val: (s) => s.open })),
        card('Indicadores', scorecard(ST), { span: 's7', sub: CMP() ? `Diferencia de ${esc(name(0))} respecto a ${esc(name(1))}: en rojo si ${esc(name(0))} está peor, en verde si está mejor. Pasa el ratón por una cifra para ver los dos valores.` : 'Pasa el ratón por un indicador para ver cómo se calcula.' }),
        card('Evolución mes a mes', `${legend()}<p class="mt-small"><b>Issues recibidas</b></p>${lines(A, (s) => s.n, num)}<p class="mt-small"><b>Media de resolución</b></p>${lines(A, (s) => s.avg, dur)}<p class="mt-small"><b>Media hasta la primera actuación</b></p>${lines(A, (s) => s.fr, dur)}`, { span: 's5', sub: 'Cada punto son las issues que entraron ese mes (por fecha de apertura): cuántas, y su media de resolución y de primera actuación. Un mes con menos de 10 issues no se pinta. * mes incompleto: los últimos meses salen mejor de lo que acabarán, porque lo lento aún no se ha resuelto.' }));
    },

    reparto(A) {
      const T = bySide(A), ST = T.map(stats);
      return grid(kpis(kpiCo('Issues', ST, (s) => num(s.n), { val: (s) => s.n }), kpiCo('Críticas', ST, (s) => pct(s.crit, 1), { val: (s) => s.crit }),
        kpiCo('Críticas o altas', ST, (s) => pct(s.crit + s.hi), { val: (s) => s.crit + s.hi }),
        kpiCo('Peticiones de usuario', T.map((l) => ({ n: l.length, v: share(l, (i) => C.sv[i] === REQ) })), (s) => pct(s.v), { val: (s) => s.v })),
      card('Issues por mes', legend() + monthly(A), { span: 's7', sub: 'Por fecha de apertura. * mes incompleto. Clic en un mes para filtrar.' }),
      card('Ámbito', legend() + bars('sc', { top: 4 }), { span: 's5', sub: 'Según los filtros de Remedy con los que Indra reconoce su backlog. Clic en un ámbito para ver todas las métricas solo ahí.' }),
      card('Tipo de operación', compare('op'), { sub: 'Derivado del prefijo de la categoría de producto 2.' }),
      card('Módulo / sistema', compare('mo', { top: 12 }), { sub: 'Categoría de producto 3.' }),
      card('Prioridad', compare('pr')),
      card('Tipo de servicio', compare('sv')),
      card('Issues por mes, en cifras', byMonthT(A, ['n', 'crit']), { span: 's12', sub: 'Por mes de apertura. Con un ámbito marcado se ve cómo ha ido pasando ese trabajo de una empresa a otra.' }));
    },

    respuesta(A) {
      const ST = bySide(A).map(stats);
      return grid(kpis(kpiCo('Media hasta la primera actuación', ST, (s) => dur(s.fr), { val: (s) => s.fr, better: 'low' }),
        kpiCo('Primera actuación en < 30 min', ST, (s) => pct(s.f30), { val: (s) => s.f30, better: 'high' }),
        kpiCo('Primera actuación en < 2 h', ST, (s) => pct(s.f120), { val: (s) => s.f120, better: 'high' }),
        kpiCo('Devueltas a la cola', ST, (s) => pct(s.bounce, 1), { val: (s) => s.bounce, better: 'low', note: 'de En curso a Asignada' })),
      card('Por prioridad', byPrio(A, ['n', 'fr', 'f30', 'f120']), { sub: 'Primera actuación = primer cambio de estado real desde la apertura.' }),
      card('Por ámbito', byScope(A, ['n', 'fr', 'f30', 'f120'])),
      card('Por franja horaria', byHours(A, ['n', 'fr', 'f30', 'f120']), { sub: 'Hora de apertura tal cual viene en el dato (sin convertir zona horaria).' }),
      card('Evolución de la primera actuación', legend() + lines(A, (s) => s.fr, dur), { sub: 'Media por mes de apertura. * mes incompleto.' }),
      card('Por módulo / sistema', ranking('mo', ['n', 'mix', 'fr', 'f30', 'f120', 'bounce'], { id: 'rs-mo', skip: noK, min: 60, top: 12 }), { span: 's12', sub: 'Módulos con al menos 60 issues. Clic en una cabecera para ordenar.' }),
      card('Por centro', ranking('ce', ['n', 'mix', 'fr', 'f30', 'f120', 'bounce'], { id: 'rs-ce', skip: noK, min: 60, top: 12 }), { span: 's12', sub: 'Centros con al menos 60 issues.' }));
    },

    sla(A) {
      const ST = bySide(A).map(stats), byP = (p) => bySide(A.filter((i) => C.pr[i] === p)).map(stats);
      const cols = ['n', 'sla', 'ip', 'ip90', 'slaKo', 'waitKo', 'noIp'];
      return grid(kpis(kpiCo('Dentro del SLA de inicio', ST, slaPct, { val: (s) => s.sla, better: 'high', note: 'todas las prioridades' }),
        ...PRIOS.map((p) => kpiCo(slaLabel(p), byP(p), slaPct, { val: (s) => s.sla, better: 'high', note: 'dentro del SLA' })),
        kpiCo('Sin iniciar y fuera de plazo', ST, (s) => num(s.waitKo), { val: (s) => s.waitKo, note: 'abiertas que nunca han pasado a En curso' })),
      card('Por prioridad', byPrio(A, cols, slaLabel, 'Prioridad y SLA'), { span: 's12', sub: 'SLA de inicio: de la apertura de la issue al primer paso a En curso, en tiempo natural. «Fuera de SLA» suma las iniciadas tarde y las abiertas que siguen sin iniciar pasado el plazo; las cerradas sin pasar por En curso no entran en el %.' }),
      card('Cómo se inician respecto al SLA', legend() + orderedBars('sl', [0, 1, 2, 3, 4, 5, 6]), { sub: 'Cuánto tarda cada issue en pasar a En curso comparado con el plazo de su prioridad. Clic en un tramo para filtrar.' }),
      card('Evolución del % dentro del SLA', legend() + lines(A, (s) => s.sla, (v) => pct(v)), { sub: 'Por mes de apertura. * mes incompleto.' }),
      card('Por ámbito', byScope(A, cols), { span: 's12' }),
      card('Por franja horaria', byHours(A, cols), { span: 's12', sub: 'Hora de apertura tal cual viene en el dato (sin convertir zona horaria). Los plazos se cuentan en tiempo natural, también de noche y en fin de semana.' }),
      card('Por módulo / sistema', ranking('mo', ['n', 'mix', 'crit', 'sla', 'ip', 'slaKo'], { id: 'sla-mo', skip: noK, min: 60, sort: 'slaKo', top: 12 }), { span: 's12', sub: 'Módulos con al menos 60 issues, ordenados por las que quedan fuera de SLA. Clic en una cabecera para ordenar.' }));
    },

    resolucion(A) {
      const ST = bySide(A).map(stats);
      return grid(kpis(kpiCo('Media de resolución', ST, (s) => dur(s.avg), { val: (s) => s.avg, better: 'low' }),
        kpiCo('P90 de resolución', ST, (s) => dur(s.p90), { val: (s) => s.p90, better: 'low' }),
        kpiCo('Resueltas en < 4 h', ST, (s) => pct(s.h4), { val: (s) => s.h4, better: 'high' }),
        kpiCo('Resueltas en < 24 h', ST, (s) => pct(s.d1), { val: (s) => s.d1, better: 'high' }),
        kpiCo('Resueltas en < 72 h', ST, (s) => pct(s.d3), { val: (s) => s.d3, better: 'high' })),
      card('Cuánto tardan en resolverse', legend() + orderedBars('tb', [0, 1, 2, 3, 4, 5, 6, 7, 8]), { sub: 'Desde la apertura hasta la última resolución, en horas naturales (cuenta noches y fines de semana).' }),
      card('Dónde se va el tiempo', `${timeBars(ST)}<p class="mt-mut mt-small">Suma del tiempo que las issues pasan en cada estado hasta resolverse, según el historial de cambios. «En cola» incluye el tiempo que vuelven a estar asignadas tras un pendiente. Todo el tiempo de una issue se cuenta a su responsable actual.</p>`, { sub: 'Reparto del tiempo total de vida de las issues por estado.' }),
      card('Por prioridad', byPrio(A, ['n', 'avg', 'p90', 'h4', 'd1', 'd3'])),
      card('Por ámbito', byScope(A, ['n', 'avg', 'p90', 'h4', 'd1', 'd3'])),
      card('Evolución de la media de resolución', legend() + lines(A, (s) => s.avg, dur), { sub: MONTH_NOTE }),
      card('Evolución de las resueltas en < 24 h', legend() + lines(A, (s) => s.d1, (v) => pct(v)), { sub: MONTH_NOTE }),
      card('Por módulo / sistema', ranking('mo', ['n', 'mix', 'avg', 'p90', 'h4', 'd1', 'pend', 'vend'], { id: 'rv-mo', skip: noK, min: 60, top: 12 }), { span: 's12', sub: 'Módulos con al menos 60 issues. Clic en una cabecera para ordenar.' }),
      card('Por centro', ranking('ce', ['n', 'mix', 'avg', 'p90', 'h4', 'd1', 'pend', 'vend'], { id: 'rv-ce', skip: noK, min: 60, top: 12 }), { span: 's12', sub: 'Centros con al menos 60 issues.' }),
      card('Por tema del título', ranking('th', ['n', 'mix', 'avg', 'p90', 'h4', 'd1', 'pend', 'vend'], { id: 'rv-th', min: 60, top: 12 }), { span: 's12', sub: 'Temas detectados por palabras clave en el título; una issue puede estar en varios.' }));
    },

    backlog(A) {
      const ST = bySide(A).map(stats), op = A.filter((i) => OPEN[i]);
      let orphan = 0; for (let i = 0; i < N; i++) if (OPEN[i] && !C.as[i] && inPeriod(i)) orphan++;
      const oldest = op.slice().sort((a, b) => C.rep[a] - C.rep[b]).slice(0, ui.exp.old ? 100 : 15);
      const list = `<div class="mt-tablewrap"><table><thead><tr><th>Issue</th><th>Abierta</th><th>Título</th><th>Prioridad</th><th>Estado</th><th>Responsable</th></tr></thead><tbody>${oldest.map((i) => `<tr><td><a href="${REMEDY}${incId(C.id[i])}%22" target="_blank" rel="noopener">${incId(C.id[i])}</a></td><td>${dateOf(BASE, C.rep[i]).slice(0, 5)}</td><td>${esc(C.su[i])}</td><td>${nice(DI.prio[C.pr[i]])}</td><td>${nice(DI.status[C.st[i]])}${C.rs[i] ? ` · <span class="mt-mut">${esc(title(DI.reason[C.rs[i]]))}</span>` : ''}</td><td><span class="mt-pill mt-p${SIDE[i]}">${esc(m.DIMS.as.label(C.as[i]))}</span></td></tr>`).join('')}</tbody></table></div>${op.length > 15 ? `<button class="mt-more" data-exp="old">${ui.exp.old ? 'Ver menos' : 'Ver más'}</button>` : ''}`;
      return grid(kpis(kpiCo('Abiertas ahora', ST, (s) => num(s.open), { val: (s) => s.open }), kpiCo('Con más de 30 días', ST, (s) => num(s.open30), { val: (s) => s.open30 }),
        kpi('Abiertas sin responsable', num(orphan), 'en todo el grupo, sin contar a ninguna empresa', 'mt-t2')),
      card('Lo abierto, por ámbito', backlogTable(), { span: 's7', sub: 'Todo lo abierto hoy, tenga o no responsable. Los ámbitos SISU y SGA son los filtros con los que Indra reconoce su backlog.' }),
      card('Antigüedad', legend() + orderedBars('age', [0, 1, 2, 3, 4], { rows: op, id: 'op-age' }), { span: 's5', sub: 'Tiempo desde la apertura hasta la foto.' }),
      card('Estado', legend() + bars('st', { id: 'op-st', rows: op, top: 4 }), { span: 's4' }),
      card('Motivo de estado', bars('rs', { id: 'op-rs', rows: op, top: 8 }), { span: 's4', sub: 'A qué o a quién están esperando.' }),
      card('Prioridad', bars('pr', { id: 'op-pr', rows: op, top: 4 }), { span: 's4' }),
      card('Centros con más abiertas', bars('ce', { id: 'op-ce', rows: op, top: 12, skip: noK })),
      card('Módulos con más abiertas', bars('mo', { id: 'op-mo', rows: op, top: 12 })),
      card('Las abiertas más antiguas', list, { span: 's12', sub: 'De lo que se compara arriba. Para ver las que no tienen responsable, elige «Sin asignar / fuera» en uno de los lados.' }));
    },

    escalados(A) {
      const withT = A.filter((i) => C.vt[i]), without = A.filter((i) => !C.vt[i]);
      const SB = bySide(A).map(stats), SW = bySide(withT).map(stats), SN = bySide(without).map(stats), tot = (s) => s.time.reduce((x, y) => x + y, 0) || 1;
      const known = group('vk', A, true).filter((x) => x.k && x.n >= 5);
      const kt = `<div class="mt-tablewrap ${ui.exp.known ? 'mt-scroll' : ''}"><table><thead><tr><th>Ticket</th><th class="mt-num">Incidencias</th><th class="mt-num">Centros</th><th>Reparto</th><th>Primera</th><th>Última</th><th class="mt-num">Media resol.</th><th>Título más habitual</th></tr></thead><tbody>${known.slice(0, ui.exp.known ? 200 : 15).map((x) => {
        const ce = new Set(x.rows.map((i) => C.ce[i])).size, f = Math.min(...x.rows.map((i) => C.rep[i])), l = Math.max(...x.rows.map((i) => C.rep[i]));
        const ti = group('de', x.rows).find((y) => y.k);   // el título más habitual
        return `<tr class="mt-clk ${isSel('vk', x.k) ? 'mt-sel' : ''}" data-f="vk:${x.k}"><td><b>${esc(DI.vkey[x.k])}</b></td><td class="mt-num">${x.n}</td><td class="mt-num">${ce}</td><td>${mini(x.t)}</td><td>${dateOf(BASE, f).slice(0, 5)}</td><td>${dateOf(BASE, l).slice(0, 5)}</td><td class="mt-num">${dur(stats(x.rows).avg)}</td><td class="mt-mut">${ti ? esc(m.DESCL[ti.k]) : ''}</td></tr>`;
      }).join('')}</tbody></table></div>${known.length > 15 ? `<button class="mt-more" data-exp="known">${ui.exp.known ? 'Ver menos' : `Ver todos (${num(known.length)})`}</button>` : ''}`;
      return grid(kpis(kpiCo('Con ticket de tercero', SB, (s) => pct(s.vend), { val: (s) => s.vend }),
        kpiCo('Pasan por «pendiente»', SB, (s) => pct(s.pend), { val: (s) => s.pend }),
        kpiCo('Media con ticket', SW, (s) => dur(s.avg), { val: (s) => s.avg, better: 'low' }),
        kpiCo('Media sin ticket', SN, (s) => dur(s.avg), { val: (s) => s.avg, better: 'low' }),
        kpiCo('Tiempo esperando a terceros', SB, (s) => pct(s.time[3] / tot(s)), { val: (s) => s.time[3] / tot(s), note: 'del tiempo de vida' }),
        kpiCo('Tiempo esperando al centro', SB, (s) => pct(s.time[2] / tot(s)), { val: (s) => s.time[2] / tot(s), note: 'del tiempo de vida' })),
      card('A quién se escala', legend() + bars('vt', { top: 12, skip: noK }), { span: 's5', sub: 'Prefijo escrito en el campo «Vendor Ticket Number», tal cual. Solo issues con ticket.' }),
      card('Proyectos Jira que reciben más', ranking('vp', ['n', 'mix', 'crit', 'avg', 'p90', 'pend'], { skip: noK, top: 12 }), { span: 's7', sub: 'Por la clave que aparece en el ticket de tercero (p. ej. SGAEWMSAP-7037 → SGAEWMSAP).' }),
      card('Por prioridad', byPrio(A, ['n', 'vend', 'pend', 'avg'])),
      card('Por ámbito', byScope(A, ['n', 'vend', 'pend', 'avg'])),
      card('Un mismo ticket, muchas incidencias', kt, { span: 's12', sub: 'Tickets de desarrollo a los que se han ligado 5 o más incidencias. Clic en uno para ver esas incidencias en todas las métricas.' }),
      card('Módulos que más se escalan', ranking('mo', ['n', 'mix', 'vend', 'pend', 'avg', 'p90'], { id: 'esc-mo', skip: noK, min: 80, sort: 'vend', top: 12 }), { span: 's12', sub: 'Módulos con al menos 80 issues.' }));
    },

    calidad(A) {
      const ST = bySide(A).map(stats), cols = ['n', 'reop', 'bounce', 'noCat', 'noDesc', 'noRes'];
      return grid(kpis(kpiCo('Reabiertas', ST, (s) => pct(s.reop, 1), { val: (s) => s.reop, better: 'low', note: 'de Resuelta a abierta' }),
        kpiCo('Devueltas a la cola', ST, (s) => pct(s.bounce, 1), { val: (s) => s.bounce, better: 'low', note: 'de En curso a Asignada' }),
        kpiCo('Sin tipología', ST, (s) => pct(s.noCat, 1), { val: (s) => s.noCat, better: 'low' }),
        kpiCo('Título sin descripción', ST, (s) => pct(s.noDesc, 1), { val: (s) => s.noDesc, better: 'low', note: 'solo centro y módulo' }),
        kpiCo('Cerradas sin texto de resolución', ST, (s) => pct(s.noRes, 1), { val: (s) => s.noRes, better: 'low' })),
      card('Por prioridad', byPrio(A, cols), { span: 's12' }),
      card('Por ámbito', byScope(A, cols), { span: 's12' }),
      card('Evolución de las reabiertas', legend() + lines(A, (s) => s.reop, (v) => pct(v, 1)), { sub: 'Por mes de apertura. * mes incompleto.' }),
      card('Evolución de las cerradas sin texto de resolución', legend() + lines(A, (s) => s.noRes, (v) => pct(v, 1)), { sub: 'Por mes de apertura. * mes incompleto.' }),
      card('Cómo se tipifica', compare('k3', { top: 12 }), { sub: 'Categorización 3 de Remedy, tal cual está informada.' }),
      card('Resoluciones que más se repiten', bars('rz', { top: 12, skip: noK }), { sub: 'Textos de resolución idénticos (salvo números) usados 4 veces o más.' }),
      card('Por módulo / sistema', ranking('mo', ['n', 'mix', 'reop', 'bounce', 'noCat', 'noDesc', 'noRes'], { id: 'ql-mo', min: 60, top: 12 }), { span: 's12', sub: 'Módulos con al menos 60 issues. Clic en una cabecera para ordenar.' }));
    },

    focos(A) {
      const gc = group('ce', A).filter((x) => x.k), tc = gc.reduce((a, x) => a + x.n, 0);
      let acc = 0, k80 = 0;
      for (const x of gc) { acc += x.n; k80++; if (acc >= tc * 0.8) break; }
      return grid(card('Centros', ranking('ce', ['n', 'sh', 'mix', 'crit', 'avg', 'vend', 'tr', 'dl'], { skip: noK, top: 15 }), { span: 's12', sub: `${k80} centros de ${gc.length} concentran el 80 % del volumen. Clic en una cabecera para ordenar; clic en una fila para ver todas las métricas solo de ese centro.` }),
        card('Centros que suben y bajan', movers('ce', { skip: noK }), { sub: 'Últimos 90 días de la foto frente a los 90 anteriores.' }),
        card('Temas en los títulos', legend() + bars('th', { top: 14 }), { sub: 'Detectados por palabras clave; una issue puede estar en varios. «Sin tema» son títulos que no encajan en ninguno.' }),
        card('Títulos que más se repiten', legend() + bars('de', { top: 14, skip: noK }), { sub: 'Mismo texto tras quitar centro, criticidad y números.' }),
        card('Tipo de operación', legend() + bars('op', { top: 10 })),
        card('Major incidents por centro', bars('ce', { id: 'mi-ce', rows: A.filter((i) => C.fl[i] & MAJOR), top: 10, skip: noK }), { sub: 'Issues con la etiqueta de major incident en sus notas de trabajo.' }));
    },

    modulos(A) {
      const op = A.filter((i) => OPEN[i]), sub = 'Cuanto más oscuro, más issues. Pasa el ratón por una celda para ver el reparto por lado; clic para filtrar por ambos.';
      return grid(card('Módulos / sistemas', ranking('mo', ['n', 'sh', 'mix', 'crit', 'sla', 'fr', 'avg', 'p90', 'd1', 'reop', 'vend', 'open', 'tr'], { id: 'md-mo', skip: noK, top: 15 }), { span: 's12', sub: 'Categoría de producto 3. Clic en una cabecera para ordenar; clic en un módulo para ver todas las métricas solo de ese módulo.' }),
        card('Centro × módulo', heat('ce', 'mo', 18, 14, { skipR: noK, skipC: noK }), { span: 's12', sub: `Los 18 centros y 14 módulos con más issues. ${sub}` }),
        card('Tema × módulo', heat('th', 'mo', 16, 14, { skipR: noTheme, skipC: noK }), { span: 's12', sub: `Temas detectados por palabras clave en el título; una issue puede estar en varios. ${sub}` }),
        card('Prioridad × módulo', heat('pr', 'mo', 4, 14, { skipR: noK, skipC: noK, orderR: PRIOS }), { span: 's12', sub }),
        card('Módulos que suben y bajan', movers('mo', { skip: noK }), { sub: 'Últimos 90 días de la foto frente a los 90 anteriores.' }),
        card('Módulos con más abiertas', legend() + bars('mo', { id: 'md-op', rows: op, top: 12, skip: noK }), { sub: 'Abiertas hoy.' }));
    },

    cobertura(A) {
      const hh = Array.from({ length: 7 }, () => new Array(24).fill(0)); for (const i of A) hh[DOW[i]][HOUR[i]]++;
      const mx = Math.max(1, ...hh.flat()), cols = ['n', 'crit', 'fr', 'f30', 'avg', 'd1'];
      const hours = `<div class="mt-tablewrap"><table class="mt-hm mt-hours"><thead><tr><th></th>${hh[0].map((_, h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${hh.map((r, d) => `<tr><th class="mt-r">${DOWS[d]}</th>${r.map((v, h) => {
        const a = v ? Math.round(6 + 94 * v / mx) : 0;
        return `<td class="${a > 50 ? 'mt-hot' : ''}" style="--mt-a:${a}%" data-f2="dow:${d}|hour:${h}" data-tip="${DOWS[d]} ${h}:00–${h}:59\n${num(v)} issues">${v || ''}</td>`;
      }).join('')}</tr>`).join('')}</tbody></table></div>`;
      return grid(card('Por franja horaria', byHours(A, cols), { span: 's12', sub: 'Según la hora de apertura tal cual viene en el dato (sin convertir zona horaria).' }),
        card('Por día de la semana', slices('Día', DOWS.map((d, k) => [d, (i) => DOW[i] === k, `dow:${k}`]), A, cols), { span: 's12' }),
        card('Cuándo llegan las issues', hours, { span: 's12', sub: 'Issues recibidas por día de la semana y hora de apertura. Cuanto más oscuro, más issues. Clic en una celda para filtrar.' }),
        card('Llegadas por hora', legend() + orderedBars('hour', [...Array(24).keys()]), { sub: 'Clic en una hora para filtrar.' }),
        card('Llegadas por día', legend() + orderedBars('dow', [0, 1, 2, 3, 4, 5, 6])));
    },

    ia(A) {
      const ia = A.filter((i) => C.fl[i] & IA_MARKS), T = bySide(A), TI = bySide(ia);
      const count = (label, b, note) => kpiCo(label, T.map((l) => ({ n: l.length, v: l.filter((i) => C.fl[i] & b).length })), (s) => num(s.v), { val: (s) => s.v, note });
      const extra = (s, l) => { s.req = share(l, (i) => C.sv[i] === REQ); s.rep = share(l, (i) => C.rz[i] > 0); };
      const SI = TI.map(stats), SN = T.map((l) => stats(l.filter((i) => !(C.fl[i] & IA_MARKS))));
      return grid(kpis(count('Issues con alguna marca de IA', IA_MARKS, 'en TAGS o en notas'), count('Con marca IA_SOLVED…', 32, 'en TAGS'), count('Con intervención de IA', 2048, 'notas [ACT IA], [INFORME IA]…'),
        count('Revisión humana OK', 4096, '[HITL_REVIEW_OK] en notas'), count('IA fallida o no OK', 8192 | 64, 'IA_FAIL, HITL no OK…'),
        kpiCo('Media con IA', SI, (s) => dur(s.avg), { val: (s) => s.avg }), kpiCo('Media sin IA', SN, (s) => dur(s.avg), { val: (s) => s.avg })),
      section('Issues donde ya interviene la IA', `${num(ia.length)} issues con alguna marca de IA`),
      card('Por mes', legend() + monthly(ia), { span: 's4' }),
      card('Por módulo', bars('mo', { id: 'ia-mo', rows: ia, top: 10 }), { span: 's4' }),
      card('Por tema', bars('th', { id: 'ia-th', rows: ia, top: 10 }), { span: 's4' }),
      card('Por centro', bars('ce', { id: 'ia-ce', rows: ia, top: 10 }), { span: 's4' }),
      card('Por tipología', bars('k3', { id: 'ia-k3', rows: ia, top: 10 }), { span: 's4' }),
      card('Resultado', bars('fl', { id: 'ia-fl', rows: ia, top: 15, skip: (x) => ![5, 6, 11, 12, 13].includes(x) }), { span: 's4', sub: 'Marcas de IA presentes en esas issues.' }),
      section('Trabajo repetitivo'),
      card('Temas: volumen, rapidez y repetición', ranking('th', ['n', 'mix', 'req', 'rep', 'avg', 'd1', 'vend'], { id: 'rep-th', extra, top: 27 }),
        { span: 's12', sub: '«% peticiones» = tipo de servicio Petición de usuario. «% resolución repetida» = issues cuyo texto de resolución se ha usado 4 veces o más.' }),
      card('Tipología: volumen, rapidez y repetición', ranking('k3', ['n', 'mix', 'req', 'rep', 'avg', 'd1', 'vend'], { id: 'rep-k3', extra, top: 15, min: 50 }), { span: 's12' }),
      card('Títulos que más se repiten', bars('de', { id: 'rep-de', top: 15, skip: noK })),
      card('Resoluciones que más se repiten', bars('rz', { id: 'rep-rz', top: 15, skip: noK })));
    },
  };

  return { render: (tab, A) => VIEWS[tab](A) };
};
