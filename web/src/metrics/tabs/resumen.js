// Resumen: un bloque por pregunta, con sus cifras clave y el paso a su pestaña. Cada cifra es la de lo que
// se mira y, al comparar, al lado, la diferencia con el otro lado.
import { esc } from '../../ui/html.js';
import { num, dec, pct, dur } from '../format.js';
import { slaText } from '../model.js';
import { IA_MARKS } from '../ia.js';
import { SHIFTS } from '../shifts.js';
import { closedInPeriod as closedIn, monthVsPrev as monthVsPrevOf } from '../flow.js';
import { TABS, QUESTIONS, MONTH_NOTE, DAY_NOTE, opt } from './common.js';

export const resumenTab = (t) => {
  const { m, ch, shareOf, grid, ask, slaPct, days } = t;
  const { C, STYPE, CMP, CO, stats, group, bySide } = m;
  const { card, legend, diff, lines } = ch;
  const fig = (label, ST, fmt, val, better, tip) => {
    const a = ST[CO()[0]];
    return `<div class="mt-fig" ${tip ? `data-tip="${esc(tip)}"` : ''}><span>${esc(label)}</span><b>${a.n ? fmt(a) : '—'}</b>${CMP() ? diff(ST[0], ST[1], fmt, val, better) : ''}</div>`;
  };
  // tabs: su pestaña o varias (un botón a cada una); title: la pregunta, si no es la de la primera
  const answer = (tabs, figs, title) => {
    const list = [].concat(tabs);
    return `<section class="mt-card mt-ans"><header><h3>${title || QUESTIONS[list[0]][0]}</h3><span class="mt-gos">${list.map((x) => `<button class="mt-go" data-go="${x}">${TABS.find(([k]) => k === x)[1]} →</button>`).join('')}</span></header><div class="mt-figs">${figs.join('')}</div></section>`;
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
    const vsPrev = monthVsPrevOf(m), closed = closedIn(m);
    return grid(ask('resumen'),
      `<div class="mt-answers">${[
        answer(['entrada', 'backlog'], [
          fig('Recibidas', ST, (s) => num(s.n), sv('n')),
          fig('Entran al día', ST.map((s) => ({ n: s.n, v: s.n / d })), (s) => dec(s.v), sv('v'), null, 'Recibidas entre los días naturales del periodo.'),
          fig('Cerramos al día', closed.map((l, k) => ({ n: l.length + ST[k].n, v: l.length / d })), (s) => dec(s.v), sv('v'), 'high', 'Todo lo cerrado en el periodo, entre sus días naturales.'),
          ...(vsPrev ? [fig(`${m.monthName(vsPrev[0])} frente a ${m.monthName(vsPrev[0] - 1)}`, vsPrev[1], (s) => opt((v) => `${v > 0 ? '+' : ''}${pct(v)}`)(s.v), sv('v'), null, 'Variación de las recibidas en el último mes completo del periodo respecto al anterior.')] : []),
          fig('Pendientes', ST, (s) => num(s.open), sv('open'), 'low', 'Lo recibido en el periodo que sigue sin resolver.'),
          fig('Fuera de plazo', ST, (s) => num(s.waitKo), sv('waitKo'), 'low', 'Pendientes que nunca han pasado a En curso y ya superan el plazo de su prioridad.')], '¿Qué tenemos?'),
        answer('modulos', [
          ...mods.map((x) => fig(m.DIMS.mo.label(x.k), shareOf(T, (i) => C.mo[i] === x.k), sharePct, sv('v'), null, 'Su parte de lo recibido.')),
          ...(mods.length > 1 ? [fig(`Los ${mods.length} primeros módulos`, shareOf(T, inSet('mo', mods.map((x) => x.k))), sharePct, sv('v'))] : []),
          ...ce.map((x) => fig(`Centro con más: ${m.DIMS.ce.label(x.k)}`, shareOf(T, (i) => C.ce[i] === x.k), sharePct, sv('v')))]),
        answer('resolucion', [
          fig('Media de resolución', ST, (s) => dur(s.avg), sv('avg'), 'low'),
          fig('Resueltas en menos de 24 h', ST, (s) => pct(s.d1), sv('d1'), 'high'),
          fig('El 90 %, en menos de', ST, (s) => dur(s.p90), sv('p90'), 'low'),
          fig('Escaladas a terceros', ST, (s) => pct(s.vend), sv('vend'), null, 'Con ticket de tercero (desarrollo, proveedor…).')]),
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
