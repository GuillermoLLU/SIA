// Escalados (resolution.js): qué escalamos y a quién. Dos vistas (ui.escNow; metrics-view.js, data-esc-mode):
//   Activas   lo que sigue abierto y ha estado en Pendiente de un tercero, a fecha de la última carga y sea cual sea el
//             periodo (m.today). Se abre así llegando desde Backlog o desde el enlace de Pendiente (proveedor) de Foto de hoy o del Resumen.
//   Histórico lo escalado y resuelto del periodo. Se abre así llegando desde cualquier otra pestaña.
// Arriba sus tiempos medios, la comparativa de los proyectos Jira que se elijan frente a la media y, debajo, los proyectos
// Jira, los malos escalados y la sábana. Pinchar proyectos en la comparativa filtra esta pestaña (no las demás): lo de
// arriba y lo de abajo. No se compara: se ve el primer lado.
import { esc } from '../../ui/html.js';
import { periodLabel } from '../period.js';
import { num, dur, signedDur } from '../format.js';
import { MISROUTED, JIRA_DISCARDED, JIRA_MOVED } from '../model.js';
import { escalationTimes, jiraComparison, variation, tescOf, hoursOf, mttrOf, idmttr, idmttrOf, JIRA_MAX } from '../resolution.js';
import { SHEET_COLS, sheetBody, incId, remedyUrl } from '../sheet.js';

// lo que cambia de una vista a otra: el nombre del tiempo total y su explicación
const TOTAL = { now: ['Antigüedad media', 'De la apertura a la última carga.'], past: ['Tiempo total medio', 'De la apertura a la resolución.'] };
const compareOf = (now) => [['the', 'THesc medio', 'De la apertura al primer Jira.'], ['tes', 'Tesc medio', 'Del Jira más antiguo a la resolución del Jira de solución o, sin resolver, a la última carga.'], ['total', ...TOTAL[now ? 'now' : 'past']]];
const shared = (label) => SHEET_COLS.find(([l]) => l === label);
const orDash = (v) => (v >= 0 ? dur(v) : '—');
const signed = signedDur;   // lo que sube (+) o baja (−) el MTTR
// Los tiempos de una incidencia escalada. THesc y Tesc, de sus tickets Jira (un ticket previo, sin dato; con el Jira aún
// sin resolver, Tesc hasta la última carga); Tesc-r, lo que lleva su Jira resuelto sin cerrarse en Remedy; su tiempo
// (hoursOf): en Activas, la antigüedad; en Histórico, el tiempo total (hasta la resolución o, abierta, hasta la última
// carga); IDMTTR, frente al MTTR de todo el periodo (base, mttrOf). En Histórico, la sábana es de lo resuelto: sin Tesc-r.
const timeCols = (base, now, open = now) => [
  ['THesc', (m, i) => orDash(m.C.the?.[i] ?? -1), 'num'],
  ['Tesc', (m, i) => orDash(tescOf(m, i)), 'num'],
  ...(open ? [['Tesc-r', (m, i) => orDash(m.C.tsr?.[i] ?? -1), 'num']] : []),
  [now ? 'Antigüedad' : 'Tiempo total', (m, i) => dur(hoursOf(m, i)), 'num'],
  ['IDMTTR', (m, i) => signed(idmttr(hoursOf(m, i), base)), 'num'],
];
// El título de la sábana: lo que hay del primer guion en adelante («TDA 123 - No imprime» → «No imprime»); sin guion, o
// sin nada detrás, entero.
export const afterDash = (s = '') => { const k = s.indexOf('-'); return (k < 0 ? '' : s.slice(k + 1).trim()) || s; };
// La sábana: sus datos y sus tiempos, sin estado ni módulo.
const escalatedCols = (base, now) => [
  shared('Incidencia'),
  ['Proyecto Jira', (m, i) => (m.C.vp[i] ? m.DIMS.vp.label(m.C.vp[i]) : '')],
  ['Título', (m, i) => afterDash(m.C.su[i])], shared('Prioridad'), shared('Responsable'), shared('Centro'), shared('Vendor Ticket Number'),
  ...timeCols(base, now),
];
// Por qué es un mal escalado: algún ticket suyo se descartó en Jira o pasó de un equipo a otro (server/metrics/escalation.js).
const whyBad = (m, i) => [m.C.fl[i] & JIRA_DISCARDED && 'Descartado en Jira', m.C.fl[i] & JIRA_MOVED && 'Cambió de equipo'].filter(Boolean).join(' y ');
// Los malos escalados, con sus tiempos (timeCols; en Histórico también los hay abiertos: con Tesc-r)
const badCols = (base, now) => [
  shared('Incidencia'),
  ['Motivo', whyBad],
  // sin dato si aún no se ha pedido su historial a Jira (lo trae «Actualizar y generar informe»)
  ['Equipo original → final', (m, i) => m.DI.vhops?.[m.C.vh?.[i]] || (m.C.fl[i] & JIRA_MOVED ? 'Pendiente de actualizar' : '')],
  ['Proyecto Jira', (m, i) => (m.C.vp[i] ? m.DIMS.vp.label(m.C.vp[i]) : '')],
  shared('Vendor Ticket Number'), shared('Título'), shared('Estado'), shared('Responsable'), shared('Centro'), shared('Módulo'),
  ...timeCols(base, now, true),
];
const x = ({ avg }) => (avg == null ? '—' : dur(avg));

