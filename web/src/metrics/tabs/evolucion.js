// La evolución del backlog día a día en el periodo (sin DOM): el backlog de cada día por prioridad y su tendencia, lo
// que entra frente a lo atendido de eso el mismo día (flow) o frente a todo lo atendido ese día (flowAll). El Resumen y el
// Histórico enseñan el backlog de cada día (render({ only: 'backlog' })); Entrantes, lo que entra frente a lo atendido
// (render({ views: ['flow', 'flowAll'] })). t: lo común de las pestañas (common.js).
import { esc } from '../../ui/html.js';
import { num, dec, pct, nice } from '../format.js';
import { backlogByDay, trendOf, flowByDay, flowByShift } from '../backlog.js';
import { SHIFTS, SHIFT_HOURS } from '../shifts.js';
import { lineScale, dayTicks, dayBuckets, bucketTicks } from '../plot.js';
import { yGrid } from '../charts.js';
import { DAY } from '../rules.js';

// En el Resumen, la evolución del backlog, a esta parte de su altura (render, compact)
const SHORT = 0.65;

export const evolutionOf = (t) => {
  const { m, ch, ui, name } = t;
  const { CO, CMP, bySide } = m;
  const { card, legend } = ch;
  // El backlog al acabar cada día del periodo (hasta la foto). Lo de antes de lo cargado no está.
  const days0 = () => [m.S.d0, Math.max(1, Math.round((Math.min(m.S.d1, m.END_D) - m.S.d0) / DAY))];
  // El backlog, por días, semanas o meses (ui.evoStep; metrics-view.js, data-evo-step; de partida, por días): en cada
  // tramo, lo que había abierto al acabar su último día (plot.js, dayBuckets). when: cómo se llama un tramo en su nota.
  const STEPS = [['day', 'Días', 'cada día', 'al día'], ['week', 'Semanas', 'cada semana', 'a la semana'], ['month', 'Meses', 'cada mes', 'al mes']];
  const stepOf = () => STEPS.find(([k]) => k === ui.evoStep) || STEPS[0];
  const byStep = (n, d0 = m.S.d0) => {
    const step = stepOf()[0], bs = dayBuckets(m, n, step, d0), last = (b) => (step !== 'day' && b.to === n - 1 ? ' (hasta la última carga)' : '');
    const when = (b) => (step === 'day' ? `${m.dayName(d0 + b.from * DAY)}, al acabar el día`
      : step === 'week' ? `Semana del ${m.dayName(d0 + b.from * DAY)} al ${m.dayName(d0 + b.to * DAY)}, al acabar${last(b)}`
        : `${m.monthName(m.monthAt(d0 + b.from * DAY))}, al acabar el mes${last(b)}`);
    return { step, bs, at: (v) => bs.map((b) => v[b.to]), when, ticks: bucketTicks(m, bs, step) };
  };
  // La altura de las gráficas de la evolución: en el Resumen (short), más bajas, para que quepa todo en la pantalla.
  // Las gráficas van a todo el ancho, así que la letra no cambia: solo la altura del dibujo.
  // Con span (el Resumen, al lado de la corona), la tarjeta no va a todo el ancho: el dibujo, más estrecho (WIDE), para
  // que la letra no encoja, y menos bajo que con short a todo el ancho.
  let short = false, span = null, keepScale = false;
  // s8 (Backlog, al lado de la corona y los meses): más ancha y más alta, para llenar su hueco
  const WIDE = 640, width = () => (span === 's8' ? 900 : span ? WIDE : 1240);
  const tall = (h) => Math.round(span === 's8' ? h * 1.3 : span ? h * 0.85 : short ? h * SHORT : h);
  const stepPick = () => `<div class="mt-seg mt-seg-sm" role="group" aria-label="Cada cuánto">${STEPS.map(([k, l]) => { const on = k === stepOf()[0]; return `<button class="mt-seg-b ${on ? 'mt-on' : ''}" data-evo-step="${k}" aria-pressed="${on}">${l}</button>`; }).join('')}</div>`;
  // Sin comparar, en barras apiladas por prioridad (crítica abajo, pegada a la base; prioridad es un orden: un solo
  // tono, de oscuro a claro, metrics.css mt-pq) y, encima, su línea de tendencia (mínimos cuadrados, en tinta neutra).
  // El marco de una gráfica de barras por día (los n días del periodo): la escala (hasta max, con aire), la rejilla, el
  // eje de los días, dónde cae cada día (xc, en el centro de su hueco de ancho slot) y la franja de cada día para su
  // nota al pasar el ratón (tip(i)). Ocupa la fila entera: a su ancho, la letra sale a su tamaño.
  const dayFrame = (n, top, tip, ticks = dayTicks(m, n)) => {
    const subs = ticks.some((t) => t.sub);
    const W = width(), H = tall(250), L = 52, R = 12, T = 12, B = subs ? 38 : 26, slot = (W - L - R) / n;
    const max = Math.max(1, top) * 1.1, y = (v) => T + (H - T - B) * (1 - v / max), xc = (i) => L + slot * (i + 0.5);
    const grid0 = yGrid({ W, L, R }, y, max);
    const xs = ticks.map(({ k, label, sub }) => `<text x="${xc(k)}" y="${H - (subs ? 19 : 6)}" text-anchor="middle" class="mt-axis">${label}</text>`
      + (sub ? `<text x="${xc(k)}" y="${H - 4}" text-anchor="middle" class="mt-axis">${sub}</text>` : '')).join('');
    const hits = Array.from({ length: n }, (_, i) => `<rect class="mt-hit" x="${(L + slot * i).toFixed(1)}" y="${T}" width="${slot.toFixed(1)}" height="${H - T - B}" data-tip="${esc(tip(i))}"/>`).join('');
    // una pila de tramos (parts: [{ cls, v }]) en x, de ancho w, desde la base
    const stack = (x, w, parts) => {
      let base = 0;
      return parts.map(({ cls, v }) => {
        if (!v) return '';
        const r = `<rect class="${cls}" x="${x.toFixed(1)}" y="${y(base + v).toFixed(1)}" width="${w.toFixed(1)}" height="${(y(base) - y(base + v)).toFixed(1)}"/>`;
        base += v;
        return r;
      }).join('');
    };
    return { W, H, slot, xc, y, stack, svg: (body) => `<svg viewBox="0 0 ${W} ${H}" class="mt-svg">${grid0}${body}${xs}${hits}</svg>` };
  };
  const evolutionStack = (list) => {
    const [d0, days] = days0(), { C, PRIOS, DI } = m, s = byStep(days), n = s.bs.length;
    const parts = PRIOS.map((p) => ({ label: nice(DI.prio[p]), v: s.at(backlogByDay(m, list.filter((i) => C.pr[i] === p), d0, days)) }));
    const total = s.at(backlogByDay(m, list, d0, days));
    const rest = total.map((t, i) => t - parts.reduce((s, p) => s + p.v[i], 0));
    if (rest.some(Boolean)) parts.push({ label: 'Sin prioridad', v: rest });
    const { a, b } = trendOf(total);
    // keepScale (Backlog): la escala, la de todo el equipo, aunque se filtre por técnico (el filtro de responsable o
    // personas en vez de la empresa): así no cambia al filtrar y se ve cuánto es lo suyo
    const ref = () => { const s0 = m.S.sides[0], co = s0?.people ? 0 : s0?.company ?? 0;
      return Math.max(0, ...s.at(backlogByDay(m, m.today(true, 'as').filter((i) => m.TEAM[i] === co), d0, days))); };
    const f = dayFrame(n, Math.max(...total, a, a + b * (n - 1), keepScale ? ref() : 0),
      (i) => `${s.when(s.bs[i])}: ${num(total[i])} pendientes\n${parts.map((p) => `${p.label}: ${num(p.v[i])}`).join('\n')}`, s.ticks);
    const bw = Math.max(1, f.slot * 0.72);
    const bars = Array.from({ length: n }, (_, i) => f.stack(f.xc(i) - bw / 2, bw, parts.map((p, j) => ({ cls: `mt-pq${j}`, v: p.v[i] })))).join('');
    const trend = `<line class="mt-trend" x1="${f.xc(0)}" y1="${f.y(Math.max(a, 0)).toFixed(1)}" x2="${f.xc(n - 1)}" y2="${f.y(Math.max(a + b * (n - 1), 0)).toFixed(1)}"/>`;
    const perDay = `${b > 0 ? '+' : b < 0 ? '−' : ''}${dec(Math.abs(b))} ${stepOf()[3]}`;
    const legend = `<div class="mt-legend">${parts.map((p, j) => `<span><i class="mt-pq${j}"></i>${p.label}</span>`).join('')}<span data-tip="Mínimos cuadrados sobre lo pendiente de ${stepOf()[2]} del periodo."><i class="mt-trend-key"></i>Tendencia (${perDay})</span></div>`;
    return `${legend}${f.svg(bars + trend)}`;
  };
  // Entrantes frente a atendidas, día a día (backlog.js, flowByDay): en cada día, dos barras juntas, lo que entró y, al
  // lado, apilado, cuánto de eso se atendió el mismo día en que entró: resueltas, pasadas a Pendiente de proveedor y a
  // Pendiente de cliente (nunca más que lo que entró). Con total, encima y en violeta, lo atendido ese día del backlog
  // (lo que entró antes). Con los colores de la corona: lo que entra, el de Asignada (donde cae al entrar); las
  // pendientes, los suyos.
  const FLOW = [['res', 'Resueltas', 'mt-fl-res'], ['ven', 'Pendiente (proveedor)', 'mt-dn-prov'], ['cli', 'Pendiente (cliente)', 'mt-dn-cli']];
  // Centrarse en una serie de lo atendido con un clic en su leyenda, como en los demás filtros (ui.flowFocus; las
  // entrantes, siempre): clic, esa (otro clic, soltarla; en otra, cambiar); Ctrl+clic, sumarla. Las demás no
  // desaparecen: se ven apagadas y no cuentan en las cifras del periodo; la nota de cada día sigue diciéndolo todo.
  const focus = () => ui.flowFocus || [];
  const off = (k) => focus().length > 0 && !focus().includes(k);
  const flowKey = (k, label, cls, tip = '') => {
    const sel = focus().includes(k);
    return `<button class="mt-fl-tg ${sel ? 'mt-sel' : off(k) ? 'mt-off' : ''}" data-flk="${k}" aria-pressed="${sel}" data-tip="${esc(`${tip}${tip ? '\n' : ''}Clic: centrarse en esta (otro clic, soltarla). Ctrl+clic: sumarla.`)}"><i class="mt-dn-sw ${cls}"></i>${label}</button>`;
  };
  // kinds: unos tipos de turno (0–2, shifts.js), juntos: lo que entró en esos turnos y lo atendido en el mismo turno
  // en que entró (backlog.js, flowByShift), sin lo del backlog
  const flowChart = (list, total, kinds = null) => {
    const kind = kinds;
    // lo del backlog, solo de los tipos encendidos; la nota del día, con todos
    const [d0, n] = days0(), sum = (a) => a.reduce((s, v) => s + v, 0);
    const raw = kind == null ? flowByDay(m, list, d0, n) : flowByShift(m, list, d0, n, kinds);
    const picked = kind == null ? flowByDay(m, list, d0, n, FLOW.map(([k]) => k).filter((k) => !off(k))).bkl : raw.bkl;
    const when = kind == null ? 'el día que entraron' : 'en el turno en que entraron';
    const head = (i) => `${m.dayName(d0 + i * DAY)}${kind == null ? '' : `, ${shiftsName(kinds)}`}`;
    // se dibujan todas (las de fuera del foco, apagadas); las cifras del periodo, solo las del foco
    const fl = raw, all = (i) => FLOW.reduce((s, [k]) => s + raw[k][i], 0), drawnBkl = total ? (focus().length ? picked : raw.bkl) : raw.bkl.map(() => 0);
    const done = fl.inc.map((_, i) => FLOW.reduce((s, [k]) => s + (off(k) ? 0 : fl[k][i]), 0)), bkl = total && !off('bkl') ? picked : raw.bkl.map(() => 0);
    const f = dayFrame(n, Math.max(...fl.inc, ...fl.inc.map((_, i) => all(i) + drawnBkl[i])), (i) => `${head(i)}\nEntraron: ${num(raw.inc[i])}`
      + `\nAtendidas ${kind == null ? 'de las que entraron ese día' : 'en su turno'}: ${num(all(i))} (${FLOW.map(([k, l]) => `${num(raw[k][i])} ${l.toLowerCase()}`).join(', ')})`
      + (total ? `\nAtendidas del backlog: ${num(raw.bkl[i])}\nEn total: ${num(all(i) + raw.bkl[i])}` : ''));
    const bw = Math.max(1, f.slot * 0.36 - 1);
    const bars = Array.from({ length: n }, (_, i) => f.stack(f.xc(i) - bw - 1, bw, [{ cls: 'mt-dn-asig', v: fl.inc[i] }])
      + f.stack(f.xc(i) + 1, bw, [...FLOW.map(([k, , cls]) => ({ cls: off(k) ? `${cls} mt-off` : cls, v: fl[k][i] })), { cls: off('bkl') ? 'mt-fl-bkl mt-off' : 'mt-fl-bkl', v: drawnBkl[i] }])).join('');
    const some = focus().length > 0;
    const legend = `<div class="mt-legend"><span><i class="mt-dn-sw mt-dn-asig"></i>Entrantes</span>${FLOW.map(([k, l, cls]) => flowKey(k, l, cls)).join('')}
      ${total ? flowKey('bkl', 'Atendidas del backlog', 'mt-fl-bkl', 'Las que entraron antes y ese día se resolvieron o pasaron a Pendiente de proveedor o de cliente (una vez por incidencia y día).') : ''}
      <span class="mt-mut">En el periodo${some ? ', con lo marcado' : ''}: ${num(sum(fl.inc))} entrantes · ${num(sum(done))} atendidas ${when} (${sum(fl.inc) ? pct(sum(done) / sum(fl.inc)) : '—'})${total ? ` · ${num(sum(bkl))} del backlog` : ''}</span></div>`;
    return `${legend}${f.svg(bars)}`;
  };
  // Comparando, una línea por lado (apilar los dos lados no se leería).
  const evolution = (all) => {
    const [d0, days] = days0(), cos = CO(), s = byStep(days), n = s.bs.length;
    const per = cos.map((k) => s.at(backlogByDay(m, all[k], d0, days)));
    const ticks = s.ticks, subs = ticks.some((x) => x.sub);
    const W = width(), H = tall(230), L = 52, R = 12, T = 12, B = subs ? 38 : 26;   // ocupa la fila entera: a su ancho, la letra sale a su tamaño
    const { max, x, y } = lineScale(per.flat(), n - 1, { W, H, L, R, T, B });
    const grid0 = yGrid({ W, L, R }, y, max);
    const xs = ticks.map(({ k, label, sub }) => `<text x="${x(k)}" y="${H - (subs ? 19 : 6)}" text-anchor="middle" class="mt-axis">${label}</text>`
      + (sub ? `<text x="${x(k)}" y="${H - 4}" text-anchor="middle" class="mt-axis">${sub}</text>` : '')).join('');
    const ser = per.map((v, s) => `<polyline class="mt-line mt-s${cos[s]}" points="${v.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ')}"/>`
      + (n <= 62 ? v.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p).toFixed(1)}" r="2.5" class="mt-f${cos[s]}"/>`).join('') : '')).join('');
    // al pasar el ratón por un día, lo de cada lado; la franja de cada día, más ancha que su punto
    const step = (W - L - R) / Math.max(n - 1, 1);
    const hits = Array.from({ length: n }, (_, i) => `<rect class="mt-hit" x="${(x(i) - step / 2).toFixed(1)}" y="${T}" width="${step.toFixed(1)}" height="${H - T - B}" data-tip="${esc(`${s.when(s.bs[i])}\n${cos.map((k, s) => `${name(k)}: ${num(per[s][i])} pendientes`).join('\n')}`)}"/>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="mt-svg">${grid0}${xs}${ser}${hits}</svg>`;
  };

  // Comparando un periodo con otro (el Resumen: periods, [{ label, range }]): una línea por periodo, cada una desde su
  // primer día, para verlas una sobre otra (el eje cuenta días, semanas o meses desde el principio de cada periodo).
  // list: lo del primer lado, se abriera cuando se abriera (su backlog de cada día).
  const evolutionPeriods = (list, periods) => {
    const unit = { day: 'Día', week: 'Semana', month: 'Mes' }[stepOf()[0]];
    const ser = periods.map(({ label, range }) => {
      if (!range) return { label, v: [], when: [] };
      const days = Math.max(1, Math.round((Math.min(range[1], m.END_D) - range[0]) / DAY)), s = byStep(days, range[0]);
      return { label, v: s.at(backlogByDay(m, list, range[0], days)), when: s.bs.map(s.when) };
    });
    const n = Math.max(1, ...ser.map((x) => x.v.length)), every = Math.ceil(n / 12);
    const ticks = [];
    for (let k = 0; k < n; k += every) ticks.push({ k, label: String(k + 1), sub: k ? null : unit.toLowerCase() });
    const W = width(), H = tall(230), L = 52, R = 12, T = 12, B = 38;
    const { max, x, y } = lineScale([0, ...ser.flatMap((s) => s.v)], n - 1, { W, H, L, R, T, B });
    const grid0 = yGrid({ W, L, R }, y, max);
    const xs = ticks.map(({ k, label, sub }) => `<text x="${x(k)}" y="${H - 19}" text-anchor="middle" class="mt-axis">${label}</text>`
      + (sub ? `<text x="${x(k)}" y="${H - 4}" text-anchor="middle" class="mt-axis">${sub}</text>` : '')).join('');
    const lines = ser.map((s, j) => (s.v.length ? `<polyline class="mt-line mt-s${j}" points="${s.v.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ')}"/>`
      + (n <= 62 ? s.v.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p).toFixed(1)}" r="2.5" class="mt-f${j}"/>`).join('') : '') : '')).join('');
    const stepW = (W - L - R) / Math.max(n - 1, 1);
    const hits = Array.from({ length: n }, (_, i) => `<rect class="mt-hit" x="${(x(i) - stepW / 2).toFixed(1)}" y="${T}" width="${stepW.toFixed(1)}" height="${H - T - B}" data-tip="${esc(`${unit} ${i + 1}\n${ser.map((s) => `${s.label}: ${s.v[i] == null ? 'sin datos' : `${num(s.v[i])} pendientes (${s.when[i]})`}`).join('\n')}`)}"/>`).join('');
    const key = `<div class="mt-legend">${ser.map((s, j) => `<span><i class="mt-c${j}"></i>${esc(s.label)}</span>`).join('')}</div>`;
    return `${key}<svg viewBox="0 0 ${W} ${H}" class="mt-svg">${grid0}${xs}${lines}${hits}</svg>`;
  };

  // La evolución del backlog, con su selector (ui.evo): el backlog de cada día (por prioridad y su tendencia), lo que
  // entra frente a lo atendido de eso mismo el día en que entró (flow) o frente a todo lo atendido ese día, también del
  // backlog (flowAll). Comparando, una línea por lado del backlog, sin selector. Con only, solo esa vista, sin selector;
  // con views, solo esas, con su selector si son varias (lo que entra frente a lo atendido, comparando, del primer lado).
  const VIEWS = [['backlog', 'Backlog', 'Evolución del backlog'], ['flow', 'Entrantes vs atendidas entrantes', 'Entrantes frente a atendidas entrantes'],
    ['flowAll', 'Entrantes vs atendidas totales', 'Entrantes frente a atendidas totales']];
  // link (el Resumen): un enlace al Histórico, debajo, con las fechas de la gráfica (data-period: las de arriba o,
  // comparando periodos, las del primero) y en su vista del backlog (data-go-evo; metrics-view.js)
  const toHistory = (range) => ({ tab: 'historico', label: 'el Histórico con estas mismas fechas', attrs: `data-go-evo="backlog"${range ? ` data-period="${range[0]}:${range[1]}"` : ''}` });
  // en el Resumen (link o short), la explicación no se ve: va en el tooltip del título
  const about = (sub, link) => (link ? { tip: sub } : { sub });
  const evolutionCard = (all, cmp, loaded, only = null, periods = null, link = false, views = null) => {
    if (periods && !cmp) {
      const sub = `Cuántas había abiertas al acabar ${stepOf()[2]} de cada periodo, contando desde su primer día: ${periods.map((p) => `${esc(p.label)} (${p.range ? `${m.dayName(p.range[0])} – ${m.dayName(Math.min(p.range[1], m.END_D) - DAY)}` : 'sin datos'})`).join(' frente a ')}. Pasa el ratón por un punto para ver sus cifras.`;
      return card('Evolución del backlog', `<div class="mt-evo-picks">${stepPick()}</div>${evolutionPeriods(all[CO()[0]], periods)}`, { span: span || 's12', ...about(sub, link || short), go: link ? toHistory(periods[0].range) : null });
    }
    const shown = views ? VIEWS.filter(([k]) => views.includes(k)) : VIEWS;
    const view = views ? (views.includes(ui.evo) ? ui.evo : views[0]) : cmp ? 'backlog' : only || (VIEWS.some(([k]) => k === ui.evo) ? ui.evo : 'backlog');
    const pick = (cmp && !views) || only || shown.length < 2 ? '' : `<div class="mt-seg mt-seg-sm" role="group" aria-label="Qué se ve">${shown.map(([k, l]) => `<button class="mt-seg-b ${k === view ? 'mt-on' : ''}" data-evo="${k}" aria-pressed="${k === view}">${l}</button>`).join('')}</div>`;
    const list = all[CO()[0]];
    const steps = view === 'backlog' ? stepPick() : '';
    const body = view !== 'backlog' ? flowChart(list, view === 'flowAll') : cmp ? `${legend()}${evolution(all)}` : evolutionStack(list);
    const whose = cmp && view !== 'backlog' ? ` Comparando, de ${esc(name(CO()[0]))}.` : '';
    const same = 'Cada día, lo que entró y, al lado, cuánto de eso se atendió el mismo día en que entró: pasó a Resuelta, a Pendiente de proveedor o a Pendiente de cliente (cada incidencia, una vez, en lo más avanzado: resuelta, luego proveedor, luego cliente).';
    const sub = view === 'flow' ? `${same} Pasa el ratón por un día para ver sus cifras.${whose}`
      : view === 'flowAll' ? `${same} Encima, en violeta, lo atendido ese día del backlog: lo que entró antes (una vez por incidencia y día). Pasa el ratón por un día para ver sus cifras.${whose}`
        : `Cuántas había abiertas al acabar ${stepOf()[2]} del periodo${cmp ? '' : ', por prioridad, y su tendencia'}.${loaded} Pasa el ratón por una barra para ver su cifra.`;
    return card(VIEWS.find(([k]) => k === view)[2], `<div class="mt-evo-picks">${pick}${steps}</div>` + body, { span: span || 's12', ...about(sub, link || short), go: link ? toHistory([m.S.d0, m.S.d1]) : null });
  };

  // con todo lo de ahora (se abriera cuando se abriera: lo abierto antes del periodo también cuenta en su backlog), por lado
  // periods: comparar periodos (el Resumen), una línea por periodo; link: el enlace al Histórico; views: qué vistas;
  // compact: más baja (el Resumen); span: el ancho de la tarjeta, si no va a todo el ancho (más estrecha)
  const render = ({ only = null, periods = null, link = false, views = null, compact = false, span: sp = null, fixedScale = false } = {}) => {
    short = compact; span = sp; keepScale = fixedScale;
    const loaded = m.S.d0 - m.MIN_D < 30 * DAY ? ` Lo cargado empieza el ${m.dayName(m.MIN_D)}: lo abierto antes no está y los primeros días salen por debajo.` : '';
    return evolutionCard(bySide(m.today()), CMP(), loaded, only, periods, link, views);
  };

  // Turnos: entrantes frente a atendidas en el mismo turno, de los turnos elegidos (ui.shifts: mañana, tarde y noche;
  // de partida, los tres, juntos), de lo que pasa los filtros (A) en el primer lado que se mira. Clic en un turno: solo
  // ese; con Ctrl (o Cmd), se suma o se quita.
  const shiftsName = (ks) => (ks.length === 3 ? 'todos los turnos' : `turno${ks.length > 1 ? 's' : ''} de ${ks.map((k) => `${SHIFTS[k].toLowerCase()} (${SHIFT_HOURS[k]})`).join(' y ')}`);
  const byShift = (A) => {
    const list = bySide(A)[CO()[0]], on = [0, 1, 2].filter((k) => !ui.shifts || ui.shifts.includes(k));
    const pick = `<div class="mt-seg mt-seg-sm" role="group" aria-label="Turnos">${SHIFTS.map((s, k) => `<button class="mt-seg-b ${on.includes(k) ? 'mt-on' : ''}" data-shk="${k}" aria-pressed="${on.includes(k)}" data-tip="${esc(`${SHIFT_HOURS[k]}
Clic: solo este turno. Ctrl+clic: sumarlo o quitarlo.`)}">${s} <small>${SHIFT_HOURS[k]}</small></button>`).join('')}</div>`;
    // sin los turnos de lo atendido (un bridge de antes que los guardara), lo dice: si no, saldría a cero
    const old = !m.C.sR ? '<p class="mt-note">Faltan los turnos de lo atendido: reinicia SIA para que el bridge los calcule.</p>' : '';
    return card('Entrantes frente a atendidas en su turno', pick + old + flowChart(list, false, on), { span: 's12', sub: `Cada día, de ${shiftsName(on)}: lo que entró y, al lado, cuánto de eso se atendió en el mismo turno en que entró (pasó a Resuelta, a Pendiente de proveedor o a Pendiente de cliente; cada incidencia, una vez, en lo más avanzado). La noche cuenta en el día en que empieza (la del lunes, de 23 a 7, es del lunes). Clic en un turno para verlo solo; Ctrl+clic para sumarlo o quitarlo. Pasa el ratón por un día para ver sus cifras.` });
  };
  return Object.assign(render, { byShift });
};
