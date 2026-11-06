// Equipo soporte (sin DOM): un control rápido del equipo y de cada
// persona con lo que importa para seguir la calidad del servicio: el SLA de
// inicio, los tiempos, la calidad del trabajo, las tareas y la cola. Con los
// datos de las Métricas (web/src/metrics/model.js); el detalle, en Métricas.
//
// Las cifras de cada persona son sus datos, sin colores: aquí no se compara.
// Con menos de MIN issues en el periodo, sus porcentajes y medias dicen poco:
// al ordenar por ellos, esas personas van al final.
import { esc } from '../ui/html.js';
import { SCOPE, slaText } from '../metrics/model.js';
import { num, dec, pct, dur, DOWS } from '../metrics/format.js';
import { monthTicks } from '../metrics/plot.js';
import { shiftCounts, perTurn, teamPerTurn } from './per-shift.js';
import { sheetBody } from '../metrics/sheet.js';
import { TEAM_SHEET_COLS } from './team-sheet.js';
import { weekdayAverages } from './weekdays.js';
import { dailyActivity, turnsByDay, comparePerDay, activityPanel, axisDay } from './activity.js';

const MIN = 10;
const DAY = 1440;   // minutos
const WEEKDAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábados', 'Domingos'];

const donePct = (s) => (s.slaDone == null ? '—' : pct(s.slaDone));
// Tan: lo que pasan En curso las resueltas (rt[1], stats de model.js)
const tan = (s) => (s.resolved ? s.rt[1] / s.resolved : null);

// Columnas de la tabla por persona: [cabecera, cómo se ve, valor, qué es mejor, qué mide]. Las de
// prioridad se añaden con el modelo (sus índices dependen de los datos).
const COLS = {
  n: ['Issues', (s) => num(s.n), (s) => s.n, null, 'Issues que tiene asignadas, creadas en el periodo.'],
  open: ['Pendientes', (s) => num(s.open), (s) => s.open, null, 'Las que tiene asignadas y siguen sin resolver.'],
  sla: ['SLA cumplido', donePct, (s) => s.slaDone, 'high',
    `De las que ha resuelto, el % que pasó a En curso dentro del plazo de su prioridad: ${slaText()}.`],
  tatt: ['Tatt medio', (s) => dur(s.ip), (s) => s.ip, 'low', 'Tiempo medio desde que se abre la issue hasta que pasa a En curso por primera vez, de las que han empezado (como en las Métricas del servicio).'],
  tan: ['Tan medio', (s) => dur(tan(s)), tan, 'low', 'De las que ha resuelto, tiempo medio de análisis: la suma de los tramos En curso, sin las esperas en Pendiente.'],
  avg: ['TTR medio', (s) => dur(s.avg), (s) => s.avg, 'low', 'Tiempo medio de resolución (TTR): desde que se abre la issue hasta que se resuelve, en horas y días naturales.'],
  reop: ['Reabiertas', (s) => pct(s.reop, 1), (s) => s.reop, 'low', '% de issues que se reabrieron después de resolverse.'],
  ...shiftCols(),
  iqa: ['%IQA', () => '—', () => null, 'high', 'De las auditadas, el % con calidad 3 o 4 (sobre 4: la nota mínima de técnica, proceso y comunicación). Pendiente: la nota del agente de calidad (tarea #55) aún no llega a SIA.'],
  ia: ['Con IA', (s) => (s.resolved ? pct(s.ia / s.resolved, 1) : '—'), (s) => (s.resolved ? s.ia / s.resolved : null), null, 'De las que ha resuelto, el % en el que intervino la IA (marcas en TAGS o en las notas).'],
};

// Por turno trabajado (per-shift.js): resueltas, escaladas a proveedor y pendientes de cliente, en total y partidas en
// entrantes (entraron en ese mismo turno) y backlog (entraron antes)
function shiftCols() {
  const what = { r: ['RPT', 'Resueltas'], v: ['EPPT', 'Escaladas a proveedor'], c: ['PCPT', 'Pasadas a pendiente de cliente'] };
  const part = { '': '', e: ' de entrantes: las que se abrieron en el turno en que actuó', b: ' de backlog: las que se abrieron antes' };
  const NOTE = ' Cada paso es de quien lo hizo. Los turnos se deducen de su actividad (cambios y notas): las acciones a menos de 6 h forman una sesión; desde 3 h o 30 acciones vale 1 turno (más de 12 h, horas / 8 redondeado) y, más corta, su parte de 8 h. En la fila del equipo, el total del equipo entre sus turnos.';
  return Object.fromEntries(Object.entries(what).flatMap(([k, [code, label]]) => Object.entries(part).map(([x, txt]) => [`${k}${x}`,
    [`${code}${x}`, (s) => (s.shift?.[`${k}${x}`] == null ? '—' : dec(s.shift[`${k}${x}`])), (s) => s.shift?.[`${k}${x}`] ?? null, k === 'r' ? 'high' : null,
      `${label} por turno trabajado${txt}.${NOTE}`]])));
}

