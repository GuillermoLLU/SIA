// Turnos: cuándo entra el trabajo y cuándo se hace (turns.js), por turno, por hora y por día de la semana.
import { esc } from '../../ui/html.js';
import { num, dec, pct, dur, DOWS } from '../format.js';
import { SHIFTS, SHIFT_HOURS, DAYS, MIN_ACTIONS } from '../shifts.js';
import { shade, HOT } from '../rules.js';
import { perShiftType, byHour, carryRows as carryRowsOf, clockMatrix } from '../turns.js';
import { opt } from './common.js';
import { isPicked } from '../view.js';
import { workMinutes } from '../hours.js';
import { SISU_SHIFTS, SISU_SHIFT_HOURS, shiftOf, endOf, slotsIn as sisuSlotsIn, carry as sisuCarry, work as sisuWork } from '../sisu-shifts.js';

export const turnosTab = (t) => {
  const { m, ch, name, grid, ask, wide, focusCls, noK, slaPct, resAt, startAt, shareOf, cell, table } = t;
  const { C, S, PRIOS, DOW, STYPE, CMP, CO, stats, bySide } = m;
  const { ui } = t;
  const { card, kpis, kpiCo, heat, day, split } = ch;

  // Mapa de calor día de la semana × hora de un instante de cada issue (la apertura, la resolución…). El de cuándo llegan
  // (clickable), con el total de cada día a la derecha.
  // con un día y hora elegidos, los demás siguen (apagados): lo de la tabla con lo que solo deja fuera ese filtro
  const clockHeat = (list0, at, clickable, edges = [7, 15, 23]) => {
    const edge = (h) => edges.includes(h);
    const list = clickable ? wide(list0, ['dow:0', 'hour:0']) : list0, { hh, max: mx } = clockMatrix(m, list, at);
    return `<div class="mt-tablewrap"><table class="mt-hm mt-hours"><thead><tr><th></th>${hh[0].map((_, h) => `<th class="${edge(h) ? 'mt-shift' : ''}">${h}</th>`).join('')}${clickable ? '<th class="mt-num">Total</th>' : ''}</tr></thead><tbody>${hh.map((r, d) => `<tr><th class="mt-r">${DOWS[d]}</th>${r.map((v, h) => {
      const a = shade(v, mx);
      return `<td class="${a > HOT ? 'mt-hot' : ''} ${edge(h) ? 'mt-shift' : ''} ${clickable ? focusCls(`dow:${d}|hour:${h}`) : ''}" style="--mt-a:${a}%" ${clickable ? `data-f2="dow:${d}|hour:${h}"` : ''} data-tip="${DOWS[d]} ${h}:00–${h}:59\n${num(v)} incidencias">${v || ''}</td>`;
    }).join('')}${clickable ? `<td class="mt-num mt-total">${num(r.reduce((x, y) => x + y, 0))}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
  };

  // Arriba, SISU o SGA (un filtro de ss, como el de la barra de arriba: clic, solo ese; otra vez, los dos). Solo con SISU, sus
  // turnos (sisuView); con SGA o los dos, los tres turnos de 24 h (allDay).
  // Con los turnos de 24 h (days), a su lado, entre semana o fin de semana: un filtro de we (model.js, DIMS.we: por el turno
  // en que entra; la noche del domingo, del fin de semana), igual: clic, solo ese; otra vez, los dos. Con SISU no sale (lo
  // del fin de semana pasa al lunes) y, al elegirlo, se quita (metrics-view.js, data-only).
  const seg = (label, dim, opts) => `<div class="mt-seg mt-seg-sm" role="group" aria-label="${label}">${opts.map(([k, l, tip]) => { const on = isPicked(S.f, dim, k);
    return `<button class="mt-seg-b ${on ? 'mt-on' : ''}" data-only="${dim}:${k}" aria-pressed="${on}" data-tip="${esc(on ? 'Clic para ver los dos.' : tip)}">${l}</button>`; }).join('')}</div>`;
  const sysSeg = () => {
    const cmp = cmpOn(), tips = ['Clic para ver solo SISU: sus turnos de mañana (7 a 15 h) y tarde (14 a 22 h), de lunes a viernes.', 'Clic para ver solo SGA: turnos de mañana, tarde y noche, todos los días.'];
    return `<div class="mt-seg mt-seg-sm${cmp ? ' mt-dn-sys-cmp' : ''}" role="group" aria-label="SISU o SGA">${[0, 1].map((k) => { const on = cmp || isPicked(S.f, 'ss', k);
      const tip = `${cmp ? 'Clic para ver solo ese' : on ? 'Clic para ver los dos (con los turnos de 24 h)' : tips[k]}. Ctrl+clic para ${cmp ? 'dejar de comparar' : 'comparar SISU y SGA, entre semana'}.`;
      return `<button class="mt-seg-b ${on ? 'mt-on' : ''}" data-ring-sys="${k}" aria-pressed="${on}" data-tip="${esc(tip)}">${m.DIMS.ss.label(k)}</button>`; }).join('')}</div>`;
  };
  const picker = (days = false) => `<div class="mt-hoy-picks">${sysSeg()}${days ? seg('Entre semana o fin de semana', 'we', [
    [0, 'Entre semana', 'Clic para ver solo lo que entra entre semana: de los turnos del lunes a las 7 h al viernes a la noche.'],
    [1, 'Fin de semana', 'Clic para ver solo lo que entra en fin de semana: de los turnos del sábado a las 7 h a la noche del domingo.']]) : ''}</div>`;
  const onlySisu = () => S.f.ss?.size === 1 && S.f.ss.has(0);
  const cmpOn = () => !!ui.ssCmp && !CMP();   // SISU frente a SGA (cmpView)

  function allDay(A) {
    const T = bySide(A), ST = T.map(stats), cos = CO(), slots = m.periodSlots();
    // por tipo de turno (0–2 laborables, 3–5 fin de semana): sus indicadores y el trabajo hecho en él (turns.js); con un
    // turno elegido, los demás siguen (apagados)
    const TW = bySide(wide(A, ['tu:0', 'we:0']));
    const per = [0, 1].map((k) => (cos.includes(k) ? perShiftType(m, TW[k], slots) : null));
    const TCOLS = [
      ['Entran', (s) => num(s.n), (s) => s.n],
      ['Entran por turno', (s) => opt(dec)(s.perTurn), (s) => s.perTurn, null, 'Media de incidencias que entran en cada turno de este tipo del periodo.'],
      ['Empezadas dentro del SLA', slaPct, (s) => s.sla, 'high'],
      ['Empezadas en su turno', (s) => opt(pct)(s.inShift), (s) => s.inShift, 'high', 'De las que se empezaron, las que pasaron a En curso en el mismo turno en que entraron.'],
      ['Resueltas en su turno', (s) => opt(pct)(s.resInShift), (s) => s.resInShift, 'high', 'De las resueltas, las que se resolvieron en el mismo turno en que entraron.'],
      ['Media hasta En curso', (s) => dur(s.ip), (s) => s.ip, 'low'],
      ['Media de resolución', (s) => (s.resolved ? dur(s.avg) : '—'), (s) => (s.resolved ? s.avg : null), 'low', 'De las resueltas, de la apertura a la resolución.'],
      ['Turnos con actividad', (s) => num(s.worked), (s) => s.worked, null, 'Turnos de este tipo en que se empezó o resolvió alguna incidencia.'],
      ['Resueltas por turno', (s) => opt(dec)(s.resTurn), (s) => s.resTurn, 'high', 'Incidencias resueltas en cada turno con actividad, de media.'],
      ['Personas activas', (s) => opt(dec)(s.people), (s) => s.people, null, `Personas que hacen al menos ${MIN_ACTIONS} acciones (empezar o resolver) en el turno, de media. Cuenta al responsable actual de cada incidencia.`],
      ['Acciones por persona', (s) => opt(dec)(s.perPerson), (s) => s.perPerson, null, 'Incidencias empezadas o resueltas por cada persona activa y turno, de media.'],
    ];
    // con una sola persona a un lado, cuántas personas hay activas no dice nada
    if (S.sides.some((x) => x?.people?.size === 1)) TCOLS.splice(TCOLS.findIndex((d) => d[0] === 'Personas activas'), 1);
    const rowsHtml = DAYS.map((dl, w) => `<tr class="mt-grp"><td colspan="${TCOLS.length + 1}">${dl}</td></tr>${SHIFTS.map((sn, k) => {
      const x = k + 3 * w, st = [per[0]?.[x], per[1]?.[x]].map((y) => y || { n: 0 });
      return `<tr class="mt-clk ${focusCls(`tu:${k}|we:${w}`)}" data-f2="tu:${k}|we:${w}"><td>${sn} <span class="mt-mut">· ${SHIFT_HOURS[k]}</span></td>${TCOLS.map((d) => `<td class="mt-num">${cell(st, d)}</td>`).join('')}</tr>`;
    }).join('')}`).join('');
    // el día en 24 horas: entran, se empiezan y se resuelven, por hora
    const hours = (l, at) => byHour(m, l, at);
    const curves = cos.map((k) => `${CMP() ? `<p class="mt-small"><span class="mt-sw mt-c${k}"></span><b>${esc(name(k))}</b></p>` : ''}${day([
      { label: 'Entran', cls: 'mt-l-in', v: hours(T[k], (i) => C.rep[i]) },
      { label: 'Se empiezan', cls: `mt-l-st${k}`, v: hours(T[k], startAt) },
      { label: 'Se resuelven', cls: `mt-l-rs${k}`, v: hours(T[k], resAt) }])}`).join('');
    // qué se queda para el turno siguiente
    // con un turno elegido, los demás siguen (apagados)
    const carryRows = carryRowsOf(m, bySide(wide(A, ['tu:0'])), cos);
    // arriba del todo, las cifras por turno; luego, el día en 24 horas, qué se queda para el turno siguiente y la
    // prioridad por turno
    return grid(ask('turnos'), picker(true),
      kpis(...SHIFTS.map((sn, k) => kpiCo(`Entran de ${sn.toLowerCase()}`, shareOf(T, (i) => STYPE[i] % 3 === k), (s) => pct(s.v), { val: (s) => s.v, note: SHIFT_HOURS[k] })),
        kpiCo('Entran en fin de semana', shareOf(T, (i) => STYPE[i] >= 3), (s) => pct(s.v), { val: (s) => s.v }),
        kpiCo('Empezadas en su turno', ST, (s) => opt(pct)(s.inShift), { val: (s) => s.inShift, better: 'high', note: 'en el turno en que entran' }),
        kpiCo('Resueltas en su turno', ST, (s) => opt(pct)(s.resInShift), { val: (s) => s.resInShift, better: 'high', note: 'en el turno en que entran' }),
        // y las medias, como con SISU, pero en tiempo natural (todo el día, todos los días)
        kpiCo('Media hasta En curso', ST, (s) => opt(dur)(s.ip), { val: (s) => s.ip, better: 'low', note: 'en tiempo natural' }),
        kpiCo('Media de resolución', ST, (s) => (s.resolved ? dur(s.avg) : '—'), { val: (s) => (s.resolved ? s.avg : null), better: 'low', note: 'en tiempo natural' })),
      card('El día en 24 horas', curves, { span: 's12', sub: 'Incidencias que entran, que se empiezan (pasan a En curso) y que se resuelven en cada hora, en todo el periodo. Si la línea de las que entran va por encima, en esas horas se acumula trabajo.' }),
      card('¿Qué se queda para el turno siguiente?', split(['En su turno', 'En el siguiente', 'Más tarde', 'Sin pasar por En curso'], carryRows), { span: 's12', sub: 'De lo que entra en cada turno, cuándo se empieza. «Sin pasar por En curso»: abiertas sin empezar o cerradas sin ese paso.' }),
      card('Prioridad por turno', heat('pr', 'tu', 4, 3, { skipR: noK, orderR: PRIOS, orderC: [0, 1, 2] }), { span: 's12', sub: 'Incidencias que entran de cada prioridad en cada turno. Clic en una celda para filtrar.' }),
      card('Turno a turno', table('Turno', TCOLS.map((d) => [d[0], d[4]]), rowsHtml), { span: 's12', sub: 'Por el turno en que entra cada incidencia; el trabajo (resueltas, personas, acciones), por el turno en que se hace. Clic en una fila para filtrar. Pasa el ratón por una cabecera para ver cómo se calcula.' }),
      card('Cuándo llegan las incidencias', clockHeat(A, (i) => C.rep[i], true), { span: 's12', sub: 'Incidencias recibidas por día de la semana y hora. Cuanto más oscuro, más incidencias; las líneas marcan los cambios de turno. Clic en una celda para filtrar.' }),
      card('Cuándo se resuelven', clockHeat(A, resAt, false), { span: 's12', sub: 'Las mismas incidencias, por el día y la hora en que se resolvieron.' }));
  }

  // SISU: sus dos turnos, de lunes a viernes (sisu-shifts.js). Lo que entra, a cualquier hora: fuera de turno (de noche, y
  // el fin de semana), en el turno siguiente (el desfase: la mañana siguiente; la del lunes); así, la media por turno, de los
  // días laborables. Las medias hasta En curso y de resolución, en su horario de atención (de lunes a viernes, de 7 a 22 h:
  // hours.js); «en su turno», antes de que acabe el turno que la recibió.
  // Las cifras de lo que recibe un turno de SISU (k) o todo SISU: con sus reglas (sisuView). slots: los turnos del periodo.
  const sisuSlots = () => sisuSlotsIn(m, S.d0, Math.min(S.d1, m.SNAP)), shiftK = (i) => shiftOf(m, C.rep[i]).k;
  const sisuStats = (l, k, slots) => {
    const dow0 = new Date(m.BASE).getUTCDay(), work = (a, b) => workMinutes(a, b, dow0), mean = (v) => (v.length ? v.reduce((x, y) => x + y, 0) / v.length : null);
    const st = stats(l), sh = (i) => shiftOf(m, C.rep[i]), started = l.filter((i) => C.ip[i] >= 0), solved = l.filter((i) => !m.OPEN[i] && C.res[i] >= 0);
    return { n: l.length, perTurn: slots[k] ? l.length / slots[k] : null, sla: st.sla,
      inShift: started.length ? started.filter((i) => C.rep[i] + C.ip[i] < endOf(sh(i))).length / started.length : null,
      resInShift: solved.length ? solved.filter((i) => C.res[i] < endOf(sh(i))).length / solved.length : null,
      ip: mean(started.map((i) => work(C.rep[i], C.rep[i] + C.ip[i]))), avg: mean(solved.map((i) => work(C.rep[i], C.res[i]))), resolved: solved.length };
  };

  function sisuView(A) {
    const T = bySide(A), cos = CO(), slots = sisuSlots();
    const statsOf = (l, k) => sisuStats(l, k, slots);
    // con un turno elegido, el otro sigue (apagado)
    const TW = bySide(wide(A, ['ts:0']));
    const per = [0, 1].map((s) => {
      if (!cos.includes(s)) return null;
      const w = sisuWork(m, TW[s], (i) => m.OPEN[i], MIN_ACTIONS);
      return [0, 1].map((k) => ({ ...statsOf(TW[s].filter((i) => shiftK(i) === k), k), worked: w[k].turns, resTurn: w[k].turns ? w[k].resolved / w[k].turns : null, people: w[k].people, perPerson: w[k].perPerson }));
    });
    const HOURS = 'En su horario de atención (de lunes a viernes, de 7 a 22 h): lo de fuera no cuenta.';
    const TCOLS = [
      ['Entran', (s) => num(s.n), (s) => s.n, null, 'Las que recibe el turno: las que entran en él y, en la mañana, las de fuera de turno (de noche y el fin de semana).'],
      ['Entran por turno', (s) => opt(dec)(s.perTurn), (s) => s.perTurn, null, 'Media de las que recibe cada turno de este tipo, de lunes a viernes: con lo de fuera de turno, que pasa a la mañana siguiente (lo del fin de semana, a la del lunes).'],
      ['Empezadas dentro del SLA', slaPct, (s) => s.sla, 'high'],
      ['Empezadas en su turno', (s) => opt(pct)(s.inShift), (s) => s.inShift, 'high', 'De las que se empezaron, las que pasaron a En curso antes de que acabara el turno que las recibió (la mañana, a las 15 h; la tarde, a las 22 h).'],
      ['Resueltas en su turno', (s) => opt(pct)(s.resInShift), (s) => s.resInShift, 'high', 'De las resueltas, las que se resolvieron antes de que acabara el turno que las recibió.'],
      ['Media hasta En curso', (s) => opt(dur)(s.ip), (s) => s.ip, 'low', `De la apertura al primer paso a En curso. ${HOURS}`],
      ['Media de resolución', (s) => opt(dur)(s.avg), (s) => s.avg, 'low', `De las resueltas, de la apertura a la resolución. ${HOURS}`],
      ['Turnos con actividad', (s) => num(s.worked), (s) => s.worked, null, 'Turnos de este tipo en que se empezó o resolvió alguna incidencia (lo hecho fuera de turno, en el siguiente).'],
      ['Resueltas por turno', (s) => opt(dec)(s.resTurn), (s) => s.resTurn, 'high', 'Incidencias resueltas en cada turno con actividad, de media.'],
      ['Personas activas', (s) => opt(dec)(s.people), (s) => s.people, null, `Personas que hacen al menos ${MIN_ACTIONS} acciones (empezar o resolver) en el turno, de media. Cuenta al responsable actual de cada incidencia.`],
      ['Acciones por persona', (s) => opt(dec)(s.perPerson), (s) => s.perPerson, null, 'Incidencias empezadas o resueltas por cada persona activa y turno, de media.'],
    ];
    if (S.sides.some((x) => x?.people?.size === 1)) TCOLS.splice(TCOLS.findIndex((d) => d[0] === 'Personas activas'), 1);
    const rowsHtml = SISU_SHIFTS.map((sn, k) => {
      const st = [per[0]?.[k], per[1]?.[k]].map((y) => y || { n: 0 });
      return `<tr class="mt-clk ${focusCls(`ts:${k}`)}" data-f="ts:${k}"><td>${sn} <span class="mt-mut">· ${SISU_SHIFT_HOURS[k]}</span></td>${TCOLS.map((d) => `<td class="mt-num">${cell(st, d)}</td>`).join('')}</tr>`;
    }).join('');
    const tot = T.map((l) => statsOf(l, 0));
    const hours = (l, at) => byHour(m, l, at);
    const curves = cos.map((k) => `${CMP() ? `<p class="mt-small"><span class="mt-sw mt-c${k}"></span><b>${esc(name(k))}</b></p>` : ''}${day([
      { label: 'Entran', cls: 'mt-l-in', v: hours(T[k], (i) => C.rep[i]) },
      { label: 'Se empiezan', cls: `mt-l-st${k}`, v: hours(T[k], startAt) },
      { label: 'Se resuelven', cls: `mt-l-rs${k}`, v: hours(T[k], resAt) }])}`).join('');
    const TC = bySide(wide(A, ['ts:0'])), carried = cos.map((k) => sisuCarry(m, TC[k]));
    const carryRows = SISU_SHIFTS.flatMap((sn, j) => cos.map((k) => ({ label: sn, k, f: `ts:${j}`, v: carried[cos.indexOf(k)][j] })));
    const share = (test) => T.map((l) => ({ n: l.length, v: l.length ? l.filter(test).length / l.length : null }));
    const P = (s) => opt(pct)(s.v);
    return grid(ask('turnos'), picker(),
      kpis(...SISU_SHIFTS.map((sn, k) => kpiCo(`Entran de ${sn.toLowerCase()}`, share((i) => shiftK(i) === k), P, { val: (s) => s.v, note: `${SISU_SHIFT_HOURS[k]}${k ? '' : ', con lo de fuera de turno'}` })),
        kpiCo('Entran fuera de turno', share((i) => shiftOf(m, C.rep[i]).out), P, { val: (s) => s.v, note: 'de noche o el fin de semana: pasan al turno siguiente' }),
        kpiCo('Empezadas en su turno', tot, (s) => opt(pct)(s.inShift), { val: (s) => s.inShift, better: 'high', note: 'antes de que acabe el turno que la recibe' }),
        kpiCo('Resueltas en su turno', tot, (s) => opt(pct)(s.resInShift), { val: (s) => s.resInShift, better: 'high', note: 'antes de que acabe el turno que la recibe' }),
        kpiCo('Media hasta En curso', tot, (s) => opt(dur)(s.ip), { val: (s) => s.ip, better: 'low', note: 'en su horario de atención' }),
        kpiCo('Media de resolución', tot, (s) => opt(dur)(s.avg), { val: (s) => s.avg, better: 'low', note: 'en su horario de atención' })),
      card('El día en 24 horas', curves, { span: 's12', sub: 'Incidencias que entran, que se empiezan (pasan a En curso) y que se resuelven en cada hora, en todo el periodo. Los turnos de SISU: mañana de 7 a 15 h y tarde de 14 a 22 h.' }),
      card('¿Qué se queda para el turno siguiente?', split(['En su turno', 'En el siguiente', 'Más tarde', 'Sin pasar por En curso'], carryRows), { span: 's12', sub: 'De lo que recibe cada turno (con lo de fuera de turno, en la mañana), cuándo se empieza: antes de que acabe ese turno, en el siguiente (tras la mañana, la tarde; tras la tarde, la mañana del siguiente día laborable) o más tarde.' }),
      card('Prioridad por turno', heat('pr', 'ts', 4, 2, { skipR: noK, orderR: PRIOS, orderC: [0, 1] }), { span: 's12', sub: 'Incidencias que recibe cada turno de SISU, de cada prioridad. Clic en una celda para filtrar.' }),
      card('Turno a turno', table('Turno', TCOLS.map((d) => [d[0], d[4]]), rowsHtml), { span: 's12', sub: 'Los turnos de SISU, de lunes a viernes: por el turno que recibe cada incidencia (lo de fuera de turno, en el siguiente); el trabajo (resueltas, personas, acciones), por el turno en que se hace. Clic en una fila para filtrar. Pasa el ratón por una cabecera para ver cómo se calcula.' }),
      card('Cuándo llegan las incidencias', clockHeat(A, (i) => C.rep[i], true, [7, 14, 15, 22]), { span: 's12', sub: 'Incidencias recibidas por día de la semana y hora, a cualquier hora. Cuanto más oscuro, más incidencias; las líneas marcan los turnos de SISU (7, 14, 15 y 22 h). Clic en una celda para filtrar.' }),
      card('Cuándo se resuelven', clockHeat(A, resAt, false, [7, 14, 15, 22]), { span: 's12', sub: 'Las mismas incidencias, por el día y la hora en que se resolvieron.' }));
  }

  // SISU frente a SGA (Ctrl+clic en el selector: ui.ssCmp; solo mirando un lado, no comparando personas ni empresas),
  // solo entre semana: de SISU, lo que entra de lunes a viernes, a cualquier hora (lo de la noche, con el desfase, en la
  // mañana siguiente); de SGA, lo de sus turnos de lunes a viernes (DIMS.we). Cada uno, con sus turnos y sus reglas: SISU,
  // sus medias en su horario de atención; SGA, en tiempo natural. En verde, el que va mejor; en rojo, el peor.
  function cmpView(A) {
    const L = bySide(A)[CO()[0]], slots = sisuSlots(), days = slots[0];
    const sisu = L.filter((i) => m.DIMS.ss.get(i) === 0 && m.clock(C.rep[i])[0] < 5), sga = L.filter((i) => m.DIMS.ss.get(i) === 1 && STYPE[i] < 3);
    const SISU = { ...sisuStats(sisu, 0, slots), perDay: days ? sisu.length / days : null }, SGA = { ...stats(sga), perDay: days ? sga.length / days : null };
    const ss = [0, 1].map((k) => sisuStats(sisu.filter((i) => shiftK(i) === k), k, slots)), sg = perShiftType(m, sga, m.periodSlots()).slice(0, 3);
    const names = [m.DIMS.ss.label(0), m.DIMS.ss.label(1)];
    // las dos cifras de cada indicador, con el color del que va mejor
    const tone = (a, b, better) => (!better || a == null || b == null || a === b ? ['', ''] : (better === 'high' ? a > b : a < b) ? ['good', 'bad'] : ['bad', 'good']);
    const fig = (label, v, fmt, better, note) => {
      const x = [v(SISU), v(SGA)], tn = tone(x[0], x[1], better);
      return `<div class="mt-kpi mt-kpi-co" data-tip="${esc(`${note}${better ? '\nEn verde, el que va mejor; en rojo, el que va peor.' : ''}`)}"><div class="mt-kpi-l">${label}</div>
        ${[0, 1].map((j) => `<div class="mt-kpi-s"><i class="mt-c${j}"></i><span>${names[j]}</span><b class="mt-diff ${tn[j]}">${x[j] == null ? '—' : fmt(x[j])}</b></div>`).join('')}</div>`;
    };
    const CLOCKS = 'SISU, en su horario de atención (de lunes a viernes, de 7 a 22 h); SGA, en tiempo natural.';
    const TC = [
      ['Entran', (s) => num(s.n), 'Las que recibe el turno, entre semana.'],
      ['Entran por turno', (s) => opt(dec)(s.perTurn), 'Media de las que recibe cada turno de este tipo, de lunes a viernes.'],
      ['Empezadas dentro del SLA', (s) => slaPct(s), ''],
      ['Empezadas en su turno', (s) => opt(pct)(s.inShift), 'De las que se empezaron, las que pasaron a En curso en el turno que las recibió.'],
      ['Resueltas en su turno', (s) => opt(pct)(s.resInShift), 'De las resueltas, las que se resolvieron en el turno que las recibió.'],
      ['Media hasta En curso', (s) => opt(dur)(s.ip), CLOCKS],
      ['Media de resolución', (s) => (s.resolved ? dur(s.avg) : '—'), CLOCKS],
    ];
    const row = (label, s, k) => `<tr><td><i class="mt-sw mt-c${k}"></i>${label}</td>${TC.map(([, f]) => `<td class="mt-num">${s?.n ? f(s) : '—'}</td>`).join('')}</tr>`;
    const body = `<tr class="mt-grp"><td colspan="${TC.length + 1}">${names[0]} · de lunes a viernes</td></tr>${SISU_SHIFTS.map((sn, k) => row(`${sn} <span class="mt-mut">· ${SISU_SHIFT_HOURS[k]}</span>`, ss[k], 0)).join('')}
      <tr class="mt-grp"><td colspan="${TC.length + 1}">${names[1]} · turnos de lunes a viernes</td></tr>${SHIFTS.map((sn, k) => row(`${sn} <span class="mt-mut">· ${SHIFT_HOURS[k]}</span>`, sg[k], 1)).join('')}`;
    const hours = (l, at) => byHour(m, l, at);
    // los dos en una sola gráfica: con el color de cada uno; lo que entra, de puntos; lo que se empieza, continuo; lo que se
    // resuelve, discontinuo
    const curves = day([[sisu, 0], [sga, 1]].flatMap(([l, k]) => [
      { label: `${names[k]} · entran`, cls: `mt-l-in${k}`, v: hours(l, (i) => C.rep[i]) },
      { label: `${names[k]} · se empiezan`, cls: `mt-l-st${k}`, v: hours(l, startAt) },
      { label: `${names[k]} · se resuelven`, cls: `mt-l-rs${k}`, v: hours(l, resAt) }]));
    const sc = sisuCarry(m, sisu), gc = m.carry(sga);
    const carryRows = [...SISU_SHIFTS.map((sn, j) => ({ label: `${names[0]} · ${sn}`, k: 0, v: sc[j] })), ...SHIFTS.map((sn, j) => ({ label: `${names[1]} · ${sn}`, k: 1, v: gc[j] }))];
    return grid(ask('turnos'), picker(),
      `<p class="mt-note">Comparando ${names[0]} y ${names[1]}, solo entre semana: de ${names[0]}, lo que entra de lunes a viernes, a cualquier hora (lo de la noche, en la mañana siguiente); de ${names[1]}, lo de sus turnos de lunes a viernes. Cada uno con sus turnos; las medias de ${names[0]}, en su horario de atención, y las de ${names[1]}, en tiempo natural. Ctrl+clic en el selector para dejar de comparar.</p>`,
      kpis(fig('Entran por día laborable', (s) => s.perDay, (v) => v.toLocaleString('es-ES', { maximumFractionDigits: 1 }), null, 'Las que entran entre semana, entre los días de lunes a viernes del periodo.'),
        fig('Empezadas dentro del SLA', (s) => s.sla, (v) => pct(v), 'high', 'Las que pasaron a En curso dentro del plazo de su prioridad.'),
        fig('Empezadas en su turno', (s) => s.inShift, (v) => pct(v), 'high', 'De las que se empezaron, en el turno que las recibió.'),
        fig('Resueltas en su turno', (s) => s.resInShift, (v) => pct(v), 'high', 'De las resueltas, en el turno que las recibió.'),
        fig('Media hasta En curso', (s) => s.ip, dur, 'low', `De la apertura al primer paso a En curso. ${CLOCKS}`),
        fig('Media de resolución', (s) => (s.resolved ? s.avg : null), dur, 'low', `De las resueltas, de la apertura a la resolución. ${CLOCKS}`)),
      card('Turno a turno', table('Turno', TC.map(([l, , tip]) => [l, tip]), body), { span: 's12', sub: `Los turnos de cada uno, entre semana: ${names[0]}, mañana y tarde; ${names[1]}, mañana, tarde y noche.` }),
      card('El día en 24 horas', curves, { span: 's12', sub: 'Entre semana: lo que entra, se empieza y se resuelve en cada hora, de los dos en la misma gráfica (cada uno con su color; lo que entra, de puntos; lo que se empieza, continuo; lo que se resuelve, discontinuo).' }),
      card('¿Qué se queda para el turno siguiente?', split(['En su turno', 'En el siguiente', 'Más tarde', 'Sin pasar por En curso'], carryRows), { span: 's12', sub: 'De lo que recibe cada turno de cada uno, entre semana, cuándo se empieza.' }));
  }

  return (A) => (cmpOn() ? cmpView(A) : onlySisu() ? sisuView(A) : allDay(A));
};
