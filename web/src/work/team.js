// El Panel de trabajo (sin DOM): un control rápido del equipo y de cada
// persona con lo que importa para seguir la calidad del servicio: el SLA de
// inicio, los tiempos, la calidad del trabajo, las tareas y la cola. Con los
// datos de las Métricas (web/src/metrics/model.js); el detalle, en Métricas.
//
// Las cifras de cada persona son sus datos, sin colores: aquí no se compara.
// Con menos de MIN issues en el periodo, sus porcentajes y medias dicen poco:
// al ordenar por ellos, esas personas van al final.
import { esc } from '../ui/html.js';
import { num, dec, pct, dur } from '../metrics/format.js';

export const MIN = 10;

const slaPct = (s) => (s.sla == null ? '—' : pct(s.sla));
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
  avg: ['Media resol.', (s) => dur(s.avg), (s) => s.avg, 'low', 'Media desde la apertura hasta la resolución, en horas naturales.'],
  d1: ['< 24 h', (s) => pct(s.d1), (s) => s.d1, 'high', 'De las resueltas, las que se resolvieron en menos de 24 h.'],
  reop: ['Reabiertas', (s) => pct(s.reop, 1), (s) => s.reop, 'low', 'Volvieron de Resuelta a un estado abierto.'],
  bounce: ['Devueltas', (s) => pct(s.bounce, 1), (s) => s.bounce, 'low', 'Pasaron de En curso a Asignada (devueltas a la cola) al menos una vez.'],
  noRes: ['Sin texto resol.', (s) => pct(s.noRes, 1), (s) => s.noRes, 'low', 'Cerradas sin explicar cómo se resolvió.'],
  ia: ['Con IA', (s) => (s.resolved ? pct(s.ia / s.resolved, 1) : '—'), (s) => (s.resolved ? s.ia / s.resolved : null), null, 'De las que ha resuelto, el % que lleva alguna marca de IA (en TAGS o en las notas).'],
};

// m: el modelo de las Métricas; ch: sus piezas (charts.js); ui.sort.team: [columna, ±1].
export const teamPanel = (m, ch, ui) => {
  const { card, kpis, kpiCo, legend, lines } = ch;
  const A = m.rows(), sides = m.CO(), names = m.NAMES(), ST = m.bySide(A).map(m.stats);

  // las prioridades, una columna cada una (cuántas de cada)
  const PRIO = { CRITICAL: 'Crít.', HIGH: 'Altas', MEDIUM: 'Medias', LOW: 'Bajas' };
  const cols = { ...COLS };
  for (const p of m.PRIOS) cols[`p${p}`] = [PRIO[m.DI.prio[p]], (s) => num(s.prio[p]), (s) => s.prio[p], null, `Cuántas de prioridad ${m.slaLabel(p)}.`];
  const order = ['n', 'open', ...m.PRIOS.map((p) => `p${p}`), 'sla', 'day', 'avg', 'd1', 'reop', 'bounce', 'noRes', 'ia'];

  const head = kpis(
    kpiCo('Issues', ST, (s) => num(s.n), { val: (s) => s.n }),
    kpiCo('Abiertas ahora', ST, (s) => num(s.open), { val: (s) => s.open }),
    kpiCo('SLA cumplido', ST, donePct, { val: (s) => s.slaDone, better: 'high', note: 'de las resueltas' }),
    kpiCo('Resueltas al día', ST, (s) => (s.perDay == null ? '—' : dec(s.perDay)), { val: (s) => s.perDay, note: 'el equipo, en los días con alguna' }),
    kpiCo('Media de resolución', ST, (s) => dur(s.avg), { val: (s) => s.avg, better: 'low' }),
    kpiCo('Reabiertas', ST, (s) => pct(s.reop, 1), { val: (s) => s.reop, better: 'low' }));

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

  // el SLA del equipo por prioridad: % dentro, fuera de plazo y media hasta En curso
  const prio = `<table><thead><tr><th>Prioridad y SLA</th>${sides.map((k) => `<th class="mt-num"><span class="mt-sw mt-c${k}"></span>${esc(names[k])}</th>`).join('')}<th class="mt-num">Fuera de plazo</th></tr></thead><tbody>${m.PRIOS.map((p) => {
    const st = m.bySide(A.filter((i) => m.C.pr[i] === p)).map(m.stats);
    return `<tr><td>${m.slaLabel(p)}</td>${sides.map((k) => `<td class="mt-num">${slaPct(st[k])}</td>`).join('')}<td class="mt-num">${sides.map((k) => num(st[k].slaKo)).join(' / ')}</td></tr>`;
  }).join('')}</tbody></table>`;

  return `<div class="mt-grid">${head}
    ${card('El equipo, persona a persona', table, { span: 's12', sub: 'Clic en una cabecera para ordenar (pasa el ratón por ella para ver qué mide) y en una persona para verla en Métricas frente al resto de su equipo.' })}
    ${card('SLA de inicio por prioridad', prio, { span: 's5', sub: 'De la apertura al primer paso a En curso. «Fuera de plazo»: iniciadas tarde o aún sin iniciar con el plazo vencido.' })}
    ${card('Evolución del equipo', `${legend()}<p class="mt-small"><b>Dentro del SLA de inicio</b></p>${lines(A, (s) => s.sla, (v) => pct(v))}<p class="mt-small"><b>Media de resolución</b></p>${lines(A, (s) => s.avg, dur)}`, { span: 's7', sub: 'Por mes de apertura. * mes incompleto: lo más reciente sale mejor de lo que acabará.' })}
  </div>`;
};