const icon = (d) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${d}</svg>`;
const CHART_ICON = icon('<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>');
const DATA_ICON = icon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 9h4M7 13h10M7 17h7"/>');
// bloques que se leen mejor como gráfica: siempre así, sin icono para cambiar
const CHART_ONLY = new Set(['volume', 'ia']);

// La pestaña «Conclusiones de calidad», a la que se llega desde el bloque Calidad: de momento, sin contenido.
export const conclusionsPanel = () => `<div class="wk-panel">
    <div class="wk-page-h"><button class="wk-switch-view" data-page="team">← Equipo soporte</button><h3>Conclusiones de calidad</h3></div>
    <div class="mt-empty"><b>En construcción</b></div>
  </div>`;

// Lo que filtra el panel: la persona (ui.person) y los días elegidos en la actividad (ui.range), que pueden ir sueltos
// dentro del periodo que abarcan. Sin días, cuenta las issues creadas en el periodo, de su responsable (assigned). Con días,
// lo hecho en ellos, de quien lo hizo: las issues con algún paso suyo esos días (worked) y las que resolvió (solved), en
// doers por persona y en done, las de lo que se mira. doing: si un paso es de lo que se mira.
const scope = (m, ui) => {
  const { C, data } = m, who = ui.person ?? null, own = m.S.sides[0].company;
  const chosen = ui.range && new Set(ui.range.days), inDays = (min) => !chosen || chosen.has(Math.floor(min / DAY) * DAY);
  const doing = (p) => (who == null ? data.company[p] === own : p === who);
  const sc = { who, chosen, inDays, doing, assigned: (i) => who == null || C.as[i] === who };
  if (!chosen) return sc;
  const blank = () => ({ worked: new Set(), solved: new Set() }), doers = new Map(), all = blank();
  for (const i of m.today()) {
    for (const [kind, t, p] of C.sp?.[i] || []) {
      if (data.company[p] !== own || !inDays(t)) continue;
      if (!doers.has(p)) doers.set(p, blank());
      for (const o of [doers.get(p), all]) { o.worked.add(i); if (kind === 0) o.solved.add(i); }
    }
  }
  return { ...sc, doers, done: who == null ? all : doers.get(who) || blank() };
};

// Las issues del panel, con sus filtros.
const panelRows = (m, sc) => (sc.chosen ? [...sc.done.worked] : m.rows().filter(sc.assigned));

// Las incidencias de la sábana: las del panel, de la más antigua a la más reciente.
export const teamIssues = (m, ui) => panelRows(m, scope(m, ui)).sort((a, b) => m.C.rep[a] - m.C.rep[b]);

// m: el modelo de las Métricas; ch: sus piezas (charts.js); ui.sort.team: [columna, ±1];
// ui.charts: los bloques que se ven como gráfica; ui.person: la persona a la que se filtra (sin ella, todo el equipo);
// ui.range: los días elegidos en la actividad; ui.actSeries: la serie que se compara con la media del equipo.
export const teamPanel = (m, ch, ui) => {
  const { card, lines } = ch;
  const sc = scope(m, ui), { who, assigned, doing, inDays, chosen, done, doers } = sc;
  // con días elegidos: cuántas y su cola, de lo trabajado; los tiempos y la calidad, de lo resuelto esos días
  const statsOf = (rows, solved = done?.solved) => {
    if (!chosen) return m.stats(rows);
    const { n, open, t, prio, ip } = m.stats(rows);
    return { ...m.stats(rows.filter((i) => solved.has(i))), n, open, t, prio, ip };
  };
  const A = panelRows(m, sc), name = m.NAMES()[0], ST = m.bySide(A).map((rows) => statsOf(rows));
  const mineLabel = who == null ? 'Asignadas al equipo' : 'Asignadas a esta persona';

  // las prioridades, una columna cada una (cuántas de cada)
  const PRIO = { CRITICAL: 'Críticas', HIGH: 'Altas', MEDIUM: 'Medias', LOW: 'Bajas' };
  const cols = { ...COLS };
  for (const p of m.PRIOS) cols[`p${p}`] = [PRIO[m.DI.prio[p]], (s) => num(s.prio[p]), (s) => s.prio[p], null, `Issues de prioridad ${m.slaLabel(p)}.`];
  const order = ['n', 'open', ...m.PRIOS.map((p) => `p${p}`), 'sla', 'tatt', 'tan', 'avg', 'reop', 'r', 're', 'rb', 'v', 've', 'vb', 'c', 'ce', 'cb', 'iqa', 'ia'];

  // Pendientes: todo lo que el equipo tiene sin resolver (caiga o no en sus búsquedas de Remedy) y lo
  // que espera en sus búsquedas (SGA y SISU) sin asignar o asignado a otros; de las issues abiertas en el periodo.
  const { C, OPEN, MONTH, S, N, TEAM } = m, own = m.S.sides[0].company;
  const queue = { all: 0, mine: 0, orphan: 0, months: Array.from({ length: m.LASTM + 1 }, () => [0, 0, 0]) };   // por mes: equipo, sin asignar, otros
  for (let i = 0; i < N; i++) {
    if (!OPEN[i] || !(chosen ? done.worked.has(i) : m.inPeriod(i) && assigned(i))) continue;
    const mine = C.as[i] && TEAM[i] === own;
    if (!mine && C.sc[i] !== SCOPE.SGA && C.sc[i] !== SCOPE.SISU) continue;
    const who = mine ? 0 : !C.as[i] ? 1 : 2;
    queue.all++;
    if (who === 0) queue.mine++; else if (who === 1) queue.orphan++;
    queue.months[MONTH[i]][who]++;
  }

  // Un bloque por tema: su cifra principal, unas pocas de apoyo y, si ayuda, una barra.
  const k0 = 0;
  const fig = (fmt, stats = ST) => fmt(stats[k0]);
  const item = (label, html, sw = '') => `<div class="wk-item"><span>${sw ? `<i class="mt-sw ${sw}"></i>` : ''}${label}</span><b>${html}</b></div>`;
  // Cada bloque se ve como cifras o como su gráfica mes a mes; el icono de la cabecera cambia de una
  // vista a otra. En la gráfica se queda arriba, en pequeño, la cifra principal.
  const charts = ui.charts || new Set();
  // CHART_ONLY: bloques que se ven siempre como gráfica, sin icono para cambiar.
  const block = (id, title, label, hero, items, extra, chart) => {
    const fixed = CHART_ONLY.has(id), asChart = fixed || charts.has(id);
    // en los bloques que son siempre gráfica, `extra` va en la línea del título, a la derecha
    const link = id === 'quality' ? '<button class="wk-block-link" data-page="conclusions">Conclusiones de calidad</button>' : '';
    const months = charts.has('volumeMonths');   // Volumen: por día de la semana o, con su icono, por mes
    const toggle = id === 'volume' ? `<button class="wk-chart-btn" data-chart="volumeMonths" title="${months ? 'Ver por día de la semana' : 'Ver por mes'}">${months ? DATA_ICON : CHART_ICON}</button>` : '';
    const head = `<div class="wk-block-h"><h3>${title}</h3>${link}${fixed ? `${extra}${toggle}` : `<button class="wk-chart-btn" data-chart="${id}" title="${asChart ? 'Ver los datos' : `Ver la evolución por ${m.daily() ? 'día' : 'mes'}`}">${asChart ? DATA_ICON : CHART_ICON}</button>`}</div>`;
    if (!asChart) return `<section class="wk-block">${head}<div class="wk-hero"><b>${hero}</b><span>${label}</span></div>${extra}<div class="wk-items">${items.join('')}</div></section>`;
    // Calidad: la gráfica sigue las reaperturas hasta que llegue la nota del %IQA
    const note = { queue: 'Lo que sigue sin resolver de cada mes, por mes de creación.', volume: '', quality: `Reaperturas, por ${m.daily() ? 'día' : 'mes'} de creación. El %IQA llegará con la nota del agente de calidad.` }[id]
      ?? (m.daily() ? 'Por día de creación. * Día de la última carga: aún puede cambiar.' : 'Por mes de creación. * Mes en curso: aún puede cambiar.');
    return `<section class="wk-block wk-as-chart">${head}<div class="wk-key"><b>${hero}</b><span>${label}</span></div>
      <div class="wk-chart">${typeof chart === 'function' ? chart() : lines(chosen ? A.filter(m.inPeriod) : A, ...chart, { height: 150, left: 78 })}</div>${note ? `<p class="wk-note">${note}</p>` : ''}</section>`;
  };
  // nuevas y resueltas de cada mes: las creadas ese mes y los pasos a Resuelta de ese mes, de quien los hizo, aunque se
  // crearan antes; dos columnas por mes
  const flow = Array.from({ length: m.LASTM + 1 }, () => [0, 0]);
  let resolvedIn = 0;   // la media al día de resueltas cuenta lo mismo que su barra, también lo creado antes del periodo
  const newDays = new Set(), resolvedDays = new Set(), flowAt = { in: [], out: [] };
  for (let i = 0; i < N; i++) {
    if (TEAM[i] === own && C.as[i] && assigned(i) && m.inPeriod(i) && inDays(C.rep[i])) { flow[MONTH[i]][0]++; newDays.add(Math.floor(C.rep[i] / DAY)); flowAt.in.push(C.rep[i]); }
    for (const [kind, t, p] of C.sp?.[i] || []) {
      if (kind !== 0 || !doing(p) || t < S.d0 || t >= S.d1 || !inDays(t)) continue;
      flow[m.monthAt(t)][1]++; resolvedIn++; resolvedDays.add(Math.floor(t / DAY)); flowAt.out.push(t);
    }
  }
  // bajo cada columna, su mes (uno de cada tantos si son muchos) y el año bajo el primero de cada año (monthTicks)
  const ticks = new Map(monthTicks(S.from, Math.min(S.to, m.LASTM), m.data.meta.start).map((t) => [t.k, t]));
  const colX = (k) => { const t = ticks.get(k); return `<span class="wk-col-x">${t ? `${t.label}${t.sub ? `<br>${t.sub}` : ''}` : '&nbsp;'}</span>`; };
  const flowBars = () => {
    const shown = flow.map((v, k) => [k, v]).filter(([k]) => k >= S.from && k <= Math.min(S.to, m.LASTM));
    const max = Math.max(1, ...shown.flatMap(([, v]) => v));
    return `<div class="wk-cols">${shown.map(([k, [inN, outN]]) => `<div class="wk-col" data-tip="${esc(`${m.monthName(k)}\nNuevas: ${num(inN)}\nResueltas: ${num(outN)}`)}">
        <span class="wk-pair"><i class="mt-c2" style="height:${(inN / max * 100).toFixed(1)}%"></i><i class="mt-c${k0}" style="height:${(outN / max * 100).toFixed(1)}%"></i></span>${colX(k)}</div>`).join('')}</div>`;
  };
  // la media de cada día de la semana, con sus dos cifras bajo las columnas, en los colores de la leyenda del bloque
  const weekdayBars = () => {
    const week = weekdayAverages(flowAt, [S.d0, S.d1], (t) => m.clock(t)[0], inDays);
    const max = Math.max(1, ...week.flatMap((w) => [w.in || 0, w.out || 0]));
    const avg = (v) => (v == null ? '—' : dec(v));
    return `<div class="wk-cols wk-days">${week.map((w, k) => `<div class="wk-col" data-tip="${esc(`${WEEKDAYS[k]} (${num(w.days)} en el periodo)\nNuevas: ${avg(w.in)} de media\nResueltas: ${avg(w.out)} de media`)}">
        <span class="wk-pair"><i class="mt-c2" style="height:${((w.in || 0) / max * 100).toFixed(1)}%"></i><i class="mt-c${k0}" style="height:${((w.out || 0) / max * 100).toFixed(1)}%"></i></span>
        <span class="wk-col-x">${DOWS[k]}</span><span class="wk-col-n">${avg(w.in)}</span><span class="wk-col-n"><b>${avg(w.out)}</b></span></div>`).join('')}</div>`;
  };
  // pendientes por mes de creación: una columna por mes, con los mismos colores que la barra del bloque
  const queueBars = (months) => {
    const shown = months.map((v, k) => [k, v]).filter(([k]) => k >= S.from && k <= Math.min(S.to, m.LASTM));
    const max = Math.max(1, ...shown.map(([, v]) => v[0] + v[1] + v[2]));
    return `<div class="wk-cols">${shown.map(([k, v]) => {
      const n = v[0] + v[1] + v[2];
      return `<div class="wk-col" data-tip="${esc(`${m.monthName(k)}: ${num(n)} sin resolver\n${mineLabel}: ${num(v[0])}\nSin asignar: ${num(v[1])}\nAsignadas a otros: ${num(v[2])}`)}">
        <span class="wk-col-n">${n ? num(n) : ''}</span><span class="wk-col-bar" style="height:${(n / max * 100).toFixed(1)}%"><i class="mt-c2" style="flex:${v[2]}"></i><i class="wk-orphan" style="flex:${v[1]}"></i><i class="mt-c${k0}" style="flex:${v[0]}"></i></span>${colX(k)}</div>`;
    }).join('')}</div>`;
  };
  const bar = (share, cls = `mt-c${k0}`) => `<span class="wk-bar"><i class="${cls}" style="width:${Math.min(100, share * 100).toFixed(1)}%"></i></span>`;
  const perDay = (v) => (v == null ? '—' : dec(v));
  const iaShare = (s) => (s.resolved ? s.ia / s.resolved : null);
  const doneRows = chosen ? [...done.solved] : A;   // el SLA de inicio es de lo resuelto
  const byPrio = m.PRIOS.map((p) => [p, m.bySide(doneRows.filter((i) => C.pr[i] === p)).map(m.stats)]);

  // la media al día, en la línea del título; sus colores son también la leyenda de las barras
  const volume = block('volume', 'Volumen', chosen ? 'issues con actividad esos días' : 'issues en el periodo', fig((s) => num(s.n)), [],
    `<span class="wk-aside">Media al día <i class="mt-sw mt-c2"></i><b>${perDay(newDays.size ? flowAt.in.length / newDays.size : null)}</b> nuevas <i class="mt-sw mt-c${k0}"></i><b>${perDay(resolvedDays.size ? resolvedIn / resolvedDays.size : null)}</b> resueltas</span>`, () => (charts.has('volumeMonths') ? flowBars() : weekdayBars()));
  const backlog = block('queue', 'Pendientes', 'sin resolver', num(queue.all), [
    item(mineLabel, num(queue.mine), `mt-c${k0}`),
    ...(who == null ? [item('Sin asignar en SGA y SISU', num(queue.orphan), 'wk-orphan')] : []),
  ], queue.all ? `<span class="wk-split" data-tip="${esc(`Sin resolver: ${num(queue.all)}\n${mineLabel}: ${num(queue.mine)}\nSin asignar, en SGA y SISU: ${num(queue.orphan)}\nAsignadas a otros, en SGA y SISU: ${num(queue.all - queue.mine - queue.orphan)}`)}"><i class="mt-c${k0}" style="flex:${queue.mine}"></i><i class="wk-orphan" style="flex:${queue.orphan}"></i><i class="mt-c2" style="flex:${queue.all - queue.mine - queue.orphan}"></i></span>` : '', () => queueBars(queue.months));
  const sla = block('sla', 'SLA de inicio', 'de las resueltas se iniciaron a tiempo', fig(donePct), [],
    `<div class="wk-prios">${byPrio.map(([p, st]) => `<div class="wk-prio"><span>${m.slaLabel(p)}</span>${bar(st[k0].slaDone || 0)}<b>${fig(donePct, st)}</b></div>`).join('')}</div>`, [(s) => s.slaDone, (v) => pct(v)]);
  const times = block('times', 'Tiempos', 'de media hasta resolverse', fig((s) => dur(s.avg)), [
    item('En menos de 24 h', fig((s) => pct(s.d1))),
    item('El 90 %, en menos de', fig((s) => dur(s.p90))),
  ], '', [(s) => s.avg, dur]);
  const quality = block('quality', 'Calidad', '%IQA · aún sin datos', fig(COLS.iqa[1]), [
    item('Reaperturas', fig((s) => pct(s.reop, 1))),
    item('Devueltas a la cola', fig((s) => pct(s.bounce, 1))),
  ], '', [(s) => s.reop, (v) => pct(v, 1)]);
  const ia = block('ia', 'IA', 'de las resueltas tuvieron intervención de la IA', fig((s) => (iaShare(s) == null ? '—' : pct(iaShare(s), 1))), [
    item('Resueltas con ayuda de la IA', fig((s) => num(s.ia))),
  ], '', [iaShare, (v) => pct(v, 1)]);

  // persona a persona
  // por turno: lo que pasa en los turnos del periodo, de las issues abiertas en cualquier mes (per-shift.js)
  const counts = shiftCounts(m, [S.d0, S.d1], inDays);
  // sin días elegidos, cada técnico con las issues de las que es responsable; con ellos, con las que trabajó esos días
  const groups = chosen ? [...doers].map(([k, o]) => ({ k, rows: [...o.worked], solved: o.solved })) : m.group('as', m.rows(), true).filter((x) => x.k);
  const people = groups.map((x) => ({ ...statsOf(x.rows, x.solved), k: x.k, shift: counts && perTurn(counts.get(x.k)) }));
  ST[k0] = { ...ST[k0], shift: counts && teamPerTurn(counts) };
  const [sortCol, dir] = ui.sort.team || ['n', -1];
  // al ordenar por un % o una media, quien tiene pocas issues va al final: su cifra dice poco
  const key = (r) => cols[sortCol][2](r) ?? -Infinity, rated = !!cols[sortCol][3], few = (r) => (rated && r.n < MIN ? 1 : 0);
  people.sort((a, b) => few(a) - few(b) || (key(a) - key(b)) * dir || b.n - a.n);
  const cell = (s, c) => `<td class="mt-num">${cols[c][1](s)}</td>`;
  const th = (c) => `<th class="mt-num ${sortCol === c ? 'mt-srt' : ''}" data-sort="team:${c}" data-tip="${esc(cols[c][4])}">${cols[c][0]}${sortCol === c ? (dir < 0 ? ' ↓' : ' ↑') : ''}</th>`;
  const row = (s) => `<tr class="mt-clk" data-person="${s.k}" title="${who == null ? 'Ver solo sus datos' : 'Quitar el filtro'}"><td title="${esc(m.DIMS.as.label(s.k))}"><i class="mt-sw mt-c${k0}"></i>${esc(m.DIMS.as.label(s.k))}</td>${order.map((c) => cell(s, c)).join('')}</tr>`;
  const teamRow = `<tr class="mt-grp"><td>Equipo ${esc(name)}</td>${order.map((c) => `<td class="mt-num">${cols[c][1](ST[k0])}</td>`).join('')}</tr>`;
  const table = `<div class="mt-tablewrap"><table class="wk-team"><thead><tr><th>Persona</th>${order.map(th).join('')}</tr></thead>
    <tbody>${people.filter((p) => who == null || p.k === who).map(row).join('') || `<tr><td colspan="${order.length + 1}" class="mt-mut">Nadie con issues en este periodo.</td></tr>`}${who == null ? teamRow : ''}</tbody></table></div>`;

  // la actividad se pinta sobre el periodo de partida, aunque haya días elegidos (activity.js)
  const activityRange = ui.range?.base || [S.d0, S.d1], picked = ui.actSeries ?? null;
  // comparar: todo el equipo, por día; una persona, por turno, frente a la media por persona y turno del equipo
  const activityDays = dailyActivity(C, m.today(true), activityRange, doing);
  const teamCounts = picked && who != null && shiftCounts(m, activityRange);
  const compare = !picked ? null : who == null ? comparePerDay(activityDays, picked)
    : teamCounts ? { per: 'turno', days: turnsByDay(C, m.data.sessions, activityRange, picked, who), avg: teamPerTurn(teamCounts)[picked] } : null;
  const activity = activityPanel(activityDays, {
    title: who == null ? 'Actividad del equipo' : `Actividad de ${m.DIMS.as.label(who)}`, dayName: m.dayName, axis: axisDay(m.BASE), sel: ui.range?.days, picked,
    compare,
  });
  const filter = who == null ? '' : `<div class="wk-filter">Solo los datos de <b>${esc(m.DIMS.as.label(who))}</b><button class="wk-block-link" data-person-clear>Quitar filtro</button></div>`;
  return `<div class="wk-panel">
    ${filter}<div class="wk-blocks">${activity}${volume}${backlog}${sla}${times}${quality}${ia}</div>
    <div class="mt-grid">
    ${card('El equipo, persona a persona', table, { span: 's12', sub: counts ? '' : 'Faltan los turnos de lo resuelto, escalado y pendiente de cliente (RPT, EPPT, PCPT): reinicia SIA para que el bridge los calcule.' })}
    </div>
    <div class="wk-sheet">${card('Sábana de incidencias', sheetBody(m, teamIssues(m, ui), { id: 'team-sheet', expanded: ui.exp['team-sheet'], more: ch.more, empty: 'Ninguna incidencia con estos filtros.', cols: TEAM_SHEET_COLS }), { span: 's12', sub: `Las incidencias del panel, abiertas o cerradas: ${chosen ? 'con algún paso en los días elegidos' : 'creadas en el periodo'}${who == null ? '' : ', del técnico elegido'}. Exportar a CSV las descarga todas, con su enlace a Remedy, para abrirlas en Excel.` })}</div>
  </div>`;
};
