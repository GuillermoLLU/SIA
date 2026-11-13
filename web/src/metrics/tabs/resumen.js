// Resumen: de un vistazo, en qué estado está lo abierto ahora (la corona de Foto de hoy: hoy.js, stateCard; a fecha de
// la última carga, sea cual sea el periodo) y, del periodo elegido (A), los KPIs del servicio:
//   MTTR          (TTR de las resueltas + lo que llevan las abiertas) / cuántas son (#48; resolution.js, mttrOf)
//   %IQA          de las auditadas, el % con calidad 3 o 4. Aún sin datos: la nota del agente de calidad (#55) no llega
//   Uso de la IA  de lo recibido, lo que tiene alguna marca de IA (ia.js, iaStats; como «Con IA» de la pestaña IA)
// Las fechas, la empresa y «Comparar» van arriba del todo, en la barra de Métricas (quick-bar.js): valen para todas las
// pestañas; de partida, el año fiscal en curso. Los KPIs, en una tarjeta a la derecha de la corona; abajo del todo, el
// backlog al acabar cada día del periodo, en barras por prioridad (evolucion.js). Comparando lados, la corona ocupa la
// fila y los KPIs van debajo, cada uno con los dos lados y su diferencia (charts.js, kpiCo); el backlog, una línea por
// lado. Comparando periodos (ui.resCmp), los KPIs con los dos y el backlog, una línea por periodo, cada una desde su
// primer día (evolucion.js, periods).
import { esc } from '../../ui/html.js';
import { num, pct, dur } from '../format.js';
import { rangeLabel, cmpRange, cmpName } from '../period.js';
import { mttrOf } from '../resolution.js';
import { iaStats } from '../ia.js';
import { stateCard } from './hoy.js';
import { evolutionOf } from './evolucion.js';
import { compareFigure } from '../compare.js';

export const IQA_NOTE = 'De las auditadas, el % con calidad 3 o 4 (sobre 4: la nota mínima de técnica, proceso y comunicación). Aún sin datos: la nota del agente de calidad (tarea #55) no llega a SIA.';

