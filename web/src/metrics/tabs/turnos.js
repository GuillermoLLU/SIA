// Turnos: cuándo entra el trabajo y cuándo se hace (turns.js), por turno, por hora y por día de la semana.
import { esc } from '../../ui/html.js';
import { num, dec, pct, dur, DOWS } from '../format.js';
import { SHIFTS, SHIFT_HOURS, DAYS, MIN_ACTIONS } from '../shifts.js';
import { shade, HOT } from '../rules.js';
import { perShiftType, byHour, carryRows as carryRowsOf, clockMatrix } from '../turns.js';
import { opt } from './common.js';
import { evolutionOf } from './evolucion.js';

export const turnosTab = (t) => {
  const { m, ch, name, grid, ask, noK, slaPct, resAt, startAt, shareOf, cell, table, slices } = t;
  const { C, S, PRIOS, DOW, STYPE, CMP, CO, stats, bySide } = m;
  const { card, kpis, kpiCo, heat, day, split } = ch;
  const evolution = evolutionOf(t);

  // Mapa de calor día de la semana × hora de un instante de cada issue (la apertura, la resolución…).
  const clockHeat = (list, at, clickable) => {
    const { hh, max: mx } = clockMatrix(m, list, at);
    return `<div class="mt-tablewrap"><table class="mt-hm mt-hours"><thead><tr><th></th>${hh[0].map((_, h) => `<th class="${h === 7 || h === 15 || h === 23 ? 'mt-shift' : ''}">${h}</th>`).join('')}</tr></thead><tbody>${hh.map((r, d) => `<tr><th class="mt-r">${DOWS[d]}</th>${r.map((v, h) => {
      const a = shade(v, mx);
      return `<td class="${a > HOT ? 'mt-hot' : ''} ${h === 7 || h === 15 || h === 23 ? 'mt-shift' : ''}" style="--mt-a:${a}%" ${clickable ? `data-f2="dow:${d}|hour:${h}"` : ''} data-tip="${DOWS[d]} ${h}:00–${h}:59\n${num(v)} incidencias">${v || ''}</td>`;
    }).join('')}</tr>`).join('')}</tbody></table></div>`;
  };

  return (A) => {
    const T = bySide(A), ST = T.map(stats), cos = CO(), slots = m.periodSlots();
    // por tipo de turno (0–2 laborables, 3–5 fin de semana): sus indicadores y el trabajo hecho en él (turns.js)
    const per = [0, 1].map((k) => (cos.includes(k) ? perShiftType(m, T[k], slots) : null));
    const TCOLS = [
      ['Entran', (s) => num(s.n), (s) => s.n],
      ['Entran por turno', (s) => opt(dec)(s.perTurn), (s) => s.perTurn, null, 'Media de incidencias que entran en cada turno de este tipo del periodo.'],
      ['Empezadas dentro del SLA', slaPct, (s) => s.sla, 'high'],
      ['Empezadas en su turno', (s) => opt(pct)(s.inShift), (s) => s.inShift, 'high', 'De las que se empezaron, las que pasaron a En curso en el mismo turno en que entraron.'],
      ['Resueltas en su turno', (s) => opt(pct)(s.resInShift), (s) => s.resInShift, 'high', 'De las resueltas, las que se resolvieron en el mismo turno en que entraron.'],
      ['Media hasta En curso', (s) => dur(s.ip), (s) => s.ip, 'low'],
      ['Turnos con actividad', (s) => num(s.worked), (s) => s.worked, null, 'Turnos de este tipo en que se empezó o resolvió alguna incidencia.'],
      ['Resueltas por turno', (s) => opt(dec)(s.resTurn), (s) => s.resTurn, 'high', 'Incidencias resueltas en cada turno con actividad, de media.'],
      ['Personas activas', (s) => opt(dec)(s.people), (s) => s.people, null, `Personas que hacen al menos ${MIN_ACTIONS} acciones (empezar o resolver) en el turno, de media. Cuenta al responsable actual de cada incidencia.`],
      ['Acciones por persona', (s) => opt(dec)(s.perPerson), (s) => s.perPerson, null, 'Incidencias empezadas o resueltas por cada persona activa y turno, de media.'],
    ];
    // con una sola persona a un lado, cuántas personas hay activas no dice nada
    if (S.sides.some((x) => x?.people?.size === 1)) TCOLS.splice(TCOLS.findIndex((d) => d[0] === 'Personas activas'), 1);
    const rowsHtml = DAYS.map((dl, w) => `<tr class="mt-grp"><td colspan="${TCOLS.length + 1}">${dl}</td></tr>${SHIFTS.map((sn, k) => {
      const x = k + 3 * w, st = [per[0]?.[x], per[1]?.[x]].map((y) => y || { n: 0 });
      return `<tr class="mt-clk" data-f2="tu:${k}|we:${w}"><td>${sn} <span class="mt-mut">· ${SHIFT_HOURS[k]}</span></td>${TCOLS.map((d) => `<td class="mt-num">${cell(st, d)}</td>`).join('')}</tr>`;
    }).join('')}`).join('');
    // el día en 24 horas: entran, se empiezan y se resuelven, por hora
    const hours = (l, at) => byHour(m, l, at);
    const curves = cos.map((k) => `${CMP() ? `<p class="mt-small"><span class="mt-sw mt-c${k}"></span><b>${esc(name(k))}</b></p>` : ''}${day([
      { label: 'Entran', cls: 'mt-l-in', v: hours(T[k], (i) => C.rep[i]) },
      { label: 'Se empiezan', cls: `mt-l-st${k}`, v: hours(T[k], startAt) },
      { label: 'Se resuelven', cls: `mt-l-rs${k}`, v: hours(T[k], resAt) }])}`).join('');
    // qué se queda para el turno siguiente
    const carryRows = carryRowsOf(m, T, cos);
    return grid(ask('turnos'),
      kpis(...SHIFTS.map((sn, k) => kpiCo(`Entran de ${sn.toLowerCase()}`, shareOf(T, (i) => STYPE[i] % 3 === k), (s) => pct(s.v), { val: (s) => s.v, note: SHIFT_HOURS[k] })),
        kpiCo('Entran en fin de semana', shareOf(T, (i) => STYPE[i] >= 3), (s) => pct(s.v), { val: (s) => s.v }),
        kpiCo('Empezadas en su turno', ST, (s) => opt(pct)(s.inShift), { val: (s) => s.inShift, better: 'high', note: 'en el turno en que entran' }),
        kpiCo('Resueltas en su turno', ST, (s) => opt(pct)(s.resInShift), { val: (s) => s.resInShift, better: 'high', note: 'en el turno en que entran' })),
      evolution.byShift(A),
      card('Turno a turno', table('Turno', TCOLS.map((d) => [d[0], d[4]]), rowsHtml), { span: 's12', sub: 'Por el turno en que entra cada incidencia; el trabajo (resueltas, personas, acciones), por el turno en que se hace. Clic en una fila para filtrar. Pasa el ratón por una cabecera para ver cómo se calcula.' }),
      card('El día en 24 horas', curves, { span: 's12', sub: 'Incidencias que entran, que se empiezan (pasan a En curso) y que se resuelven en cada hora, en todo el periodo. Si la línea de las que entran va por encima, en esas horas se acumula trabajo.' }),
      card('¿Qué se queda para el turno siguiente?', split(['En su turno', 'En el siguiente', 'Más tarde', 'Sin pasar por En curso'], carryRows), { span: 's12', sub: 'De lo que entra en cada turno, cuándo se empieza. «Sin pasar por En curso»: abiertas sin empezar o cerradas sin ese paso.' }),
      card('Prioridad por turno', heat('pr', 'tu', 4, 3, { skipR: noK, orderR: PRIOS, orderC: [0, 1, 2] }), { sub: 'Incidencias que entran de cada prioridad en cada turno. Clic en una celda para filtrar.' }),
      card('Por día de la semana', slices('Día', DOWS.map((dw, k) => [dw, (i) => DOW[i] === k, `dow:${k}`]), A, ['n', 'sla', 'inShift', 'ip', 'avg'])),
      card('Cuándo llegan las incidencias', clockHeat(A, (i) => C.rep[i], true), { span: 's12', sub: 'Incidencias recibidas por día de la semana y hora. Cuanto más oscuro, más incidencias; las líneas marcan los cambios de turno. Clic en una celda para filtrar.' }),
      card('Cuándo se resuelven', clockHeat(A, resAt, false), { span: 's12', sub: 'Las mismas incidencias, por el día y la hora en que se resolvieron.' }));
  };
};
