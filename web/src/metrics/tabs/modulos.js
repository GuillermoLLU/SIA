// Módulos y focos: los módulos, centros y problemas que concentran el trabajo (focus.js). No compara empresas:
// cada una recibe trabajo distinto y no comparten backlog. Comparando empresas, se ve solo la primera; con
// personas, qué toca cada uno (en qué se ha especializado frente al equipo). Arriba, Actual o Histórico (ui.modNow;
// metrics-view.js, data-mod-mode), como en SLAs: Histórico (de partida), lo recibido en el periodo; Actual, lo abierto
// ahora, se abriera cuando se abriera, con los mismos cuadros. Y a su lado, la criticidad.
import { esc } from '../../ui/html.js';
import { num, pct } from '../format.js';
import { OWNERS_SHARE } from '../rules.js';
import { centreExtra as centreExtraOf, problemExtra as problemExtraOf, owners as ownersOf } from '../focus.js';

export const modulosTab = (t) => {
  const { m, ch, ui, name, grid, ask, noK, noTheme, topRows, mixCmp, prioPicker } = t;
  const { S, PRIOS, CMP, OPEN, isSel } = m;
  const { card, heat, scorecard } = ch;
  // la ficha de los módulos: bloques de columnas (charts.js, scorecard)
  const MOD_GROUPS = [['Volumen', ['n', 'dl']], ['Cómo se atiende', ['sla', 'avg', 'd1', 'reop']], ['Qué trae', ['crit', 'vend']], ['Hoy', ['open']]];
  // y la de los centros: lo que más les falla (su módulo con más issues) y sus major incidents
  const CE_GROUPS = [['Volumen', ['n', 'dl']], ['Cómo se atiende', ['sla', 'avg']], ['Qué trae', ['top', 'crit', 'vend', 'mi']], ['Hoy', ['open']]];
  const centreExtra = centreExtraOf(m);
  // y la de los problemas, por tema: cuánto se repiten, en cuántos centros y si se cierran siempre igual (esto, solo
  // de un problema: en un tema o en el total se mezclan problemas distintos)
  const PB_GROUPS = [['Volumen', ['n', 'dl', 'nce']], ['Cómo se resuelve', ['avg', 'd1', 'reop', 'vend', 'same']], ['Hoy', ['open']]];
  const problemExtra = problemExtraOf(m);

  // ¿De quién dependemos en cada módulo? Los 15 módulos con más issues: cuántas personas lo tocan, cuántas hacen
  // falta para llevar OWNERS_SHARE (de la que más lleva a la que menos) y las tres que más llevan.
  const OWNERS_PCT = Math.round(OWNERS_SHARE * 100);
  const owners = (A) => {
    const g = ownersOf(m, A);
    const body = g.map((x) => {
      const top = x.top.map((p) => `<span class="mt-own ${isSel('as', p.k) ? 'mt-sel' : ''}" data-f="as:${p.k}" data-tip="${esc(`${m.DIMS.as.label(p.k)}\n${num(p.n)} de ${num(x.n)} incidencias de ${m.DIMS.mo.label(x.k)}`)}">${esc(m.DIMS.as.label(p.k))} <b>${pct(p.n / x.n)}</b></span>`).join('');
      return `<tr class="mt-clk ${isSel('mo', x.k) ? 'mt-sel' : ''}" data-f="mo:${x.k}"><td>${esc(m.DIMS.mo.label(x.k))}</td><td class="mt-num">${num(x.n)}</td><td class="mt-num">${x.people}</td><td class="mt-num">${x.n80}</td><td class="mt-owns">${top}</td></tr>`;
    }).join('');
    return g.length ? `<div class="mt-tablewrap"><table class="mt-owners"><thead><tr><th>Módulo</th><th class="mt-num">Incidencias</th><th class="mt-num" data-tip="Personas con alguna incidencia del módulo.">Personas</th>
      <th class="mt-num" data-tip="Cuántas personas, de la que más lleva a la que menos, suman el ${OWNERS_PCT} % de las incidencias del módulo.">Llevan el ${OWNERS_PCT} %</th><th>Quién lleva más</th></tr></thead><tbody>${body}</tbody></table></div>` : '<p class="mt-mut mt-small">Sin datos con estos filtros.</p>';
  };

  // arriba, Actual o Histórico y la criticidad (tabs/common.js): cada una con lo que se mira (rowsOf, sin su filtro)
  const modes = (now) => `<div class="mt-seg mt-seg-sm" role="group" aria-label="Qué módulos y focos">${[['now', 'Actual', 'Lo que sigue abierto, a fecha de la última carga: no depende del periodo.'], ['past', 'Histórico', 'Lo recibido en el periodo.']]
    .map(([k, l, tip]) => { const a = (k === 'now') === now; return `<button class="mt-seg-b ${a ? 'mt-on' : ''}" data-mod-mode="${k}" aria-pressed="${a}" data-tip="${esc(tip)}">${l}</button>`; }).join('')}</div>`;
  const picks = (rowsOf) => `<div class="mt-hoy-picks">${modes(!!ui.modNow)}${prioPicker(rowsOf('pr'))}</div>`;
  // Módulos y focos de un solo lado; note: un aviso arriba; rowsOf: lo que cuenta (sin el filtro de una dimensión)
  const modulesView = (A, note = '', rowsOf = m.rows) => {
    const team = !S.sides[0].people;
    return grid(picks(rowsOf), ask('modulos'), note,
      card('', scorecard('ce', CE_GROUPS, { id: 'md-ce', rows: rowsOf('ce'), skip: noK, refLabel: 'Todos los centros', extra: centreExtra, title: 'Centros' }), { span: 's12' }),
      card('', scorecard('mo', MOD_GROUPS, { id: 'md-mo', rows: rowsOf('mo'), skip: noK, refLabel: 'Todos los módulos', title: 'Módulos' }), { span: 's12' }),
      team ? card('Quién lleva cada módulo', owners(A), { span: 's12', sub: `${ui.modNow ? 'De lo abierto ahora' : 'De lo recibido en el periodo'} con responsable: cuántas personas tocan cada módulo, cuántas llevan entre todas el 80 % y quién lleva más. Clic en un módulo o en una persona para filtrar.` }) : '',
      card('', heat('ce', 'mo', 18, 14, { rows: rowsOf(), skipR: noK, skipC: noK, title: true }), { span: 's12' }),
      card('', heat('tp', 'mo', 16, 14, { rows: rowsOf(), skipR: noTheme, skipC: noK, title: true }), { span: 's12' }),
      card('', heat('pr', 'mo', 4, 14, { rows: rowsOf(), skipR: noK, skipC: noK, orderR: PRIOS, title: true }), { span: 's12' }),
      card('', scorecard('tp', PB_GROUPS, { id: 'md-pb', rows: rowsOf('tp'), refLabel: 'Todos los problemas', extra: problemExtra, title: 'Problemas', top: 14, child: { dim: 'de', top: 8, noun: 'problemas' } }), { span: 's12' }));
  };

  // Actual: lo abierto ahora, se abriera cuando se abriera (el periodo, todo lo cargado, el tiempo de pintarlo, y solo
  // lo abierto; luego, el periodo de antes), como en SLAs
  const openNow = (view) => {
    const { d0, d1 } = S;
    m.setPeriod(m.MIN_D, m.END_D); m.refilter();
    try {
      const rowsOf = (dim) => m.rows(dim).filter((i) => OPEN[i]);
      return view(rowsOf(), rowsOf);
    } finally { m.setPeriod(d0, d1); m.refilter(); }
  };
  const render = (A, rowsOf) => {
    if (CMP() && !m.perHead()) return m.alone(() => modulesView(rowsOf(), `<p class="mt-note">Esta pestaña no compara empresas: cada una recibe trabajo distinto. Se ve solo ${esc(name(0))}.</p>`, rowsOf));
    if (CMP()) {
      const rowsDef = [{ head: 'Módulo' }, ...topRows('mo', A, 12), { head: 'Centro' }, ...topRows('ce', A, 8), { head: 'Tema', note: 'El principal del título.' }, ...topRows('tp', A, 8)];
      return grid(picks(rowsOf), ask('modulos'), card('Qué toca cada uno', mixCmp(rowsDef, A, 'Incidencias'),
        { span: 's12', sub: `En qué se ha especializado cada uno: sus incidencias de cada módulo, centro y tema y qué parte son de lo suyo${m.perHead() && S.sides.some((x) => !x.people) ? '; las de la empresa, la media por persona de su equipo' : ''}. Clic en una fila para filtrar.` }));
    }
    return modulesView(A, '', rowsOf);
  };
  return (A) => (ui.modNow ? openNow(render) : render(A, m.rows));
};
