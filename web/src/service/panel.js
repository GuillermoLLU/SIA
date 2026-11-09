// Lo que enseña la vista de Métricas del servicio (sin DOM): cada métrica en el periodo, con su objetivo por prioridad y
// si se cumple cuando tiene SLA, y su valor día a día. Solo Indra, salvo que se compare (ui.svc) con el mismo periodo
// del año anterior o con T-Systems. t: lo común de las pestañas de las Métricas (metrics/tabs/common.js).
import { esc } from '../ui/html.js';
import { num, pct, dur, dmy, nice } from '../metrics/format.js';
import { createService, SIDES, PRIORITIES, ACTION_TARGET, RESOLUTION, RESOLUTION_ALL, REOPEN_MAX, AUDIT } from './service.js';

export const NO_DATA = 'sin datos';
const prioLabel = (k) => (k === 'all' ? 'Todas' : k === 'REST' ? 'Resto (media y baja)' : nice(k));

export const servicePanel = (t) => {
  const { m, ch, ui, grid, section, table } = t;
  const { card, kpis, kpi } = ch;
  const svc = createService(m);
  const none = `<td class="mt-num mt-mut">${NO_DATA}</td>`;
  // una cifra frente a su objetivo: si lo cumple o no, en color y con su marca; sin dato, lo dice
  const goal = (v, ok, fmt, tip = '') => (v == null ? none
    : `<td class="mt-num ${ok ? 'mt-svc-ok' : 'mt-svc-ko'}" ${tip ? `data-tip="${esc(tip)}"` : ''}>${ok ? '✓' : '✗'} ${fmt(v)}</td>`);
  const plain = (v, fmt, tip = '') => (v == null ? none : `<td class="mt-num" ${tip ? `data-tip="${esc(tip)}"` : ''}>${fmt(v)}</td>`);
  const pct1 = (v) => pct(v, 1);
  const sideName = (s) => SIDES.find(([k]) => k === s)[1];
  const groups = (on, n, first) => [...(first ? [first] : []), ...on.map((s) => [sideName(s), n])];
  const dayName = (d) => dmy(m.BASE + d * 6e4);
  const range = ([a, b]) => `${dayName(a)} – ${dayName(b - 1440)}`;

  // La tabla de un periodo: una fila por prioridad; cells(k), las celdas de esa fila.
  const periodRows = (keys, cells) => keys.map((k) => `<tr class="${k === 'all' ? 'mt-tot' : ''}"><td>${prioLabel(k)}</td>${cells(k)}</tr>`).join('');

  // El día a día de una métrica: una fila por día y, por cada lado, las celdas de cols ([nombre, nota, (cifras del día) => celda]).
  const dayTable = (V, on, cols) => {
    const rows = V.days.map((d, j) => `<tr><td>${dayName(d)}</td>${on.map((s) => {
      const fig = V.daily[s][j];
      return cols.map(([, , cell]) => (fig ? cell(fig) : none)).join('');
    }).join('')}</tr>`).join('');
    const heads = on.flatMap(() => cols.map(([l, tip]) => [l, tip]));
    return `<details class="sv-days" open><summary>Día a día (${num(V.days.length)} ${V.days.length === 1 ? 'día' : 'días'})</summary><div class="sv-days-scroll">${table('Día', heads, rows, groups(on, cols.length))}</div></details>`;
  };

  const byPrio = (o) => PRIORITIES.filter((k) => o[k].ok + o[k].ko).map((k) => `${prioLabel(k)}: ${pct1(o[k].share)} (${num(o[k].ok)} dentro y ${num(o[k].ko)} fuera)`).join('\n');
  const resByGroup = (o) => RESOLUTION.filter(([k]) => o[k].n).map(([k, max]) => `${prioLabel(k)}: ${dur(o[k].mttr)} (objetivo < ${dur(max)})`).join('\n');

  // Tiempo de acción: de cada prioridad, la parte que pasa a En curso dentro de su plazo (cumple con más del 90 %).
  const actionCard = (V, on) => {
    const S = V.stats;
    const cells = (k) => `<td class="mt-num">${k === 'all' ? 'Según prioridad' : dur(m.SLA[m.DI.prio.indexOf(k)])}</td>${on.map((s) => {
      const a = S[s].action[k];
      return goal(a.share, a.share > ACTION_TARGET, pct1, `${num(a.ok)} dentro y ${num(a.ko)} fuera del plazo`) + plain(a.avg, dur);
    }).join('')}`;
    const keys = [...PRIORITIES.filter((k) => m.DI.prio.includes(k)), 'all'];
    return card('Tiempo de acción (Tatt)', table('Prioridad', [['Plazo', 'Tiempo de acción de la oferta.'], ...on.flatMap(() => [['Dentro del plazo', `Cumple con más del ${pct(ACTION_TARGET)}: de la apertura al primer paso a En curso.`], ['Media', 'Media de la apertura al primer paso a En curso.']])],
      periodRows(keys, cells), groups(on, 2, ['SLA', 1]))
      + dayTable(V, on, [
        ['Dentro del plazo', `Cumple con más del ${pct(ACTION_TARGET)}. Pasa el ratón para ver cada prioridad.`, (f) => goal(f.action.all.share, f.action.all.share > ACTION_TARGET, pct1, byPrio(f.action))],
        ['Media', '', (f) => plain(f.action.all.avg, dur)],
      ]),
    { span: 's12', sub: `De la apertura al primer paso a En curso, el día en que pasa. Cumple si más del ${pct(ACTION_TARGET)} pasa dentro del plazo de su prioridad; las cerradas sin pasar por En curso no cuentan y las abiertas sin empezar cuentan como fuera el día en que se les pasa el plazo.` });
  };

  // Tiempo de resolución medio (MTTR): la media de lo resuelto frente al objetivo de cada prioridad.
  const resolutionCard = (V, on) => {
    const S = V.stats;
    const cells = (k, max) => `<td class="mt-num">&lt; ${dur(max)}</td>${on.map((s) => {
      const r = S[s].resolution[k];
      return goal(r.mttr, r.mttr < max, dur, `${num(r.n)} resueltas`) + plain(r.under, pct1);
    }).join('')}`;
    const body = [...RESOLUTION.map(([k, max]) => `<tr><td>${prioLabel(k)}</td>${cells(k, max)}</tr>`), `<tr class="mt-tot"><td>Todas</td>${cells('all', RESOLUTION_ALL)}</tr>`].join('');
    return card('Tiempo de resolución medio (MTTR)', table('Prioridad', [['Objetivo', 'Tiempo de resolución medio de la oferta.'], ...on.flatMap(() => [['MTTR', 'De la apertura a la resolución, de las resueltas.'], ['Dentro del objetivo', 'Las resueltas que tardaron menos que el objetivo.']])],
      body, groups(on, 2, ['SLA', 1]))
      + dayTable(V, on, [['MTTR', `Objetivo de todas: < ${dur(RESOLUTION_ALL)}. Pasa el ratón para ver cada prioridad.`, (f) => goal(f.resolution.all.mttr, f.resolution.all.mttr < RESOLUTION_ALL, dur, resByGroup(f.resolution))]]),
    { span: 's12', sub: 'De la apertura a la resolución, de las resueltas cada día. Cumple si la media queda por debajo del objetivo de su prioridad. Un día sin resueltas no tiene valor.' });
  };

  // Calidad: reapertura (≤ 5 % en todas) y auditoría (las notas aún no llegan: tarea #55).
  const qualityCard = (V, on) => {
    const S = V.stats;
    const cells = (k) => `<td class="mt-num">≤ ${pct(REOPEN_MAX)}</td>${on.map((s) => {
      const r = S[s].reopen[k];
      return goal(r.share, r.share <= REOPEN_MAX, pct1, `${num(r.re)} de ${num(r.done)} cerradas`);
    }).join('')}`;
    const keys = [...PRIORITIES.filter((k) => m.DI.prio.includes(k)), 'all'];
    const audit = AUDIT.map(([k, v]) => `<tr><td>${prioLabel(k)}</td><td class="mt-num">${pct(v)}</td>${on.map(() => none).join('')}</tr>`).join('');
    return card('Calidad de las incidencias', `${table('Prioridad', [['Objetivo', 'Índice de reapertura de la oferta.'], ...on.map(() => ['Reabiertas', 'De las cerradas ese día, las que volvieron de Resuelta a abierta.'])], periodRows(keys, cells), groups(on, 1, ['Reapertura', 1]))}
      ${dayTable(V, on, [['Reabiertas', `Objetivo: ≤ ${pct(REOPEN_MAX)}.`, (f) => goal(f.reopen.all.share, f.reopen.all.share <= REOPEN_MAX, pct1, `${num(f.reopen.all.re)} de ${num(f.reopen.all.done)} cerradas`)]])}
      ${table('Prioridad', [['Objetivo', 'Auditadas con nota mínima ≥ 3 en T, C, P y CL.'], ...on.map(() => ['Aprobadas', ''])], audit, groups(on, 1, ['Auditoría', 1]))}`,
    { span: 's12', sub: 'Reapertura: de las cerradas, las que volvieron de Resuelta a abierta; cumple con un 5 % o menos. Auditoría: las auditadas con nota mínima ≥ 3 en T, C, P y CL; sin datos hasta que las notas del agente de calidad (tarea #55) lleguen a SIA.' });
  };

  // Evolución del número de incidencias y entrantes frente a resueltas entrantes: sin SLA.
  const volumeCard = (V, on) => {
    const row = (label, f) => `<tr class="mt-tot"><td>${label}</td>${on.map((s) => `<td class="mt-num">${num(f[s].n)}</td><td class="mt-num">${num(f[s].resolvedIn)}</td><td class="mt-num">${f[s].inShare == null ? NO_DATA : pct(f[s].inShare)}</td>`).join('')}</tr>`;
    return card('Evolución de las incidencias: entrantes frente a resueltas entrantes', table('', on.flatMap(() => [['Entrantes', 'Abiertas en el periodo.'], ['Resueltas entrantes', 'De las que entraron, las resueltas antes de acabar el periodo.'], ['%', '']]), row('Periodo', V.stats), groups(on, 3))
      + dayTable(V, on, [
        ['Entrantes', 'Abiertas ese día. Un día sin incidencias es 0.', (f) => plain(f.n, num)],
        ['Resueltas entrantes', 'De las que entraron ese día, las resueltas ese mismo día.', (f) => plain(f.resolvedIn, num)],
        ['%', '', (f) => plain(f.inShare, pct)],
      ]),
    { span: 's12', sub: 'Una incidencia que entra y se resuelve después cuenta como entrante, pero no como resuelta entrante.' });
  };

  // Escalados (con los tickets Jira): sin SLA, la cifra de cada lado y su día a día.
  const escalationCard = (V, on, jira) => {
    const S = V.stats;
    const rows = [
      ['THesc', 'De la apertura al primer Jira creado después; los tickets previos a la apertura no cuentan.', (s) => s.esc.thesc, dur, (s) => `${num(s.esc.nThesc)} incidencias · ${num(s.esc.previous)} con ticket previo`],
      ['Tesc', 'Del Jira más antiguo (también los Discarded) a la resolución del Jira de solución final; solo escaladas.', (s) => s.esc.tesc, dur, (s) => `${num(s.esc.nTesc)} escaladas`],
      ['Tesc-r', 'De la resolución del Jira de solución final a ahora: escaladas que siguen abiertas en Remedy con su Jira ya resuelto.', (s) => s.esc.tescr, dur, (s) => `${num(s.esc.nTescr)} abiertas`],
      ['Escaladas', 'Abiertas en el periodo que estuvieron en Pendiente con motivo Third Party Vendor Action Reqd.', (s) => s.esc.n, num],
      ['Sin Jira válido', 'Escaladas y cerradas sin ningún Jira suyo que no esté Discarded o cancelado.', (s) => s.esc.bad, num],
      ['Mal escaladas', 'Algún Jira suyo se descartó o pasó de un equipo a otro. El paso de equipo solo se sabe de los tickets de las abiertas.', (s) => s.esc.misrouted, num],
      ['Cerradas con el Jira abierto', 'Escaladas cerradas en Remedy con su Jira aún sin resolver.', (s) => s.esc.jiraOpen, num],
      ['Cerradas antes que su Jira', 'Escaladas que se cerraron en Remedy antes de que se resolviera su Jira de solución final.', (s) => s.esc.early, num],
    ];
    const body = rows.map(([label, tip, val, fmt, sub]) => `<tr><td data-tip="${esc(tip)}">${label}</td>${on.map((s) => plain(val(S[s]), fmt, sub ? sub(S[s]) : '')).join('')}</tr>`).join('');
    const note = !jira?.at ? ' THesc, Tesc y Tesc-r salen de Jira: aún no se ha traído nada.' : jira.message ? ` Jira no respondió en la última actualización: esas tres métricas no tienen valor desde el ${dmy(Date.parse(jira.at))}.` : '';
    return card('Escalados', table('Métrica', on.map((s) => [sideName(s), '']), body)
      + dayTable(V, on, [
        ['THesc', 'El día en que se crea su primer Jira.', (f) => plain(f.esc.thesc, dur)],
        ['Tesc', 'El día en que se resuelve su Jira de solución final.', (f) => plain(f.esc.tesc, dur)],
        ['Tesc-r', 'El día en que se resuelve su Jira de solución final, de las que siguen abiertas.', (f) => plain(f.esc.tescr, dur)],
      ]),
    { span: 's12', sub: `Sin SLA en la oferta. Los tiempos, con los tickets Jira de cada incidencia; las marcas, de lo abierto en el periodo.${note}` });
  };

  // Uso de la IA: sin SLA.
  const iaCard = (V, on) => card('Uso de la IA', table('', on.map((s) => [sideName(s), '']), `<tr class="mt-tot"><td>Periodo</td>${on.map((s) => plain(V.stats[s].ia.share, pct1, `${num(V.stats[s].ia.ia)} de ${num(V.stats[s].ia.done)} resueltas`)).join('')}</tr>`)
    + dayTable(V, on, [['Uso de la IA', 'De las resueltas ese día.', (f) => plain(f.ia.share, pct1, `${num(f.ia.ia)} de ${num(f.ia.done)} resueltas`)]]),
  { span: 's12', sub: 'De las resueltas, las que tienen una nota [ANALISIS_IA], [DIAGNOSTICO_IA] o [ANTECEDENTES_IA]. Sin objetivo en la oferta.' });

  // period: [d0, d1), en minutos desde BASE.
  return (period) => {
    ui.svc ||= { prev: false, ts: false };
    const on = ['us', ...['prev', 'ts'].filter((s) => ui.svc[s])];
    const V = svc.compute(period), S = V.stats, us = S.us, jira = m.data.meta.jira;
    const toggles = `<div class="mt-svc-bar"><span>Comparar con</span>${[['prev', `Mismo periodo del año anterior (${range(V.prev)})`], ['ts', 'T-Systems']].map(([k, l]) => `<button class="mt-btn ${ui.svc[k] ? 'mt-on' : ''}" data-svc="${k}" aria-pressed="${ui.svc[k]}">${esc(l)}</button>`).join('')}</div>`;
    const notes = [
      ui.svc.prev && V.prevCover !== 'full' ? `${V.prevCover === 'none' ? 'No hay' : 'Faltan'} datos del año anterior para este periodo: para compararlo, elimina el histórico en Métricas y vuelve a cargar eligiendo un periodo que lo incluya.` : '',
      jira?.message ? `Jira: ${jira.message}` : '',
    ].filter(Boolean).map((n) => `<p class="mt-note">${esc(n)}</p>`).join('');
    // en cada cifra de arriba, también lo de los lados con que se compara
    const also = (f) => on.slice(1).map((s) => `${sideName(s)}: ${f(S[s])}`).join(' · ');
    const show = (v, fmt) => (v == null ? NO_DATA : fmt(v));
    const fig = (label, f, fmt, sub, ok) => { const v = f(us); return kpi(label, show(v, fmt), [sub, also((s) => show(f(s), fmt))].filter(Boolean).join(' · '), v == null || ok == null ? '' : ok(v) ? 'mt-svc-ok' : 'mt-svc-ko'); };
    return grid(toggles, notes,
      kpis(fig('Entrantes', (s) => s.n, num, 'abiertas en el periodo'), fig('Resueltas entrantes', (s) => s.resolvedIn, num, us.inShare == null ? '' : `${pct(us.inShare)} de las entrantes`),
        fig('Tiempo de acción', (s) => s.action.all.share, pct1, `dentro del plazo · objetivo > ${pct(ACTION_TARGET)}`, (v) => v > ACTION_TARGET),
        fig('MTTR', (s) => s.resolution.all.mttr, dur, `todas · objetivo < ${dur(RESOLUTION_ALL)}`, (v) => v < RESOLUTION_ALL),
        fig('Reapertura', (s) => s.reopen.all.share, pct1, `de las cerradas · objetivo ≤ ${pct(REOPEN_MAX)}`, (v) => v <= REOPEN_MAX),
        fig('Uso de la IA', (s) => s.ia.share, pct1, 'de las resueltas, con nota _IA')),
      section('¿Cumplimos los SLA?'), actionCard(V, on), resolutionCard(V, on), qualityCard(V, on),
      section('¿Cómo evoluciona?'), volumeCard(V, on), iaCard(V, on),
      section('¿Y lo escalado?'), escalationCard(V, on, jira));
  };
};
