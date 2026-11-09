// Análisis tiempos: en qué se va el tiempo de lo que se mira (phases.js): las dos barras, sin escalar y escalado, con
// lo que pasa cada fase de media. Comparando, una fila por lado en cada barra (con personas, una empresa es todo su
// equipo). Antes, arriba de Resolución. Dos vistas (ui.timesNow; metrics-view.js, data-times-mode):
//   Actual     lo que sigue abierto, a fecha de la última carga y sea cual sea el periodo: lo que llevan hasta hoy
//   Histórico  lo resuelto de lo recibido en el periodo (de partida)
// Debajo, el desglose por módulo afectado (phases.js, modulesTimes): de más a menos tiempo total, para ver qué nos ocupa
// más, con su parte del total, su media y en qué se le va; sigue el mismo selector. Clic en un módulo, filtrar por él.
// Y los problemas comunes (phases.js, problemsTimes; server/metrics/problems.js): qué problemas afectan más, por lo que
// dice el centro al abrir y el título, de más a menos incidencias, con su tiempo y sus módulos. Clic, filtrar por él.
// Abajo del todo, la sábana de esas incidencias (las mismas que cuentan las tablas: lo abierto o lo resuelto, con los
// filtros de arriba; pinchar un módulo o un problema la filtra), con su tiempo; se exporta (metrics-view.js).
import { esc } from '../../ui/html.js';
import { SHEET_COLS, sheetBody } from '../sheet.js';
import { afterDash } from './escalados.js';
import { num, pct, dur } from '../format.js';
import { phasesOf, phasesNowOf, phasesChart, PHASES_NOTE, PHASES_NOW_NOTE, modulesTimes, PARTS, problemsTimes } from '../phases.js';

const TOP = 15;   // los módulos que se ven; el resto, en una fila

