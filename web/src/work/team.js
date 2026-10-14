// El Panel de trabajo (sin DOM): un control rápido del equipo y de cada
// persona con lo que importa para seguir la calidad del servicio: el SLA de
// inicio, los tiempos, la calidad del trabajo, las tareas y la cola. Con los
// datos de las Métricas (web/src/metrics/model.js); el detalle, en Métricas.
//
// Las cifras de cada persona son sus datos, sin colores: aquí no se compara.
// Con menos de MIN issues en el periodo, sus porcentajes y medias dicen poco:
// al ordenar por ellos, esas personas van al final.
import { esc } from '../ui/html.js';
import { SCOPE } from '../metrics/model.js';
import { num, dec, pct, dur } from '../metrics/format.js';

export const MIN = 10;

const donePct = (s) => (s.slaDone == null ? '—' : pct(s.slaDone));

// Columnas de la tabla por persona: [cabecera, cómo se ve, valor, qué es mejor, qué mide]. Las de
// prioridad se añaden con el modelo (sus índices dependen de los datos).
const COLS = {
  n: ['Issues', (s) => num(s.n), (s) => s.n, null, 'Issues de las que es responsable, abiertas en el periodo.'],
  open: ['Abiertas', (s) => num(s.open), (s) => s.open, null, 'Su cola: las que siguen sin resolver hoy.'],
  sla: ['SLA cumplido', donePct, (s) => s.slaDone, 'high',
    'De las que ha resuelto, cuántas empezaron (pasaron a En curso) dentro del plazo de su prioridad: crítica 15 min, alta 45 min, media 2 h, baja 8 h.'],
  day: ['Resueltas / día', (s) => (s.perDay == null ? '—' : dec(s.perDay)), (s) => s.perDay, 'high',
    'Media de issues resueltas en los días en que resolvió alguna. En la fila del equipo, la media de su gente.'],
  avg: ['Med. resol. (días)', (s) => (s.avg == null ? '—' : dec(s.avg / 1440)), (s) => s.avg, 'low', 'Media desde la apertura hasta la resolución, en días naturales.'],
  d1: ['< 24 h', (s) => pct(s.d1), (s) => s.d1, 'high', 'De las resueltas, las que se resolvieron en menos de 24 h.'],
  reop: ['Reabiertas', (s) => pct(s.reop, 1), (s) => s.reop, 'low', 'Volvieron de Resuelta a un estado abierto.'],
  bounce: ['Devueltas', (s) => pct(s.bounce, 1), (s) => s.bounce, 'low', 'Pasaron de En curso a Asignada (devueltas a la cola) al menos una vez.'],
  noRes: ['Sin texto resol.', (s) => pct(s.noRes, 1), (s) => s.noRes, 'low', 'Cerradas sin explicar cómo se resolvió.'],
  ia: ['Con IA', (s) => (s.resolved ? pct(s.ia / s.resolved, 1) : '—'), (s) => (s.resolved ? s.ia / s.resolved : null), null, 'De las que ha resuelto, el % que lleva alguna marca de IA (en TAGS o en las notas).'],
};

