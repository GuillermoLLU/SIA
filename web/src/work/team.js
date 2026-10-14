// El Panel de trabajo (sin DOM): un control rápido del equipo y de cada
// persona con lo que importa para seguir la calidad del servicio: el SLA de
// inicio, los tiempos, la calidad del trabajo, las tareas y la cola. Con los
// datos de las Métricas (web/src/metrics/model.js); el detalle, en Métricas.
//
// Cada cifra de una persona sale en verde si está mejor que la media de su
// equipo y en rojo si está peor (cualquier diferencia cuenta). Con menos de
// MIN issues en el periodo, sus porcentajes y medias dicen poco: salen sin color.
import { esc } from '../ui/html.js';
import { num, pct, dur } from '../metrics/format.js';
import { verdict } from '../metrics/compare.js';

export const MIN = 10;

const slaPct = (s) => (s.sla == null ? '—' : pct(s.sla));
// Columnas de la tabla por persona: [cabecera, cómo se ve, valor, qué es mejor, qué mide]
const COLS = {
  n: ['Issues', (s) => num(s.n), (s) => s.n, null, 'Issues de las que es responsable, abiertas en el periodo.'],
  open: ['Abiertas', (s) => num(s.open), (s) => s.open, null, 'Su cola: las que siguen sin resolver hoy.'],
  open30: ['> 30 días', (s) => num(s.open30), (s) => s.open30, null, 'De su cola, las que llevan más de 30 días abiertas.'],
  sla: ['En SLA', slaPct, (s) => s.sla, 'high', 'Pasan a En curso dentro del plazo de su prioridad (crítica 15 min, alta 45 min, media 2 h, baja 8 h).'],
  fr: ['1.ª actuación', (s) => dur(s.fr), (s) => s.fr, 'low', 'Media desde la apertura hasta el primer cambio de estado.'],
  avg: ['Media resol.', (s) => dur(s.avg), (s) => s.avg, 'low', 'Media desde la apertura hasta la resolución, en horas naturales.'],
  d1: ['Resueltas < 24 h', (s) => pct(s.d1), (s) => s.d1, 'high', 'De las resueltas, las que se resolvieron en menos de 24 h.'],
  reop: ['Reabiertas', (s) => pct(s.reop, 1), (s) => s.reop, 'low', 'Volvieron de Resuelta a un estado abierto.'],
  bounce: ['Devueltas', (s) => pct(s.bounce, 1), (s) => s.bounce, 'low', 'Pasaron de En curso a Asignada al menos una vez.'],
  noRes: ['Sin texto resol.', (s) => pct(s.noRes, 1), (s) => s.noRes, 'low', 'Cerradas sin explicar cómo se resolvió.'],
};
const ORDER = ['n', 'open', 'open30', 'sla', 'fr', 'avg', 'd1', 'reop', 'bounce', 'noRes'];

