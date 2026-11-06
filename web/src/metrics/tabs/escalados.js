// Escalados (resolution.js): qué escalamos y a quién, de lo resuelto: arriba sus tiempos medios, la comparativa de los
// proyectos Jira que se elijan frente a la media y, debajo, los proyectos Jira, los malos escalados y la sábana. Pinchar
// proyectos en la comparativa filtra esta pestaña (no las demás): lo de arriba y lo de abajo. No se compara: se ve el primer lado.
import { esc } from '../../ui/html.js';
import { num, dur } from '../format.js';
import { MISROUTED, JIRA_DISCARDED, JIRA_MOVED } from '../model.js';
import { escalationTimes, jiraComparison, variation, JIRA_MAX } from '../resolution.js';
import { SHEET_COLS, sheetBody } from '../sheet.js';

const COMPARE = [['the', 'THesc medio', 'De la apertura al primer Jira.'], ['tes', 'Tesc medio', 'Del Jira más antiguo a la resolución del Jira de solución.'], ['total', 'Tiempo total medio', 'De la apertura a la resolución.']];
const shared = (label) => SHEET_COLS.find(([l]) => l === label);
const orDash = (v) => (v >= 0 ? dur(v) : '—');
// La sábana de lo escalado y resuelto: sus datos y sus tiempos. THesc y Tesc, de sus tickets Jira (un ticket previo, sin dato).
const ESCALATED_COLS = [
  shared('Incidencia'),
  ['Proyecto Jira', (m, i) => (m.C.vp[i] ? m.DIMS.vp.label(m.C.vp[i]) : '')],
  shared('Título'), shared('Prioridad'), shared('Responsable'), shared('Centro'), shared('Módulo'), shared('Vendor Ticket Number'),
  ['THesc', (m, i) => orDash(m.C.the?.[i] ?? -1), 'num'],
  ['Tesc', (m, i) => orDash(m.C.tes?.[i] ?? -1), 'num'],
  ['Tiempo total', (m, i) => dur(m.C.res[i] - m.C.rep[i]), 'num'],
];
// Por qué es un mal escalado: algún ticket suyo se descartó en Jira o pasó de un equipo a otro (server/metrics/escalation.js).
const whyBad = (m, i) => [m.C.fl[i] & JIRA_DISCARDED && 'Descartado en Jira', m.C.fl[i] & JIRA_MOVED && 'Cambió de equipo'].filter(Boolean).join(' y ');
const BAD_COLS = [
  shared('Incidencia'),
  ['Motivo', whyBad],
  // sin dato si aún no se ha pedido su historial a Jira (lo trae «Actualizar y generar informe»)
  ['Equipo original → final', (m, i) => m.DI.vhops?.[m.C.vh?.[i]] || (m.C.fl[i] & JIRA_MOVED ? 'Pendiente de actualizar' : '')],
  ['Proyecto Jira', (m, i) => (m.C.vp[i] ? m.DIMS.vp.label(m.C.vp[i]) : '')],
  shared('Vendor Ticket Number'), shared('Título'), shared('Estado'), shared('Responsable'), shared('Centro'), shared('Módulo'),
];
const x = ({ avg }) => (avg == null ? '—' : dur(avg));
// la diferencia entre dos tiempos, con signo
const durDiff = (a, b) => (a == null || b == null ? '—' : `${a >= b ? '+' : '−'}${dur(Math.abs(a - b))}`);