export const resumenTab = (t) => {
  const { m, ch, ui, grid, ask, solved } = t;
  const { C, S, OPEN, CMP, CO, bySide } = m;
  const { card, kpi, kpis, kpiCo } = ch;
  const stateOf = stateCard(t), evolution = evolutionOf(t);
  const opt = (f) => (s) => (s.v == null ? '—' : f(s.v));
  const val = (s) => s.v;
  // con qué se comparan los KPIs: 'side' (otro lado: T-Systems u otro, desde arriba), 'periods' (un periodo con otro:
  // ui.resCmp) o nada
  const cmpMode = () => (CMP() ? 'side' : ui.resCmp?.a && ui.resCmp?.b ? 'periods' : null);
  // lo del primer lado abierto en un rango, con los filtros de arriba (sea cual sea el periodo de arriba)
  const inRange = (r) => (r ? bySide(m.today())[CO()[0]].filter((i) => C.rep[i] >= r[0] && C.rep[i] < r[1]) : []);

  // los KPIs de unas incidencias: { n, v } de cada uno
  const figures = (l) => {
    const b = mttrOf(m, l), s = iaStats(l, C), r = l.filter(solved).length;
    // en SLA: las empezadas (paso a En curso) dentro del plazo de su prioridad, de las que cuentan (model.js, stats sla)
    const st = m.stats(l);
    return { inc: { n: l.length, r, v: l.length ? r / l.length : null }, mttr: { n: b.n, v: b.mttr }, sla: { n: l.length, v: st.sla }, ia: { n: s.n, v: s.share }, iqa: { n: l.length, v: null } };
  };
  // comparando periodos, los dos: [{ key, label, range }]
  const periods = () => (cmpMode() === 'periods' ? [ui.resCmp.a, ui.resCmp.b].map((key) => ({ key, label: cmpName(m, key), range: cmpRange(m, key) })) : null);
  // Del periodo: de cada lado o, comparando periodos, lo del primer lado abierto en cada uno (con los mismos filtros)
  const periodKpis = (A, wide = false) => {
    const mode = cmpMode();
    let F, names = null, sub = 'Lo recibido en el periodo elegido arriba.';
    if (mode === 'periods') {
      const [pa, pb] = periods(), ra = pa.range, rb = pb.range;
      F = [figures(pa.key === 'cur' ? bySide(A)[CO()[0]] : inRange(ra)), figures(inRange(rb))];
      names = [pa.label, pb.label];
      const when = (r) => (r ? esc(rangeLabel(m, r)) : 'sin datos');
      sub = `Lo recibido en ${esc(names[0])} (${when(ra)}) frente a ${esc(names[1])} (${when(rb)}).`;
    } else F = bySide(A).map(figures);
    const of = (k) => F.map((f) => f[k]), o = (x) => ({ val, pair: mode === 'periods', names, ...x });
    // Entrantes: cuántas entraron en el periodo y cuántas de esas están ya resueltas, en totales. Sin comparar, las
    // entrantes en grande y debajo las resueltas (y qué parte son); comparando, la diferencia de entrantes y de resueltas
    // (en unidades, sin mejor ni peor: entrar más no es ir peor) y, de cada lado, sus entrantes y sus resueltas.
    const INC_NOTE = 'Las incidencias que entraron en el periodo y, de esas, las que ya están resueltas (a fecha de la última carga).';
    const signed = (v) => (v ? `${v > 0 ? '+' : '−'}${num(Math.abs(v))}` : '=');
    const incKpi = ((I) => {
      const k = CO()[0], x = I[k];
      // con un enlace a la pestaña Entrantes debajo, como los demás KPIs
      const go = '<p class="mt-kpi-go"><button class="mt-go" data-go="entrada">Ver Entrantes →</button></p>';
      if (!mode) return kpi('Entrantes', x.n ? num(x.n) : '—', `${x.n ? `${num(x.r)} resueltas (${pct(x.v)})` : 'nada entró'}${go}`, `mt-t${k}`, `data-tip="${esc(INC_NOTE)}"`);
      const nm = (j) => names?.[j] || t.name(j);
      const side = (j) => `<div class="mt-kpi-s"><i class="mt-c${j}"></i><span title="${esc(nm(j))}">${esc(nm(j))}</span><b>${num(I[j].n)} <small class="mt-mut">· ${num(I[j].r)} res.</small></b></div>`;
      const both = I[0].n || I[1].n;
      return `<div class="mt-kpi mt-kpi-co"><div class="mt-kpi-l" data-tip="${esc(INC_NOTE)}">Entrantes</div>
      <div class="mt-kpi-v ${both ? 'mt-diff' : 'mt-mut'}">${both ? `${signed(I[0].n - I[1].n)} <small class="mt-mut">· ${signed(I[0].r - I[1].r)} res.</small>` : '—'}</div>${side(0)}${side(1)}${go}</div>`;
    })(of('inc'));
    return card('Del periodo', kpis(incKpi,
      kpiCo('MTTR', of('mttr'), opt(dur), o({ better: 'low', go: ['tiempos', 'Análisis tiempos'], note: 'De lo recibido en el periodo: (TTR de las resueltas + lo que llevan abiertas las que siguen abiertas) / cuántas son. Una cancelada sin resolver no cuenta.' })),
      kpiCo('% dentro de SLA', of('sla'), opt(pct), o({ better: 'high', go: ['sla', 'SLAs'], note: 'De lo recibido en el periodo, lo que se empezó (paso a En curso) dentro del plazo de su prioridad; las abiertas sin empezar y ya fuera de plazo cuentan como fuera. El detalle, en la pestaña SLAs.' })),
      kpiCo('%IQA', of('iqa'), () => '—', o({ better: 'high', go: ['calidad', 'Calidad'], note: IQA_NOTE })),
      kpiCo('Uso de la IA', of('ia'), opt((v) => pct(v, 1)), o({ better: 'high', go: ['ia', 'Uso de la IA'], note: 'De lo recibido en el periodo, lo que tiene alguna marca de IA (en TAGS o en las notas). El detalle, en la pestaña Uso de la IA.' }))),
      { span: CMP() || wide ? 's12' : 's8', sub });
  };

  // El informe Estado de SLAs (report.js, PARAMS): los parámetros elegidos (only: sus claves), siempre en el mismo orden, de lo
  // recibido en el periodo; comparando con T-Systems, cada uno con los dos lados y su diferencia.
  const slaState = (A, only, part = 'top') => {
    const F = bySide(A).map(figures), of = (k, f = (x) => x) => F.map((x) => f(x[k])), o = (x) => ({ val, ...x });
    const ALL = {
      inc: () => kpiCo('Incidencias', of('inc', (x) => ({ n: x.n, v: x.n })), opt(num), o({ note: 'Las que entraron en el periodo.' })),
      res: () => kpiCo('% de resueltas', of('inc'), opt(pct), o({ better: 'high', note: 'De las que entraron en el periodo, las que ya están resueltas (a fecha de la última carga).' })),
      mttr: () => kpiCo('MTTR', of('mttr'), opt(dur), o({ better: 'low', note: '(TTR de las resueltas + lo que llevan abiertas las que siguen abiertas) / cuántas son. Una cancelada sin resolver no cuenta.' })),
      iqa: () => kpiCo('Calidad (%IQA)', of('iqa'), () => '—', o({ better: 'high', note: IQA_NOTE })),
      sla: () => kpiCo('Atendidas en SLA', of('sla'), opt(pct), o({ better: 'high', note: 'Lo que se empezó (paso a En curso) dentro del plazo de su prioridad; las abiertas sin empezar y ya fuera de plazo cuentan como fuera.' })),
      ia: () => kpiCo('Uso de la IA', of('ia'), opt((v) => pct(v, 1)), o({ better: 'high', note: 'Lo que tiene alguna marca de IA (en TAGS o en las notas).' })),
    };
    const keys = Object.keys(ALL).filter((k) => only.includes(k));
    // El detalle de cada parámetro, en gráficas: una tarjeta para cada uno con cuatro cortes, por SLA (la prioridad, con su
    // plazo para pasar a En curso), por módulo y por centro (los TOP con más incidencias del periodo), en barras
    // horizontales con una línea en lo de todas, y por mes, en columnas. Comparando, dos barras por fila (una de cada
    // lado) y la diferencia. El %IQA aún no tiene datos: su tarjeta lo dice, sin gráficas vacías.
    // COLS: [nombre, su cifra ({ n, v }), cómo se ve, qué es mejor, si es un % (escala de 0 a 100 %)].
    const COLS = {
      inc: ['Incidencias', (f) => ({ n: f.inc.n, v: f.inc.n }), num, null, false],
      res: ['% de resueltas', (f) => f.inc, pct, 'high', true],
      mttr: ['MTTR', (f) => f.mttr, dur, 'low', false],
      iqa: ['Calidad (%IQA)', (f) => f.iqa, pct, 'high', true],
      sla: ['Atendidas en SLA', (f) => f.sla, pct, 'high', true],
      ia: ['Uso de la IA', (f) => f.ia, (v) => pct(v, 1), 'high', true],
    };
    const two = CMP(), ks = two ? [0, 1] : [CO()[0]];
    const TOP = 10, sides = bySide(A), by = (pick) => sides.map((l) => figures(l.filter(pick)));
    const top = (dim) => m.group(dim, A).filter((g) => g.k).slice(0, TOP).map((g) => [m.DIMS[dim].label(g.k), by((i) => m.DIMS[dim].get(i) === g.k)]);
    const months = [...new Set(A.map((i) => m.MONTH[i]))].sort((a, b) => a - b).map((k) => [m.monthName(k), by((i) => m.MONTH[i] === k)]);
    const prios = m.PRIOS.map((p) => [m.slaLabel(p), by((i) => C.pr[i] === p)]);
    const shownOf = (k) => (s) => (s.v == null ? '—' : COLS[k][2](s.v));
    // la diferencia del primer lado con el segundo (en puntos si es un %), en verde o en rojo si tiene un sentido mejor
    const dif = (k, FF) => {
      const f = compareFigure(COLS[k][1](FF[0]), COLS[k][1](FF[1]), shownOf(k), val, COLS[k][3]);
      return f ? `<b class="mt-diff ${f.cls}">${f.pts || f.main}</b>` : '<span class="mt-mut">—</span>';
    };
    // la escala de unas filas: un %, de 0 a 100 %; si no, hasta la mayor cifra (también la de todas)
    const scaleOf = (k, rows) => (COLS[k][4] ? 1 : Math.max(1e-9, ...[...rows.map(([, FF]) => FF), F].flatMap((FF) => ks.map((s) => COLS[k][1](FF[s]).v || 0))));
    const w = (v, max) => `${Math.min(100, (v || 0) / max * 100).toFixed(1)}%`;
    const hbars = (k, rows) => {
      if (!rows.length) return '<p class="mt-mut mt-small">Sin datos.</p>';
      const max = scaleOf(k, rows), get = COLS[k][1], shown = shownOf(k);
      // la línea de lo de todas, la del primer lado
      const ref = get(F[ks[0]]).v, line = ref == null ? '' : `<span class="mt-hb-ref" style="left:${w(ref, max)}"></span>`;
      return `<div class="mt-hb">${rows.map(([label, FF]) => `<div class="mt-hb-row"><span class="mt-hb-x" title="${esc(label)}">${esc(label)}</span>
        <span class="mt-hb-track">${line}${ks.map((s) => `<i class="mt-c${s}" style="width:${w(get(FF[s]).v, max)}"></i>`).join('')}</span>
        <span class="mt-hb-v">${ks.map((s) => shown(get(FF[s]))).join(' · ')}${two ? ` ${dif(k, FF)}` : ''}</span></div>`).join('')}</div>`;
    };
    const vbars = (k, rows) => {
      if (!rows.length) return '<p class="mt-mut mt-small">Sin datos.</p>';
      const max = scaleOf(k, rows), get = COLS[k][1], shown = shownOf(k);
      return `<div class="mt-vb">${rows.map(([label, FF]) => `<div class="mt-vb-col"><div class="mt-vb-bars">${ks.map((s) => `<span><small>${shown(get(FF[s]))}</small><i class="mt-c${s}" style="height:calc((100% - 14px) * ${Math.min(1, (get(FF[s]).v || 0) / max).toFixed(3)})"></i></span>`).join('')}</div><span class="mt-vb-x">${esc(label)}</span></div>`).join('')}</div>`;
    };
    const legend = two ? `<div class="mt-legend">${ks.map((s) => `<span><i class="mt-c${s}"></i>${esc(t.name(s))}</span>`).join('')}<span><i class="mt-hb-key"></i>Todas (${esc(t.name(0))})</span></div>`
      : `<div class="mt-legend"><span><i class="mt-hb-key"></i>Todas</span></div>`;
    const paramCard = (k) => {
      if (k === 'iqa') return card(COLS[k][0], `<p class="mt-mut mt-small">${esc(IQA_NOTE)}</p>`, { span: 's12' });
      const total = ks.map((s) => shownOf(k)(COLS[k][1](F[s]))).join(' · ');
      // wide: a todo el ancho (sin Por SLA, el mes queda solo en su fila)
      const panel = (title, body, wide = false) => `<div class="mt-sla-panel${wide ? ' mt-sla-wide' : ''}"><h4>${esc(title)}</h4>${body}</div>`;
      return card(`${COLS[k][0]} <small class="mt-mut">· todas: ${total}</small>`, legend + `<div class="mt-sla-dets">${k === 'sla' ? panel('Por SLA', hbars(k, prios)) : ''}${panel(`Por módulo (los ${TOP} con más incidencias)`, hbars(k, top('mo')))}${panel(`Por centro (los ${TOP} con más incidencias)`, hbars(k, top('ce')))}${panel('Por mes', vbars(k, months), k !== 'sla')}</div>`, { span: 's12' });
    };
    // Por técnico (la calidad y el uso de la IA): una barra por persona, del color de su lado, de la mayor cifra a la
    // menor; quien tiene menos de MIN incidencias, apagado (su % dice poco). Arriba, la cifra de todo el equipo.
    const MIN = 10;
    const people = sides.flatMap((l, s) => (ks.includes(s) ? m.group('as', l, true).filter((g) => g.k).map((g) => ({ k: g.k, s, rows: g.rows, n: g.rows.length })) : []));
    const personBars = (get, fmt) => {
      const list = people.map((p) => ({ ...p, v: get(p.rows) })).filter((p) => p.v != null).sort((a, b) => b.v - a.v);
      if (!list.length) return '<p class="mt-mut mt-small">Sin datos.</p>';
      return `<div class="mt-hb">${list.map((p) => `<div class="mt-hb-row ${p.n < MIN ? 'mt-mut' : ''}"><span class="mt-hb-x" title="${esc(m.DIMS.as.label(p.k))}">${esc(m.DIMS.as.label(p.k))} <small class="mt-mut">${num(p.n)}</small></span>
        <span class="mt-hb-track"><i class="mt-c${p.s}" style="width:${w(p.v, 1)}"></i></span><span class="mt-hb-v">${fmt(p.v)}</span></div>`).join('')}</div>`;
    };
    const teamOf = (get, fmt) => ks.map((s) => { const v = get(sides[s]); return `${two ? `${esc(t.name(s))}: ` : ''}${v == null ? '—' : fmt(v)}`; }).join(' · ');
    const whoLegend = two ? `<div class="mt-legend">${ks.map((s) => `<span><i class="mt-c${s}"></i>${esc(t.name(s))}</span>`).join('')}</div>` : '';
    const PEOPLE_NOTE = `Por técnico responsable de lo recibido en el periodo, de la mayor cifra a la menor; junto al nombre, sus incidencias. Con menos de ${MIN}, en gris: su % dice poco.`;
    const reop = (l) => (l.length ? m.stats(l).reop : null), bounce = (l) => (l.length ? m.stats(l).bounce : null), iaOf = (l) => (l.length ? iaStats(l, C).share : null);
    const pc1 = (v) => pct(v, 1);
    const qualityCard = () => card('Calidad por técnico', `<p class="mt-note">%IQA: ${esc(IQA_NOTE)} Mientras, las reaperturas y las devueltas a la cola.</p>${whoLegend}<div class="mt-sla-dets">
      <div class="mt-sla-panel"><h4>Reabiertas <small class="mt-mut">· ${teamOf(reop, pc1)}</small></h4>${personBars(reop, pc1)}</div>
      <div class="mt-sla-panel"><h4>Devueltas a la cola <small class="mt-mut">· ${teamOf(bounce, pc1)}</small></h4>${personBars(bounce, pc1)}</div></div>`, { span: 's12', sub: `${PEOPLE_NOTE} Menos es mejor.` });
    const iaCard = () => card(`Uso de la IA por técnico <small class="mt-mut">· ${teamOf(iaOf, pc1)}</small>`, whoLegend + personBars(iaOf, pc1), { span: 's12', sub: `Lo que tiene alguna marca de IA (en TAGS o en las notas). ${PEOPLE_NOTE}` });

    // part 'top': Atendidas en SLA (arriba del todo, la única por SLA), las cifras del periodo y las incidencias (por
    // módulo, centro y mes); part 'people': la calidad y el uso de la IA, por técnico. Entre las dos, el informe pone lo
    // de Análisis tiempos (metrics-view.js): en qué se va el tiempo y por módulo.
    const rest = keys.filter((k) => k !== 'sla');
    if (part === 'people') return grid(keys.includes('iqa') ? qualityCard() : '', keys.includes('ia') ? iaCard() : '');
    return grid(keys.includes('sla') ? paramCard('sla') : '',
      rest.length ? card('Del periodo', kpis(...rest.map((k) => ALL[k]())), { span: 's12', sub: 'Lo recibido en el periodo del informe.' }) : '',
      keys.includes('inc') ? paramCard('inc') : '');
  };

  // state: false, sin la corona (el informe con datos históricos: report.js); los KPIs, entonces, a todo el ancho.
  // slas: los parámetros del informe Estado de SLAs; con ellos, solo lo suyo (part: 'top' o 'people', slaState)
  return (A, { state = true, slas = null, part = 'top' } = {}) => {
    if (slas) return slaState(A, slas, part);
    const P = bySide(m.today()).map((l) => l.filter((i) => OPEN[i]));
    return grid(ask('resumen'), state ? stateOf(P, { link: true }) : '', periodKpis(A, !state), evolution({ only: 'backlog', periods: periods(), link: true }));
  };
};
