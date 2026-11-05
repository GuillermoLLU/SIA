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
import { num, dec, pct, dur } from '../metrics/format.js';
import { monthTicks } from '../metrics/plot.js';
import { shiftCounts, perTurn, teamPerTurn } from './per-shift.js';

const MIN = 10;

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
  const part = { '': '', e: ' de entrantes: las que entraron en ese mismo turno', b: ' de backlog: las que entraron en un turno anterior' };
  const NOTE = ' Un turno trabajado es uno con algún paso suyo (empezar, resolver, escalar o pasar a pendiente de cliente); cuenta lo que pasa en los turnos del periodo, se abriera la issue cuando se abriera, y se atribuye al responsable actual. En la fila del equipo, la media por persona y turno.';
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
    <div class="mt-empty"><b>Planned for the future</b></div>
  </div>`;

// m: el modelo de las Métricas; ch: sus piezas (charts.js); ui.sort.team: [columna, ±1];
// ui.charts: los bloques que se ven como gráfica.
export const teamPanel = (m, ch, ui) => {
  const { card, lines } = ch;
  const A = m.rows(), name = m.NAMES()[0], ST = m.bySide(A).map(m.stats);

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
    if (!OPEN[i] || !m.inPeriod(i)) continue;
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
    const head = `<div class="wk-block-h"><h3>${title}</h3>${link}${fixed ? extra : `<button class="wk-chart-btn" data-chart="${id}" title="${asChart ? 'Ver los datos' : `Ver la evolución por ${m.daily() ? 'día' : 'mes'}`}">${asChart ? DATA_ICON : CHART_ICON}</button>`}</div>`;
    if (!asChart) return `<section class="wk-block">${head}<div class="wk-hero"><b>${hero}</b><span>${label}</span></div>${extra}<div class="wk-items">${items.join('')}</div></section>`;
    const note = { queue: 'Lo que sigue sin resolver de cada mes, por mes de creación.', volume: '' }[id]
      ?? (m.daily() ? 'Por día de creación. * Día de la última carga: aún puede cambiar.' : 'Por mes de creación. * Mes en curso: aún puede cambiar.');
    return `<section class="wk-block wk-as-chart">${head}<div class="wk-key"><b>${hero}</b><span>${label}</span></div>
      <div class="wk-chart">${typeof chart === 'function' ? chart() : lines(A, ...chart, { height: 150, left: 78 })}</div>${note ? `<p class="wk-note">${note}</p>` : ''}</section>`;
  };
  // nuevas y resueltas de cada mes: las creadas ese mes y las resueltas ese mes (por su fecha de resolución,
  // aunque se crearan antes), del equipo; dos columnas por mes
  const flow = Array.from({ length: m.LASTM + 1 }, () => [0, 0]);
  for (let i = 0; i < N; i++) {
    if (TEAM[i] !== own || !C.as[i]) continue;
    if (m.inPeriod(i)) flow[MONTH[i]][0]++;
    if (C.res[i] >= S.d0 && C.res[i] < S.d1) flow[m.monthAt(C.res[i])][1]++;
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
  // pendientes por mes de creación: una columna por mes, con los mismos colores que la barra del bloque
  const queueBars = (months) => {
    const shown = months.map((v, k) => [k, v]).filter(([k]) => k >= S.from && k <= Math.min(S.to, m.LASTM));
    const max = Math.max(1, ...shown.map(([, v]) => v[0] + v[1] + v[2]));
    return `<div class="wk-cols">${shown.map(([k, v]) => {
      const n = v[0] + v[1] + v[2];
      return `<div class="wk-col" data-tip="${esc(`${m.monthName(k)}: ${num(n)} sin resolver\nAsignadas al equipo: ${num(v[0])}\nSin asignar: ${num(v[1])}\nAsignadas a otros: ${num(v[2])}`)}">
        <span class="wk-col-n">${n ? num(n) : ''}</span><span class="wk-col-bar" style="height:${(n / max * 100).toFixed(1)}%"><i class="mt-c2" style="flex:${v[2]}"></i><i class="wk-orphan" style="flex:${v[1]}"></i><i class="mt-c${k0}" style="flex:${v[0]}"></i></span>${colX(k)}</div>`;
    }).join('')}</div>`;
  };
  const bar = (share, cls = `mt-c${k0}`) => `<span class="wk-bar"><i class="${cls}" style="width:${Math.min(100, share * 100).toFixed(1)}%"></i></span>`;
  const perDay = (v) => (v == null ? '—' : dec(v));
  const iaShare = (s) => (s.resolved ? s.ia / s.resolved : null);
  const byPrio = m.PRIOS.map((p) => [p, m.bySide(A.filter((i) => C.pr[i] === p)).map(m.stats)]);

  // la media al día, en la línea del título; sus colores son también la leyenda de las barras
  const volume = block('volume', 'Volumen', 'issues en el periodo', fig((s) => num(s.n)), [],
    `<span class="wk-aside">Media al día <i class="mt-sw mt-c2"></i><b>${perDay(ST[k0].inPerDay)}</b> nuevas <i class="mt-sw mt-c${k0}"></i><b>${perDay(ST[k0].perDay)}</b> resueltas</span>`, flowBars);
  const backlog = block('queue', 'Pendientes', 'sin resolver', num(queue.all), [
    item('Asignadas al equipo', num(queue.mine), `mt-c${k0}`),
    item('Sin asignar en SGA y SISU', num(queue.orphan), 'wk-orphan'),
  ], queue.all ? `<span class="wk-split" data-tip="${esc(`Sin resolver: ${num(queue.all)}\nAsignadas al equipo: ${num(queue.mine)}\nSin asignar, en SGA y SISU: ${num(queue.orphan)}\nAsignadas a otros, en SGA y SISU: ${num(queue.all - queue.mine - queue.orphan)}`)}"><i class="mt-c${k0}" style="flex:${queue.mine}"></i><i class="wk-orphan" style="flex:${queue.orphan}"></i><i class="mt-c2" style="flex:${queue.all - queue.mine - queue.orphan}"></i></span>` : '', () => queueBars(queue.months));
  const sla = block('sla', 'SLA de inicio', 'de las resueltas se iniciaron a tiempo', fig(donePct), [],
    `<div class="wk-prios">${byPrio.map(([p, st]) => `<div class="wk-prio"><span>${m.slaLabel(p)}</span>${bar(st[k0].slaDone || 0)}<b>${fig(donePct, st)}</b></div>`).join('')}</div>`, [(s) => s.slaDone, (v) => pct(v)]);
  const times = block('times', 'Tiempos', 'de media hasta resolverse', fig((s) => dur(s.avg)), [
    item('En menos de 24 h', fig((s) => pct(s.d1))),
    item('El 90 %, en menos de', fig((s) => dur(s.p90))),
  ], '', [(s) => s.avg, dur]);
  const quality = block('quality', 'Calidad', 'se reabrieron tras resolverse', fig((s) => pct(s.reop, 1)), [
    item('Devueltas a la cola', fig((s) => pct(s.bounce, 1))),
    item('Cerradas sin explicar la solución', fig((s) => pct(s.noRes, 1))),
  ], '', [(s) => s.reop, (v) => pct(v, 1)]);
  const ia = block('ia', 'IA', 'de las resueltas tuvieron intervención de la IA', fig((s) => (iaShare(s) == null ? '—' : pct(iaShare(s), 1))), [
    item('Resueltas con ayuda de la IA', fig((s) => num(s.ia))),
  ], '', [iaShare, (v) => pct(v, 1)]);

  // persona a persona
  // por turno: lo que pasa en los turnos del periodo, de las issues abiertas en cualquier mes (per-shift.js)
  const counts = shiftCounts(m, m.today(), [S.d0, S.d1]);
  const people = m.group('as', A, true).filter((x) => x.k).map((x) => ({ ...m.stats(x.rows), k: x.k, shift: counts && perTurn(counts.get(x.k)) }));
  ST[k0] = { ...ST[k0], shift: counts && teamPerTurn(counts) };
  const [sortCol, dir] = ui.sort.team || ['n', -1];
  // al ordenar por un % o una media, quien tiene pocas issues va al final: su cifra dice poco
  const key = (r) => cols[sortCol][2](r) ?? -Infinity, rated = !!cols[sortCol][3], few = (r) => (rated && r.n < MIN ? 1 : 0);
  people.sort((a, b) => few(a) - few(b) || (key(a) - key(b)) * dir || b.n - a.n);
  const cell = (s, c) => `<td class="mt-num">${cols[c][1](s)}</td>`;
  const th = (c) => `<th class="mt-num ${sortCol === c ? 'mt-srt' : ''}" data-sort="team:${c}" data-tip="${esc(cols[c][4])}">${cols[c][0]}${sortCol === c ? (dir < 0 ? ' ↓' : ' ↑') : ''}</th>`;
  const row = (s) => `<tr class="mt-clk" data-person="${s.k}" title="Ver en Métricas"><td title="${esc(m.DIMS.as.label(s.k))}"><i class="mt-sw mt-c${k0}"></i>${esc(m.DIMS.as.label(s.k))}</td>${order.map((c) => cell(s, c)).join('')}</tr>`;
  const teamRow = `<tr class="mt-grp"><td>Equipo ${esc(name)}</td>${order.map((c) => `<td class="mt-num">${cols[c][1](ST[k0])}</td>`).join('')}</tr>`;
  const table = `<div class="mt-tablewrap"><table class="wk-team"><thead><tr><th>Persona</th>${order.map(th).join('')}</tr></thead>
    <tbody>${people.map(row).join('') || `<tr><td colspan="${order.length + 1}" class="mt-mut">Nadie con issues en este periodo.</td></tr>`}${teamRow}</tbody></table></div>`;

  return `<div class="wk-panel">
    <div class="wk-blocks">${volume}${backlog}${sla}${times}${quality}${ia}</div>
    <div class="mt-grid">
    ${card('El equipo, persona a persona', table, { span: 's12', sub: counts ? '' : 'Faltan los turnos de lo resuelto, escalado y pendiente de cliente (RPT, EPPT, PCPT): reinicia SIA para que el bridge los calcule.' })}
    </div>
  </div>`;
};