// m: el modelo de las Métricas; ch: sus piezas (charts.js); ui.sort.team: [columna, ±1].
export const teamPanel = (m, ch, ui) => {
  const { card, kpi, kpis, kpiCo, legend, lines } = ch;
  const A = m.rows(), sides = m.CO(), names = m.NAMES(), ST = m.bySide(A).map(m.stats);

  // las prioridades, una columna cada una (cuántas de cada)
  const PRIO = { CRITICAL: 'Crít.', HIGH: 'Altas', MEDIUM: 'Medias', LOW: 'Bajas' };
  const cols = { ...COLS };
  for (const p of m.PRIOS) cols[`p${p}`] = [PRIO[m.DI.prio[p]], (s) => num(s.prio[p]), (s) => s.prio[p], null, `Cuántas de prioridad ${m.slaLabel(p)}.`];
  const order = ['n', 'open', ...m.PRIOS.map((p) => `p${p}`), 'sla', 'day', 'avg', 'd1', 'reop', 'bounce', 'noRes', 'ia'];

  // Backlog: lo que el equipo ve en sus búsquedas de Remedy (SGA y SISU), sin resolver, tenga
  // responsable o no; de las issues abiertas en el periodo.
  const { C, OPEN, MONTH, S, N } = m;
  let backlog = 0, orphan = 0;
  for (let i = 0; i < N; i++) {
    if (!OPEN[i] || MONTH[i] < S.from || MONTH[i] > S.to || (C.sc[i] !== SCOPE.SGA && C.sc[i] !== SCOPE.SISU)) continue;
    backlog++;
    if (!C.as[i]) orphan++;
  }

  const perDay = (v) => (v == null ? '—' : dec(v));
  const row1 = kpis(
    kpiCo('Issues', ST, (s) => num(s.n), { val: (s) => s.n }),
    kpiCo('Entradas al día', ST, (s) => perDay(s.inPerDay), { val: (s) => s.inPerDay, note: 'issues abiertas de media, en los días con alguna' }),
    kpiCo('Resueltas al día', ST, (s) => perDay(s.perDay), { val: (s) => s.perDay, note: 'de media, en los días con alguna' }),
    kpiCo('Abiertas ahora', ST, (s) => num(s.open), { val: (s) => s.open, note: 'con responsable de la empresa' }),
    kpi('Backlog SGA + SISU', num(backlog), `${num(orphan)} sin responsable`, m.CMP() ? '' : `mt-t${sides[0]}`));
  const row2 = kpis(
    kpiCo('SLA cumplido', ST, donePct, { val: (s) => s.slaDone, better: 'high', note: 'de las resueltas' }),
    kpiCo('Media de resolución', ST, (s) => dur(s.avg), { val: (s) => s.avg, better: 'low' }),
    kpiCo('Resueltas en < 24 h', ST, (s) => pct(s.d1), { val: (s) => s.d1, better: 'high' }),
    kpiCo('Reabiertas', ST, (s) => pct(s.reop, 1), { val: (s) => s.reop, better: 'low' }),
    kpiCo('Uso de IA', ST, (s) => (s.resolved ? pct(s.ia / s.resolved, 1) : '—'), { val: (s) => (s.resolved ? s.ia / s.resolved : null), note: 'resueltas con alguna marca de IA' }));
  // SLA cumplido por prioridad, de las resueltas: una caja por prioridad
  const row3 = kpis(...m.PRIOS.map((p) => kpiCo(m.slaLabel(p), m.bySide(A.filter((i) => C.pr[i] === p)).map(m.stats), donePct, { val: (s) => s.slaDone, better: 'high', note: 'SLA cumplido' })));

  // persona a persona, cada una frente a la media de su equipo
  const people = m.group('as', A, true).filter((x) => x.k).map((x) => ({ ...m.stats(x.rows), k: x.k, side: x.t[0] ? 0 : 1 }));
  // resueltas al día, en la fila del equipo: la media de su gente (lo que resuelve el equipo entero en un día va arriba)
  for (const k of sides) {
    const v = people.filter((p) => p.side === k && p.n >= MIN && p.perDay != null).map((p) => p.perDay);
    ST[k] = { ...ST[k], perDay: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null };
  }
  const [sortCol, dir] = ui.sort.team || ['n', -1];
  // al ordenar por un % o una media, quien tiene pocas issues va al final: su cifra dice poco
  const key = (r) => cols[sortCol][2](r) ?? -Infinity, rated = !!cols[sortCol][3], few = (r) => (rated && r.n < MIN ? 1 : 0);
  people.sort((a, b) => few(a) - few(b) || (key(a) - key(b)) * dir || b.n - a.n);
  const cell = (s, c) => `<td class="mt-num">${cols[c][1](s)}</td>`;
  const th = (c) => `<th class="mt-num ${sortCol === c ? 'mt-srt' : ''}" data-sort="team:${c}" data-tip="${esc(cols[c][4])}">${cols[c][0]}${sortCol === c ? (dir < 0 ? ' ↓' : ' ↑') : ''}</th>`;
  const row = (s) => `<tr class="mt-clk" data-person="${s.k}" title="Ver en Métricas"><td><i class="mt-sw mt-c${s.side}"></i>${esc(m.DIMS.as.label(s.k))}</td>${order.map((c) => cell(s, c)).join('')}</tr>`;
  const teamRow = (k) => `<tr class="mt-grp"><td>Equipo ${esc(names[k])}</td>${order.map((c) => `<td class="mt-num">${cols[c][1](ST[k])}</td>`).join('')}</tr>`;
  const table = `<div class="mt-tablewrap"><table class="wk-team"><thead><tr><th>Persona</th>${order.map(th).join('')}</tr></thead>
    <tbody>${people.map(row).join('') || `<tr><td colspan="${order.length + 1}" class="mt-mut">Nadie con issues en este periodo.</td></tr>`}${sides.map(teamRow).join('')}</tbody></table></div>`;

  return `<div class="mt-grid wk-panel">
    <div class="wk-row5">${row1}</div>
    <div class="wk-row5">${row2}</div>
    <h2 class="mt-sec">SLA cumplido por prioridad<small>de las resueltas, cuántas pasaron a En curso dentro del plazo de su prioridad</small></h2>
    <div class="wk-row4">${row3}</div>
    ${card('El equipo, persona a persona', table, { span: 's12', sub: 'Clic en una cabecera para ordenar (pasa el ratón por ella para ver qué mide) y en una persona para verla en Métricas frente al resto de su equipo.' })}
    ${card('Evolución del equipo', `${legend()}<div class="wk-evo"><div><p class="mt-small"><b>SLA cumplido</b></p>${lines(A, (s) => s.slaDone, (v) => pct(v))}</div><div><p class="mt-small"><b>Media de resolución</b></p>${lines(A, (s) => s.avg, dur)}</div></div>`, { span: 's12', sub: 'Por mes de apertura. * mes incompleto: lo más reciente sale mejor de lo que acabará.' })}
  </div>`;
};