export const escaladosTab = (t) => {
  const { m, ch, ui, name, grid, ask, noK, escd, solved } = t;
  const { CMP } = m;
  const { card, kpi, kpis, more, scorecard } = ch;
  // Arriba: cuántas son y sus tiempos. THesc y Tesc salen de sus tickets Jira, así que pueden ser de menos incidencias.
  const timesKpis = (done) => {
    const t = escalationTimes(m, done);
    const withJira = (x) => (t.n ? `de ${num(x.n)} con ese dato en Jira` : 'sin escaladas');
    return kpis(kpi('Incidencias escaladas', num(t.n), 'resueltas, que estuvieron en Pendiente de un tercero'),
      kpi('THesc medio', x(t.the), withJira(t.the)), kpi('Tesc medio', x(t.tes), withJira(t.tes)),
      kpi('Tiempo total medio', x(t.total), 'de la apertura a la resolución'));
  };

  // Proyectos Jira frente a la media: cada tiempo es una gráfica de barras horizontales, de partida solo con la media de todo
  // lo escalado a Jira; cada proyecto que se pincha (ui.jiraPick; metrics-view.js, data-jc) añade su barra. Cada una, a su escala.
  const jiraCompare = ({ options, picked, shown, global }) => {
    if (!options.length) return card('Proyectos Jira frente a la media', '<p class="mt-mut mt-small">Nada escalado a Jira con estos filtros.</p>', { span: 's12' });
    const full = picked.length >= JIRA_MAX;
    const chooser = `<div class="mt-jc-opts">${options.map((o) => { const on = picked.includes(o.k); return `<button class="mt-jc-opt ${on ? 'mt-on' : ''}" data-jc="${o.k}" aria-pressed="${on}" ${!on && full ? 'disabled' : ''} title="${esc(o.label)}: ${num(o.n)} resueltas">${esc(o.label)} <b>${num(o.n)}</b></button>`; }).join('')}</div>`;
    const panel = ([key, title, help]) => {
      const bars = [{ label: 'Media global', times: global, global: true }, ...shown];
      const max = Math.max(...bars.map((b) => b.times[key].avg || 0)) || 1, at = (v) => (v / max * 100).toFixed(2);
      const base = global[key].avg;
      const row = (b) => {
        const t = b.times[key], change = b.global ? null : variation(t.avg, base);
        const against = !change || t.avg === base ? '' : `\n${change.text} frente a la media global (${dur(base)})`;
        const tip = `${b.label}\n${title}: ${t.avg == null ? 'sin dato' : dur(t.avg)}\nDe ${num(t.n)} incidencias${against}`;
        return `<div class="mt-jc-row" data-tip="${esc(tip)}"><span class="mt-jc-x ${b.global ? 'mt-jc-gx' : ''}">${esc(b.label.replace(/^[A-Z]+ · /, ''))}</span>
          <span class="mt-jc-track">${t.avg == null ? '' : `<i class="${b.global ? 'mt-jc-global' : 'mt-c0'}" style="width:${at(t.avg)}%"></i>`}${base == null ? '' : `<span class="mt-jc-line" style="left:${at(base)}%"></span>`}</span>
          <span class="mt-jc-v">${x(t)}</span><span class="mt-jc-d ${change?.cls || ''}">${change?.text || ''}</span></div>`;
      };
      return `<div class="mt-jc-panel"><h4 data-tip="${esc(help)}">${title}</h4><div class="mt-jc-plot">${bars.map(row).join('')}</div></div>`;
    };
    const filtering = picked.length ? `<p class="mt-jc-on">Pestaña filtrada por ${picked.length === 1 ? 'este proyecto' : `estos ${picked.length} proyectos`}: las cifras de arriba, los proyectos, los malos escalados y la sábana. <button class="mt-jc-clear" data-jc-clear>Quitar filtro</button></p>` : '';
    return card('Proyectos Jira frente a la media', `${chooser}${filtering}<div class="mt-jc-panels">${COMPARE.map(panel).join('')}</div>`, { span: 's12',
      sub: `Los tiempos medios de todo lo escalado a Jira y resuelto. Pincha un proyecto para añadir su barra y filtrar por él el resto de la pestaña, hasta ${JIRA_MAX}; otro clic lo quita. Cada gráfica, a su escala, con el tiempo de las incidencias que tienen ese dato.` });
  };

  const view = (A, note = '') => {
    const cmp = jiraComparison(m, m.rows('vp').filter((i) => solved(i) && escd(i) && !noK(m.C.vp[i])), ui.jiraPick);
    ui.jiraShown = cmp.picked;
    // lo que se ve de la pestaña: sin proyectos elegidos, todo; con ellos, solo lo suyo
    const inPicked = (i) => !cmp.picked.length || cmp.picked.includes(m.C.vp[i]);
    const done = A.filter((i) => solved(i) && escd(i) && inPicked(i)).sort((a, b) => m.C.rep[a] - m.C.rep[b]);
    const bad = A.filter((i) => m.C.fl[i] & MISROUTED && inPicked(i)).sort((a, b) => m.C.rep[a] - m.C.rep[b]);
    ui.escSheet = { list: done, cols: ESCALATED_COLS };   // lo que exporta el botón (metrics-view.js)
    return grid(ask('escalados'), note, timesKpis(done), jiraCompare(cmp),
    // los proyectos Jira a los que se escala (de ITSMECOM, por su equipo asignado), como los módulos: lo escalado y resuelto
    card('', scorecard('vp', [['Volumen', ['n']], ['Cuánto tarda', ['avg', 'd1', 'd7', 'd15', 'mx']], ['En qué se va', ['tq', 'tc', 'tv']]],
      { id: 'rs-vp', rows: m.rows('vp').filter((i) => solved(i) && escd(i) && inPicked(i)), skip: noK, refLabel: cmp.picked.length ? 'Lo elegido' : 'Todo lo escalado a Jira', title: 'Proyectos Jira', n: ['Resueltas', 'Escaladas resueltas y su parte del total escalado a Jira.'] }),
      { span: 's12', sub: 'Lo escalado y resuelto, por el proyecto Jira de su ticket de tercero; ITSMECOM, por su equipo asignado en Jira. Clic en un proyecto para filtrar.' }),
    card('Malos escalados', sheetBody(m, bad, { id: 'esc-bad', expanded: ui.exp['esc-bad'], more, empty: 'Ningún mal escalado con estos filtros.', cols: BAD_COLS, exportable: false }), { span: 's12', sub: 'Incidencias del periodo, abiertas o cerradas, con algún ticket que se descartó en Jira o pasó de un equipo a otro: se escaló a quien no era. De la más antigua a la más reciente.' }),
    card('Sábana de incidencias', sheetBody(m, done, { id: 'esc-sheet', expanded: ui.exp['esc-sheet'], more, empty: 'Ninguna incidencia escalada con estos filtros.', cols: ESCALATED_COLS }), { span: 's12', sub: 'Las incidencias escaladas y resueltas de esta pestaña, con sus filtros, de la más antigua a la más reciente. Exportar a CSV las descarga todas, con su enlace a Remedy.' }));
  };

  return (A) => {
    if (CMP()) return m.alone((A1) => view(A1, `<p class="mt-note">Esta pestaña no compara: se ve solo ${esc(name(0))}.</p>`));
    return view(A);
  };
};