export const escaladosTab = (t) => {
  const { m, ch, ui, name, grid, ask, noK, escd, solved } = t;
  const { CMP, OPEN } = m;
  const { card, kpi, kpis, more, scorecard } = ch;
  // Arriba: cuántas son y sus tiempos. THesc y Tesc salen de sus tickets Jira, así que pueden ser de menos incidencias.
  // las que tienen el Jira aún sin resolver: su Tesc llega hasta la última carga (tescOf), y crece hasta que se resuelva
  const openJira = (t) => (t.jiraOpen ? ` · ${num(t.jiraOpen)} con su Jira aún abierto, hasta hoy` : '');
  // base: el MTTR de todas las incidencias del periodo (A), escaladas o no; el IDMTTR de las de aquí, lo que cambia ese MTTR
  // al quitarlas (idmttrOf): las que no son del periodo no lo mueven
  // noJira: las Sin Jira (cuántas, y si filtran la pestaña: ui.escNoJira; metrics-view.js, data-esc-nojira)
  const timesKpis = (list, A, base, now, noJira) => {
    const t = escalationTimes(m, list), on = !!ui.escNoJira;
    const noJiraKpi = kpi('Sin Jira', num(noJira.length), `${now ? 'pendientes de proveedor ahora' : 'escaladas y resueltas'} sin ticket Jira · ${on ? 'clic para quitar el filtro' : 'clic para verlas'}`,
      `mt-clk${on ? ' mt-on' : ''}`, `data-esc-nojira role="button" tabindex="0" aria-pressed="${on}" data-tip="Sin ningún ticket Jira, ni en Vendor Ticket Number ni en sus notas. Pincha para filtrar por ellas la pestaña."`);
    const withJira = (x) => (t.n ? `de ${num(x.n)} con ese dato en Jira` : now ? 'sin escaladas activas' : 'sin escaladas');
    return kpis(kpi('Incidencias escaladas', num(t.n), now ? 'activas, que han estado en Pendiente de un tercero' : 'resueltas, que estuvieron en Pendiente de un tercero'),
      noJiraKpi, kpi('THesc medio', x(t.the), withJira(t.the)), kpi('Tesc medio', x(t.tes), withJira(t.tes) + openJira(t)),
      kpi(TOTAL[now ? 'now' : 'past'][0], x(t.total), now ? 'de la apertura a la última carga' : 'de la apertura a la resolución'),
      kpi('IDMTTR', base.mttr == null ? '—' : signed(idmttrOf(m, A, list)), base.mttr == null ? 'sin incidencias en el periodo' : `lo que mueven el MTTR del periodo (${dur(base.mttr)}, de ${num(base.n)} incidencias)`));
  };

  // Proyectos Jira frente a la media: cada tiempo es una gráfica de barras horizontales, de partida solo con la media de todo
  // lo escalado a Jira; cada proyecto que se pincha (ui.jiraPick; metrics-view.js, data-jc) añade su barra. Cada una, a su escala.
  const jiraCompare = ({ options, picked, shown, global }, now) => {
    const which = now ? 'activas' : 'resueltas';
    if (!options.length) return card('Proyectos Jira frente a la media', `<p class="mt-mut mt-small">Nada escalado a Jira${now ? ' y activo' : ''} con estos filtros.</p>`, { span: 's12' });
    const full = picked.length >= JIRA_MAX;
    const chooser = `<div class="mt-jc-opts">${options.map((o) => { const on = picked.includes(o.k); return `<button class="mt-jc-opt ${on ? 'mt-on' : ''}" data-jc="${o.k}" aria-pressed="${on}" title="${esc(o.label)}: ${num(o.n)} ${which}. Clic: solo este (otra vez, quitarlo). Ctrl+clic: añadirlo${full && !on ? ` (ya hay ${JIRA_MAX}: el máximo)` : ''}.">${esc(o.label)} <b>${num(o.n)}</b></button>`; }).join('')}</div>`;
    const panel = ([key, title, help]) => {
      const bars = [{ label: 'Media global', times: global, global: true }, ...shown];
      const max = Math.max(...bars.map((b) => b.times[key].avg || 0)) || 1, at = (v) => (v / max * 100).toFixed(2);
      const base = global[key].avg;
      const row = (b) => {
        const t = b.times[key], change = b.global ? null : variation(t.avg, base);
        const against = !change || t.avg === base ? '' : `\n${change.text} frente a la media global (${dur(base)})`;
        const open = key === 'tes' && b.times.jiraOpen ? `\n${num(b.times.jiraOpen)} con su Jira aún abierto: su Tesc llega hasta hoy` : '';
        const tip = `${b.label}\n${title}: ${t.avg == null ? 'sin dato' : dur(t.avg)}\nDe ${num(t.n)} incidencias${against}${open}`;
        return `<div class="mt-jc-row" data-tip="${esc(tip)}"><span class="mt-jc-x ${b.global ? 'mt-jc-gx' : ''}">${esc(b.label.replace(/^[A-Z]+ · /, ''))}</span>
          <span class="mt-jc-track">${t.avg == null ? '' : `<i class="${b.global ? 'mt-jc-global' : 'mt-c0'}" style="width:${at(t.avg)}%"></i>`}${base == null ? '' : `<span class="mt-jc-line" style="left:${at(base)}%"></span>`}</span>
          <span class="mt-jc-v">${x(t)}</span><span class="mt-jc-d ${change?.cls || ''}">${change?.text || ''}</span></div>`;
      };
      return `<div class="mt-jc-panel"><h4 data-tip="${esc(help)}">${title}</h4><div class="mt-jc-plot">${bars.map(row).join('')}</div></div>`;
    };
    const filtering = picked.length ? `<p class="mt-jc-on">Pestaña filtrada por ${picked.length === 1 ? 'este proyecto' : `estos ${picked.length} proyectos`}: las cifras de arriba, los proyectos, los malos escalados y la sábana. <button class="mt-jc-clear" data-jc-clear>Quitar filtro</button></p>` : '';
    return card('Proyectos Jira frente a la media', `${chooser}${filtering}<div class="mt-jc-panels">${compareOf(now).map(panel).join('')}</div>`, { span: 's12',
      sub: `Los tiempos medios de todo lo escalado a Jira y ${now ? 'aún activo' : 'resuelto'}. Pincha un proyecto para ver su barra y filtrar por él el resto de la pestaña; otro clic lo quita. Con Ctrl+clic, se añaden varios, hasta ${JIRA_MAX}. Cada gráfica, a su escala, con el tiempo de las incidencias que tienen ese dato.` });
  };

  // cómo se agrupa la tabla de lo escalado: [dimensión, en el selector, título de la tabla, de qué va, de qué es el total]
  const BY = [['vp', 'Proyecto Jira', 'Proyectos Jira', 'por el proyecto Jira de su ticket de tercero; ITSMECOM, por su equipo asignado en Jira.', ' a Jira'],
    ['mo', 'Módulo', 'Módulos', 'por el módulo de la incidencia.', ''],
    ['ce', 'Centro', 'Centros', 'por el centro que la abrió.', '']];
  // Activas o Histórico (metrics-view.js, data-esc-mode)
  const modes = (now) => `<div class="mt-seg mt-seg-sm" role="group" aria-label="Qué escalados">${[['now', 'Abiertas ahora', 'Lo escalado que sigue abierto, a fecha de la última carga: no depende de las fechas de arriba.'], ['past', 'Del periodo', `Lo escalado y resuelto en las fechas de arriba: ${periodLabel(m)}.`]]
    .map(([k, l, tip]) => { const on = (k === 'now') === now; return `<button class="mt-seg-b ${on ? 'mt-on' : ''}" data-esc-mode="${k}" aria-pressed="${on}" data-tip="${esc(tip)}">${l}</button>`; }).join('')}</div>`;

  // A: lo del periodo (en Activas, solo para el MTTR del IDMTTR: lo de la pestaña es lo abierto, sea cual sea el periodo)
  // inReport: para el informe Escalados (report.js): sin la pregunta, el selector Activas / Histórico ni la comparativa de
  // proyectos (se elige pinchando); la tabla de lo escalado, con sus tres desgloses uno tras otro
  const view = (A, note = '', inReport = false) => {
    const now = !!ui.escNow;
    const keep = now ? (i) => OPEN[i] && escd(i) : (i) => solved(i) && escd(i);
    const pool = (skip) => (now ? m.today(false, skip) : skip ? m.rows(skip) : A);
    const cmp = jiraComparison(m, pool('vp').filter((i) => keep(i) && !noK(m.C.vp[i])), ui.jiraPick);
    ui.jiraShown = cmp.picked;
    // lo que se ve de la pestaña: sin proyectos elegidos, todo; con ellos, solo lo suyo
    const inPicked = (i) => !cmp.picked.length || cmp.picked.includes(m.C.vp[i]);
    const byAge = (a, b) => m.C.rep[a] - m.C.rep[b];
    // Sin Jira: sin ningún ticket Jira (ni en Vendor Ticket Number ni en sus notas: server/metrics/remedy.js). En Activas,
    // las que están ahora en Pendiente de un tercero (Espera tercero); en Histórico, lo escalado y resuelto del periodo.
    // Pincharlas filtra por ellas la pestaña; no tienen proyecto Jira, así que elegir uno quita ese filtro (metrics-view.js).
    const isNoJira = (i) => (now ? OPEN[i] && m.DIMS.sit.get(i) === 3 : keep(i)) && !m.C.vk[i];
    const noJira = pool().filter(isNoJira), only = ui.escNoJira ? isNoJira : () => true;
    const list = pool().filter((i) => keep(i) && inPicked(i) && only(i)).sort(byAge);
    // los malos escalados: en Activas, los abiertos; en Histórico, los del periodo, abiertos o cerrados
    const bad = pool().filter((i) => (!now || OPEN[i]) && m.C.fl[i] & MISROUTED && inPicked(i) && only(i)).sort(byAge);
    const base = mttrOf(m, A), cols = escalatedCols(base, now);
    ui.escSheet = { list, cols };   // lo que exporta el botón (metrics-view.js)
    const what = now ? 'activo' : 'resuelto';
    // los proyectos Jira a los que se escala (de ITSMECOM, por su equipo asignado), como los módulos; lo activo aún no
    // tiene tiempo de resolución, así que en Activas cuántas, su riesgo y sus tiempos de escalado. El desglose de los
    // tiempos (escTimes), como arriba: THesc, Tesc, en Activas Tesc-r y la antigüedad (en Histórico ya está la media de
    // resolución), y el IDMTTR de cada proyecto, lo que mueve el MTTR del periodo (idmttrOf).
    const escTimes = now ? ['the', 'tes', 'tsr', 'age', 'idm'] : ['the', 'tes', 'idm'];
    const groups = now ? [['Volumen', ['n', 'crit', 'slaKo']], ['Tiempos de escalado', escTimes]]
      : [['Volumen', ['n']], ['Cuánto tarda', ['avg', 'd1', 'd7', 'd15', 'mx']], ['En qué se va', ['tq', 'tc', 'tv']], ['Tiempos de escalado', escTimes]];
    const withTimes = (st, rows) => { st.esc = escalationTimes(m, rows); st.idm = idmttrOf(m, A, rows); };
    // la situación es la de ahora (Asignada, Pendiente…): lo resuelto ya no está en ninguna, así que en Histórico ese
    // filtro lo vacía todo. Se avisa y se ofrece quitarlo (data-only="sit:", metrics-view.js).
    const bySit = !now && m.anySel('sit') ? '<p class="mt-note">Hay un filtro de situación (cómo está ahora la incidencia): lo resuelto no está en ninguna, así que Histórico sale vacío. <button class="mt-jc-clear" data-only="sit:">Quitar el filtro de situación</button> o pasa a Activas.</p>' : '';
    const byNoJira = ui.escNoJira ? '<p class="mt-note">Pestaña filtrada por las Sin Jira: las cifras, los proyectos, los malos escalados y la sábana. <button class="mt-jc-clear" data-esc-nojira>Quitar filtro</button></p>' : '';
    // la tabla de lo escalado, por proyecto Jira (de partida), módulo o centro (ui.escBy; metrics-view.js, data-esc-by):
    // las mismas incidencias y columnas, agrupadas de otra forma. Cada agrupación, sin su propio filtro, para que al
    // pinchar una fila se vean las demás apagadas
    const by = BY.find(([k]) => k === ui.escBy) || BY[0], [dim] = by;
    const byPick = `<div class="mt-esc-by"><span>Agrupar por</span><div class="mt-seg mt-seg-sm" role="group" aria-label="Agrupar lo escalado por">${BY.map(([k, l]) => `<button class="mt-seg-b ${k === dim ? 'mt-on' : ''}" data-esc-by="${k}" aria-pressed="${k === dim}">${l}</button>`).join('')}</div></div>`;
    // en la pestaña, con su título: Desglose de tiempos de escalado (en el informe, las tres, sin él)
    const table = ([d, , title, what1, of], pick = '') => card(inReport ? '' : 'Desglose de tiempos de escalado', pick + scorecard(d, groups,
      // en el informe, cada tabla con todos sus filtros: solo los equipos de Jira marcados (report.js, PICKS)
      { id: `rs-${d}`, rows: pool(inReport ? undefined : d).filter((i) => keep(i) && inPicked(i) && only(i)), skip: noK, extra: withTimes, refLabel: cmp.picked.length ? 'Lo elegido' : `Todo lo escalado${of}`, title,
        n: now ? ['Activas', `Escaladas activas y su parte del total escalado${of}.`] : ['Resueltas', `Escaladas resueltas y su parte del total escalado${of}.`] }),
      { span: 's12', sub: `Lo escalado y ${what}, ${what1}${inReport ? '' : ' Clic en una fila para filtrar.'}` });
    const top = inReport ? [note, bySit, timesKpis(list, A, base, now, noJira), byNoJira, ...BY.map((b) => table(b))]
      : [ask('escalados', false), modes(now), note, bySit, timesKpis(list, A, base, now, noJira), byNoJira, jiraCompare(cmp, now), table(by, byPick)];
    // Malos escalados, en la pestaña: a la izquierda, cada cambio de equipo (original → final) y cuántas, que filtra toda la
    // página al pincharlo (los que no cambiaron de equipo: descartados en Jira o aún sin dato, juntos); a la derecha, sus
    // incidencias (id y resumen), en una lista con scroll
    // Los cambios de equipo, sin su propio filtro: el elegido se destaca y los demás siguen (apagados). Clic: solo ese;
    // Ctrl+clic: sumarlo o quitarlo (data-only, como los selectores).
    const badAll = pool('mb').filter((i) => (!now || OPEN[i]) && m.C.fl[i] & MISROUTED && inPicked(i) && only(i));
    const badTab = () => {
      if (!badAll.length) return `<p class="mt-mut mt-small">Ningún mal escalado${now ? ' activo' : ''} con estos filtros.</p>`;
      // cada cambio de equipo y, de los que no cambiaron, en qué proyecto se descartaron (model.js, DIMS.mb)
      const groups = new Map(), any = m.anySel('mb');
      for (const i of badAll) { const k = m.DIMS.mb.get(i); groups.set(k, (groups.get(k) || 0) + 1); }
      const label = (k) => m.DIMS.mb.label(k);
      const rows = [...groups].sort((a, b) => b[1] - a[1] || label(a[0]).localeCompare(label(b[0])))
        .map(([k, n]) => `<tr class="mt-clk ${m.isSel('mb', k) ? 'mt-sel' : any ? 'mt-off' : ''}" data-only="mb:${k}" data-tip="${esc(`${label(k)}
${num(n)} incidencias. Clic: filtrar toda la página por este. Ctrl+clic: sumarlo o quitarlo.`)}"><td>${esc(label(k))}</td><td class="mt-num">${num(n)}</td></tr>`).join('');
      const list = bad.map((i) => `<tr><td><a href="${remedyUrl(m.C.id[i])}" target="_blank" rel="noopener">${incId(m.C.id[i])}</a></td><td class="mt-subj" data-tip="${esc(m.C.su[i])}">${esc(m.C.su[i])}</td></tr>`).join('');
      return `<div class="mt-bad"><div class="mt-bad-list"><table><thead><tr><th>Equipo original → final o dónde se descartó</th><th class="mt-num">Incidencias</th></tr></thead><tbody>${rows}</tbody></table></div>
        <div class="mt-bad-list"><table><thead><tr><th>Incidencia</th><th>Resumen</th></tr></thead><tbody>${list}</tbody></table></div></div>`;
    };
    return grid(...top,
      !inReport ? card('Malos escalados', badTab(), { span: 's12', tip: `${now ? 'Incidencias activas' : 'Incidencias del periodo, abiertas o cerradas,'} con algún ticket que se descartó en Jira o pasó de un equipo a otro: se escaló a quien no era. A la izquierda, cada cambio de equipo; clic para filtrar. A la derecha, sus incidencias.` }) :
      card('Malos escalados', sheetBody(m, bad, { ui, id: 'esc-bad', expanded: ui.exp['esc-bad'], more, empty: `Ningún mal escalado${now ? ' activo' : ''} con estos filtros.`, cols: badCols(base, now), exportable: false }),
        { span: 's12', sub: `${now ? 'Incidencias activas' : 'Incidencias del periodo, abiertas o cerradas,'} con algún ticket que se descartó en Jira o pasó de un equipo a otro: se escaló a quien no era. De la más antigua a la más reciente.` }),
      // la sábana ya no se ve: se exporta desde los tres puntos (Exportar sábana a CSV; ui.escSheet); solo con ui.showSheet (los tests)
      inReport || !ui.showSheet ? '' : card('Sábana de incidencias', sheetBody(m, list, { ui, id: 'esc-sheet', expanded: ui.exp['esc-sheet'], more, empty: `Ninguna incidencia escalada${now ? ' activa' : ''} con estos filtros.`, cols }),
        { span: 's12', sub: `Las incidencias escaladas y ${now ? 'activas' : 'resueltas'} de esta pestaña, con sus filtros, de la más antigua a la más reciente. Exportar a CSV las descarga todas, con su enlace a Remedy.` }));
  };

  return (A, { inReport = false } = {}) => {
    if (CMP()) return m.alone((A1) => view(A1, `<p class="mt-note">Esta pestaña no compara: se ve solo ${esc(name(0))}.</p>`, inReport));
    return view(A, '', inReport);
  };
};
