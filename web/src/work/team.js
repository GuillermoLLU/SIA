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
  const { card, diff, legend, lines } = ch;
  const A = m.rows(), sides = m.CO(), names = m.NAMES(), ST = m.bySide(A).map(m.stats);

  // las prioridades, una columna cada una (cuántas de cada)
  const PRIO = { CRITICAL: 'Crít.', HIGH: 'Altas', MEDIUM: 'Medias', LOW: 'Bajas' };
  const cols = { ...COLS };
  for (const p of m.PRIOS) cols[`p${p}`] = [PRIO[m.DI.prio[p]], (s) => num(s.prio[p]), (s) => s.prio[p], null, `Cuántas de prioridad ${m.slaLabel(p)}.`];
  const order = ['n', 'open', ...m.PRIOS.map((p) => `p${p}`), 'sla', 'day', 'avg', 'd1', 'reop', 'bounce', 'noRes', 'ia'];

  // Backlog: lo que el equipo ve en sus búsquedas de Remedy (SGA y SISU), sin resolver, tenga
  // responsable o no; de las issues abiertas en el periodo. Repartido: de su gente, sin responsable, de otros.
  const { C, OPEN, MONTH, S, N, TEAM } = m, own = m.S.sides[0].company;
  const queue = { all: 0, mine: 0, orphan: 0 };
  for (let i = 0; i < N; i++) {
    if (!OPEN[i] || MONTH[i] < S.from || MONTH[i] > S.to || (C.sc[i] !== SCOPE.SGA && C.sc[i] !== SCOPE.SISU)) continue;
    queue.all++;
    if (!C.as[i]) queue.orphan++; else if (TEAM[i] === own) queue.mine++;
  }

  // Un bloque por tema: su cifra principal, unas pocas de apoyo y, si ayuda, una barra. Con un lado,
  // sus valores; comparando, la diferencia (la tarjeta del ratón da los dos valores).
  const cmp = m.CMP(), k0 = sides[0];
  const fig = (fmt, val, better, stats = ST) => (cmp ? diff(stats[0], stats[1], fmt, val, better) : fmt(stats[k0]));
  const item = (label, html, sw = '') => `<div class="wk-item"><span>${sw ? `<i class="mt-sw ${sw}"></i>` : ''}${label}</span><b>${html}</b></div>`;
  const block = (title, label, hero, items, extra = '') => `<section class="wk-block"><h3>${title}</h3>
    <div class="wk-hero"><b>${hero}</b><span>${label}</span></div>${extra}<div class="wk-items">${items.join('')}</div></section>`;
  const bar = (share, cls = `mt-c${k0}`) => `<span class="wk-bar"><i class="${cls}" style="width:${Math.min(100, share * 100).toFixed(1)}%"></i></span>`;
  const perDay = (v) => (v == null ? '—' : dec(v));
  const iaShare = (s) => (s.resolved ? s.ia / s.resolved : null);
  const byPrio = m.PRIOS.map((p) => [p, m.bySide(A.filter((i) => C.pr[i] === p)).map(m.stats)]);

  const volume = block('Volumen', 'issues en el periodo', fig((s) => num(s.n), (s) => s.n), [
    item('Entradas al día', fig((s) => perDay(s.inPerDay), (s) => s.inPerDay)),
    item('Resueltas al día', fig((s) => perDay(s.perDay), (s) => s.perDay)),
  ], cmp ? '' : (() => {   // entradas frente a resueltas: si se resuelve al ritmo que entra
    const st = ST[k0], max = Math.max(st.inPerDay || 0, st.perDay || 0) || 1;
    return `<div class="wk-pace"><span>entran</span>${bar((st.inPerDay || 0) / max, 'mt-c2')}<span>se resuelven</span>${bar((st.perDay || 0) / max)}</div>`;
  })());
  const backlog = block('Cola', 'backlog SGA + SISU', num(queue.all), [
    // de su gente: las del backlog con responsable de la empresa; comparando, todas sus abiertas, de un lado y del otro
    item('De su gente', cmp ? fig((s) => num(s.open), (s) => s.open) : num(queue.mine), `mt-c${k0}`),
    item('Sin responsable', num(queue.orphan), 'wk-orphan'),
  ], queue.all ? `<span class="wk-split" data-tip="${esc(`Backlog SGA + SISU: ${num(queue.all)}\nDe su gente: ${num(queue.mine)}\nSin responsable: ${num(queue.orphan)}\nDe otros: ${num(queue.all - queue.mine - queue.orphan)}`)}"><i class="mt-c${k0}" style="flex:${queue.mine}"></i><i class="wk-orphan" style="flex:${queue.orphan}"></i><i class="mt-c2" style="flex:${queue.all - queue.mine - queue.orphan}"></i></span>` : '');
  const sla = block('SLA de inicio', 'cumplido, de las resueltas', fig(donePct, (s) => s.slaDone, 'high'), [],
    `<div class="wk-prios">${byPrio.map(([p, st]) => `<div class="wk-prio"><span>${m.slaLabel(p)}</span>${cmp ? '' : bar(st[k0].slaDone || 0)}<b>${fig(donePct, (s) => s.slaDone, 'high', st)}</b></div>`).join('')}</div>`);
  const times = block('Tiempos', 'media de resolución', fig((s) => dur(s.avg), (s) => s.avg, 'low'), [
    item('Resueltas en < 24 h', fig((s) => pct(s.d1), (s) => s.d1, 'high')),
    item('P90 de resolución', fig((s) => dur(s.p90), (s) => s.p90, 'low')),
  ]);
  const quality = block('Calidad', 'reabiertas', fig((s) => pct(s.reop, 1), (s) => s.reop, 'low'), [
    item('Devueltas a la cola', fig((s) => pct(s.bounce, 1), (s) => s.bounce, 'low')),
    item('Sin texto de resolución', fig((s) => pct(s.noRes, 1), (s) => s.noRes, 'low')),
  ]);
  const ia = block('IA', 'de las resueltas, con marca de IA', fig((s) => (iaShare(s) == null ? '—' : pct(iaShare(s), 1)), iaShare), [
    item('Resueltas con IA', fig((s) => num(s.ia), (s) => s.ia)),
  ]);

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

  return `<div class="wk-panel">
    ${cmp ? `<div class="wk-cmp">${legend()}<span class="mt-mut">Cada cifra es la diferencia de ${esc(names[0])} respecto a ${esc(names[1])}; pasa el ratón para ver los dos valores.</span></div>` : ''}
    <div class="wk-blocks">${volume}${backlog}${sla}</div>
    <div class="wk-blocks">${times}${quality}${ia}</div>
    <div class="mt-grid">
    ${card('El equipo, persona a persona', table, { span: 's12', sub: 'Clic en una cabecera para ordenar (pasa el ratón por ella para ver qué mide) y en una persona para verla en Métricas frente al resto de su equipo.' })}
    ${card('Evolución del equipo', `${legend()}<div class="wk-evo"><div><p class="mt-small"><b>SLA cumplido</b></p>${lines(A, (s) => s.slaDone, (v) => pct(v))}</div><div><p class="mt-small"><b>Media de resolución</b></p>${lines(A, (s) => s.avg, dur)}</div></div>`, { span: 's12', sub: 'Por mes de apertura. * mes incompleto: lo más reciente sale mejor de lo que acabará.' })}
    </div>
  </div>`;
};
