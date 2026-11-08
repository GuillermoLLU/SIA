// Resumen: de un vistazo, en qué estado está lo abierto ahora (la corona de Foto de hoy: hoy.js, stateCard; a fecha de
// la última carga, sea cual sea el periodo) y, del periodo elegido (A), los KPIs del servicio:
//   MTTR          (TTR de las resueltas + lo que llevan las abiertas) / cuántas son (#48; resolution.js, mttrOf)
//   %IQA          de las auditadas, el % con calidad 3 o 4. Aún sin datos: la nota del agente de calidad (#55) no llega
//   Uso de la IA  de lo recibido, lo que tiene alguna marca de IA (ia.js, iaStats; como «Con IA» de la pestaña IA)
// Arriba del todo, las fechas que se miran: su botón abre el calendario de arriba (metrics-view.js, data-calendar), que vale
// para todas las pestañas; de partida, el año fiscal en curso, desde el 1 de febrero (model.js, resetPeriod). Los KPIs, en una tarjeta a la derecha de
// la corona; abajo del todo, el backlog al acabar cada día del periodo, en barras por prioridad (evolucion.js).
// Arriba, también las fechas rápidas (period.js, PRESETS) y con qué se comparan los KPIs (ui.resCmp; metrics-view.js,
// data-res-cmp): con el periodo anterior (prevRange: el mes anterior, los mismos días) o con T-Systems (el otro lado, como
// «+ Comparar»: vale para todas las pestañas). Comparando lados, la corona ocupa la fila y los KPIs van debajo, cada uno
// con los dos lados y su diferencia (charts.js, kpiCo); el backlog, una línea por lado. Con el periodo anterior, solo
// los KPIs se comparan.
import { esc } from '../../ui/html.js';
import { pct, dur } from '../format.js';
import { periodLabel, PRESETS, presetOf, prevRange, rangeLabel } from '../period.js';
import { mttrOf } from '../resolution.js';
import { iaStats } from '../ia.js';
import { stateCard } from './hoy.js';
import { evolutionOf } from './evolucion.js';

export const IQA_NOTE = 'De las auditadas, el % con calidad 3 o 4 (sobre 4: la nota mínima de técnica, proceso y comunicación). Aún sin datos: la nota del agente de calidad (tarea #55) no llega a SIA.';

export const resumenTab = (t) => {
  const { m, ch, ui, grid, ask } = t;
  const { C, S, OPEN, CMP, CO, bySide } = m;
  const { card, kpis, kpiCo } = ch;
  const stateOf = stateCard(t), evolution = evolutionOf(t);
  const opt = (f) => (s) => (s.v == null ? '—' : f(s.v));
  const val = (s) => s.v;
  // con qué se comparan los KPIs: 'side' (otro lado: T-Systems u otro, desde arriba), 'prev' (el periodo anterior, si
  // hay datos de él) o nada
  const cmpMode = () => (CMP() ? 'side' : ui.resCmp === 'prev' && prevRange(m) ? 'prev' : null);
  const isTsys = () => CMP() && S.sides[1]?.company === 1 && !S.sides[1].people;

  // los KPIs de unas incidencias: { n, v } de cada uno
  const figures = (l) => {
    const b = mttrOf(m, l), s = iaStats(l, C);
    return { mttr: { n: b.n, v: b.mttr }, ia: { n: s.n, v: s.share }, iqa: { n: l.length, v: null } };
  };
  // Del periodo: de cada lado o, con el periodo anterior, el periodo (el primer lado) y el anterior: lo de los mismos
  // filtros y el mismo lado abierto en esas fechas
  const periodKpis = (A) => {
    const mode = cmpMode();
    let F, names = null, sub = 'Lo recibido en el periodo elegido arriba.';
    if (mode === 'prev') {
      const [a, b] = prevRange(m), before = bySide(m.today())[CO()[0]].filter((i) => C.rep[i] >= a && C.rep[i] < b);
      F = [figures(bySide(A)[CO()[0]]), figures(before)];
      names = ['Periodo', 'Anterior'];
      sub = `Lo recibido en ${esc(periodLabel(m))} frente a ${esc(rangeLabel(m, [a, b]))}.`;
    } else F = bySide(A).map(figures);
    const of = (k) => F.map((f) => f[k]), o = (x) => ({ val, pair: mode === 'prev', names, ...x });
    return card('Del periodo', kpis(
      kpiCo('MTTR', of('mttr'), opt(dur), o({ better: 'low', note: 'De lo recibido en el periodo: (TTR de las resueltas + lo que llevan abiertas las que siguen abiertas) / cuántas son. Una cancelada sin resolver no cuenta.' })),
      kpiCo('%IQA', of('iqa'), () => '—', o({ better: 'high', note: IQA_NOTE })),
      kpiCo('Uso de la IA', of('ia'), opt((v) => pct(v, 1)), o({ better: 'high', note: 'De lo recibido en el periodo, lo que tiene alguna marca de IA (en TAGS o en las notas). El detalle, en la pestaña IA.' }))),
      { span: CMP() ? 's12' : 's8', sub });
  };

  // Arriba, fuera de las tarjetas: las fechas rápidas, el botón de las fechas (abre el calendario de arriba) y con qué
  // se compara. Valen para los KPIs y para el backlog de cada día.
  const seg = (label, items) => `<div class="mt-seg mt-seg-sm" role="group" aria-label="${label}">${items.map(([attr, l, on, tip]) => `<button class="mt-seg-b ${on ? 'mt-on' : ''}" ${attr} aria-pressed="${on}"${tip ? ` data-tip="${esc(tip)}"` : ''}>${l}</button>`).join('')}</div>`;
  const bar = () => {
    const now = presetOf(m), mode = cmpMode(), prev = prevRange(m);
    const quick = seg('Fechas rápidas', PRESETS.map(([k, l]) => [`data-preset="${k}"`, l, now === k]));
    const dates = `<button class="mt-btn mt-res-dates" data-calendar aria-haspopup="true" data-tip="Elegir otras fechas: valen para todas las pestañas.">${esc(periodLabel(m))}</button>`;
    const vs = seg('Comparar con', [
      ['data-res-cmp="none"', 'Nada', !mode],
      ['data-res-cmp="prev"', 'Periodo anterior', mode === 'prev', prev ? `Los KPIs, frente a ${rangeLabel(m, prev)}.` : 'No hay datos de antes de este periodo.'],
      ...(S.sides[0]?.company === 1 && !S.sides[0].people ? [] : [['data-res-cmp="tsys"', 'T-Systems', isTsys(), 'Compara con T-Systems todas las pestañas, como «+ Comparar».']]),
    ]);
    return `<div class="mt-res-bar"><span class="mt-mut">Periodo</span>${quick}${dates}<span class="mt-mut mt-res-vs">Comparar con</span>${vs}</div>`;
  };

  return (A) => {
    const P = bySide(m.today()).map((l) => l.filter((i) => OPEN[i]));
    return grid(ask('resumen'), bar(), stateOf(P), periodKpis(A), evolution({ only: 'backlog' }));
  };
};
