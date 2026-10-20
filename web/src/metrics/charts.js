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
  const { DIMS, LASTM, CO, CMP, NAMES, isSel, rows, group, stats, bySide, trend, SIDE, MONTH } = m;
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

  const delta = (tr) => {
    if (tr.prev < 15 && tr.now < 15) return '<span class="mt-mut">—</span>';
    const d = tr.prev ? (tr.now - tr.prev) / tr.prev : 1;
    return `<span class="${d > 0.1 ? 'mt-up' : d < -0.1 ? 'mt-down' : 'mt-mut'}">${d > 0 ? '+' : ''}${Math.round(d * 100)} %</span>`;
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
    // Resolución: lo resuelto, cuánto tarda y en qué se le va el tiempo (de media por resuelta: model.js, stats rt)
    d7: ['1 a 7 días', null, (s) => (s.resolved ? s.d7 : null), 'De las resueltas, las que tardaron de 1 a 7 días.'],
    d15: ['7 a 15 días', 'low', (s) => (s.resolved ? s.d15 : null), 'De las resueltas, las que tardaron de 7 a 15 días.'],
    mx: ['Máximo', null, (s) => (s.resolved ? s.mx : null), 'Lo que tardó la resuelta más lenta.'],
    w7: ['> 7 días', 'low', (s) => (s.resolved ? s.w7 : null), 'De las resueltas, las que tardaron más de 7 días.'],
    tq: ['En cola', 'low', (s) => (s.resolved ? s.rt[0] / s.resolved : null), 'Tiempo medio en Asignada.'],
    tc: ['Espera cliente', null, (s) => (s.resolved ? s.rt[2] / s.resolved : null), 'Tiempo medio en Pendiente del centro o del cliente.'],
    tv: ['Espera tercero', null, (s) => (s.resolved ? s.rt[3] / s.resolved : null), 'Tiempo medio en Pendiente de un tercero.'],
    // IA (con o.extra: tabs.js, iaView)
    iaN: ['Issues', null, (s) => s.iaN, 'Con alguna marca de IA.'],
    iaShare: ['% de las suyas', null, (s) => s.iaShare, 'De lo recibido, lo que tiene alguna marca de IA.'],
    // el 5.º: sobre cuántas se marca si va peor (si no, sus issues)
    iaOk: ['Revisadas OK', 'high', (s) => s.iaOk, 'De las de IA, con revisión humana OK y sin fallo.', (s) => s.iaN],
    iaFail: ['Con fallo', 'low', (s) => s.iaFail, 'De las de IA, con alguna marca de fallo o de revisión no OK.', (s) => s.iaN],
    iaUnrev: ['Sin revisar', null, (s) => s.iaUnrev, 'De las de IA, sin revisión ni fallo.'],
    // con o.cell: la celda la pinta quien llama (el reparto de las de IA en una barra)
    iaMix: ['Reparto', null, null, 'Revisadas OK, con fallo y sin revisar.'],
    req: ['% peticiones', null, (s) => s.req, 'Tipo de servicio Petición de usuario.'],
    rep: ['Resol. repetida', null, (s) => s.rep, 'Issues cuyo texto de resolución se ha usado 4 veces o más.'],
    // SLA y calidad
    slaKo: ['Fuera de SLA', null, (s) => s.slaKo, 'Empezadas tarde y abiertas que siguen sin empezar pasado el plazo.'],
    ip: ['Hasta En curso', 'low', (s) => s.ip, 'Media de la apertura al primer paso a En curso.'],
    bounce: ['Devueltas', 'low', (s) => (s.n ? s.bounce : null), 'Pasaron de En curso a Asignada.'],
    noIpDone: ['Sin En curso', 'low', (s) => s.noIpDone, 'De las cerradas, las que nunca pasaron por En curso.'],
    escNoPend: ['Esc. sin Pendiente', 'low', (s) => s.escNoPend, 'De las cerradas con ticket de tercero, las que nunca pasaron a Pendiente.'],
    noCat: ['Sin tipología', 'low', (s) => (s.n ? s.noCat : null), 'Sin categorización 3 de Remedy.'],
    noDesc: ['Sin descripción', 'low', (s) => (s.n ? s.noDesc : null), 'El título no dice cuál es el problema.'],
    same: ['Mismo cierre', null, (s) => s.same, 'De las resueltas, la parte cerrada con el mismo texto de resolución (el más usado). Si es alta, se resuelve siempre igual: se puede automatizar o llevar a la IA.'],
  };
  const SC_FMT = { sla: (v) => (v == null ? '—' : pct(v)), avg: dur, d1: (v) => pct(v), reop: (v) => pct(v, 1), crit: (v) => pct(v), vend: (v) => pct(v), open: num, mi: (v) => (v ? num(v) : ''), nce: num, same: pct, w7: (v) => pct(v), d7: (v) => pct(v), d15: (v) => pct(v), mx: dur, tq: dur, tc: dur, tv: dur, iaN: (v) => (v ? num(v) : ''), iaShare: (v) => (v ? pct(v, 1) : ''), iaOk: (v) => (v == null ? '' : pct(v)), iaFail: (v) => (v == null ? '' : pct(v)), iaUnrev: (v) => (v == null ? '' : pct(v)), req: (v) => pct(v), rep: (v) => pct(v), slaKo: num, ip: dur, bounce: (v) => pct(v, 1), noIpDone: (v) => pct(v, 1), escNoPend: (v) => pct(v, 1), noCat: (v) => pct(v, 1), noDesc: (v) => pct(v, 1) };
  const scorecard = (dim, groups, o = {}) => {
    const id = o.id || `sc-${dim}`, list = o.rows || rows(dim), cmp = CMP(), cols = groups.flatMap(([, c]) => c);
    const side = (l) => (cmp ? bySide(l)[0] : l), other = (l) => bySide(l)[1];
    const full = (l) => { const st = stats(side(l)); st.tr = trend(side(l)); o.extra?.(st, side(l)); if (cmp) { st.b = stats(other(l)); o.extra?.(st.b, other(l)); } return st; };
    const all = group(dim, list, true).filter((x) => !(o.skip && o.skip(x.k)));
    const ref = full(list), T = ref.n || 1;
    const srt = ui.sort[id] || [o.sort || 'n', -1], key = (r) => SC[srt[0]][2](r) ?? -Infinity;
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
      if (!b || (SC[c][4] ? SC[c][4](r) : r.n) < SC_MIN || v == null || w == null) return false;
      return b === 'low' ? v > w * 1.15 : v < w * 0.85;
    };
    // la barra, su parte real del total (el total, entera; «Resto», lo que suma)
    const cell = (c, r, isRef) => {
      if (c === 'n') return `<td><div class="mt-sc-vol"><em>${pct(r.n / T, 1)}</em><span class="mt-sc-bar"><i style="width:${(r.n / T * 100).toFixed(1)}%"></i></span><b>${num(r.n)}</b></div></td>`;
      if (c === 'top') return `<td class="mt-sc-top">${r.top ? `<span data-tip="${esc(`${r.top.label}\n${pct(r.top.share, 1)} de sus issues`)}">${esc(r.top.label)}</span><em>${pct(r.top.share)}</em>` : ''}</td>`;
      if (o.cell?.[c]) return `<td class="mt-tbar">${o.cell[c](r)}</td>`;
      if (c === 'dl') return `<td class="mt-num" data-tip="${esc(`Últimos 90 días: ${num(r.tr.now)}\n90 anteriores: ${num(r.tr.prev)}`)}">${delta(r.tr)}</td>`;
      const v = SC[c][2](r), shown = v == null ? '—' : SC_FMT[c](v);
      const d = cmp && r.b ? diff(r, r.b, (x) => SC_FMT[c](SC[c][2](x)), (x) => SC[c][2](x), SC[c][1]) : '';
      return `<td class="mt-num ${!isRef && worse(c, r) ? 'mt-worse' : ''}" ${!isRef && worse(c, r) ? `data-tip="${esc(`Peor que la media de todos: ${SC_FMT[c](SC[c][2](ref))}`)}"` : ''}>${shown}${d ? `<small>${d}</small>` : ''}</td>`;
    };
    // o.n: [nombre, nota] de la columna del volumen, si no son issues recibidas (lo resuelto, lo escalado…)
    // o.heads: { columna: [nombre, nota] } para cambiar el nombre de una columna en esta ficha
    const def = (c) => (c === 'n' && o.n ? [o.n[0], null, SC.n[2], o.n[1]] : o.heads?.[c] ? [o.heads[c][0], SC[c][1], SC[c][2], o.heads[c][1]] : SC[c]);
    const head = (c) => `<th class="mt-num ${srt[0] === c ? 'mt-srt' : ''}" ${SC[c][2] ? `data-sort="${id}:${c}"` : ''} data-tip="${esc(def(c)[3])}">${def(c)[0]}${srt[0] === c ? (srt[1] < 0 ? ' ↓' : ' ↑') : ''}</th>`;
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
      const ek = `${id}:${r.k}`, tog = ch ? `<button class="mt-sc-tog" data-exp="${ek}" data-tip="${ui.exp[ek] ? 'Recoger' : `Ver sus ${ch.noun}`}">${ui.exp[ek] ? '▾' : '▸'}</button>` : '';
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
      return `<td class="${a > 50 ? 'mt-hot' : ''}" style="--mt-a:${a}%" data-f2="${rd}:${R[r].k}|${cd}:${Cc[c].k}" data-tip="${esc(`${dr.label(R[r].k)} × ${dc.label(Cc[c].k)}\n${num(v)} issues\n${CO().map((k) => `${name(k)}: ${num(t[k])}`).join(' · ')}`)}">${v || ''}</td>`;
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
    const cell = (r, j, c, k) => {
      const v = tot(cnt[j][k]), a = v ? Math.round(8 + 92 * Math.pow(v / gmax.get(r.g), 0.6)) : 0;
      return `<td class="mt-num ${a > 50 ? 'mt-hot' : ''}" style="--mt-a:${a}%" ${filt(r, c)} data-tip="${esc(tip(`${r.label} · ${c.label}`, cnt[j][k]))}">${show(cnt[j][k])}</td>`;
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
      return `<tr class="${first ? 'mt-gfirst' : ''}">${gl}${cols.map((c, k) => cell(r, j, c, k)).join('')}${tail(rt[j], r)}</tr>`;
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

  return { card, legend, kpi, kpis, kpiCo, diff, more, lines, heat, matrix, scorecard, day, split };
};
