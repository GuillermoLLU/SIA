// Módulos y focos: los módulos, centros y problemas que concentran el trabajo (focus.js). No compara empresas:
// cada una recibe trabajo distinto y no comparten backlog. Comparando empresas, se ve solo la primera; con
// personas, qué toca cada uno (en qué se ha especializado frente al equipo).
import { esc } from '../../ui/html.js';
import { num, pct } from '../format.js';
import { OWNERS_SHARE } from '../rules.js';
import { centreExtra as centreExtraOf, problemExtra as problemExtraOf, owners as ownersOf } from '../focus.js';

export const modulosTab = (t) => {
  const { m, ch, name, grid, ask, noK, noTheme, topRows, mixCmp } = t;
  const { S, PRIOS, CMP, isSel } = m;
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

  // Módulos y focos de un solo lado; note: un aviso arriba
  const modulesView = (A, note = '') => {
    const team = !S.sides[0].people;
    return grid(ask('modulos'), note,
      card('', scorecard('ce', CE_GROUPS, { id: 'md-ce', skip: noK, refLabel: 'Todos los centros', extra: centreExtra, title: 'Centros' }), { span: 's12' }),
      card('', scorecard('mo', MOD_GROUPS, { id: 'md-mo', skip: noK, refLabel: 'Todos los módulos', title: 'Módulos' }), { span: 's12' }),
      team ? card('Quién lleva cada módulo', owners(A), { span: 's12', sub: 'De lo recibido en el periodo con responsable: cuántas personas tocan cada módulo, cuántas llevan entre todas el 80 % y quién lleva más. Clic en un módulo o en una persona para filtrar.' }) : '',
      card('', heat('ce', 'mo', 18, 14, { skipR: noK, skipC: noK, title: true }), { span: 's12' }),
      card('', heat('tp', 'mo', 16, 14, { skipR: noTheme, skipC: noK, title: true }), { span: 's12' }),
      card('', heat('pr', 'mo', 4, 14, { skipR: noK, skipC: noK, orderR: PRIOS, title: true }), { span: 's12' }),
      card('', scorecard('tp', PB_GROUPS, { id: 'md-pb', refLabel: 'Todos los problemas', extra: problemExtra, title: 'Problemas', top: 14, child: { dim: 'de', top: 8, noun: 'problemas' } }), { span: 's12' }));
  };

  return (A) => {
    if (CMP() && !m.perHead()) return m.alone((A1) => modulesView(A1, `<p class="mt-note">Esta pestaña no compara empresas: cada una recibe trabajo distinto. Se ve solo ${esc(name(0))}.</p>`));
    if (CMP()) {
      const rowsDef = [{ head: 'Módulo' }, ...topRows('mo', A, 12), { head: 'Centro' }, ...topRows('ce', A, 8), { head: 'Tema', note: 'El principal del título.' }, ...topRows('tp', A, 8)];
      return grid(ask('modulos'), card('Qué toca cada uno', mixCmp(rowsDef, A, 'Incidencias'),
        { span: 's12', sub: `En qué se ha especializado cada uno: sus incidencias de cada módulo, centro y tema y qué parte son de lo suyo${m.perHead() && S.sides.some((x) => !x.people) ? '; las de la empresa, la media por persona de su equipo' : ''}. Clic en una fila para filtrar.` }));
    }
    return modulesView(A);
  };
};