// m: el modelo de las Métricas; ch: sus piezas (charts.js); ui.sort.team: [columna, ±1].
export const teamPanel = (m, ch, ui) => {
  const { card, kpis, kpiCo, legend, lines } = ch;
  const A = m.rows(), sides = m.CO(), names = m.NAMES(), ST = m.bySide(A).map(m.stats);

  const head = kpis(
    kpiCo('Issues', ST, (s) => num(s.n), { val: (s) => s.n }),
    kpiCo('Dentro del SLA de inicio', ST, slaPct, { val: (s) => s.sla, better: 'high' }),
    kpiCo('Primera actuación', ST, (s) => dur(s.fr), { val: (s) => s.fr, better: 'low', note: 'media' }),
    kpiCo('Media de resolución', ST, (s) => dur(s.avg), { val: (s) => s.avg, better: 'low' }),
    kpiCo('Reabiertas', ST, (s) => pct(s.reop, 1), { val: (s) => s.reop, better: 'low' }),
    kpiCo('Abiertas ahora', ST, (s) => num(s.open), { val: (s) => s.open, note: m.CMP() ? '' : `${num(ST[sides[0]].open30)} con más de 30 días` }));

  // persona a persona, cada una frente a la media de su equipo
  const people = m.group('as', A, true).filter((x) => x.k).map((x) => {
    const s = m.stats(x.rows);
    return { ...s, k: x.k, side: x.t[0] ? 0 : 1, months: m.byMonth(x.rows) };
  });
  const [sortCol, dir] = ui.sort.team || ['n', -1];
  // al ordenar por un % o una media, quien tiene pocas issues va al final: su cifra dice poco
  const key = (r) => COLS[sortCol][2](r) ?? -Infinity, rated = !!COLS[sortCol][3], few = (r) => (rated && r.n < MIN ? 1 : 0);
  people.sort((a, b) => few(a) - few(b) || (key(a) - key(b)) * dir || b.n - a.n);
  const cell = (s, c, ref) => {
    const [, fmt, val, better] = COLS[c];
    if (c === 'open30') return `<td class="mt-num ${s.open30 ? 'bad' : ''}">${fmt(s)}</td>`;
    const cls = better && s.n >= MIN && val(s) != null && val(ref) != null ? verdict(val(s), val(ref), better === 'low') : '';
    const tip = better ? ` data-tip="${esc(`Media de su equipo: ${fmt(ref)}`)}"` : '';
    return `<td class="mt-num ${cls} ${better && s.n < MIN ? 'mt-mut' : ''}"${tip}>${fmt(s)}</td>`;
  };
  const spark = (a) => {
    const v = a.slice(0, m.LASTM + 1), max = Math.max(...v, 1), w = 80, h = 18, st = w / Math.max(v.length - 1, 1);
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="mt-spark"><polyline points="${v.map((y, i) => `${(i * st).toFixed(1)},${(h - 2 - y / max * (h - 4)).toFixed(1)}`).join(' ')}"/></svg>`;
  };
  const th = (c) => `<th class="mt-num ${sortCol === c ? 'mt-srt' : ''}" data-sort="team:${c}" data-tip="${esc(COLS[c][4])}">${COLS[c][0]}${sortCol === c ? (dir < 0 ? ' ↓' : ' ↑') : ''}</th>`;
  const row = (s) => `<tr class="mt-clk" data-person="${s.k}" title="Ver en Métricas"><td><i class="mt-sw mt-c${s.side}"></i>${esc(m.DIMS.as.label(s.k))}</td>${ORDER.map((c) => cell(s, c, ST[s.side])).join('')}<td>${spark(s.months)}</td></tr>`;
  const teamRow = (k) => `<tr class="mt-grp"><td>Equipo ${esc(names[k])}</td>${ORDER.map((c) => `<td class="mt-num">${COLS[c][1](ST[k])}</td>`).join('')}<td></td></tr>`;
  const table = `<div class="mt-tablewrap"><table class="wk-team"><thead><tr><th>Persona</th>${ORDER.map(th).join('')}<th>Por mes</th></tr></thead>
    <tbody>${people.map(row).join('') || `<tr><td colspan="${ORDER.length + 2}" class="mt-mut">Nadie con issues en este periodo.</td></tr>`}${sides.map(teamRow).join('')}</tbody></table></div>`;

  // el SLA del equipo por prioridad: % dentro, fuera de plazo y media hasta En curso
  const prio = `<table><thead><tr><th>Prioridad y SLA</th>${sides.map((k) => `<th class="mt-num"><span class="mt-sw mt-c${k}"></span>${esc(names[k])}</th>`).join('')}<th class="mt-num">Fuera de plazo</th></tr></thead><tbody>${m.PRIOS.map((p) => {
    const st = m.bySide(A.filter((i) => m.C.pr[i] === p)).map(m.stats);
    return `<tr><td>${m.slaLabel(p)}</td>${sides.map((k) => `<td class="mt-num">${slaPct(st[k])}</td>`).join('')}<td class="mt-num">${sides.map((k) => num(st[k].slaKo)).join(' / ')}</td></tr>`;
  }).join('')}</tbody></table>`;

  return `<div class="mt-grid">${head}
    ${card('El equipo, persona a persona', table, { span: 's12', sub: `En verde, mejor que la media de su equipo; en rojo, peor (pasa el ratón para verla). Con menos de ${MIN} issues en el periodo, sin color. Clic en una persona para verla en Métricas frente al resto de su equipo.` })}
    ${card('SLA de inicio por prioridad', prio, { span: 's5', sub: 'De la apertura al primer paso a En curso. «Fuera de plazo»: iniciadas tarde o aún sin iniciar con el plazo vencido.' })}
    ${card('Evolución del equipo', `${legend()}<p class="mt-small"><b>Dentro del SLA de inicio</b></p>${lines(A, (s) => s.sla, (v) => pct(v))}<p class="mt-small"><b>Media de resolución</b></p>${lines(A, (s) => s.avg, dur)}`, { span: 's7', sub: 'Por mes de apertura. * mes incompleto: lo más reciente sale mejor de lo que acabará.' })}
  </div>`;
};
