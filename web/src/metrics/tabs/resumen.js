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
    return { inc: { n: l.length, r, v: l.length ? r / l.length : null }, mttr: { n: b.n, v: b.mttr }, ia: { n: s.n, v: s.share }, iqa: { n: l.length, v: null } };
  };
  // comparando periodos, los dos: [{ key, label, range }]
  const periods = () => (cmpMode() === 'periods' ? [ui.resCmp.a, ui.resCmp.b].map((key) => ({ key, label: cmpName(m, key), range: cmpRange(m, key) })) : null);
  // Del periodo: de cada lado o, comparando periodos, lo del primer lado abierto en cada uno (con los mismos filtros)
  const periodKpis = (A) => {
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
      if (!mode) return kpi('Entrantes', x.n ? num(x.n) : '—', x.n ? `${num(x.r)} resueltas (${pct(x.v)})` : 'nada entró', `mt-t${k}`, `data-tip="${esc(INC_NOTE)}"`);
      const nm = (j) => names?.[j] || t.name(j);
      const side = (j) => `<div class="mt-kpi-s"><i class="mt-c${j}"></i><span title="${esc(nm(j))}">${esc(nm(j))}</span><b>${num(I[j].n)} <small class="mt-mut">· ${num(I[j].r)} res.</small></b></div>`;
      const both = I[0].n || I[1].n;
      return `<div class="mt-kpi mt-kpi-co"><div class="mt-kpi-l" data-tip="${esc(INC_NOTE)}">Entrantes</div>
      <div class="mt-kpi-v ${both ? 'mt-diff' : 'mt-mut'}">${both ? `${signed(I[0].n - I[1].n)} <small class="mt-mut">· ${signed(I[0].r - I[1].r)} res.</small>` : '—'}</div>${side(0)}${side(1)}</div>`;
    })(of('inc'));
    return card('Del periodo', kpis(incKpi,
      kpiCo('MTTR', of('mttr'), opt(dur), o({ better: 'low', go: ['tiempos', 'Análisis tiempos'], note: 'De lo recibido en el periodo: (TTR de las resueltas + lo que llevan abiertas las que siguen abiertas) / cuántas son. Una cancelada sin resolver no cuenta.' })),
      kpiCo('%IQA', of('iqa'), () => '—', o({ better: 'high', go: ['calidad', 'Calidad'], note: IQA_NOTE })),
      kpiCo('Uso de la IA', of('ia'), opt((v) => pct(v, 1)), o({ better: 'high', go: ['ia', 'Uso de la IA'], note: 'De lo recibido en el periodo, lo que tiene alguna marca de IA (en TAGS o en las notas). El detalle, en la pestaña Uso de la IA.' }))),
      { span: CMP() ? 's12' : 's8', sub });
  };

  return (A) => {
    const P = bySide(m.today()).map((l) => l.filter((i) => OPEN[i]));
    return grid(ask('resumen'), stateOf(P, { link: true }), periodKpis(A), evolution({ only: 'backlog', periods: periods(), link: true }));
  };
};
