// Piezas de pantalla de las Métricas: devuelven HTML (sin DOM, se pueden
// probar en node). Los clics van por atributos que lee metrics-view.js:
// data-f="dimensión:clave" filtra, data-f2 filtra por dos a la vez,
// data-exp despliega una lista, data-sort ordena una tabla.
// Con los dos lados (A frente a B), los indicadores son la diferencia de
// A respecto a B (compare.js); data-cmp lleva lo que enseña
// la tarjeta al pasar el ratón.
import { esc } from '../ui/html.js';
import { num, pct, dur, MONTHS } from './format.js';
import { compareFigure } from './compare.js';

// ui: { exp: {id: true}, sort: {id: [columna, ±1]} }, lo que la persona ha desplegado y ordenado.
export const createCharts = (m, ui) => {
  const { DIMS, LASTM, CO, CMP, NAMES, isSel, rows, group, stats, bySide, byMonth, trend, SIDE, MONTH } = m;
  const name = (k) => NAMES()[k];   // el nombre de cada lado: una empresa, una persona o «N personas»

  const card = (t, body, o = {}) => `<section class="mt-card ${o.span ? `mt-${o.span}` : ''}"><h3>${t}</h3>${o.sub ? `<p class="mt-sub">${o.sub}</p>` : ''}${body}</section>`;
  const legend = () => `<div class="mt-legend">${CO().map((k) => `<span><i class="mt-c${k}"></i>${esc(name(k))}</span>`).join('')}</div>`;
  const kpi = (l, v, d = '', cls = '') => `<div class="mt-kpi ${cls}"><div class="mt-kpi-l">${l}</div><div class="mt-kpi-v">${v}</div><div class="mt-kpi-d">${d}</div></div>`;
  const kpis = (...k) => `<div class="mt-kpis">${k.join('')}</div>`;
  const more = (id, total, top) => (total > top ? `<button class="mt-more" data-exp="${id}">${ui.exp[id] ? 'Ver menos' : `Ver todos (${num(total)})`}</button>` : '');
  const empty = '<p class="mt-mut mt-small">Sin datos con estos filtros.</p>';

  // Diferencia de A respecto a B en un indicador.
  const diff = (a, b, fmt, val, better) => {
    const f = compareFigure(a, b, fmt, val, better);
    return f ? `<b class="mt-diff ${f.cls}" data-cmp="${esc([f.a, f.other, f.b, f.cls].join('¦'))}">${f.main}</b>` : '<span class="mt-mut">—</span>';
  };
  // Indicador de cabecera: con un lado, su valor; con los dos, la diferencia.
  const kpiCo = (label, ST, fmt, o = {}) => {
    if (!CMP()) { const k = CO()[0]; return kpi(label, fmt(ST[k]), o.note || '', `mt-t${k}`); }
    return kpi(label, diff(ST[0], ST[1], fmt, o.val, o.better), `${esc(name(0))} respecto a ${esc(name(1))}${o.note ? ` · ${o.note}` : ''}`);
  };

  // Barras horizontales de una dimensión, partidas por lado.
  const bars = (dim, o = {}) => {
    const id = o.id || dim, top = o.top || 10, list = o.rows || rows(dim);
    const g = (o.groups || group(dim, list)).filter((x) => !(o.skip && o.skip(x.k)));
    const total = list.length || 1, max = Math.max(1, ...g.map((x) => x.n)), all = ui.exp[id];
    const w = (v) => (v / max * 100).toFixed(2);
    const html = (all ? g.slice(0, 300) : g.slice(0, top)).map((x) => {
      const tip = `${DIMS[dim].label(x.k)}\n${num(x.n)} issues · ${pct(x.n / total, 1)}\n${CO().map((k) => `${name(k)}: ${num(x.t[k])}`).join(' · ')}`;
      return `<div class="mt-br ${isSel(dim, x.k) ? 'mt-sel' : ''}" data-f="${dim}:${x.k}" data-tip="${esc(tip)}"><span class="mt-bl">${esc(DIMS[dim].label(x.k))}</span>
        <span class="mt-bt">${[0, 1, 2].map((k) => `<i class="mt-c${k}" style="width:${w(x.t[k])}%"></i>`).join('')}</span>
        <span class="mt-bv">${num(x.n)}</span><span class="mt-bp">${pct(x.n / total)}</span></div>`;
    }).join('');
    return `<div class="${all ? 'mt-scroll' : ''}">${html || empty}</div>${more(id, g.length, top)}`;
  };
  // barras en un orden fijo (tramos), no por volumen
  const orderedBars = (dim, order, o = {}) => {
    const g = new Map(group(dim, o.rows).map((x) => [x.k, x]));
    return bars(dim, { ...o, top: order.length, groups: order.map((k) => g.get(k) || { k, n: 0, t: [0, 0, 0] }) });
  };

  // Columnas por mes, apiladas por lado.
  const monthly = (list) => {
    const mt = Array.from({ length: 12 }, () => [0, 0, 0]);
    for (const i of list) mt[MONTH[i]][SIDE[i]]++;
    const tot = mt.map((x) => x[0] + x[1] + x[2]), max = Math.max(...tot, 1);
    return `<div class="mt-ts">${mt.map((x, k) => (k > LASTM ? '' : `<div class="mt-col ${isSel('month', k) ? 'mt-sel' : ''} ${k === LASTM ? 'mt-part' : ''}" data-f="month:${k}"
      data-tip="${esc(`${MONTHS[k]}${k === LASTM ? ' (mes incompleto)' : ''}\n${num(tot[k])} issues\n${CO().map((t) => `${name(t)}: ${num(x[t])}`).join(' · ')}`)}">
      <div class="mt-col-n">${num(tot[k])}</div><div class="mt-stack" style="height:${(tot[k] / max * 100).toFixed(1)}%">${[0, 1, 2].map((t) => `<div class="mt-c${t}" style="flex:${x[t]}"></div>`).join('')}</div>
      <div class="mt-col-x">${MONTHS[k]}${k === LASTM ? '*' : ''}</div></div>`)).join('')}</div>`;
  };

  // Líneas por mes, una por lado. f(indicadores del mes) da el valor.
  const lines = (A, f, fmt) => {
    const W = 620, H = 190, L = 54, R = 12, T = 12, B = 26, cos = CO();
    const per = cos.map((k) => { const mt = Array.from({ length: LASTM + 1 }, () => []); for (const i of A) if (SIDE[i] === k) mt[MONTH[i]].push(i); return mt.map((l) => (l.length >= 10 ? f(stats(l)) : null)); });
    const max = Math.max(1e-9, ...per.flat().filter((v) => v != null)) * 1.1;
    const x = (i) => L + i * (W - L - R) / Math.max(LASTM, 1), y = (v) => T + (H - T - B) * (1 - v / max);
    const grid = [0, 0.5, 1].map((p) => `<line x1="${L}" x2="${W - R}" y1="${y(max * p)}" y2="${y(max * p)}" class="mt-gridline"/><text x="${L - 6}" y="${y(max * p) + 4}" text-anchor="end" class="mt-axis">${fmt(max * p)}</text>`).join('');
    const xs = MONTHS.slice(0, LASTM + 1).map((mm, i) => `<text x="${x(i)}" y="${H - 6}" text-anchor="middle" class="mt-axis">${mm}${i === LASTM ? '*' : ''}</text>`).join('');
    const ser = per.map((v, s) => {
      const pts = v.map((p, i) => (p == null ? null : [x(i), y(p)])).filter(Boolean);
      return `<polyline class="mt-line mt-s${cos[s]}" points="${pts.map((p) => p.map((n) => n.toFixed(1)).join(',')).join(' ')}"/>`
        + v.map((p, i) => (p == null ? '' : `<circle cx="${x(i).toFixed(1)}" cy="${y(p).toFixed(1)}" r="4" class="mt-f${cos[s]}" data-tip="${esc(`${name(cos[s])} · ${MONTHS[i]}\n${fmt(p)}`)}"/>`)).join('');
    }).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="mt-svg">${grid}${xs}${ser}</svg>`;
  };

  const spark = (a) => {
    const v = a.slice(0, LASTM + 1), max = Math.max(...v, 1), w = 86, h = 20, st = w / Math.max(v.length - 1, 1);
    const pts = v.map((yv, i) => `${(i * st).toFixed(1)},${(h - 2 - yv / max * (h - 4)).toFixed(1)}`);
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" class="mt-spark"><polyline points="${pts.slice(0, -1).join(' ')}"/><polyline class="mt-spark-last" points="${pts.slice(-2).join(' ')}"/></svg>`;
  };
  const mini = (t) => { const n = t[0] + t[1] + t[2] || 1; return `<span class="mt-mini">${[0, 1, 2].map((k) => `<i class="mt-c${k}" style="width:${t[k] / n * 100}%"></i>`).join('')}</span>`; };
  const delta = (tr) => {
    if (tr.prev < 15 && tr.now < 15) return '<span class="mt-mut">—</span>';
    const d = tr.prev ? (tr.now - tr.prev) / tr.prev : 1;
    return `<span class="${d > 0.1 ? 'mt-up' : d < -0.1 ? 'mt-down' : 'mt-mut'}">${d > 0 ? '+' : ''}${Math.round(d * 100)} %</span>`;
  };

  // Columnas de las tablas por valor de una dimensión: [cabecera, cómo se ve, valor para ordenar, qué es mejor].
  // Al comparar, las de DUO salen como diferencia entre los dos lados.
  const COLS = {
    n: ['Issues', (s) => num(s.n), (s) => s.n], sh: ['% total', (s, T) => pct(s.n / T, 1), (s) => s.n], mix: ['Reparto', (s) => mini(s.t), (s) => s.t[0] / (s.n || 1)],
    crit: ['% críticas', (s) => pct(s.crit), (s) => s.crit], avg: ['Media resol.', (s) => dur(s.avg), (s) => s.avg ?? -1, 'low'], p90: ['P90 resol.', (s) => dur(s.p90), (s) => s.p90 ?? -1, 'low'],
    fr: ['1.ª actuación', (s) => dur(s.fr), (s) => s.fr ?? -1, 'low'], vend: ['% a terceros', (s) => pct(s.vend), (s) => s.vend], pend: ['% pasa por pendiente', (s) => pct(s.pend), (s) => s.pend],
    reop: ['% reabiertas', (s) => pct(s.reop, 1), (s) => s.reop, 'low'], open: ['Abiertas', (s) => num(s.open), (s) => s.open], d1: ['% en < 24 h', (s) => pct(s.d1), (s) => s.d1, 'high'],
    f30: ['1.ª act. < 30 min', (s) => pct(s.f30), (s) => s.f30, 'high'], f120: ['1.ª act. < 2 h', (s) => pct(s.f120), (s) => s.f120, 'high'], h4: ['% en < 4 h', (s) => pct(s.h4), (s) => s.h4, 'high'],
    bounce: ['% devueltas a cola', (s) => pct(s.bounce, 1), (s) => s.bounce, 'low'], noCat: ['% sin tipología', (s) => pct(s.noCat, 1), (s) => s.noCat, 'low'],
    noDesc: ['% título sin descripción', (s) => pct(s.noDesc, 1), (s) => s.noDesc, 'low'], noRes: ['% sin texto de resolución', (s) => pct(s.noRes, 1), (s) => s.noRes, 'low'],
    sla: ['% en SLA de inicio', (s) => (s.sla == null ? '—' : pct(s.sla)), (s) => s.sla ?? -1, 'high'], ip: ['Media hasta En curso', (s) => dur(s.ip), (s) => s.ip ?? -1, 'low'],
    slaKo: ['Fuera de SLA', (s) => num(s.slaKo), (s) => s.slaKo],
    req: ['% peticiones', (s) => pct(s.req), (s) => s.req], rep: ['% resolución repetida', (s) => pct(s.rep), (s) => s.rep],
    tr: ['Tendencia', (s) => spark(s.m), (s) => s.tr.now - s.tr.prev], dl: ['Últ. 90 d vs. 90 ant.', (s) => `${num(s.tr.now)} / ${num(s.tr.prev)} ${delta(s.tr)}`, (s) => s.tr.now - s.tr.prev],
  };
  const DUO = new Set(['sla', 'ip', 'crit', 'avg', 'p90', 'fr', 'vend', 'pend', 'reop', 'd1', 'req', 'rep', 'f30', 'f120', 'h4', 'bounce', 'noCat', 'noDesc', 'noRes']);

  // Tabla ordenable con indicadores por valor de una dimensión. Clic en una fila = filtrar.
  const ranking = (dim, cols, o = {}) => {
    const id = o.id || `rk-${dim}`, list = o.rows || rows(dim), T = list.length || 1, min = o.min || 1, cmp = CMP();
    const full = (l) => { const s = stats(l); o.extra?.(s, l); return s; };
    const data = group(dim, list, true).filter((x) => x.n >= min && !(o.skip && o.skip(x.k))).map((x) => {
      const s = full(x.rows);
      s.k = x.k;
      if (cols.includes('tr') || cols.includes('dl')) { s.m = byMonth(x.rows); s.tr = trend(x.rows); }
      if (cmp) s.co = bySide(x.rows).slice(0, 2).map(full);
      return s;
    });
    const srt = ui.sort[id] || [o.sort || 'n', -1];
    // al comparar, las columnas de diferencia se ordenan por la diferencia
    const key = (r) => {
      const v = COLS[srt[0]][2];
      if (!cmp || !DUO.has(srt[0])) return v(r);
      if (!r.co[0].n || !r.co[1].n) return -Infinity;
      const x = v(r.co[0]), y = v(r.co[1]);
      return y && /%$/.test(COLS[srt[0]][1](r.co[0])) ? (x - y) / y : x - y;
    };
    data.sort((a, b) => (key(a) - key(b)) * srt[1]);
    const top = o.top || 15, all = ui.exp[id], shown = all ? data.slice(0, 400) : data.slice(0, top);
    const cell = (s, c) => (cmp && DUO.has(c) ? diff(s.co[0], s.co[1], COLS[c][1], COLS[c][2], COLS[c][3]) : COLS[c][1](s, T));
    const head = (c) => `<th class="mt-num ${srt[0] === c ? 'mt-srt' : ''}" data-sort="${id}:${c}">${COLS[c][0]}${srt[0] === c ? (srt[1] < 0 ? ' ↓' : ' ↑') : ''}</th>`;
    return `<div class="mt-tablewrap ${all ? 'mt-scroll' : ''}"><table><thead><tr><th>${DIMS[dim].name}</th>${cols.map(head).join('')}</tr></thead><tbody>
      ${shown.map((s) => `<tr class="mt-clk ${isSel(dim, s.k) ? 'mt-sel' : ''}" data-f="${dim}:${s.k}"><td>${esc(DIMS[dim].label(s.k))}</td>${cols.map((c) => `<td class="mt-num">${cell(s, c)}</td>`).join('')}</tr>`).join('')}
      </tbody></table></div>${more(id, data.length, top)}`;
  };

  // Perfil comparado: qué parte de lo de cada lado cae en cada valor. Con uno solo, barras normales.
  const compare = (dim, o = {}) => {
    if (!CMP()) return bars(dim, { top: o.top || 10, skip: o.skip, id: `cmp-${dim}` });
    const list = o.rows || rows(dim), g = group(dim, list).filter((x) => !(o.skip && o.skip(x.k)));
    const tot = [0, 0]; for (const i of list) if (SIDE[i] < 2) tot[SIDE[i]]++;
    const sh = g.map((x) => ({ k: x.k, a: x.t[0] / (tot[0] || 1), b: x.t[1] / (tot[1] || 1), t: x.t })).sort((p, q) => Math.max(q.a, q.b) - Math.max(p.a, p.b)).slice(0, o.top || 10);
    const max = Math.max(0.01, ...sh.map((x) => Math.max(x.a, x.b)));
    return `<div class="mt-cmp mt-cmp-h"><div class="mt-cmp-l">${esc(name(0))}</div><div class="mt-cmp-m mt-mut">% de lo que lleva cada lado</div><div class="mt-cmp-r">${esc(name(1))}</div></div>` + sh.map((x) =>
      `<div class="mt-cmp ${isSel(dim, x.k) ? 'mt-sel' : ''}" data-f="${dim}:${x.k}" data-tip="${esc(`${DIMS[dim].label(x.k)}\n${name(0)}: ${num(x.t[0])} (${pct(x.a, 1)})\n${name(1)}: ${num(x.t[1])} (${pct(x.b, 1)})`)}">
       <div class="mt-cmp-l"><span>${pct(x.a)}</span><i class="mt-c0" style="width:${x.a / max * 70}%"></i></div><div class="mt-cmp-m">${esc(DIMS[dim].label(x.k))}</div><div class="mt-cmp-r"><i class="mt-c1" style="width:${x.b / max * 70}%"></i><span>${pct(x.b)}</span></div></div>`).join('');
  };

  // Mapa de calor entre dos dimensiones (los valores más frecuentes de cada una). Clic en una celda = filtrar por ambas.
  const heat = (rd, cd, nr, nc, o = {}) => {
    const dr = DIMS[rd], dc = DIMS[cd], list = o.rows || rows(), keys = (d, i) => (d.multi ? d.get(i) : [d.get(i)]);
    const R = group(rd, list).filter((x) => !(o.skipR && o.skipR(x.k))).slice(0, nr), Cc = group(cd, list).filter((x) => !(o.skipC && o.skipC(x.k))).slice(0, nc);
    if (!R.length || !Cc.length) return empty;
    if (o.orderR) R.sort((x, y) => o.orderR.indexOf(x.k) - o.orderR.indexOf(y.k));
    const ri = new Map(R.map((x, i) => [x.k, i])), ci = new Map(Cc.map((x, i) => [x.k, i])), mt = R.map(() => Cc.map(() => [0, 0, 0]));
    for (const i of list) for (const a of keys(dr, i)) { const r = ri.get(a); if (r == null) continue; for (const b of keys(dc, i)) { const c = ci.get(b); if (c != null) mt[r][c][SIDE[i]]++; } }
    const tot = (t) => t[0] + t[1] + t[2], max = Math.max(1, ...mt.flat().map(tot));
    const cell = (t, r, c) => {
      const v = tot(t), a = v ? Math.round(8 + 92 * Math.pow(v / max, 0.6)) : 0;
      return `<td class="${a > 50 ? 'mt-hot' : ''}" style="--mt-a:${a}%" data-f2="${rd}:${R[r].k}|${cd}:${Cc[c].k}" data-tip="${esc(`${dr.label(R[r].k)} × ${dc.label(Cc[c].k)}\n${num(v)} issues\n${CO().map((k) => `${name(k)}: ${num(t[k])}`).join(' · ')}`)}">${v || ''}</td>`;
    };
    return `<div class="mt-tablewrap"><table class="mt-hm"><thead><tr><th></th>${Cc.map((c) => `<th class="mt-v">${esc(dc.label(c.k))}</th>`).join('')}<th class="mt-v">Total</th></tr></thead><tbody>
      ${R.map((r, i) => `<tr><th class="mt-r" title="${esc(dr.label(r.k))}">${esc(dr.label(r.k))}</th>${mt[i].map((t, j) => cell(t, i, j)).join('')}<td class="mt-mut mt-total">${num(r.n)}</td></tr>`).join('')}</tbody></table></div>`;
  };

  // Barra única repartida en tramos: dónde se va el tiempo de vida de las issues.
  const TIME_NAMES = ['En cola (asignada, sin coger)', 'En curso', 'Pendiente del centro / cliente', 'Pendiente de un tercero', 'Pendiente (otros motivos)'];
  const timeBar = (t) => {
    const total = t.reduce((a, b) => a + b, 0) || 1;
    return `<div class="mt-hbar">${t.map((v, i) => `<i class="mt-time${i}" style="width:${v / total * 100}%" data-tip="${TIME_NAMES[i]}\n${pct(v / total, 1)} del tiempo · ${num(v / 60)} h"></i>`).join('')}</div>`;
  };
  const timeBars = (ST) => `<div class="mt-legend">${TIME_NAMES.map((n, i) => `<span><i class="mt-time${i}"></i>${n}</span>`).join('')}</div>`
    + CO().map((k) => `<p class="mt-small"><span class="mt-sw mt-c${k}"></span><b>${esc(name(k))}</b></p>${timeBar(ST[k].time)}`).join('');

  // Quién sube y quién baja: últimos 90 días frente a los 90 anteriores.
  const movers = (dim, o = {}) => {
    const g = group(dim, o.rows || rows(dim), true).filter((x) => !(o.skip && o.skip(x.k))).map((x) => ({ k: x.k, ...trend(x.rows) })).filter((x) => x.now + x.prev >= (o.min || 40));
    const row = (x) => `<tr class="mt-clk" data-f="${dim}:${x.k}"><td>${esc(DIMS[dim].label(x.k))}</td><td class="mt-num">${num(x.prev)}</td><td class="mt-num">${num(x.now)}</td><td class="mt-num">${delta(x)}</td></tr>`;
    const up = g.slice().sort((a, b) => (b.now - b.prev) - (a.now - a.prev)).filter((x) => x.now > x.prev).slice(0, o.top || 6);
    const dn = g.slice().sort((a, b) => (a.now - a.prev) - (b.now - b.prev)).filter((x) => x.now < x.prev).slice(0, o.top || 6);
    const head = '<thead><tr><th></th><th class="mt-num">90 d ant.</th><th class="mt-num">Últ. 90 d</th><th class="mt-num">Var.</th></tr></thead>';
    const none = '<tr><td class="mt-mut">Nada destacable</td></tr>';
    return `<div class="mt-pair"><div><p class="mt-small"><b class="mt-up">▲ Suben</b></p><table>${head}<tbody>${up.map(row).join('') || none}</tbody></table></div>
      <div><p class="mt-small"><b class="mt-down">▼ Bajan</b></p><table>${head}<tbody>${dn.map(row).join('') || none}</tbody></table></div></div>`;
  };

  return { card, legend, kpi, kpis, kpiCo, diff, bars, orderedBars, monthly, lines, ranking, compare, heat, timeBars, movers, mini };
};
