// Pendiente de cliente: lo que está ahora en Pendiente del centro o del cliente (situación «Espera cliente»: model.js,
// SITUATIONS), a fecha de la última carga y sea cual sea el periodo. Arriba, sus KPIs; debajo, por qué se espera al
// cliente (el motivo de nuestra última nota pública: server/metrics/pending-reason.js), por módulo afectado y por
// centro y, abajo del todo, la sábana.
//   Pendientes de cliente     cuántas
//   MTTR                      el de estas incidencias (resolution.js, mttrOf); al estar todas abiertas, lo que llevan
//                             abiertas de media
//   Tiempo en pendiente       lo que llevan en Pendiente de cliente, sumando todas las veces, de media (tPc, hasta la
//                             última modificación, más lo de desde entonces: siguen en ese estado)
//   Sin reclamar > 24 h       sin nota pública nuestra en las últimas 24 h (o ninguna): no le hemos vuelto a escribir
//   Rebotes                   las que han pasado a Pendiente de cliente 2 veces o más (nC)
//   IDMTTR                    lo que mueven el MTTR del periodo (resolution.js, idmttrOf)
// Lo público se aproxima (la consulta no dice si una nota es pública): ver pending-reason.js. Comparando, los KPIs de
// cada lado; el motivo y la sábana, del primero. La definición de cada KPI, al pasar el ratón. Pinchar «Sin reclamar»,
// «Rebotes» o una barra del motivo filtra la sábana (ui.cliFilter: 'quiet', 'reb' o 'r:<motivo>'; metrics-view.js,
// data-cli-f); otro clic, o «Quitar filtro», lo quita.
import { esc } from '../../ui/html.js';
import { num, pct, dur, signedDur } from '../format.js';
import { mttrOf, hoursOf, idmttr, idmttrOf } from '../resolution.js';
import { SHEET_COLS, sheetBody } from '../sheet.js';
import { afterDash } from './escalados.js';

export const CLIENT_SIT = 4;   // «Espera cliente» (model.js, SITUATIONS)
export const QUIET_MIN = 24 * 60;   // sin reclamar: más de 24 h sin nota pública nuestra
// los motivos (server/metrics/pending-reason.js, PENDING_REASONS) y el orden en que salen: los cuatro, otro y sin nota
export const REASONS = ['Sin nota pública', 'Información/evidencias solicitadas', 'Validación de solución/workaround',
  'Resolución/cierre comunicado', 'Decisión del cliente', 'Otro motivo'];
const ORDER = [1, 2, 3, 4, 5, 0];

