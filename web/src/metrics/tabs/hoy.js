// Foto de hoy: cómo está el backlog ahora (a fecha de la última carga, se abriera cuando se abriera), con el selector de
// SISU o SGA arriba del todo. Lo recibido en el periodo, por preguntas, está en el Histórico (historico.js); la corona
// (stateCard) la comparte el Resumen (resumen.js).
import { esc } from '../../ui/html.js';
import { num, pct, dur, nice, signedDur } from '../format.js';
import { ages, meanAge } from '../backlog.js';
import { whoHas } from '../today.js';
import { sheetOf, sheetBody, SHEET_COLS } from '../sheet.js';
import { afterDash } from './escalados.js';
import { backlogParts } from './backlog.js';
import { evolutionOf } from './evolucion.js';
import { mttrOf, idmttr, hoursOf } from '../resolution.js';
import { MTTR_TARGET, monthTrend } from '../rules.js';

// Las columnas de la sábana de Foto de hoy: las de siempre, con el título del guion en adelante y el estado sin su motivo
const HOY_COLS = SHEET_COLS.map((c) => (c[0] === 'Título' ? ['Título', (mm, i) => afterDash(mm.C.su[i])]
  : c[0] === 'Estado' ? ['Estado', (mm, i) => nice(mm.DI.status[mm.C.st[i]])] : c));

// El selector SISU / SGA (la corona y Rendimiento equipos): el filtro de toda la página (S.f.ss; sin él, los dos marcados).
// Clic, solo ese; otra vez, los dos; Ctrl+clic, compararlos (ui.ssCmp; view.js, pickSys), salvo comparando empresas o personas
export const sysCmpOf = (m, ui) => !!ui?.ssCmp && !m.CMP();
export const ofSysOf = (m, l, k) => l.filter((i) => m.DIMS.ss.get(i) === k);
export const sysBarOf = (m, ui) => {
  const cmp = sysCmpOf(m, ui), on = m.S.f.ss?.size ? [...m.S.f.ss] : [0, 1], L = m.DIMS.ss.label;
  const tip = (k) => `${on.length === 1 && on[0] === k && !cmp ? 'Clic para ver los dos' : `Clic para ver solo ${L(k)}`}; Ctrl+clic para ${cmp ? 'dejar de comparar' : 'comparar SISU y SGA'}.`;
  return `<div class="mt-seg mt-seg-sm mt-dn-sys${cmp ? ' mt-dn-sys-cmp' : ''}" role="group" aria-label="SISU o SGA">${[0, 1].map((k) => `<button class="mt-seg-b ${on.includes(k) ? 'mt-on' : ''}" data-ring-sys="${k}" aria-pressed="${on.includes(k)}" data-tip="${esc(tip(k))}">${L(k)}</button>`).join('')}</div>`;
};

