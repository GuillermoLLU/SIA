// Histórico: lo recibido en el periodo elegido, un bloque por pregunta con sus cifras clave y el paso a su pestaña, y
// arriba del todo, la evolución del backlog día a día (evolucion.js), y la de lo recibido mes a mes (o día a día). Cada cifra es la de lo que se mira y, al comparar, al lado, la diferencia con el
// otro lado. (Lo de ahora, el backlog a fecha de la última carga, está en el Resumen.)
import { esc } from '../../ui/html.js';
import { num, dec, pct, dur } from '../format.js';
import { slaText } from '../model.js';
import { IA_MARKS } from '../ia.js';
import { SHIFTS } from '../shifts.js';
import { monthVsPrev as monthVsPrevOf } from '../flow.js';
import { TABS, QUESTIONS, MONTH_NOTE, DAY_NOTE, opt } from './common.js';
import { evolutionOf } from './evolucion.js';
import { DAY } from '../rules.js';

export const historicoTab = (t) => {
  const { m, ch, shareOf, grid, ask, slaPct, days } = t;
  const { C, STYPE, CMP, CO, stats, group, bySide } = m;
  const { card, legend, diff, lines } = ch;
  const evolution = evolutionOf(t);
  const fig = (label, ST, fmt, val, better, tip) => {
    const a = ST[CO()[0]];
    return `<div class="mt-fig" ${tip ? `data-tip="${esc(tip)}"` : ''}><span>${esc(label)}</span><b>${a.n ? fmt(a) : '—'}</b>${CMP() ? diff(ST[0], ST[1], fmt, val, better) : ''}</div>`;
  };
  // tabs: su pestaña o varias (un botón a cada una); title: la pregunta, si no es la de la primera; lead: lo que va
  // antes de las cifras (una gráfica)
  const answer = (tabs, figs, title, lead = '') => {
    const list = [].concat(tabs);
    return `<section class="mt-card mt-ans"><header><h3>${title || QUESTIONS[list[0]][0]}</h3><span class="mt-gos">${list.map((x) => `<button class="mt-go" data-go="${x}">${TABS.find(([k]) => k === x)[1]} →</button>`).join('')}</span></header>${lead}<div class="mt-figs">${figs.join('')}</div></section>`;
  };


  return (A) => {
    const T = bySide(A), ST = T.map(stats), d = days() || 1, sv = (v) => (s) => s[v];
    const top = (dim, n) => group(dim, T[CO()[0]]).filter((x) => x.k).slice(0, n);
    const mods = top('mo', 3), ce = top('ce', 1);
    const inSet = (dim, ks) => (i) => ks.includes(C[dim][i]);
    const ia = shareOf(T, (i) => C.fl[i] & IA_MARKS), iaDone = ST.map((s) => ({ n: s.n, v: s.resolved ? s.ia / s.resolved : null }));
    const count = (b) => T.map((l) => ({ n: l.length, v: l.filter((i) => C.fl[i] & b).length }));
    const sharePct = (s) => opt(pct)(s.v);
    // último mes completo del periodo frente al anterior (las del mes anterior pueden quedar fuera del periodo)
    const vsPrev = monthVsPrevOf(m);
    // al día, cuántas pasaron en el periodo a Resuelta, a Pendiente de proveedor o a Pendiente de cliente (dataset.js:
    // eR, eV, eC, los días en que pasó), se abrieran cuando se abrieran: cada incidencia, una vez por día
    const NOW = bySide(m.today()), a0 = m.S.d0, a1 = Math.min(m.S.d1, m.END_D);
    const moves = (col) => NOW.map((l) => ({ n: l.length, v: l.reduce((s, i) => s + new Set((C[col]?.[i] || []).filter((e) => e * DAY >= a0 && e * DAY < a1)).size, 0) / d }));
    return grid(ask('historico'), evolution(),
      `<div class="mt-answers">${[
        answer(['entrada', 'backlog'], [
          fig('Recibidas', ST, (s) => num(s.n), sv('n')),
          fig('Entran al día', ST.map((s) => ({ n: s.n, v: s.n / d })), (s) => dec(s.v), sv('v'), null, 'Recibidas entre los días naturales del periodo.'),
          fig('Resueltas al día', moves('eR'), (s) => dec(s.v), sv('v'), 'high', 'Las veces que una incidencia pasó a Resuelta en el periodo (una vez por día; si se reabrió y se volvió a resolver, cuenta otra vez), entre sus días naturales.'),
          fig('Escaladas a proveedor al día', moves('eV'), (s) => dec(s.v), sv('v'), null, 'Las que pasaron a Pendiente de proveedor (Third Party Vendor Action Reqd) en el periodo, entre sus días naturales.'),
          fig('Pendientes de cliente al día', moves('eC'), (s) => dec(s.v), sv('v'), null, 'Las que pasaron a Pendiente de cliente (Client Action Required) en el periodo, entre sus días naturales.'),
          ...(vsPrev ? [fig(`${m.monthName(vsPrev[0])} frente a ${m.monthName(vsPrev[0] - 1)}`, vsPrev[1], (s) => opt((v) => `${v > 0 ? '+' : ''}${pct(v)}`)(s.v), sv('v'), null, 'Variación de las recibidas en el último mes completo del periodo respecto al anterior.')] : []),
          fig('Pendientes', ST, (s) => num(s.open), sv('open'), 'low', 'Lo recibido en el periodo que sigue sin resolver.'),
          fig('Fuera de plazo', ST, (s) => num(s.waitKo), sv('waitKo'), 'low', 'Pendientes que nunca han pasado a En curso y ya superan el plazo de su prioridad.')],
        '¿Qué tenemos?'),
        answer('modulos', [
          ...mods.map((x) => fig(m.DIMS.mo.label(x.k), shareOf(T, (i) => C.mo[i] === x.k), sharePct, sv('v'), null, 'Su parte de lo recibido.')),
          ...(mods.length > 1 ? [fig(`Los ${mods.length} primeros módulos`, shareOf(T, inSet('mo', mods.map((x) => x.k))), sharePct, sv('v'))] : []),
          ...ce.map((x) => fig(`Centro con más: ${m.DIMS.ce.label(x.k)}`, shareOf(T, (i) => C.ce[i] === x.k), sharePct, sv('v')))]),
        answer('resolucion', [
          fig('Media de resolución', ST, (s) => dur(s.avg), sv('avg'), 'low'),
          fig('Resueltas en menos de 24 h', ST, (s) => pct(s.d1), sv('d1'), 'high'),
          fig('El 90 %, en menos de', ST, (s) => dur(s.p90), sv('p90'), 'low'),
          fig('Escaladas a terceros', ST, (s) => pct(s.vend), sv('vend'), null, 'Han estado en Pendiente de un tercero (desarrollo, proveedor…).')]),
        answer('sla', [
          fig('Empezadas dentro del SLA', ST, slaPct, sv('sla'), 'high', `Pasan a En curso dentro del plazo de su prioridad: ${slaText()}.`),
          fig('Primera actuación, de media', ST, (s) => dur(s.fr), sv('fr'), 'low'),
          fig('Reabiertas', ST, (s) => pct(s.reop, 1), sv('reop'), 'low'),
          fig('Cerradas sin explicar la solución', ST, (s) => pct(s.noRes, 1), sv('noRes'), 'low')]),
        answer('ia', [
          fig('Con alguna marca de IA', ia, (s) => pct(s.v, 1), sv('v'), 'high'),
          fig('De las resueltas, con IA', iaDone, (s) => opt((v) => pct(v, 1))(s.v), sv('v'), 'high'),
          fig('Revisión humana OK', count(4096), (s) => num(s.v), sv('v')),
          fig('IA fallida o revisión no OK', count(8192 | 64), (s) => num(s.v), sv('v'))]),
        answer('turnos', [
          ...SHIFTS.map((sn, k) => fig(`Entran de ${sn.toLowerCase()}`, shareOf(T, (i) => STYPE[i] % 3 === k), sharePct, sv('v'))),
          fig('En fin de semana', shareOf(T, (i) => STYPE[i] >= 3), sharePct, sv('v')),
          fig('Empezadas en el turno en que entran', ST, (s) => opt(pct)(s.inShift), sv('inShift'), 'high')]),
      ].join('')}</div>`,
      card(m.daily() ? 'Evolución día a día' : 'Evolución mes a mes', `${CMP() ? legend() : ''}<div class="mt-trio">
        <div><p class="mt-small"><b>Issues recibidas</b></p>${lines(A, (s) => s.n, num, { height: 170 })}</div>
        <div><p class="mt-small"><b>Empezadas dentro del SLA</b></p>${lines(A, (s) => s.sla, (v) => pct(v), { height: 170 })}</div>
        <div><p class="mt-small"><b>Media de resolución</b></p>${lines(A, (s) => s.avg, dur, { height: 170 })}</div></div>`, { span: 's12', sub: m.daily() ? DAY_NOTE : `${MONTH_NOTE} Un mes con menos de 10 issues no se pinta.` }));
  };
};
