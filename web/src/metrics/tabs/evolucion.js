// La evolución del backlog día a día en el periodo (sin DOM): el backlog de cada día por prioridad y su tendencia, lo
// que entra frente a lo atendido de eso el mismo día (flow) o frente a todo lo atendido ese día (flowAll). La enseña el
// Histórico. t: lo común de las pestañas (common.js).
import { esc } from '../../ui/html.js';
import { num, dec, pct, nice } from '../format.js';
import { backlogByDay, trendOf, flowByDay, flowByShift } from '../backlog.js';
import { SHIFTS, SHIFT_HOURS } from '../shifts.js';
import { lineScale, dayTicks } from '../plot.js';
import { DAY } from '../rules.js';

export const evolutionOf = (t) => {
  const { m, ch, ui, name } = t;
  const { CO, CMP, bySide } = m;
  const { card, legend } = ch;
  // El backlog al acabar cada día del periodo (hasta la foto). Lo de antes de lo cargado no está.
  const days0 = () => [m.S.d0, Math.max(1, Math.round((Math.min(m.S.d1, m.END_D) - m.S.d0) / DAY))];
  // Sin comparar, en barras apiladas por prioridad (crítica abajo, pegada a la base; prioridad es un orden: un solo
  // tono, de oscuro a claro, metrics.css mt-pq) y, encima, su línea de tendencia (mínimos cuadrados, en tinta neutra).
  // El marco de una gráfica de barras por día (los n días del periodo): la escala (hasta max, con aire), la rejilla, el
  // eje de los días, dónde cae cada día (xc, en el centro de su hueco de ancho slot) y la franja de cada día para su
  // nota al pasar el ratón (tip(i)). Ocupa la fila entera: a su ancho, la letra sale a su tamaño.
  const dayFrame = (n, top, tip) => {
    const ticks = dayTicks(m, n), subs = ticks.some((t) => t.sub);
    const W = 1240, H = 250, L = 52, R = 12, T = 12, B = subs ? 38 : 26, slot = (W - L - R) / n;
    const max = Math.max(1, top) * 1.1, y = (v) => T + (H - T - B) * (1 - v / max), xc = (i) => L + slot * (i + 0.5);
    const grid0 = [0, 0.5, 1].map((p) => `<line x1="${L}" x2="${W - R}" y1="${y(max * p)}" y2="${y(max * p)}" class="mt-gridline"/><text x="${L - 6}" y="${y(max * p) + 4}" text-anchor="end" class="mt-axis">${num(max * p)}</text>`).join('');
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
    const [d0, n] = days0(), { C, PRIOS, DI } = m;
    const parts = PRIOS.map((p) => ({ label: nice(DI.prio[p]), v: backlogByDay(m, list.filter((i) => C.pr[i] === p), d0, n) }));
    const total = backlogByDay(m, list, d0, n);
    const rest = total.map((t, i) => t - parts.reduce((s, p) => s + p.v[i], 0));
    if (rest.some(Boolean)) parts.push({ label: 'Sin prioridad', v: rest });
    const { a, b } = trendOf(total);
    const f = dayFrame(n, Math.max(...total, a, a + b * (n - 1)),
      (i) => `${m.dayName(d0 + i * DAY)}, al acabar el día: ${num(total[i])} pendientes\n${parts.map((p) => `${p.label}: ${num(p.v[i])}`).join('\n')}`);
    const bw = Math.max(1, f.slot * 0.72);
    const bars = Array.from({ length: n }, (_, i) => f.stack(f.xc(i) - bw / 2, bw, parts.map((p, j) => ({ cls: `mt-pq${j}`, v: p.v[i] })))).join('');
    const trend = `<line class="mt-trend" x1="${f.xc(0)}" y1="${f.y(Math.max(a, 0)).toFixed(1)}" x2="${f.xc(n - 1)}" y2="${f.y(Math.max(a + b * (n - 1), 0)).toFixed(1)}"/>`;
    const perDay = `${b > 0 ? '+' : b < 0 ? '−' : ''}${dec(Math.abs(b))} al día`;
    const legend = `<div class="mt-legend">${parts.map((p, j) => `<span><i class="mt-pq${j}"></i>${p.label}</span>`).join('')}<span data-tip="Mínimos cuadrados sobre lo pendiente de cada día del periodo."><i class="mt-trend-key"></i>Tendencia (${perDay})</span></div>`;
    return `${legend}${f.svg(bars + trend)}`;
  };
  // Entrantes frente a atendidas, día a día (backlog.js, flowByDay): en cada día, dos barras juntas, lo que entró y, al
  // lado, apilado, cuánto de eso se atendió el mismo día en que entró: resueltas, pasadas a Pendiente de proveedor y a
  // Pendiente de cliente (nunca más que lo que entró). Con total, encima y en violeta, lo atendido ese día del backlog
  // (lo que entró antes). Con los colores de la corona: lo que entra, el de Asignada (donde cae al entrar); las
  // pendientes, los suyos.
  const FLOW = [['res', 'Resueltas', 'mt-fl-res'], ['ven', 'Pendiente (proveedor)', 'mt-dn-prov'], ['cli', 'Pendiente (cliente)', 'mt-dn-cli']];
  // Cada serie de lo atendido se enciende y se apaga con un clic en su leyenda (ui.flowOff; las entrantes, siempre): lo
  // apagado no se apila ni cuenta en las cifras del periodo; la nota de cada día sigue diciéndolo todo.
  const flowKey = (k, label, cls, tip = '') => {
    const on = !ui.flowOff?.[k];
    return `<button class="mt-fl-tg ${on ? '' : 'mt-off'}" data-flk="${k}" aria-pressed="${on}" data-tip="${esc(`${tip}${tip ? '\n' : ''}Clic para ${on ? 'quitarlo' : 'verlo'}.`)}"><i class="mt-dn-sw ${cls}"></i>${label}</button>`;
  };
  // kinds: unos tipos de turno (0–2, shifts.js), juntos: lo que entró en esos turnos y lo atendido en el mismo turno
  // en que entró (backlog.js, flowByShift), sin lo del backlog
  const flowChart = (list, total, kinds = null) => {
    const kind = kinds;
    // lo del backlog, solo de los tipos encendidos; la nota del día, con todos
    const [d0, n] = days0(), sum = (a) => a.reduce((s, v) => s + v, 0);
    const raw = kind == null ? flowByDay(m, list, d0, n) : flowByShift(m, list, d0, n, kinds);
    const picked = kind == null ? flowByDay(m, list, d0, n, FLOW.map(([k]) => k).filter((k) => !ui.flowOff?.[k])).bkl : raw.bkl;
    const when = kind == null ? 'el día que entraron' : 'en el turno en que entraron';
    const head = (i) => `${m.dayName(d0 + i * DAY)}${kind == null ? '' : `, ${shiftsName(kinds)}`}`;
    const shown = (k) => (ui.flowOff?.[k] ? raw[k].map(() => 0) : raw[k]);
    const fl = { ...raw, res: shown('res'), ven: shown('ven'), cli: shown('cli') };
    const done = fl.inc.map((_, i) => FLOW.reduce((s, [k]) => s + fl[k][i], 0)), bkl = total && !ui.flowOff?.bkl ? picked : raw.bkl.map(() => 0);
    const all = (i) => FLOW.reduce((s, [k]) => s + raw[k][i], 0);
    const f = dayFrame(n, Math.max(...fl.inc, ...done.map((v, i) => v + bkl[i])), (i) => `${head(i)}\nEntraron: ${num(raw.inc[i])}`
      + `\nAtendidas ${kind == null ? 'de las que entraron ese día' : 'en su turno'}: ${num(all(i))} (${FLOW.map(([k, l]) => `${num(raw[k][i])} ${l.toLowerCase()}`).join(', ')})`
      + (total ? `\nAtendidas del backlog: ${num(raw.bkl[i])}\nEn total: ${num(all(i) + raw.bkl[i])}` : ''));
    const bw = Math.max(1, f.slot * 0.36 - 1);
    const bars = Array.from({ length: n }, (_, i) => f.stack(f.xc(i) - bw - 1, bw, [{ cls: 'mt-dn-asig', v: fl.inc[i] }])
      + f.stack(f.xc(i) + 1, bw, [...FLOW.map(([k, , cls]) => ({ cls, v: fl[k][i] })), { cls: 'mt-fl-bkl', v: bkl[i] }])).join('');
    const some = [...FLOW.map(([k]) => k), ...(total ? ['bkl'] : [])].some((k) => ui.flowOff?.[k]);
    const legend = `<div class="mt-legend"><span><i class="mt-dn-sw mt-dn-asig"></i>Entrantes</span>${FLOW.map(([k, l, cls]) => flowKey(k, l, cls)).join('')}
      ${total ? flowKey('bkl', 'Atendidas del backlog', 'mt-fl-bkl', 'Las que entraron antes y ese día se resolvieron o pasaron a Pendiente de proveedor o de cliente (una vez por incidencia y día).') : ''}
      <span class="mt-mut">En el periodo${some ? ', con lo marcado' : ''}: ${num(sum(fl.inc))} entrantes · ${num(sum(done))} atendidas ${when} (${sum(fl.inc) ? pct(sum(done) / sum(fl.inc)) : '—'})${total ? ` · ${num(sum(bkl))} del backlog` : ''}</span></div>`;
    return `${legend}${f.svg(bars)}`;
  };
  // Comparando, una línea por lado (apilar los dos lados no se leería).
  const evolution = (all) => {
    const [d0, n] = days0(), cos = CO();
    const per = cos.map((k) => backlogByDay(m, all[k], d0, n));
    const ticks = dayTicks(m, n), subs = ticks.some((x) => x.sub);
    const W = 1240, H = 230, L = 52, R = 12, T = 12, B = subs ? 38 : 26;   // ocupa la fila entera: a su ancho, la letra sale a su tamaño
    const { max, x, y } = lineScale(per.flat(), n - 1, { W, H, L, R, T, B });
    const grid0 = [0, 0.5, 1].map((p) => `<line x1="${L}" x2="${W - R}" y1="${y(max * p)}" y2="${y(max * p)}" class="mt-gridline"/><text x="${L - 6}" y="${y(max * p) + 4}" text-anchor="end" class="mt-axis">${num(max * p)}</text>`).join('');
    const xs = ticks.map(({ k, label, sub }) => `<text x="${x(k)}" y="${H - (subs ? 19 : 6)}" text-anchor="middle" class="mt-axis">${label}</text>`
      + (sub ? `<text x="${x(k)}" y="${H - 4}" text-anchor="middle" class="mt-axis">${sub}</text>` : '')).join('');
    const ser = per.map((v, s) => `<polyline class="mt-line mt-s${cos[s]}" points="${v.map((p, i) => `${x(i).toFixed(1)},${y(p).toFixed(1)}`).join(' ')}"/>`
      + (n <= 62 ? v.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p).toFixed(1)}" r="2.5" class="mt-f${cos[s]}"/>`).join('') : '')).join('');
    // al pasar el ratón por un día, lo de cada lado; la franja de cada día, más ancha que su punto
    const step = (W - L - R) / Math.max(n - 1, 1);
    const hits = Array.from({ length: n }, (_, i) => `<rect class="mt-hit" x="${(x(i) - step / 2).toFixed(1)}" y="${T}" width="${step.toFixed(1)}" height="${H - T - B}" data-tip="${esc(`${m.dayName(d0 + i * DAY)}, al acabar el día\n${cos.map((k, s) => `${name(k)}: ${num(per[s][i])} pendientes`).join('\n')}`)}"/>`).join('');
    return `<svg viewBox="0 0 ${W} ${H}" class="mt-svg">${grid0}${xs}${ser}${hits}</svg>`;
  };

  // La evolución del backlog, con su selector (ui.evo): el backlog de cada día (por prioridad y su tendencia), lo que
  // entra frente a lo atendido de eso mismo el día en que entró (flow) o frente a todo lo atendido ese día, también del
  // backlog (flowAll). Comparando, una línea por lado del backlog, sin selector.
  const VIEWS = [['backlog', 'Backlog', 'Evolución del backlog'], ['flow', 'Entrantes vs atendidas entrantes', 'Entrantes frente a atendidas entrantes'],
    ['flowAll', 'Entrantes vs atendidas totales', 'Entrantes frente a atendidas totales']];
  const evolutionCard = (all, cmp, loaded) => {
    const view = cmp ? 'backlog' : VIEWS.some(([k]) => k === ui.evo) ? ui.evo : 'backlog';
    const pick = cmp ? '' : `<div class="mt-seg mt-seg-sm" role="group" aria-label="Qué se ve">${VIEWS.map(([k, l]) => `<button class="mt-seg-b ${k === view ? 'mt-on' : ''}" data-evo="${k}" aria-pressed="${k === view}">${l}</button>`).join('')}</div>`;
    const list = all[CO()[0]];
    const body = cmp ? `${legend()}${evolution(all)}` : view === 'backlog' ? evolutionStack(list) : flowChart(list, view === 'flowAll');
    const same = 'Cada día, lo que entró y, al lado, cuánto de eso se atendió el mismo día en que entró: pasó a Resuelta, a Pendiente de proveedor o a Pendiente de cliente (cada incidencia, una vez, en lo más avanzado: resuelta, luego proveedor, luego cliente).';
    const sub = view === 'flow' ? `${same} Pasa el ratón por un día para ver sus cifras.`
      : view === 'flowAll' ? `${same} Encima, en violeta, lo atendido ese día del backlog: lo que entró antes (una vez por incidencia y día). Pasa el ratón por un día para ver sus cifras.`
        : `Cuántas había abiertas al acabar cada día del periodo${cmp ? '' : ', por prioridad, y su tendencia'}.${loaded} Pasa el ratón por un día para ver su cifra.`;
    return card(VIEWS.find(([k]) => k === view)[2], pick + body, { span: 's12', sub });
  };

  // con todo lo de ahora (se abriera cuando se abriera: lo abierto antes del periodo también cuenta en su backlog), por lado
  const render = () => {
    const loaded = m.S.d0 - m.MIN_D < 30 * DAY ? ` Lo cargado empieza el ${m.dayName(m.MIN_D)}: lo abierto antes no está y los primeros días salen por debajo.` : '';
    return evolutionCard(bySide(m.today()), CMP(), loaded);
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