export const clienteTab = (t) => {
  const { m, ch, ui, grid, ask } = t;
  const { C, OPEN, DIMS, SNAP, CO, bySide, isSel, anySel } = m;
  const { card, kpis, kpiCo } = ch;
  const labels = m.data.pendingReasons || REASONS;
  const ready = !!(C.pn && C.pm && C.nC);   // unos datos de antes no traen las notas públicas ni los rebotes
  const mean = (l, f) => (l.length ? l.reduce((s, i) => s + f(i), 0) / l.length : null);
  // lo que lleva en Pendiente de cliente: lo sumado hasta su última modificación y, como sigue ahí, lo de desde entonces
  const inPending = (i) => (C.tPc?.[i] || 0) + Math.max(SNAP - (C.lm?.[i] >= 0 ? C.lm[i] : SNAP), 0);
  const quiet = (i) => C.pn[i] < 0 || SNAP - C.pn[i] > QUIET_MIN;
  const reasonOf = (i) => (ready ? C.pm[i] : 0);
  // los filtros de la sábana: [prueba, cómo se dice]
  const FILTERS = { quiet: [quiet, 'sin reclamar más de 24 h'], reb: [(i) => C.nC[i] >= 2, 'con rebotes'] };
  const filterOf = (f) => (!f || !ready ? null : f.startsWith('r:') ? [(i) => reasonOf(i) === Number(f.slice(2)), `con motivo «${labels[Number(f.slice(2))]}»`] : FILTERS[f] || null);
  const pick = (k) => (ready ? { attr: `data-cli-f="${k}"`, on: ui.cliFilter === k } : null);

  const kpiCards = (P, A) => {
    const F = P.map((l) => ({
      n: { n: l.length, v: l.length }, mttr: { n: l.length, v: mttrOf(m, l).mttr },
      pc: { n: l.length, v: mean(l, inPending) }, quiet: { n: l.length, v: ready ? l.filter(quiet).length : null },
      reb: { n: l.length, v: ready ? l.filter((i) => C.nC[i] >= 2).length : null }, idm: { n: l.length, v: idmttrOf(m, A, l) },
    }));
    const of = (k) => F.map((f) => f[k]), val = (s) => s.v, opt = (f) => (s) => (s.v == null ? '—' : f(s.v)), tip = true;
    return kpis(
      kpiCo('Pendientes de cliente', of('n'), opt(num), { val, better: 'low', tip, note: 'Incidencias abiertas que están ahora en Pendiente del centro o del cliente.' }),
      kpiCo('MTTR', of('mttr'), opt(dur), { val, better: 'low', tip, note: 'El MTTR de estas incidencias: (TTR de las resueltas + lo que llevan las abiertas) / cuántas son. Como todas siguen abiertas, es lo que llevan abiertas de media.' }),
      kpiCo('Tiempo medio en pendiente de cliente', of('pc'), opt(dur), { val, better: 'low', tip, note: 'Lo que llevan en Pendiente de cliente, sumando todas las veces que han pasado por ahí, de media.' }),
      kpiCo('Sin reclamar más de 24 h', of('quiet'), opt(num), { val, better: 'low', tip, pick: pick('quiet'), note: 'Sin nota pública nuestra en las últimas 24 horas (o sin ninguna): no le hemos vuelto a escribir al cliente. Lo público se aproxima: la nota de alguien del equipo que no empieza por una etiqueta interna ([ANALISIS], [DIAGNOSTICO]…).' }),
      kpiCo('Rebotes', of('reb'), opt(num), { val, better: 'low', tip, pick: pick('reb'), note: 'Las que han pasado a Pendiente de cliente 2 veces o más.' }),
      kpiCo('IDMTTR', of('idm'), opt(signedDur), { val, tip, note: 'Lo que mueven el MTTR del periodo: el MTTR con ellas menos el MTTR sin ellas.' }));
  };

  // Motivo de pendiente: una barra horizontal por motivo, con cuántas y qué parte de lo pendiente de cliente
  const reasonCard = (l) => {
    const rows = ORDER.map((k) => ({ k, n: l.filter((i) => reasonOf(i) === k).length }));
    const body = l.length ? `<table class="mt-blist">${rows.map(({ k, n }) => {
      const sh = n / l.length;
      const f = `r:${k}`, on = ui.cliFilter === f;
      return `<tr class="${ready ? 'mt-clk' : ''} ${on ? 'mt-sel' : ''}" ${ready ? `data-cli-f="${f}" data-tip="${esc(on ? 'Clic para quitar el filtro.' : 'Clic para ver solo estas en la sábana.')}"` : ''}><th>${esc(labels[k])}</th><td class="mt-num">${num(n)}</td><td class="mt-num mt-mut">${pct(sh)}</td><td class="mt-blist-bar"><i class="mt-c${CO()[0]}" style="width:${(sh * 100).toFixed(1)}%"></i></td></tr>`;
    }).join('')}</table>` : '<p class="mt-mut mt-small">Nada en Pendiente de cliente con estos filtros.</p>';
    return card('Motivo de pendiente', body, { span: 's12', sub: 'Por qué esperamos al cliente, según nuestra última nota pública (por sus palabras: lo que pide, si es validar una solución, comunicar el cierre o que decida el cliente). Clic en un motivo para ver solo esas en la sábana.' });
  };

  // Por módulo afectado y por centro: lo pendiente de cliente del primer lado, los 10 con más (y «Resto»), con cuántas y
  // qué parte, lo que llevan en pendiente de cliente de media, cuántas sin reclamar más de 24 h, los rebotes y la
  // antigüedad media; al final, el total. Cada tabla, sin su propio filtro, para que al pinchar una fila (filtra todo)
  // se vean las demás apagadas.
  const TOP = 10;
  const pendingOf = (skip) => bySide(m.today(false, skip))[CO()[0]].filter((i) => OPEN[i] && DIMS.sit.get(i) === CLIENT_SIT);
  const groupCard = (dim, title, noun) => {
    const l = pendingOf(dim), g = m.group(dim, l, true), top = g.slice(0, TOP), rest = g.slice(TOP).flatMap((x) => x.rows), any = anySel(dim);
    const opt = (f) => (v) => (v == null ? '—' : f(v));
    const cells = (rows) => [`<td class="mt-num">${num(rows.length)}</td><td class="mt-num mt-mut">${l.length ? pct(rows.length / l.length) : '—'}</td>`,
      `<td class="mt-num">${opt(dur)(mean(rows, inPending))}</td>`,
      `<td class="mt-num">${ready ? num(rows.filter(quiet).length) : '—'}</td><td class="mt-num">${ready ? num(rows.filter((i) => C.nC[i] >= 2).length) : '—'}</td>`,
      `<td class="mt-num">${opt(dur)(mean(rows, (i) => SNAP - C.rep[i]))}</td>`].join('');
    const row = (x) => `<tr class="mt-clk ${isSel(dim, x.k) ? 'mt-sel' : any ? 'mt-off' : ''}" data-f="${dim}:${x.k}"><th class="mt-r" title="${esc(DIMS[dim].label(x.k))}">${esc(DIMS[dim].label(x.k))}</th>${cells(x.rows)}</tr>`;
    const body = l.length ? `<div class="mt-tablewrap"><table class="mt-cli-g"><thead><tr><th>${esc(noun)}</th><th class="mt-num">Incidencias</th><th class="mt-num">%</th>
      <th class="mt-num" data-tip="Lo que llevan en Pendiente de cliente, sumando todas las veces, de media.">En pendiente</th>
      <th class="mt-num" data-tip="Sin nota pública nuestra en las últimas 24 horas (o sin ninguna).">Sin reclamar &gt; 24 h</th>
      <th class="mt-num" data-tip="Las que han pasado a Pendiente de cliente 2 veces o más.">Rebotes</th>
      <th class="mt-num" data-tip="Lo que llevan abiertas, de media.">Antigüedad</th></tr></thead><tbody>
      ${top.map(row).join('')}${rest.length ? `<tr class="mt-mut"><th class="mt-r">Resto (${num(g.length - TOP)})</th>${cells(rest)}</tr>` : ''}
      <tr class="mt-tot"><th class="mt-r">Total</th>${cells(l)}</tr></tbody></table></div>` : '<p class="mt-mut mt-small">Nada en Pendiente de cliente con estos filtros.</p>';
    const whose = m.CMP() ? ` Comparando, de ${esc(t.name(CO()[0]))}.` : '';
    return card(title, body, { span: 's6', sub: `Los ${TOP} ${noun === 'Módulo' ? 'módulos' : 'centros'} con más pendientes de cliente; «Resto», los demás.${whose} Clic en una fila para filtrar.` });
  };

  // la sábana: lo pendiente de cliente, de la más antigua a la más reciente, con sus tiempos y su motivo
  const shared = (label) => SHEET_COLS.find(([l]) => l === label);
  const sheetCols = (base) => [
    shared('Incidencia'), ['Título', (mm, i) => afterDash(mm.C.su[i])], shared('Prioridad'), shared('Responsable'), shared('Centro'), shared('Módulo'),
    ['Antigüedad', (mm, i) => dur(SNAP - mm.C.rep[i]), 'num'],
    ['En pendiente de cliente', (mm, i) => dur(inPending(i)), 'num'],
    ['Última nota pública', (mm, i) => (ready && C.pn[i] >= 0 ? `hace ${dur(SNAP - C.pn[i])}` : '—'), 'num', (mm, i) => (ready && C.pn[i] >= 0 ? SNAP - C.pn[i] : null)],
    ['Motivo', (mm, i) => (ready ? labels[reasonOf(i)] : '')],
    ['Veces en pendiente', (mm, i) => (ready ? num(C.nC[i]) : '—'), 'num'],
    ['IDMTTR', (mm, i) => signedDur(idmttr(hoursOf(mm, i), base)), 'num'],
  ];

  return (A) => {
    const P = bySide(m.today()).map((l) => l.filter((i) => OPEN[i] && DIMS.sit.get(i) === CLIENT_SIT));
    const all = [...P[CO()[0]]].sort((a, b) => C.rep[a] - C.rep[b]), cols = sheetCols(mttrOf(m, A));
    const f = filterOf(ui.cliFilter), list = f ? all.filter(f[0]) : all;
    ui.cliSheet = { list, cols };   // lo que exporta el botón (metrics-view.js), con el filtro
    // la sábana ya no se ve (se exporta desde los tres puntos): el filtro, a la vista, porque cambia lo que se exporta
    const filtered = f ? `<p class="mt-note">Filtrado: ${num(list.length)} de ${num(all.length)}, ${esc(f[1])} (lo que exporta la sábana). <button class="mt-jc-clear" data-cli-f="">Quitar filtro</button></p>` : '';
    const old = ready ? '' : '<p class="mt-note">Faltan las notas públicas y los rebotes: reinicia SIA para que el bridge los calcule.</p>';
    return grid(ask('cliente'), old, kpiCards(P, A), reasonCard(all), groupCard('mo', 'Por módulo afectado', 'Módulo'), groupCard('ce', 'Por centro', 'Centro'), filtered,
      // la sábana, solo con ui.showSheet (los tests): en la app, desde los tres puntos
      ui.showSheet ? card('Sábana de incidencias', sheetBody(m, list, { ui, id: 'cli-sheet', expanded: ui.exp['cli-sheet'], more: ch.more, empty: 'Nada en Pendiente de cliente con estos filtros.', cols }),
        { span: 's12', sub: 'Lo que está ahora en Pendiente de cliente, con los filtros de arriba, de la más antigua a la más reciente. Exportar a CSV las descarga todas, con su enlace a Remedy.' }) : '');
  };
};
