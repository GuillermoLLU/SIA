// Servicio (service.js): el servicio de Indra en su conjunto frente a los SLA de la oferta, para el seguimiento con el
// cliente (épica #14). Cada métrica con SLA, con su objetivo por prioridad y si se cumple; las demás, con su evolución.
// No usa los lados de la comparación de arriba: con sus botones, se compara con el mismo periodo del año anterior y con
// T-Systems (de partida, solo nuestras cifras). Los filtros y el periodo de arriba sí cuentan.
import { esc } from '../../ui/html.js';
import { num, pct, nice, dmy } from '../format.js';
import { createService, SIDES, ACTION_TARGET, RESOLUTION, RESOLUTION_ALL, REOPEN_MAX, AUDIT } from '../service.js';

const PRIOS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];
// Todos los tiempos de la pestaña, en horas: sin decimales desde 10 h («80 h»), con uno como mucho hasta ahí («9,6 h»,
// «2 h») y con dos por debajo de una hora, para que los plazos de 15 y 45 min salgan exactos («0,25 h»).
const HOURS = [0, 1, 2].map((d) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: d }));
export const hours = (min) => { const h = min / 60; return `${HOURS[h >= 10 ? 0 : h >= 1 ? 1 : 2].format(h)} h`; };
const DAY = 1440;