export const tiemposTab = (t) => {
  const { m, ch, ui, grid, ask, name } = t;
  const { CMP, CO, OPEN, bySide } = m;
  const past = phasesOf(m), now = phasesNowOf(m);
  const modes = (on) => `<div class="mt-seg mt-seg-sm" role="group" aria-label="Qué tiempos">${[['now', 'Actual', 'Lo que sigue abierto, a fecha de la última carga: lo que llevan hasta hoy. No depende del periodo.'], ['past', 'Histórico', 'Lo resuelto de lo recibido en el periodo.']]
    .map(([k, l, tip]) => { const a = (k === 'now') === on; return `<button class="mt-seg-b ${a ? 'mt-on' : ''}" data-times-mode="${k}" aria-pressed="${a}" data-tip="${esc(tip)}">${l}</button>`; }).join('')}</div>`;
  const timesCard = (A) => {
    const on = !!ui.timesNow, phases = on ? now : past;
    // lo actual: lo abierto ahora de cada lado, se abriera cuando se abriera; lo histórico, lo del periodo
    const T = on ? bySide(m.today()).map((l) => l.filter((i) => OPEN[i])) : bySide(A);
    const rows = CMP() ? T.slice(0, 2).map((l, k) => ({ who: name(k), p: phases(l) })) : [{ who: name(CO()[0]), p: phases(T[CO()[0]]) }];
    return ch.card('En qué se va el tiempo', `<div class="mt-evo-picks">${modes(on)}</div>${phasesChart(rows, { jiraAt: m.data.meta.jira?.at, now: on })}`, { span: 's12', sub: on ? PHASES_NOW_NOTE : PHASES_NOTE });
  };
  // el desglose por módulo, del primer lado: una fila por módulo, con una barra de su tiempo total partida por estados
  const modulesCard = (A) => {
    const on = !!ui.timesNow, list = on ? bySide(m.today())[CO()[0]] : bySide(A)[CO()[0]];
    const { rows, total, n } = modulesTimes(m, list, on);
    if (!rows.length) return ch.card('Por módulo', `<p class="mt-mut mt-small">${on ? 'Nada abierto' : 'Nada resuelto'} con estos filtros.</p>`, { span: 's12' });
    const top = rows.slice(0, TOP), rest = rows.slice(TOP), max = top[0].total || 1;
    const restRow = rest.length ? (() => { const sum = rest.reduce((s, r) => s + r.total, 0), cnt = rest.reduce((s, r) => s + r.n, 0);
      return { k: null, label: `Resto (${num(rest.length)} módulos)`, n: cnt, total: sum, mean: sum / cnt, parts: PARTS.map((_, j) => rest.reduce((s, r) => s + r.parts[j] * r.n, 0) / cnt) }; })() : null;
    const done = on ? 'abiertas' : 'resueltas';
    const row = (r) => {
      const label = r.label || m.DIMS.mo.label(r.k), sel = r.k != null && m.isSel('mo', r.k);
      const bar = `<span class="mt-mo-bar" style="width:${(r.total / max * 100).toFixed(1)}%">${r.parts.map((v, j) => `<i class="mt-svc-${PARTS[j][1]}" style="flex-grow:${(v * r.n).toFixed(1)}" data-tip="${esc(`${label}
${PARTS[j][0]}: ${dur(v * r.n)} en total, ${dur(v)} de media`)}"></i>`).join('')}</span>`;
      return `<tr class="${r.k != null ? 'mt-clk' : 'mt-mut'} ${sel ? 'mt-sel' : ''}" ${r.k != null ? `data-f="mo:${r.k}"` : ''}><th class="mt-r" title="${esc(label)}">${esc(label)}</th>
        <td class="mt-num">${num(r.n)}</td><td class="mt-num"><b>${dur(r.total)}</b></td><td class="mt-num">${pct(r.total / total, 1)}</td><td class="mt-mo-cell">${bar}</td>
        <td class="mt-num">${dur(r.mean)}</td>${r.parts.map((v) => `<td class="mt-num">${dur(v)}</td>`).join('')}</tr>`;
    };
    const head = `<tr><th>Módulo</th><th class="mt-num">${on ? 'Abiertas' : 'Resueltas'}</th><th class="mt-num" data-tip="La suma del tiempo de sus incidencias: lo que nos ocupa ese módulo.">Tiempo total</th><th class="mt-num">% del tiempo</th><th></th>
      <th class="mt-num" data-tip="${on ? 'Lo que llevan abiertas, de media.' : 'Su tiempo de resolución medio.'}">Media</th>${PARTS.map(([l, cls]) => `<th class="mt-num"><i class="mt-dn-sw mt-svc-${cls}"></i>${l}</th>`).join('')}</tr>`;
    const totalRow = `<tr class="mt-tot"><th class="mt-r">Total</th><td class="mt-num">${num(n)}</td><td class="mt-num"><b>${dur(total)}</b></td><td class="mt-num">100 %</td><td></td><td class="mt-num">${dur(total / n)}</td>${PARTS.map((_, j) => `<td class="mt-num">${dur(rows.reduce((s, r) => s + r.parts[j] * r.n, 0) / n)}</td>`).join('')}</tr>`;
    const legend = `<div class="mt-legend">${PARTS.map(([l, cls]) => `<span><i class="mt-svc-${cls}"></i>${l}</span>`).join('')}</div>`;
    const whose = CMP() ? ` Comparando, de ${esc(name(CO()[0]))}.` : '';
    return ch.card('Por módulo', `${legend}<div class="mt-tablewrap"><table class="mt-list mt-mo-times"><thead>${head}</thead><tbody>${top.map(row).join('')}${restRow ? row(restRow) : ''}${totalRow}</tbody></table></div>`,
      { span: 's12', sub: `Qué módulo nos ocupa más: el tiempo de sus incidencias ${done}, sumado, de más a menos, con su parte del total; la media y en qué se le va el tiempo, de media por incidencia. Los ${TOP} con más tiempo; el resto, en una fila. Clic en un módulo para filtrar.${whose}` });
  };
  // los problemas comunes, del primer lado: cuántas, su parte, su tiempo y su parte del tiempo, la media y sus módulos
  const problemsCard = (A) => {
    if (!m.C.pc) return ch.card('Problemas comunes', '<p class="mt-note">Faltan los problemas comunes: reinicia SIA para que el bridge los calcule.</p>', { span: 's12' });
    const on = !!ui.timesNow, list = on ? bySide(m.today())[CO()[0]] : bySide(A)[CO()[0]];
    const { rows, none, n, total } = problemsTimes(m, list, on);
    if (!n) return ch.card('Problemas comunes', `<p class="mt-mut mt-small">${on ? 'Nada abierto' : 'Nada resuelto'} con estos filtros.</p>`, { span: 's12' });
    const maxN = rows[0]?.n || 1, done = on ? 'abiertas' : 'resueltas';
    const row = (r) => {
      const label = m.DIMS.pc.label(r.k), sel = m.isSel('pc', r.k), mods = r.modules.map(([k, c]) => `${m.DIMS.mo.label(k)} ${num(c)}`).join(' · ');
      return `<tr class="mt-clk ${r.k ? '' : 'mt-mut'} ${sel ? 'mt-sel' : ''}" data-f="pc:${r.k}"><th class="mt-r" title="${esc(label)}">${esc(label)}</th>
        <td class="mt-num"><b>${num(r.n)}</b></td><td class="mt-num">${pct(r.n / n, 1)}</td><td class="mt-blist-bar"><i class="mt-c${CO()[0]}" style="width:${(r.n / maxN * 100).toFixed(1)}%"></i></td>
        <td class="mt-num">${dur(r.total)}</td><td class="mt-num">${pct(r.total / total, 1)}</td><td class="mt-num">${dur(r.mean)}</td><td class="mt-mut mt-small" title="${esc(mods)}">${esc(mods)}</td></tr>`;
    };
    const head = `<tr><th>Problema</th><th class="mt-num">${on ? 'Abiertas' : 'Resueltas'}</th><th class="mt-num">%</th><th></th><th class="mt-num" data-tip="La suma de su tiempo: lo que nos ocupa.">Tiempo total</th><th class="mt-num">% del tiempo</th><th class="mt-num">Media</th><th>Módulos principales</th></tr>`;
    const whose = CMP() ? ` Comparando, de ${esc(name(CO()[0]))}.` : '';
    return ch.card('Problemas comunes', `<div class="mt-tablewrap"><table class="mt-list mt-pc-times"><thead>${head}</thead><tbody>${rows.map(row).join('')}${none ? row(none) : ''}</tbody></table></div>`,
      { span: 's12', sub: `Qué problemas afectan más, de las incidencias ${done}: cada una, en su problema según lo que dice el centro al abrirla y su título (por palabras clave, en varios idiomas; las que no encajan, en «Sin clasificar», al final). De más a menos incidencias, con su tiempo y los módulos donde más pasa. Clic en un problema para filtrar.${whose}` });
  };
  // la sábana: las incidencias de las tablas de arriba, de la que más tiempo lleva a la que menos
  const shared = (label) => SHEET_COLS.find(([l]) => l === label);
  const sheetCard = (A) => {
    const on = !!ui.timesNow, { C, SNAP } = m;
    const time = (i) => (on ? SNAP - C.rep[i] : Math.max(C.res[i] - C.rep[i], 0));
    const list = (on ? bySide(m.today())[CO()[0]] : bySide(A)[CO()[0]]).filter((i) => (on ? OPEN[i] : C.res[i] >= 0 && !OPEN[i])).sort((a, b) => time(b) - time(a));
    const cols = [shared('Incidencia'), ['Título', (mm, i) => afterDash(mm.C.su[i])], ['Problema común', (mm, i) => mm.DIMS.pc.label(mm.DIMS.pc.get(i))], shared('Módulo'),
      shared('Prioridad'), ...(on ? [shared('Estado')] : []), shared('Responsable'), shared('Centro'), [on ? 'Antigüedad' : 'Tiempo de resolución', (mm, i) => dur(time(i)), 'num']];
    ui.timesSheet = { list, cols };   // lo que exporta el botón (metrics-view.js)
    const filtered = m.S.f.mo?.size || m.S.f.pc?.size ? ' Filtrada por lo que has pinchado arriba (quítalo en los filtros de la barra).' : '';
    return ch.card('Sábana de incidencias', sheetBody(m, list, { id: 'times-sheet', expanded: ui.exp['times-sheet'], more: ch.more, empty: `${on ? 'Nada abierto' : 'Nada resuelto'} con estos filtros.`, cols }),
      { span: 's12', sub: `Las incidencias ${on ? 'abiertas ahora' : 'resueltas del periodo'} de las tablas de arriba, con los filtros de la barra, de la que más tiempo ${on ? 'lleva' : 'tardó'} a la que menos. Pincha un módulo o un problema para ver solo esas.${filtered} Exportar a CSV las descarga todas, con su enlace a Remedy.` });
  };
  return (A) => grid(ask('tiempos'), timesCard(A), modulesCard(A), problemsCard(A), sheetCard(A));
};
