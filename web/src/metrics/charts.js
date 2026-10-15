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
import { SHIFTS } from './shifts.js';

// ui: { exp: {id: true}, sort: {id: [columna, ±1]} }, lo que la persona ha desplegado y ordenado.
export const createCharts = (m, ui) => {
  const { DIMS, LASTM, CO, CMP, NAMES, isSel, rows, group, stats, bySide, byMonth, trend, SIDE, MONTH } = m;
  const name = (k) => NAMES()[k];   // el nombre de cada lado: una empresa, una persona o «N personas»

  // sin título (t vacío), la tarjeta es solo su contenido, de borde a borde: p. ej. un mapa de calor que lleva el
  // título dentro y forma un bloque
  const card = (t, body, o = {}) => `<section class="mt-card ${o.span ? `mt-${o.span}` : ''} ${t ? '' : 'mt-flush'}">${t ? `<h3>${t}</h3>` : ''}${o.sub ? `<p class="mt-sub">${o.sub}</p>` : ''}${body}</section>`;
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
  // Indicador de cabecera: con un lado, su valor; con los dos, en grande la diferencia del primero respecto al
  // segundo (en verde o rojo si tiene un sentido mejor; en puntos si es un %, que es lo que se lee al mirar los dos
  // valores) y debajo el valor de cada uno. La nota, al pasar el ratón.
  const kpiCo = (label, ST, fmt, o = {}) => {
    if (!CMP()) { const k = CO()[0]; return kpi(label, fmt(ST[k]), o.note || '', `mt-t${k}`); }
    const f = compareFigure(ST[0], ST[1], fmt, o.val, o.better);
    const nm = (k) => o.names?.[k] || name(k);   // o.names: otro nombre para cada lado en esta cifra
    const side = (k) => `<div class="mt-kpi-s"><i class="mt-c${k}"></i><span title="${esc(nm(k))}">${esc(nm(k))}</span><b>${ST[k].n ? fmt(ST[k]) : '—'}</b></div>`;
    return `<div class="mt-kpi mt-kpi-co"><div class="mt-kpi-l" ${o.note ? `data-tip="${esc(o.note)}"` : ''}>${label}</div>
      <div class="mt-kpi-v ${f ? `mt-diff ${f.cls}` : 'mt-mut'}">${f ? (f.pts || f.main) : '—'}</div>${side(0)}${side(1)}</div>`;
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

  // Líneas por mes, una por lado. f(indicadores del mes) da el valor. o.height y o.left: alto del
  // dibujo y margen para las etiquetas del eje (para gráficas pequeñas, con letra más grande).
  const lines = (A, f, fmt, o = {}) => {
    const W = 620, H = o.height || 190, L = o.left || 74, R = 12, T = 12, B = 26, cos = CO();
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
    crit: ['% críticas', (s) => pct(s.crit), (s) => s.crit], avg: ['Media resol.', (s) => dur(s.avg), (s) => s.avg ?? -1, 'low'], p90: ['El 90 %, en menos de', (s) => dur(s.p90), (s) => s.p90 ?? -1, 'low'],
    fr: ['1.ª actuación', (s) => dur(s.fr), (s) => s.fr ?? -1, 'low'], vend: ['% a terceros', (s) => pct(s.vend), (s) => s.vend], pend: ['% pasa por pendiente', (s) => pct(s.pend), (s) => s.pend],
    reop: ['% reabiertas', (s) => pct(s.reop, 1), (s) => s.reop, 'low'], open: ['Abiertas', (s) => num(s.open), (s) => s.open], d1: ['% en < 24 h', (s) => pct(s.d1), (s) => s.d1, 'high'],
    f30: ['1.ª act. < 30 min', (s) => pct(s.f30), (s) => s.f30, 'high'], f120: ['1.ª act. < 2 h', (s) => pct(s.f120), (s) => s.f120, 'high'], h4: ['% en < 4 h', (s) => pct(s.h4), (s) => s.h4, 'high'],
    bounce: ['% devueltas a cola', (s) => pct(s.bounce, 1), (s) => s.bounce, 'low'], noCat: ['% sin tipología', (s) => pct(s.noCat, 1), (s) => s.noCat, 'low'],
    noDesc: ['% título sin descripción', (s) => pct(s.noDesc, 1), (s) => s.noDesc, 'low'], noRes: ['% sin texto de resolución', (s) => pct(s.noRes, 1), (s) => s.noRes, 'low'],
    sla: ['Empezadas dentro del SLA', (s) => (s.sla == null ? '—' : pct(s.sla)), (s) => s.sla ?? -1, 'high'], ip: ['Media hasta En curso', (s) => dur(s.ip), (s) => s.ip ?? -1, 'low'],
    slaKo: ['Fuera de SLA', (s) => num(s.slaKo), (s) => s.slaKo],
    req: ['% peticiones', (s) => pct(s.req), (s) => s.req], rep: ['% resolución repetida', (s) => pct(s.rep), (s) => s.rep],
    tr: ['Tendencia', (s) => spark(s.m), (s) => s.tr.now - s.tr.prev], dl: ['Últ. 90 d vs. 90 ant.', (s) => `${num(s.tr.now)} / ${num(s.tr.prev)} ${delta(s.tr)}`, (s) => s.tr.now - s.tr.prev],
  };
  const DUO = new Set(['sla', 'ip', 'crit', 'avg', 'p90', 'fr', 'vend', 'pend', 'reop', 'd1', 'req', 'rep', 'f30', 'f120', 'h4', 'bounce', 'noCat', 'noDesc', 'noRes']);

  // Tabla ordenable con indicadores por valor de una dimensión. Clic en una fila = filtrar.
  const ranking = (dim, cols, o = {}) => {
    const id = o.id || `rk-${dim}`, list = o.rows || rows(dim), T = list.length || 1, min = o.min || 1, cmp = CMP();
    if (!cmp) cols = cols.filter((c) => c !== 'mix');   // el reparto entre lados, solo al comparar
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
      </tbody></table></div>`;
  };

  // Ficha por valor de una dimensión (módulos, centros…), para leerla de un vistazo: columnas en bloques con su
  // título; abajo, el total (todos), que es la referencia; en ocre, lo que va claramente peor que ella (un 15 % o más,
  // solo con al menos SC_MIN issues, para no marcar lo que dice poco). Las o.top primeras y «Resto», para que
  // sume el total; un clic en «Resto» las enseña todas. Clic en una cabecera ordena; en una fila, filtra. Comparando,
  // cada cifra es la del primer lado con su diferencia respecto al otro.
  // o.child: { dim, top, noun }: cada fila se despliega (▸) en sus valores de otra dimensión (los temas, en sus problemas),
  // ordenados igual; los o.child.top primeros y «Otros», para que sumen la fila.
  const SC_MIN = 30;
  const SC = {
    n: ['Issues', null, (s) => s.n, 'Issues recibidas en el periodo y su parte del total.'],
    dl: ['90 días', null, (s) => (s.tr.prev ? (s.tr.now - s.tr.prev) / s.tr.prev : 0), 'Últimos 90 días de la foto frente a los 90 anteriores.'],
    sla: ['En SLA', 'high', (s) => s.sla, 'Empezadas (paso a En curso) dentro del plazo de su prioridad.'],
    avg: ['Media resol.', 'low', (s) => s.avg, 'Tiempo medio de la apertura a la resolución.'],
    d1: ['En < 24 h', 'high', (s) => s.d1, 'De las resueltas, las resueltas en menos de 24 horas.'],
    reop: ['Reabiertas', 'low', (s) => s.reop, 'Volvieron de Resuelta a abierta.'],
    crit: ['Críticas', null, (s) => s.crit, 'Parte de prioridad crítica.'],
    vend: ['Escaladas', null, (s) => s.vend, 'Parte con ticket de tercero.'],
    open: ['Pendientes', null, (s) => s.open, 'Lo recibido en el periodo que sigue sin resolver.'],
    // con o.extra: top, el valor de otra dimensión que más se repite ({ label, share }); mi, los major incidents
    top: ['Lo que más falla', null, null, 'El módulo con más issues y su parte.'],
    mi: ['Major inc.', null, (s) => s.mi, 'Issues con la etiqueta de major incident en sus notas de trabajo.'],
    // con o.extra: nce, en cuántos centros pasa; same, de las resueltas, la parte cerrada con el texto más usado
    nce: ['Centros', null, (s) => s.nce, 'En cuántos centros distintos ha pasado. En uno, es algo local; en muchos, del sistema.'],
    same: ['Mismo cierre', null, (s) => s.same, 'De las resueltas, la parte cerrada con el mismo texto de resolución (el más usado). Si es alta, se resuelve siempre igual: se puede automatizar o llevar a la IA.'],
  };
  const SC_FMT = { sla: (v) => (v == null ? '—' : pct(v)), avg: dur, d1: (v) => pct(v), reop: (v) => pct(v, 1), crit: (v) => pct(v), vend: (v) => pct(v), open: num, mi: (v) => (v ? num(v) : ''), nce: num, same: pct };
  const scorecard = (dim, groups, o = {}) => {
    const id = o.id || `sc-${dim}`, list = o.rows || rows(dim), cmp = CMP(), cols = groups.flatMap(([, c]) => c);
    const side = (l) => (cmp ? l.filter((i) => SIDE[i] === 0) : l), other = (l) => l.filter((i) => SIDE[i] === 1);
    const full = (l) => { const st = stats(side(l)); st.tr = trend(side(l)); o.extra?.(st, side(l)); if (cmp) { st.b = stats(other(l)); o.extra?.(st.b, other(l)); } return st; };
    const all = group(dim, list, true).filter((x) => !(o.skip && o.skip(x.k)));
    const ref = full(list), T = ref.n || 1;
    const srt = ui.sort[id] || ['n', -1], key = (r) => SC[srt[0]][2](r) ?? -Infinity;
    // al ordenar por cómo se atiende, lo que tiene pocas issues va al final: su cifra dice poco
    const few = (r) => (SC[srt[0]][1] && r.n < SC_MIN ? 1 : 0);
    const order = (a, b) => few(a) - few(b) || (key(a) - key(b)) * srt[1] || b.n - a.n;
    const data = all.map((x) => ({ ...full(x.rows), k: x.k, rows: x.rows })).sort(order);
    // lo marcado (filtrado) va primero y siempre a la vista, aunque estuviera en «Resto»; lo demás, apagado
    const picked = data.filter((r) => isSel(dim, r.k)), any = picked.length > 0;
    const ordered = any ? [...picked, ...data.filter((r) => !isSel(dim, r.k))] : data;
    const top = Math.max(o.top || 12, picked.length), open = ui.exp[id], shown = open ? ordered : ordered.slice(0, top);
    const rest = !open && data.length > top ? full(all.filter((x) => !shown.some((r) => r.k === x.k)).flatMap((x) => x.rows)) : null;
    const worse = (c, r) => {
      const b = SC[c][1], v = SC[c][2](r), w = SC[c][2](ref);
      if (!b || r.n < SC_MIN || v == null || w == null) return false;
      return b === 'low' ? v > w * 1.15 : v < w * 0.85;
    };
    // la barra, su parte real del total (el total, entera; «Resto», lo que suma)
    const cell = (c, r, isRef) => {
      if (c === 'n') return `<td><div class="mt-sc-vol"><em>${pct(r.n / T, 1)}</em><span class="mt-sc-bar"><i style="width:${(r.n / T * 100).toFixed(1)}%"></i></span><b>${num(r.n)}</b></div></td>`;
      if (c === 'top') return `<td class="mt-sc-top">${r.top ? `<span data-tip="${esc(`${r.top.label}\n${pct(r.top.share, 1)} de sus issues`)}">${esc(r.top.label)}</span><em>${pct(r.top.share)}</em>` : ''}</td>`;
      if (c === 'dl') return `<td class="mt-num" data-tip="${esc(`Últimos 90 días: ${num(r.tr.now)}\n90 anteriores: ${num(r.tr.prev)}`)}">${delta(r.tr)}</td>`;
      const v = SC[c][2](r), shown = v == null ? '—' : SC_FMT[c](v);
      const d = cmp && r.b ? diff(r, r.b, (x) => SC_FMT[c](SC[c][2](x)), (x) => SC[c][2](x), SC[c][1]) : '';
      return `<td class="mt-num ${!isRef && worse(c, r) ? 'mt-worse' : ''}" ${!isRef && worse(c, r) ? `data-tip="${esc(`Peor que la media de todos: ${SC_FMT[c](SC[c][2](ref))}`)}"` : ''}>${shown}${d ? `<small>${d}</small>` : ''}</td>`;
    };
    const head = (c) => `<th class="mt-num ${srt[0] === c ? 'mt-srt' : ''}" ${SC[c][2] ? `data-sort="${id}:${c}"` : ''} data-tip="${esc(SC[c][3])}">${SC[c][0]}${srt[0] === c ? (srt[1] < 0 ? ' ↓' : ' ↑') : ''}</th>`;
    const colgroup = `<colgroup><col class="mt-sc-first">${groups.map(([, c]) => c.map((x, j) => `<col class="${j ? '' : 'mt-gsep'} mt-sc-${x}">`).join('')).join('')}</colgroup>`;
    const row = (label, r, attrs = '', isRef = false, lead = '') => `<tr ${attrs}><th class="mt-r" title="${esc(label)}">${lead}${esc(label)}</th>${cols.map((c) => cell(c, r, isRef)).join('')}</tr>`;
    const ch = o.child, cd = ch && DIMS[ch.dim], kidAny = ch && m.S.f[ch.dim]?.size > 0;
    const kids = (r) => {
      const g = group(ch.dim, r.rows, true).map((x) => ({ ...full(x.rows), k: x.k, rows: x.rows })).sort(order), top = g.slice(0, ch.top || 8);
      const others = g.length > top.length ? full(g.slice(top.length).flatMap((x) => x.rows)) : null;
      return top.map((x) => row(cd.label(x.k), x, `class="mt-clk mt-sc-kid ${isSel(ch.dim, x.k) ? 'mt-sel' : any || kidAny ? 'mt-off' : ''}" data-f="${ch.dim}:${x.k}"`)).join('')
        + (others ? row(`Otros ${num(g.length - top.length)} ${ch.noun}`, others, `class="mt-sc-kid mt-sc-others ${any || kidAny ? 'mt-off' : ''}"`) : '');
    };
    const parent = (r) => {
      const ek = `${id}:${r.k}`, tog = ch ? `<button class="mt-sc-tog" data-exp="${ek}" data-tip="${ui.exp[ek] ? 'Recoger' : 'Ver sus problemas'}">${ui.exp[ek] ? '▾' : '▸'}</button>` : '';
      return row(DIMS[dim].label(r.k), r, `class="mt-clk ${isSel(dim, r.k) ? 'mt-sel' : any ? 'mt-off' : ''} ${ch && ui.exp[ek] ? 'mt-sc-open' : ''}" data-f="${dim}:${r.k}"`, false, tog) + (ch && ui.exp[ek] ? kids(r) : '');
    };
    return `${cmp ? `<p class="mt-small mt-mut mt-sc-cmp">Cifras de ${esc(name(0))}; debajo, la diferencia con ${esc(name(1))}.</p>` : ''}<div class="mt-tablewrap"><table class="mt-sc">${colgroup}
      <thead><tr class="mt-cgrp"><th rowspan="2" class="mt-sc-title">${esc(o.title || DIMS[dim].name)}</th>${groups.map(([t, c]) => `<th colspan="${c.length}">${t}</th>`).join('')}</tr><tr>${cols.map(head).join('')}</tr></thead><tbody>
      ${shown.map(parent).join('')}
      ${rest ? row(`Resto (${data.length - shown.length})`, rest, `class="mt-sc-rest ${any ? 'mt-off' : ''}" data-exp="${id}" data-tip="Ver todos"`) : ''}
      ${open && data.length > top ? `<tr class="mt-sc-less" data-exp="${id}"><th class="mt-r" colspan="${cols.length + 1}">Ver menos</th></tr>` : ''}
      ${row(o.refLabel || 'Todos', ref, 'class="mt-sc-ref"', true)}
      </tbody></table></div>`;
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
    if (o.orderC) Cc.sort((x, y) => o.orderC.indexOf(x.k) - o.orderC.indexOf(y.k));
    const ri = new Map(R.map((x, i) => [x.k, i])), ci = new Map(Cc.map((x, i) => [x.k, i])), mt = R.map(() => Cc.map(() => [0, 0, 0]));
    for (const i of list) for (const a of keys(dr, i)) { const r = ri.get(a); if (r == null) continue; for (const b of keys(dc, i)) { const c = ci.get(b); if (c != null) mt[r][c][SIDE[i]]++; } }
    const tot = (t) => t[0] + t[1] + t[2], max = Math.max(1, ...mt.flat().map(tot));
    const cell = (t, r, c) => {
      const v = tot(t), a = v ? Math.round(8 + 92 * Math.pow(v / max, 0.6)) : 0;
      return `<td class="${a > 50 ? 'mt-hot' : ''}" style="--mt-a:${a}%" ${o.noClick ? '' : `data-f2="${rd}:${R[r].k}|${cd}:${Cc[c].k}"`} data-tip="${esc(`${dr.label(R[r].k)} × ${dc.label(Cc[c].k)}\n${num(v)} issues\n${CO().map((k) => `${name(k)}: ${num(t[k])}`).join(' · ')}`)}">${v || ''}</td>`;
    };
    // cabeceras en horizontal; si son muchas (módulos, centros…), columnas iguales y el nombre cortado con «…» (entero al pasar el ratón)
    const v = 'mt-h', wide = Cc.length > 6;
    const cg = wide ? `<colgroup><col style="width:22%">${'<col>'.repeat(Cc.length)}<col style="width:6%"></colgroup>` : '';
    // o.title: el título, dentro de la tabla, en la esquina de la fila de cabecera («Centro × Módulo»)
    const corner = o.title ? `<th class="mt-hm-title">${esc(DIMS[rd].name.split(' ')[0])}<i>×</i>${esc(dc.name.split(' ')[0])}</th>` : '<th></th>';
    return `<div class="mt-tablewrap"><table class="mt-hm ${wide ? 'mt-hwide' : ''} ${o.title ? 'mt-hm-titled' : ''}">${cg}<thead><tr>${corner}${Cc.map((c) => `<th class="${v}" data-tip="${esc(dc.label(c.k))}">${esc(dc.label(c.k))}</th>`).join('')}<th class="${v}">Total</th></tr></thead><tbody>
      ${R.map((r, i) => `<tr><th class="mt-r" title="${esc(dr.label(r.k))}">${esc(dr.label(r.k))}</th>${mt[i].map((t, j) => cell(t, i, j)).join('')}<td class="mt-mut mt-total">${num(r.n)}</td></tr>`).join('')}</tbody></table></div>`;
  };

  // Tabla de recuentos para cuadrar cuentas: filas y columnas son condiciones ({ label, test, f }); una
  // fila { head } abre un grupo. Cada celda, cuántas de `list` cumplen las dos; el color, dentro de su
  // grupo. o.total: columna Total; o.share: columna % (de o.of, por defecto todo `list`); o.foot: fila
  // { label, test } de totales. Clic en una celda o fila con `f` = filtrar.
  const matrix = (rowsDef, cols, list, o = {}) => {
    const R = rowsDef.filter((r) => !r.head), ri = new Map(R.map((r, j) => [r, j]));
    const all = o.foot ? [...R, o.foot] : R, cnt = all.map(() => cols.map(() => [0, 0, 0])), rt = all.map(() => [0, 0, 0]);
    for (const i of list) {
      for (let r = 0; r < all.length; r++) {
        if (!all[r].test(i)) continue;
        rt[r][SIDE[i]]++;
        for (let c = 0; c < cols.length; c++) if (cols[c].test(i)) cnt[r][c][SIDE[i]]++;
      }
    }
    const tot = (t) => t[0] + t[1] + t[2], of = o.of ?? list.length;
    // comparando, cada celda lleva lo de los dos lados: «A / B» (lo que no es de ninguno, tal cual)
    const show = (t) => (!CMP() || (!t[0] && !t[1]) ? (tot(t) ? num(tot(t)) : '') : `${num(t[0])}<span class="mt-mut"> / ${num(t[1])}</span>`);
    // el máximo de cada grupo, para el color
    const gmax = new Map(); let g = 0;
    for (const r of rowsDef) { if (r.head) { g++; continue; } const j = ri.get(r); gmax.set(g, Math.max(gmax.get(g) || 1, ...cnt[j].map(tot))); r.g = g; }
    const tip = (label, t) => `${label}\n${num(tot(t))} issues${CMP() ? `\n${CO().map((k) => `${name(k)}: ${num(t[k])}`).join(' · ')}` : ''}`;
    const filt = (r, c) => (r.f && c?.f ? `data-f2="${r.f}|${c.f}"` : r.f && !c ? `data-f="${r.f}"` : c?.f && !r.f ? `data-f="${c.f}"` : '');
    const cell = (r, j, c, k, shade) => {
      const v = tot(cnt[j][k]), a = shade && v ? Math.round(8 + 92 * Math.pow(v / gmax.get(r.g), 0.6)) : 0;
      return `<td class="mt-num ${a > 50 ? 'mt-hot' : ''}" ${shade ? `style="--mt-a:${a}%"` : ''} ${filt(r, c)} data-tip="${esc(tip(`${r.label} · ${c.label}`, cnt[j][k]))}">${show(cnt[j][k])}</td>`;
    };
    if (CMP()) o = { ...o, share: false };   // comparando, un % sobre los dos lados juntos no dice nada
    // Las filas, por bloques: cada { head, note } abre uno y su nombre va en una columna a la izquierda que
    // abarca todas sus filas (como en una tabla dinámica). Las filas antes del primero, sin bloque.
    const blocks = [];
    for (const r of rowsDef) { if (r.head) blocks.push({ head: r.head, note: r.note, rows: [] }); else { if (!blocks.length) blocks.push({ rows: [] }); blocks[blocks.length - 1].rows.push(r); } }
    const grouped = blocks.some((b) => b.head), span = grouped ? 'colspan="2"' : '';
    const tail = (t, r = {}) => `${o.total ? `<td class="mt-num mt-total" ${filt(r)} data-tip="${esc(tip(r.label || 'Total', t))}">${show(t)}</td>` : ''}${o.share ? `<td class="mt-num mt-mut">${pct(tot(t) / (of || 1), 1)}</td>` : ''}`;
    const row = (r, b, first) => {
      const j = ri.get(r), lab = `<th class="mt-r" ${r.tip ? `data-tip="${esc(r.tip)}"` : `title="${esc(r.label)}"`} ${filt(r)}>${esc(r.label)}</th>`;
      const gl = !grouped ? lab : !b.head ? lab.replace('<th ', `<th ${span} `) : (first ? `<th class="mt-gl" rowspan="${b.rows.length}">${esc(b.head)}${b.note ? `<small>${esc(b.note)}</small>` : ''}</th>` : '') + lab;
      return `<tr class="${first ? 'mt-gfirst' : ''}">${gl}${cols.map((c, k) => cell(r, j, c, k, o.shade !== false)).join('')}${tail(rt[j], r)}</tr>`;
    };
    const fj = all.length - 1;
    // el total: arriba (footTop) encabeza la tabla y lo de debajo es su desglose; abajo, la cierra
    const foot = o.foot ? `<tr class="mt-lead ${o.footTop ? '' : 'mt-lead-end'}"><th class="mt-r" ${span}>${esc(o.foot.label)}</th>${cols.map((c, k) => `<td class="mt-num" ${filt({}, c)}>${show(cnt[fj][k])}</td>`).join('')}${tail(rt[fj])}</tr>` : '';
    const wide = cols.length > 8, widths = grouped ? [wide ? 12 : 15, wide ? 17 : 20] : [wide ? 20 : 27];
    const body = blocks.map((b) => b.rows.map((r, k) => row(r, b, k === 0)).join('')).join('');
    return `${CMP() ? `<p class="mt-small mt-mut">Cada celda: ${esc(name(0))} / ${esc(name(1))}.</p>` : ''}<div class="mt-tablewrap"><table class="mt-hm mt-mx"><colgroup>${widths.map((w) => `<col style="width:${w}%">`).join('')}${'<col>'.repeat(cols.length + (o.total ? 1 : 0) + (o.share ? 1 : 0))}</colgroup>
      <thead><tr><th class="mt-corner" ${span}>${esc(o.corner || '')}</th>${cols.map((c) => `<th class="mt-h" ${c.tip ? `data-tip="${esc(c.tip)}"` : ''}>${esc(c.label)}</th>`).join('')}${o.total ? '<th class="mt-h">Total</th>' : ''}${o.share ? '<th class="mt-h">%</th>' : ''}</tr></thead><tbody>
      ${o.footTop ? foot : ''}${body}${o.footTop ? '' : foot}</tbody></table></div>`;
  };

  // Barra única repartida en tramos: dónde se va el tiempo de vida de las issues.
  const TIME_NAMES = ['En cola (asignada, sin coger)', 'En curso', 'Pendiente del centro / cliente', 'Pendiente de un tercero', 'Pendiente (otros motivos)'];
  const timeBar = (t) => {
    const total = t.reduce((a, b) => a + b, 0) || 1;
    return `<div class="mt-hbar">${t.map((v, i) => `<i class="mt-time${i}" style="width:${v / total * 100}%" data-tip="${TIME_NAMES[i]}\n${pct(v / total, 1)} del tiempo · ${num(v / 60)} h"></i>`).join('')}</div>`;
  };
  const timeBars = (ST) => `<div class="mt-legend">${TIME_NAMES.map((n, i) => `<span><i class="mt-time${i}"></i>${n}</span>`).join('')}</div>`
    + CO().map((k) => `<p class="mt-small"><span class="mt-sw mt-c${k}"></span><b>${esc(name(k))}</b></p>${timeBar(ST[k].time)}`).join('');

  // Un día en 24 horas: una línea por serie ({ label, cls, v: 24 valores }) sobre los turnos, de fondo.
  const day = (series, fmt = num) => {
    const W = 1100, H = 260, L = 46, R = 12, T = 22, B = 24, x = (h) => L + (h + 0.5) * (W - L - R) / 24;
    const max = Math.max(1, ...series.flatMap((s) => s.v)) * 1.1, y = (v) => T + (H - T - B) * (1 - v / max);
    const band = (from, to, k) => `<rect x="${(L + from * (W - L - R) / 24).toFixed(1)}" y="${T}" width="${((to - from) * (W - L - R) / 24).toFixed(1)}" height="${H - T - B}" class="mt-band${k}"/>`;
    const bands = band(0, 7, 2) + band(7, 15, 0) + band(15, 23, 1) + band(23, 24, 2)
      + [[3.5, 2], [11, 0], [19, 1]].map(([h, k]) => `<text x="${(L + h * (W - L - R) / 24).toFixed(1)}" y="${T - 8}" text-anchor="middle" class="mt-axis">${SHIFTS[k]}</text>`).join('');
    const grid = [0, 0.5, 1].map((p) => `<line x1="${L}" x2="${W - R}" y1="${y(max * p)}" y2="${y(max * p)}" class="mt-gridline"/><text x="${L - 6}" y="${y(max * p) + 4}" text-anchor="end" class="mt-axis">${fmt(max * p)}</text>`).join('');
    const xs = [0, 3, 6, 9, 12, 15, 18, 21].map((h) => `<text x="${x(h)}" y="${H - 6}" text-anchor="middle" class="mt-axis">${h} h</text>`).join('');
    const ser = series.map((s) => `<polyline class="mt-line ${s.cls}" points="${s.v.map((v, h) => `${x(h).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}"/>`
      + s.v.map((v, h) => `<circle cx="${x(h).toFixed(1)}" cy="${y(v).toFixed(1)}" r="3" class="mt-dot ${s.cls}" data-tip="${esc(`${s.label} · de ${h} a ${h + 1} h\n${fmt(v)}`)}"/>`).join('')).join('');
    return `<div class="mt-legend">${series.map((s) => `<span><i class="mt-key ${s.cls}"></i>${esc(s.label)}</span>`).join('')}</div><svg viewBox="0 0 ${W} ${H}" class="mt-svg">${bands}${grid}${xs}${ser}</svg>`;
  };

  // Barras apiladas al 100 %: cómo se reparte cada fila ({ label, k: lado, v: valores }) entre unos tramos.
  const split = (names, list) => `<div class="mt-legend">${names.map((n, j) => `<span><i class="mt-part${j}"></i>${n}</span>`).join('')}</div>`
    + list.map((r) => {
      const t = r.v.reduce((a, b) => a + b, 0);
      return `<div class="mt-split"><span class="mt-split-l">${r.k != null && CMP() ? `<i class="mt-sw mt-c${r.k}"></i>` : ''}${esc(r.label)}</span><span class="mt-hbar mt-split-b">${t ? r.v.map((v, j) => `<i class="mt-part${j}" style="width:${v / t * 100}%" data-tip="${esc(`${r.label}${r.k != null && CMP() ? ` · ${name(r.k)}` : ''}\n${names[j]}: ${num(v)} (${pct(v / t)})`)}">${v / t >= 0.08 ? pct(v / t) : ''}</i>`).join('') : ''}</span><span class="mt-split-n">${num(t)}</span></div>`;
    }).join('');

  return { card, legend, kpi, kpis, kpiCo, diff, bars, orderedBars, monthly, lines, ranking, compare, heat, matrix, scorecard, timeBars, mini, day, split };
};