export const servicioTab = (t) => {
  const { m, ch, ui, grid, ask, section, table, selRow } = t;
  const { card, kpis, kpi } = ch;
  const svc = createService(m);
  const prioLabel = (k) => (k === 'all' ? 'Todas' : k === 'REST' ? 'Resto (media y baja)' : nice(k));
  const filterOf = (k) => (PRIOS.includes(k) ? `pr:${m.DI.prio.indexOf(k)}` : '');
  const row = (k, cells) => {
    const f = filterOf(k);
    return `<tr class="${f ? 'mt-clk' : 'mt-tot'} ${selRow(f) ? 'mt-sel' : ''}" ${f ? `data-f="${f}"` : ''}><td>${prioLabel(k)}</td>${cells}</tr>`;
  };
  // una cifra frente a su objetivo: en verde si lo cumple y en ocre si no; sin dato, una raya
  const goal = (v, ok, fmt, tip = '') => (v == null ? '<td class="mt-num">—</td>'
    : `<td class="mt-num ${ok ? 'mt-svc-ok' : 'mt-svc-ko'}" ${tip ? `data-tip="${esc(tip)}"` : ''}>${fmt(v)}</td>`);
  const plain = (v, fmt) => `<td class="mt-num">${v == null ? '—' : fmt(v)}</td>`;
  const sideName = (s) => SIDES.find(([k]) => k === s)[1];
  const groups = (on, n, first) => [[first[0], first[1]], ...on.map((s) => [sideName(s), n])];
  const range = ([a, b]) => `${dmy(m.BASE + a * 6e4)} – ${dmy(m.BASE + (b - DAY) * 6e4)}`;

  // En qué se va el tiempo (service.js, phases): una barra para las escaladas y otra para las que no, cada una con sus
  // tramos apilados (de media por resuelta, en el orden en que pasan), y una fila por lado. Las dos, en la misma escala.
  // Sin escalar no hay Tesc: no tienen tramo de escalado. Cada tramo, de un color (metrics.css, mt-svc-pe y mt-svc-pp).
  const PHASES = [
    ['esc', 'Escaladas', 'pe', [['Hasta escalar (THesc)', 'De la apertura al primer Jira creado después.'],
      ['Escalada en Jira (Tesc)', 'Del Jira más antiguo, también los Discarded, a la resolución del Jira de solución final.'],
      ['Cierre en Remedy (Tcr)', 'De la resolución del Jira de solución final a la resolución en Remedy.']]],
    ['plain', 'Sin escalar', 'pp', [['En cola', 'En Asignada, y lo de antes del primer cambio de estado.'], ['En curso (Tan)', 'En In Progress.'],
      ['Esperando al centro (Tpc)', 'En Pendiente esperando al centro o al cliente.'], ['Otras esperas', 'En Pendiente por otro motivo.']]],
  ];
  // por qué una escalada resuelta no entra en su barra (service.js, phases: out)
  const OUT = [['previous', 'ligadas a un ticket previo'], ['bad', 'mal escaladas'], ['jiraOpen', 'cerradas con el Jira abierto'],
    ['early', 'cerradas en Remedy antes que su Jira'], ['none', 'sin datos de Jira']];
  const timesCard = (S, on) => {
    const total = (p) => (p.n ? p.seg.reduce((a, b) => a + b, 0) : null);
    const max = Math.max(1, ...PHASES.flatMap(([k]) => on.map((s) => total(S[s].phases[k]) || 0)));
    const blocks = PHASES.map(([k, title, cls, segs]) => {
      const rows = on.map((s) => {
        const p = S[s].phases[k], t = total(p), who = sideName(s);
        const left = k === 'esc' ? OUT.filter(([r]) => p.out[r]).map(([r, l]) => `${num(p.out[r])} ${l}`) : [];
        const count = k === 'esc' ? `${num(p.n)} escaladas resueltas${left.length ? `\nFuera: ${left.join(', ')}` : ''}` : `${num(p.n)} resueltas`;
        const empty = k === 'esc' && !m.data.meta.jira?.at ? 'aún no se ha traído nada de Jira: pulsa «Actualizar y generar informe»'
          : left.length ? 'sin escaladas con sus tres tiempos de Jira' : 'sin datos';
        const bar = t == null ? `<em>${empty}</em>`
          : `<span class="mt-svc-stack" style="--mt-at:${(t / max).toFixed(4)}">${p.seg.map((v, j) => `<i class="mt-svc-${cls}${j}" style="flex-grow:${v.toFixed(1)}" data-tip="${esc(`${title} · ${who}\n${segs[j][0]}: ${hours(v)} (${pct(v / t)})\n${count}`)}">${v / max >= 0.08 ? hours(v) : ''}</i>`).join('')}</span><b>${hours(t)}</b>`;
        return `<div class="mt-svc-row" data-tip="${esc(`${title} · ${who}\nEn total, ${t == null ? 'sin datos' : hours(t)} de media · ${count}`)}"><span class="mt-svc-who">${esc(who)}</span><span class="mt-svc-track">${bar}</span></div>`;
      }).join('');
      const legend = `<div class="mt-legend">${segs.map(([l, tip], j) => `<span data-tip="${esc(tip)}"><i class="mt-svc-${cls}${j}"></i>${l}</span>`).join('')}</div>`;
      return `<div class="mt-svc-time"><p class="mt-svc-th"><b>${title}</b></p>${legend}${rows}</div>`;
    }).join('');
    return card('En qué se va el tiempo', `<div class="mt-svc-times">${blocks}</div>`,
      { span: 's12', sub: 'De media por resuelta, cada tramo en el orden en que pasa; la barra entera es su tiempo de resolución medio. Escalada: estuvo en Pendiente con motivo Third Party Vendor Action Reqd; solo cuentan las que tienen sus tres tiempos de Jira, con los tickets creados entre su apertura y su cierre (las notas citan también tickets de otras incidencias). Las dos barras, en la misma escala. Pasa el ratón por un tramo para ver su detalle.' });
  };

  // Tiempo de acción: de cada prioridad, la parte que pasa a En curso dentro de su plazo (cumple con más del 90 %).
  const actionCard = (S, on) => {
    const cells = (k) => `<td class="mt-num">${k === 'all' ? 'Según prioridad' : hours(m.SLA[m.DI.prio.indexOf(k)])}</td>${on.map((s) => {
      const a = S[s].action[k];
      return goal(a.share, a.share > ACTION_TARGET, (v) => pct(v, 1), `${num(a.ok)} dentro y ${num(a.ko)} fuera del plazo`) + plain(a.avg, hours);
    }).join('')}`;
    const body = [...PRIOS, 'all'].filter((k) => k === 'all' || on.some((s) => S[s].action[k].n)).map((k) => row(k, cells(k))).join('');
    return card('Tiempo de acción (Tatt)', table('Prioridad', [['Plazo', 'Tiempo de acción de la oferta.'], ...on.flatMap(() => [['Dentro del plazo', `Cumple con más del ${pct(ACTION_TARGET)}: de la apertura al primer paso a En curso.`], ['Media', 'Media de la apertura al primer paso a En curso.']])],
      body, groups(on, 2, ['SLA', 1])),
    { span: 's12', sub: `De la apertura al primer paso a En curso. Cumple si más del ${pct(ACTION_TARGET)} pasa dentro del plazo de su prioridad; las cerradas sin pasar por En curso no cuentan y las abiertas que siguen sin empezar pasado el plazo cuentan como fuera. Clic en una prioridad para filtrar.` });
  };

  // Tiempo de resolución medio (MTTR): la media frente al objetivo de cada prioridad y qué parte queda dentro.
  const resolutionCard = (S, on) => {
    const cells = (k, max) => `<td class="mt-num">&lt; ${hours(max)}</td>${on.map((s) => {
      const r = S[s].resolution[k];
      return goal(r.mttr, r.mttr < max, hours, `${num(r.n)} issues`) + plain(r.under, (v) => pct(v, 1));
    }).join('')}`;
    const body = [...RESOLUTION.map(([k, max]) => row(k, cells(k, max))), row('all', cells('all', RESOLUTION_ALL))].join('');
    return card('Tiempo de resolución medio (MTTR)', table('Prioridad', [['Objetivo', 'Tiempo de resolución medio de la oferta.'], ...on.flatMap(() => [['MTTR', 'TTR de las resueltas más lo que llevan las abiertas, entre todas.'], ['Dentro del objetivo', 'Las issues que tardan (o llevan) menos que el objetivo.']])],
      body, groups(on, 2, ['SLA', 1])),
    { span: 's12', sub: 'De la apertura a la resolución; las que siguen abiertas cuentan con lo que llevan hasta la foto (MTTR continuo). Cumple si la media queda por debajo del objetivo de su prioridad. Clic en una prioridad para filtrar.' });
  };

  // Calidad: reapertura (≤ 5 % en todas) y auditoría (pendiente del agente de calidad de la tarea #55).
  const qualityCard = (S, on) => {
    const cells = (k) => `<td class="mt-num">≤ ${pct(REOPEN_MAX)}</td>${on.map((s) => {
      const r = S[s].reopen[k];
      return goal(r.share, r.share <= REOPEN_MAX, (v) => pct(v, 1), `${num(r.re)} de ${num(r.done)} cerradas`);
    }).join('')}`;
    const body = [...PRIOS, 'all'].filter((k) => k === 'all' || on.some((s) => S[s].reopen[k].done)).map((k) => row(k, cells(k))).join('');
    const audit = AUDIT.map(([k, v]) => `<tr><td>${prioLabel(k)}</td><td class="mt-num">${pct(v)}</td>${on.map(() => '<td class="mt-num mt-mut">Pendiente</td>').join('')}</tr>`).join('');
    return card('Calidad de las incidencias', `${table('Prioridad', [['Objetivo', 'Índice de reapertura de la oferta.'], ...on.map(() => ['Reabiertas', 'De las cerradas, las que volvieron de Resuelta a abierta.'])], body, groups(on, 1, ['Reapertura', 1]))}
      ${table('Prioridad', [['Objetivo', 'Auditadas con nota mínima ≥ 3 en T, C, P y CL.'], ...on.map(() => ['Aprobadas', ''])], audit, groups(on, 1, ['Auditoría', 1]))}`,
    { span: 's12', sub: 'Reapertura: de las cerradas, las que volvieron de Resuelta a abierta; cumple con un 5 % o menos en todas las prioridades. Auditoría: las auditadas con nota mínima ≥ 3 en las dimensiones T, C, P y CL; la calculará el agente de calidad de la tarea #55, que aún no está.' });
  };

  // Mes a mes: lo que entra y cuánto de ello se resuelve dentro del mismo mes, y la parte de las resueltas con IA.
  const evolutionCard = (V, on) => {
    const cells = (x) => on.map((s) => `<td class="mt-num">${num(x[s].n)}</td><td class="mt-num">${num(x[s].resolvedIn)}</td><td class="mt-num">${x[s].inShare == null ? '—' : pct(x[s].inShare)}</td>`).join('');
    const body = V.months.map((x) => `<tr class="mt-clk ${selRow(x.f) ? 'mt-sel' : ''}" data-f="${x.f}"><td>${x.label}</td>${cells(x)}</tr>`).join('');
    const tot = `<tr class="mt-tot"><td>Periodo</td>${on.map((s) => { const st = V.stats[s]; return `<td class="mt-num">${num(st.n)}</td><td class="mt-num">${num(st.resolvedIn)}</td><td class="mt-num">${st.inShare == null ? '—' : pct(st.inShare)}</td>`; }).join('')}</tr>`;
    return card('Entrantes frente a resueltas entrantes', table('Mes de apertura', on.flatMap(() => [['Entrantes', 'Abiertas en el mes.'], ['Resueltas entrantes', 'De las que entraron en el mes, las resueltas antes de acabar el mes.'], ['%', '']]),
      body + tot, groups(on, 3, ['', 0]).slice(1)),
    { span: 's12', sub: 'Por mes de apertura. Una issue que entra en el mes y se resuelve después cuenta como entrante, pero no como resuelta entrante; la fila del periodo cuenta lo resuelto antes de que acabe el periodo. * mes en curso. Clic en un mes para filtrar.' });
  };

  // Escalados (con los tickets Jira) y uso de la IA: sin SLA, la cifra de cada lado.
  const escalationCard = (S, on, jira) => {
    const rows = [
      ['THesc', 'De la apertura al primer Jira creado después; los tickets previos a la apertura no cuentan.', (s) => s.esc.thesc, hours, (s) => `${num(s.esc.nThesc)} issues · ${num(s.esc.previous)} con ticket previo`],
      ['Tesc', 'Del Jira más antiguo (también los Discarded) a la resolución del Jira de solución final; solo escaladas.', (s) => s.esc.tesc, hours, (s) => `${num(s.esc.nTesc)} escaladas`],
      ['Tesc-r', 'De la resolución del Jira de solución final a ahora: escaladas que siguen abiertas en Remedy con su Jira ya resuelto.', (s) => s.esc.tescr, hours, (s) => `${num(s.esc.nTescr)} abiertas`],
      ['Escaladas', 'Estuvieron en Pendiente con motivo Third Party Vendor Action Reqd.', (s) => s.esc.n, num],
      ['Mal escaladas', 'Escaladas y cerradas sin ningún Jira suyo (creado entre su apertura y su cierre) que no esté Discarded o cancelado.', (s) => s.esc.bad, num],
      ['Cerradas con el Jira abierto', 'Escaladas cerradas en Remedy con su Jira aún sin resolver.', (s) => s.esc.jiraOpen, num],
      ['Cerradas antes que su Jira', 'Escaladas que se cerraron en Remedy antes de que se resolviera su Jira de solución final: sin Tcr.', (s) => s.esc.early, num],
      ['Uso de la IA', 'De las resueltas, las que tienen una nota [ANALISIS_IA], [DIAGNOSTICO_IA] o [ANTECEDENTES_IA].', (s) => s.ia.share, (v) => pct(v, 1), (s) => `${num(s.ia.ia)} de ${num(s.ia.done)} resueltas`],
    ];
    const body = rows.map(([label, tip, val, fmt, sub]) => `<tr><td data-tip="${esc(tip)}">${label}</td>${on.map((s) => {
      const v = val(S[s]);
      return `<td class="mt-num" ${sub ? `data-tip="${esc(sub(S[s]))}"` : ''}>${v == null ? '—' : fmt(v)}</td>`;
    }).join('')}</tr>`).join('');
    const note = !jira?.at ? ' THesc, Tesc y Tesc-r salen de Jira: aún no se ha traído nada.' : jira.message ? ` Última vez que se pudo traer de Jira: ${dmy(Date.parse(jira.at))}.` : '';
    return card('Escalados y uso de la IA', table('Métrica', on.map((s) => [sideName(s), '']), body),
      { span: 's12', sub: `Sin SLA en la oferta: la cifra de cada uno. Los tiempos de escalado, con los tickets Jira de cada issue (los del ticket de tercero y los que se citan en las notas).${note}` });
  };

  return () => {
    ui.svc ||= { prev: false, ts: false };
    const on = ['us', ...['prev', 'ts'].filter((s) => ui.svc[s])];
    const V = svc.compute(), S = V.stats, us = S.us, jira = m.data.meta.jira;
    const toggles = `<div class="mt-svc-bar"><span>Comparar con</span>${[['prev', `Mismo periodo del año anterior (${range(V.periods.prev)})`], ['ts', 'T-Systems']].map(([k, l]) => `<button class="mt-btn ${ui.svc[k] ? 'mt-on' : ''}" data-svc="${k}" aria-pressed="${ui.svc[k]}">${esc(l)}</button>`).join('')}</div>`;
    const notes = [
      ui.svc.prev && V.periods.prevCover !== 'full' ? `${V.periods.prevCover === 'none' ? 'No hay' : 'Faltan'} datos del año anterior para este periodo: se traen de Snowflake con la próxima actualización («Actualizar y generar informe»).` : '',
      jira?.message ? `Jira: ${jira.message}` : '',
    ].filter(Boolean).map((n) => `<p class="mt-note">${esc(n)}</p>`).join('');
    const all = us.resolution.all;
    return grid(ask('servicio'), toggles, notes,
      kpis(kpi('Entrantes', num(us.n), 'abiertas en el periodo'), kpi('Resueltas entrantes', num(us.resolvedIn), us.inShare == null ? '' : `${pct(us.inShare)} de las entrantes`),
        kpi('Tiempo de acción', us.action.all.share == null ? '—' : pct(us.action.all.share, 1), `dentro del plazo · objetivo > ${pct(ACTION_TARGET)}`, us.action.all.share == null ? '' : us.action.all.share > ACTION_TARGET ? 'mt-svc-ok' : 'mt-svc-ko'),
        kpi('MTTR', all.mttr == null ? '—' : hours(all.mttr), `todas · objetivo < ${hours(RESOLUTION_ALL)}`, all.mttr == null ? '' : all.mttr < RESOLUTION_ALL ? 'mt-svc-ok' : 'mt-svc-ko'),
        kpi('Reapertura', us.reopen.all.share == null ? '—' : pct(us.reopen.all.share, 1), `de las cerradas · objetivo ≤ ${pct(REOPEN_MAX)}`, us.reopen.all.share == null ? '' : us.reopen.all.share <= REOPEN_MAX ? 'mt-svc-ok' : 'mt-svc-ko'),
        kpi('Uso de la IA', us.ia.share == null ? '—' : pct(us.ia.share, 1), 'de las resueltas, con nota _IA')),
      section('¿Cuánto tardamos?'), timesCard(S, on),
      section('¿Cumplimos los SLA?'), actionCard(S, on), resolutionCard(S, on), qualityCard(S, on),
      section('¿Cómo evoluciona?'), evolutionCard(V, on),
      section('¿Y lo escalado?'), escalationCard(S, on, jira));
  };
};