// En qué estado está: el backlog ahora, en una corona (lo primero de Foto de hoy y del Resumen): lo abierto (en el
// centro), repartido por su estado, con las situaciones de la pestaña Backlog (model.js, SITUATIONS): Asignada (sin tocar
// o devuelta a la cola), Pendiente (proveedor), Pendiente (cliente) y En curso; lo que espera por otro motivo, solo si lo
// hay. Suman lo abierto. Comparando, una corona por lado y, debajo, las cifras de cada uno. Devuelve la tarjeta de P: lo
// abierto de cada lado (bySide).
export const stateCard = (t) => {
  const { m, ch, name } = t;
  const { DIMS, CMP, CO } = m;
  const PARTS = [
    ['asig', 'Asignada', [1, 2], 'En Asignada: sin tocar o devueltas a la cola.'],
    ['prov', 'Pendiente (proveedor)', [3], 'En Pendiente por una acción de un tercero (desarrollo, proveedor…).'],
    ['cli', 'Pendiente (cliente)', [4], 'En Pendiente por una acción o respuesta del centro o del cliente.'],
    ['curso', 'En curso', [0], 'Alguien está trabajando en ellas.'],
    ['otro', 'Pendiente (otro motivo)', [5], 'En Pendiente con otro motivo o sin motivo informado.'],
  ].map(([cls, label, sits, tip]) => ({ cls, label, sits, tip, f: sits.map((k) => `sit:${k}`).join('|') }));
  // (lo sin técnico de las búsquedas del equipo ya es de Indra: model.js, SEARCH_OWNER)
  // pick: un clic en un estado filtra
  // el selector SISU / SGA de la corona: el filtro de toda la página (S.f.ss; sin él, los dos marcados). Clic, solo ese;
  // otra vez, los dos; Ctrl+clic, una corona por sistema (t.ui.ssCmp; view.js, pickSys), salvo comparando empresas o personas
  const sysCmp = () => sysCmpOf(m, t.ui);
  const sysBar = () => sysBarOf(m, t.ui);
  const ofSys = (l, k) => ofSysOf(m, l, k);
  // IDMTTR de lo abierto de la corona (idm): cuánto suben (o bajan) el MTTR del conjunto (lo cargado, resueltas con su TTR
  // y abiertas con su edad; resolution.js, mttrOf) las abiertas que se ven: la suma de (su edad − MTTR) / N
  const IDMTTR_NOTE = 'IDMTTR, el impacto en el MTTR de estas incidencias abiertas: la suma de (su edad − MTTR) / N, con el MTTR del conjunto = (TTR de las resueltas + edad de las abiertas) / N y N = resueltas + abiertas (todo lo cargado, con los filtros de arriba). Positivo, lo suben; negativo, lo bajan.';
  // all: el conjunto de ese lado (o de ese sistema)
  const idmOf = (open, all) => {
    const base = mttrOf(m, all), v = open.map((i) => idmttr(hoursOf(m, i), base)).filter((x) => x != null);
    return v.length ? v.reduce((a, b) => a + b, 0) : null;
  };
  const haveNow = (P0, pick = true, idm = false) => {
    // centrarse en un estado sin que los demás desaparezcan: lo de cada lado, con lo que solo deja fuera el filtro de
    // situación (model.js, widen); el elegido, destacado, y los demás, apagados
    const wideOf = (l) => (pick ? m.widen(l, ['sit'], { now: true, keep: (i) => m.OPEN[i] && m.C.rep[i] < m.S.d1 }) : l);
    // comparando SISU y SGA (sysCmp): los dos «lados» son los dos sistemas del único lado que se mira
    const split = sysCmp(), base = CO()[0], today = () => m.bySide(m.today());
    const P = split ? [0, 1].map((k) => ofSys(wideOf(P0[base]), k)) : P0.map(wideOf);
    const open = split ? [0, 1].map((k) => ofSys(P0[base], k)) : P0;
    const allOf = (k) => (split ? ofSys(today()[base], k) : today()[k]);
    const name = split ? DIMS.ss.label : t.name;
    const ks = split ? [0, 1] : CO(), one = ks.length === 1;
    const total = (k) => P[k].length, share = (v, k) => (total(k) ? pct(v / total(k)) : '—');
    const count = P.map((l) => PARTS.map((p) => l.filter((i) => p.sits.includes(DIMS.sit.get(i))).length));
    const shown = PARTS.filter((p, j) => p.cls !== 'otro' || ks.some((k) => count[k][j]));
    const at = (p, k) => count[k][PARTS.indexOf(p)];
    const rings = ks.map((k) => `<figure class="mt-dn-fig">${one ? '' : `<figcaption>${esc(name(k))}</figcaption>`}${ch.donut(shown.map((p) => ({ ...p, v: at(p, k), f: pick ? p.f : null })), [num(total(k)), 'incidencias'], one ? 116 : 96)}</figure>`).join('');
    const head = one ? '' : `<tr class="mt-dn-head"><th></th>${ks.map((k) => `<th class="mt-num">${esc(name(k))}</th>`).join('')}</tr>`;
    const row = (p) => `<tr${pick ? ` class="mt-clk ${t.focusCls(p.f)}" data-f${p.f.includes('|') ? '2' : ''}="${p.f}"` : ''} data-tip="${esc(p.tip)}"><th><i class="mt-dn-sw mt-dn-${p.cls}"></i>${p.label}</th>${ks.map((k) => `<td class="mt-num"><b>${num(at(p, k))}</b><small>${share(at(p, k), k)}</small></td>`).join('')}</tr>`;
    const sum = `<tr class="mt-dn-sum" data-tip="Lo abierto ahora, se abriera cuando se abriera."><th>Incidencias</th>${ks.map((k) => `<td class="mt-num"><b>${num(total(k))}</b><small>ahora</small></td>`).join('')}</tr>`;
    const idmRow = idm ? `<tr class="mt-dn-idm" data-tip="${esc(IDMTTR_NOTE)}"><th>IDMTTR</th>${ks.map((k) => { const v = idmOf(open[k], allOf(k));
      return `<td class="mt-num"><b class="mt-diff ${v > 0 ? 'bad' : v < 0 ? 'good' : ''}">${v == null ? '—' : signedDur(v)}</b><small>en el MTTR</small></td>`; }).join('')}</tr>` : '';
    return `<div class="mt-dn ${one ? '' : 'mt-dn-cmp'}"><div class="mt-dn-rings">${rings}</div><table class="mt-dn-legend">${head}${shown.map(row).join('')}${sum}${idmRow}</table></div>`;
  };
  // links: filtrado por Pendiente (proveedor), un enlace a Escalados, en Activas y sin ese filtro, que allí sobra
  // (Activas ya es lo escalado y abierto) y vaciaría Histórico (metrics-view.js, data-esc-now y data-rm); el Resumen, sin
  // enlaces. upTo (el Resumen): P es lo abierto ahora que se abrió hasta el final del periodo (resumen.js); la
  // explicación, en el tooltip del título, y sin nada abierto en ningún lado, lo dice. Sin upTo (el informe Backlog
  // actual), lo abierto, con la explicación debajo. Un clic en un estado filtra.
  // pick: un clic en un estado filtra (el Resumen y Backlog, no); go: la tarjeta entera lleva a esa pestaña (el Resumen, a Backlog)
  return (P, { upTo = false, links = true, pick = true, go = null } = {}) => {
    const toEscalated = links && m.isSel('sit', 3) ? '<p class="mt-dn-go"><button class="mt-go" data-go="escalados" data-esc-now data-rm="sit:3" data-tip="Abre Escalados en Activas: todo lo escalado y abierto, con sus tiempos, sus proyectos Jira y los malos escalados.">Ver en Escalados →</button></p>' : '';
    const about = upTo ? `Lo abierto ahora que se abrió hasta el final del periodo elegido (también antes de él), por su estado.${pick ? ' Clic en uno para filtrar.' : ''}`
      : 'Lo abierto, por su estado. Clic en uno para filtrar.';
    const none = upTo && P.every((l) => !l.length);
    return ch.card('En qué estado está', (upTo ? sysBar() : '') + (none ? '<p class="mt-none-open">Sin incidencias abiertas</p>' : haveNow(P, pick, upTo)) + toEscalated, { span: CMP() ? 's12' : 's4', ...(upTo ? { tip: about } : { sub: about }), go });
  };
};

export const hoyTab = (t) => {
  const { m, ch, ui, grid, ask, section, selRow, asRows, prioRows, topRows, mixCmp } = t;
  const { C, OPEN, DIMS, CMP, CO, isSel, bySide } = m;
  const { kpis, kpiCo } = ch;
  // En la pestaña, las explicaciones no se ven: van en el tooltip del título de su tarjeta o su sección. En el informe
  // (inReport), debajo, como siempre.
  const plain = (h) => h.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const card = (title, body, o = {}) => ch.card(title, body, !inReport && o.sub ? { ...o, sub: '', tip: plain(o.sub) } : o);
  const stateOf = stateCard(t), detail = backlogParts(t, { card }), evolution = evolutionOf(t);
  const sec = (title, small = '') => (inReport || !small ? section(title, small) : `<h2 class="mt-sec" data-tip="${esc(plain(small).replace(/^./, (c) => c.toUpperCase()))}">${title}</h2>`);

  // --- El backlog ahora: lo abierto a fecha de la última carga, se abriera cuando se abriera (no
  // depende del periodo; sí de los filtros y de lo que se mira arriba). Sus cifras y cómo se reparte (cómo ha ido día
  // a día, en el Histórico: evolucion.js).
  const nowRows = (op) => [
    { head: 'Antigüedad', note: 'Desde que se abrió.' }, ...ages(m),
    { head: 'Prioridad' }, ...asRows(prioRows()),
    { head: 'Centro', note: 'Los 8 con más.' }, ...topRows('ce', op, 8),
    { head: 'Módulo', note: 'Los 8 con más.' }, ...topRows('mo', op, 8),
  ];

  // Quién tiene qué: lo abierto ahora de cada persona, con su total (today.js). Clic en una persona: todo, solo de ella.
  const whoCard = () => {
    const { op, cols: PCOLS, who, tot } = whoHas(m);
    return `<div class="mt-tablewrap"><table><thead><tr><th>Persona</th>${PCOLS.map(([l]) => `<th class="mt-num">${l}</th>`).join('')}</tr></thead><tbody>${who.map((r) => `<tr class="mt-clk ${isSel('as', r.k) ? 'mt-sel' : ''}" data-f="as:${r.k}"><td>${CMP() ? `<i class="mt-sw mt-c${m.SIDE[op.find((i) => C.as[i] === r.k)]}"></i>` : ''}${esc(m.DIMS.as.label(r.k))}</td>${r.v.map((v) => `<td class="mt-num">${v || ''}</td>`).join('')}</tr>`).join('')}
      <tr class="mt-grp"><td>Total</td>${tot.map((v) => `<td class="mt-num">${num(v)}</td>`).join('')}</tr></tbody></table></div>`;
  };

  // La sábana: lo abierto ahora, con los filtros y los lados de arriba (sheet.js), de la más reciente a la más antigua
  // (por apertura); el título, del guion en adelante, y el estado, solo el estado (sin su motivo: «Pendiente», no
  // «Pendiente · Cliente»). El botón la exporta entera a CSV, igual (metrics-view.js, data-export).
  const sheetCard = () => {
    const list = sheetOf(m).reverse();
    ui.hoySheet = { list, cols: HOY_COLS };   // lo que exporta el botón (metrics-view.js)
    // ya no se ve (se exporta desde los tres puntos: Exportar sábana a CSV); solo con ui.showSheet (los tests)
    if (!ui.showSheet) return '';
    const body = sheetBody(m, list, { ui, id: 'res-sheet', expanded: ui.exp['res-sheet'], more: ch.more, empty: 'Nada abierto con estos filtros.', cols: HOY_COLS });
    return card('Sábana de incidencias', body, { span: 's12', sub: 'Lo abierto ahora, con los filtros y los lados de arriba, de la más reciente a la más antigua. Exportar a CSV las descarga todas, con su enlace a Remedy, para abrirlas en Excel.' });
  };

  // La pestaña Backlog: los meses en los que se abrió algo que sigue abierto (de lo de ahora, con los filtros y los
  // lados de arriba): cuántas siguen abiertas de cada mes y el MTTR de todo lo recibido en él (TTR de las resueltas + lo
  // que llevan las abiertas, como en el Mes a mes del Resumen), en verde por debajo de MTTR_TARGET y en rojo por encima.
  // Del más antiguo al más reciente; al final, el total. Comparando, las dos cifras de cada lado.
  const MONTHS_TIP = `Los meses en los que se abrió algo que sigue abierto. Abiertas: cuántas de ese mes siguen abiertas. MTTR: de todo lo recibido en ese mes, (TTR de las resueltas + lo que llevan abiertas las que siguen abiertas) / cuántas son; en verde por debajo de ${dur(MTTR_TARGET)} y en rojo por encima.`;
  // En una gráfica de barras, para que llene el sitio al lado de la corona: una barra por mes (comparando, una por lado,
  // con su color) con sus abiertas encima y, debajo del mes, su MTTR en verde o en rojo; arriba, el total. Comparando, a
  // todo el ancho (la corona va sola en su fila). Al pasar el ratón por un mes, sus cifras.
  const monthsCard = (all0, P0) => {
    // con un mes elegido, los demás siguen (apagados): lo de ahora con lo que solo deja fuera ese filtro
    const all = all0.map((l) => m.widen(l, ['mes'], { now: true })), P = P0.map((l) => m.widen(l, ['mes'], { now: true, keep: (i) => OPEN[i] }));
    const cos = CO(), cmp = CMP(), monthOf = (i) => m.monthAt(C.rep[i]), span = cmp ? 's12' : 's4';
    const months = [...new Set(cos.flatMap((k) => P[k].map(monthOf)))].sort((a, b) => a - b);
    if (!months.length) return card('Meses con incidencias abiertas', '<p class="mt-mut mt-small">Nada abierto con estos filtros.</p>', { span, tip: MONTHS_TIP });
    const mttr = (k, mos) => mttrOf(m, all[k].filter((i) => mos.includes(monthOf(i)))).mttr;
    const tone = (v) => (v == null ? '' : monthTrend(v, null, { target: MTTR_TARGET }).value);
    const open = cos.map((k) => months.map((mo) => P[k].filter((i) => monthOf(i) === mo).length));
    const times = cos.map((k) => months.map((mo) => mttr(k, [mo])));
    // sin comparar, pequeña: debajo de la corona (a su ancho)
    const W = cmp ? 1240 : 480, H = cmp ? 200 : 180, T = 22, B = cmp ? 30 + 16 * cos.length : 46, L = 8, R = 8, n = months.length, slot = (W - L - R) / n;
    const max = Math.max(1, ...open.flat()), y = (v) => T + (H - T - B) * (1 - v / max);
    const bw = Math.min(56, (slot * 0.62) / cos.length);
    const bars = months.map((mo, j) => {
      const x0 = L + slot * j + slot / 2 - (bw * cos.length) / 2;
      const cols = cos.map((k, s) => { const v = open[s][j], x = x0 + bw * s;
        return `<rect class="mt-f${k}" x="${x.toFixed(1)}" y="${y(v).toFixed(1)}" width="${(bw - 2).toFixed(1)}" height="${(H - B - y(v)).toFixed(1)}" rx="2"/>`
          + (v ? `<text x="${(x + bw / 2 - 1).toFixed(1)}" y="${(y(v) - 5).toFixed(1)}" text-anchor="middle" class="mt-mm-n">${num(v)}</text>` : ''); }).join('');
      const xc = L + slot * (j + 0.5);
      const lab = `<text x="${xc.toFixed(1)}" y="${H - B + 16}" text-anchor="middle" class="mt-axis">${esc(m.monthName(mo))}</text>`;
      const ttr = cos.map((k, s) => `<text x="${xc.toFixed(1)}" y="${H - B + 32 + 16 * s}" text-anchor="middle" class="mt-mm-t ${tone(times[s][j])}">${cmp ? `${esc(t.name(k))}: ` : ''}${times[s][j] == null ? '—' : dur(times[s][j])}</text>`).join('');
      const tip = `${m.monthName(mo)}\n${cos.map((k, s) => `${cmp ? `${t.name(k)}: ` : ''}${num(open[s][j])} abiertas · MTTR ${times[s][j] == null ? '—' : dur(times[s][j])}`).join('\n')}`;
      // un clic en el mes filtra por él (como un estado de la corona); marcado, el resto más claro
      const on = m.isSel('mes', mo), dim = m.anySel('mes') && !on ? ' mt-mm-off' : '';
      return `<g class="mt-clk${dim}" data-f="mes:${mo}">${cols}${lab}${ttr}<rect class="mt-hit" x="${(L + slot * j).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${H}" data-tip="${esc(`${tip}
Clic para filtrar por este mes.`)}"/></g>`;
    }).join('');
    const base = `<line x1="${L}" x2="${W - R}" y1="${H - B}" y2="${H - B}" class="mt-gridline"/>`;
    const total = cos.map((k) => { const v = mttr(k, months);
      return `<span>${cmp ? `<i class="mt-sw mt-c${k}"></i>${esc(t.name(k))}: ` : 'Total: '}<b>${num(P[k].length)}</b> abiertas · MTTR <b class="mt-diff ${tone(v)}">${v == null ? '—' : dur(v)}</b></span>`; }).join('');
    return card('Meses con incidencias abiertas', `<div class="mt-mm-total">${total}</div><svg viewBox="0 0 ${W} ${H}" class="mt-svg">${base}${bars}</svg>`, { span, tip: MONTHS_TIP });
  };



  const backlogNow = (A) => {
    const all = bySide(m.today()), op = m.today().filter((i) => OPEN[i]), P = all.map((l) => l.filter((i) => OPEN[i])), cos = CO(), cmp = CMP();
    const S0 = P[cos[0]];
    // la antigüedad media (el total ya está en la corona): sin comparar, en una baldosa cuadrada (dos columnas de la
    // rejilla); comparando, con la diferencia
    const ageBox = () => `<section class="mt-st mt-st-age"><h4>Antigüedad media</h4><div class="mt-st-big"><b>${dur(meanAge(m, S0))}</b></div><p>lo que llevan abiertas, de media</p></section>`;
    // lo primero, la corona (en qué estado está); sin comparar, a su lado en qué punto está y debajo la baldosa y la
    // prioridad; comparando, la corona sola en su fila, la antigüedad con la diferencia y una tabla de dos lados
    // la corona: en el Resumen (bare), la pone él; en el informe, de todo lo abierto; sola (la pestaña, que ya no sale en
    // ninguna vista), como la del Resumen
    // en Backlog, la del Resumen (lo abierto ahora que se abrió hasta el final del periodo, sin enlaces)
    const ring = bare ? '' : inReport ? stateOf(P) : stateOf(all.map((l) => l.filter((i) => OPEN[i] && C.rep[i] < m.S.d1)), { upTo: true, links: !bklog });
    // y debajo, lo pendiente en detalle (lo que era la pestaña Backlog: backlog.js): en qué punto está, qué vigilar y
    // sus tablas; comparando, sus cifras junto a la antigüedad media y la tabla de cómo está lo de cada uno
    const cp = cmp ? detail.cmpParts(m.today(), A) : null;
    const ageKpi = bklog ? [] : [kpiCo('Antigüedad media', [0, 1].map((k) => ({ n: P[k].length, v: meanAge(m, P[k]) })), (s) => dur(s.v), { val: (s) => s.v, better: 'low', note: 'Lo que llevan abiertas, de media.' })];
    const top = cmp
      ? [ring, kpis(...ageKpi, ...cp.kpis), ...(bklog ? [monthsCard(all, P), evolution({ only: 'backlog', compact: true })] : []),
        card('Cómo se reparte', mixCmp(nowRows(op), op, 'Pendientes'), { span: 's12', sub: 'De cada uno, cuántas y qué parte de lo suyo. Clic en una fila para filtrar.' }),
        sec('¿En qué punto está lo pendiente?'), cp.table]
      : (() => {
        // sin comparar: a la derecha de la corona, en qué punto está lo pendiente (el panel, con la antigüedad media al
        // final); debajo, las tablas de detalle (la antigüedad, el centro y el módulo ya están en ellas; la prioridad, en
        // el selector de arriba)
        // en Backlog, sin A vigilar ni la antigüedad media: debajo del panel, los meses con incidencias abiertas
        // en Backlog, sin «¿En qué punto están?»: la corona y, a su lado, los meses con incidencias abiertas
        // en Backlog, sin «¿En qué punto están?»: a la izquierda, la corona y debajo los meses con incidencias abiertas; a
        // la derecha, la evolución del backlog
        if (bklog) {
          return [`<div class="mt-s4 mt-stackcol">${ring}${monthsCard(all, P)}</div>`, evolution({ only: 'backlog', span: 's8', fixedScale: true }),
            ...detail.single(m.today(), '', false, { simple: true }).slice(1)];
        }
        const [panel, ...tables] = bare ? detail.single(m.today(), '', false) : detail.single(m.today(), ageBox());
        return [ring, bare ? panel : panel.replace('class="mt-stock ', 'class="mt-stock mt-st-side '),
          sec('Lo pendiente en detalle', 'su situación, lo que conviene vigilar y desde cuándo.'), ...tables];
      })();
    return [bklog ? '' : sec('¿Cómo está el backlog ahora?', 'lo abierto a fecha de la última carga, se abriera cuando se abriera.'), ...top,   // Backlog, sin título
      card('Quién tiene qué', whoCard(), { span: 's12', sub: 'Lo abierto ahora de cada persona. Clic en una persona para ver todas las métricas solo de ella.' }),
      inReport ? '' : sheetCard()];
  };

  // inReport: en un informe (Backlog actual, report.js), sin la sábana de incidencias. bare: como parte del Resumen
  // (resumen.js): lo de debajo de la corona, sin la pregunta. Los selectores (SISU o SGA, prioridad), en la barra de
  // arriba, para todas las pestañas (tabs/common.js, filterPicks).
  // bklog: la pestaña Backlog, sin la corona (está en el Resumen) y con todo lo demás
  let inReport = false, bare = false, bklog = false;
  return (A, opts = {}) => {
    inReport = !!opts.inReport; bare = !!opts.bare; bklog = !!opts.backlog;
    if (bare) return backlogNow(A);
    return grid(bklog ? '' : ask('hoy'), ...backlogNow(A));   // Backlog, sin la pregunta de arriba
  };
};
