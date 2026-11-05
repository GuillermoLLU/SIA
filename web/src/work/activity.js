// La actividad por día de Equipo soporte (sin DOM): las issues resueltas, escaladas a proveedor y pasadas a pendiente
// de cliente cada día, apiladas. Cuenta lo que pasa ese día, se abriera la issue cuando se abriera (dataset.js eR/eV/eC,
// una vez por issue y día), y se atribuye al responsable actual. Pinchar un día hace foco en él y pincharlo otra vez lo
// quita; con Ctrl se eligen varios, seguidos o no, y arrastrando, un rango. La gráfica sigue enseñando el periodo de
// partida (range.base), con lo elegido (range.days) resaltado.
//
// Pinchar una serie la compara con la media del equipo, las dos con la misma vara. Todo el equipo: lo de cada día frente a
// la media al día del periodo de partida (comparePerDay). Una persona: lo suyo de cada día por turno trabajado frente a la media
// por persona y turno de todo el equipo (turnsByDay; per-shift.js, la fila del equipo de la tabla). Cada paso es de quien lo hizo.
import { esc } from '../ui/html.js';
import { num, dec, MONTHS } from '../metrics/format.js';
import { KINDS, sessionAt } from './per-shift.js';

const DAY = 1440;
const LABELLED = 31;   // hasta estos días, cada barra lleva su total y su día; con más no caben
const ONE_LINE = 16;   // hasta estos días, el día de cada barra cabe en una línea; con más, en tres
const TICKS = 12;
const HEADROOM = 1.15;   // sitio sobre la barra más alta para su cifra
// [clave (per-shift.js), nombre, color]
const SERIES = [['r', 'Resueltas', 'wk-act-r'], ['v', 'Escaladas a proveedor', 'wk-act-v'], ['c', 'Pendientes de cliente', 'wk-act-c']];

// El nombre de un día bajo su barra, «L 23 oct 2026». base: el instante del minuto 0 del modelo (model.js, BASE).
export const axisDay = (base) => (min) => {
  const d = new Date(base + min * 6e4);
  return `${'LMXJVSD'[(d.getUTCDay() + 6) % 7]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};

const dayGrid = ([d0, d1], make) => {
  const day0 = Math.floor(d0 / DAY), n = Math.ceil((d1 - d0) / DAY);
  return { day0, n, days: Array.from({ length: n }, (_, k) => make((day0 + k) * DAY)) };
};

// C: las columnas del modelo; list: las issues que se miran; [d0, d1): el periodo, en minutos; allowed: de qué personas.
// Una vez por issue, tipo de paso y día.
export const dailyActivity = (C, list, range, allowed = () => true) => {
  const { day0, n, days } = dayGrid(range, (day) => ({ day, r: 0, v: 0, c: 0 }));
  for (const i of list) {
    const seen = new Set();
    for (const [kind, t, p] of C.sp?.[i] || []) {
      const j = Math.floor(t / DAY) - day0, once = `${kind}:${j}`;
      if (!allowed(p) || j < 0 || j >= n || seen.has(once)) continue;
      seen.add(once);
      days[j][KINDS[kind]]++;
    }
  }
  return days;
};

// Una serie (k) de una persona (who) por turno, cada día del periodo: los pasos de sus sesiones que terminan ese día, entre
// los turnos de esas sesiones (per-shift.js). sessions: las de todos (data.sessions). value: pasos por turno; sin turnos, null.
export const turnsByDay = (C, sessions, range, k, who) => {
  const { day0, days } = dayGrid(range, (day) => ({ day, count: 0, turns: 0 }));
  const dayOf = ([, to]) => days[Math.floor(to / DAY) - day0];
  for (const s of sessions[who] || []) { const d = dayOf(s); if (d) d.turns += s[2]; }
  for (const steps of C.sp || []) {
    for (const [kind, t, p] of steps) {
      if (p !== who || KINDS[kind] !== k) continue;
      const s = sessionAt(sessions[who], t), d = s && dayOf(s);
      if (d) d.count++;
    }
  }
  return days.map((d) => ({ ...d, value: d.turns ? d.count / d.turns : null }));
};

// Una serie (k) de la actividad (dailyActivity) para comparar por día: la media, entre todos los días, también los que
// no tuvieron actividad.
export const comparePerDay = (days, k) => ({
  per: 'día',
  days: days.map((d) => ({ day: d.day, count: d[k], value: d[k] })),
  avg: days.length ? days.reduce((sum, d) => sum + d[k], 0) / days.length : null,
});

// Pinchar de un día (a) a otro (b), en minutos; multi: con Ctrl. Da el periodo que abarca lo elegido y el rango; sin nada
// elegido, el periodo de partida. Sin Ctrl sustituye lo elegido o, si es lo mismo, lo quita; con Ctrl, lo añade o lo quita.
export const pickDays = (range, current, a, b, multi = false) => {
  const base = range?.base || current, had = range?.days || [], picked = [];
  for (let d = Math.min(a, b); d <= Math.max(a, b); d += DAY) picked.push(d);
  const hasAll = picked.every((d) => had.includes(d));
  const days = multi
    ? (hasAll ? had.filter((d) => !picked.includes(d)) : [...new Set([...had, ...picked])]).sort((x, y) => x - y)
    : hasAll && had.length === picked.length ? [] : picked;
  return days.length ? { period: [days[0], days[days.length - 1] + DAY], range: { base, days } } : { period: base, range: null };
};

// los turnos pueden ser una fracción (0,25): con dos decimales, para que cuadren con los pasos por turno
const turnsText = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const avgText = (v) => (v == null ? '—' : dec(v));
const versus = (v, avg) => (v === avg ? 'en la media' : v > avg ? 'por encima de la media' : 'por debajo de la media');

// opts: title; dayName (el nombre de un día); axis: el de bajo cada barra; sel: los días elegidos o null; picked: la serie pinchada o null;
// compare: con ella, { per: 'día' o 'turno', days: comparePerDay o turnsByDay, avg: la media del equipo }, o null si faltan los turnos.
export const activityPanel = (days, { title, dayName, axis = dayName, sel = null, picked = null, compare = null }) => {
  const inSel = (d) => !sel || sel.includes(d.day);
  const total = (d) => d.r + d.v + d.c;
  const series = SERIES.find(([k]) => k === picked);
  const n = days.length, labelled = n <= LABELLED, every = labelled ? 1 : Math.ceil(n / TICKS), stacked = labelled && n > ONE_LINE;
  const axisText = (min) => {
    const words = esc(axis(min)).split(' ');
    return stacked ? [words.slice(0, 2).join(' '), ...words.slice(2)].join('<br>') : words.join(' ');
  };
  const max = compare ? Math.max(compare.avg || 0, ...compare.days.map((d) => d.value || 0)) || 1 : Math.max(1, ...days.map(total));
  const legend = SERIES.map(([k, name, cls]) => {
    const count = days.filter(inSel).reduce((sum, d) => sum + d[k], 0), on = k === picked;
    return `<button class="wk-act-key${on ? ' wk-act-on' : picked ? ' wk-act-dim' : ''}" data-act-series="${k}" aria-pressed="${on}" title="${on ? 'Volver a la actividad' : 'Comparar con la media del equipo'}"><i class="${cls}"></i>${name} <b>${num(count)}</b></button>`;
  }).join('');
  const what = !series ? 'Pincha un día para verlo y otra vez para quitarlo; Ctrl + clic para elegir varios'
    : compare ? `${series[1]} ${compare.per === 'día' ? 'por día' : 'por turno trabajado'}, frente a la media del equipo` : 'Faltan los turnos para comparar: reinicia SIA';
  const hint = sel
    ? `<span class="wk-act-hint">${sel.length <= 3 ? sel.map((d) => esc(dayName(d))).join(', ') : `${num(sel.length)} días, de ${esc(dayName(sel[0]))} a ${esc(dayName(sel[sel.length - 1]))}`}</span><button class="wk-block-link wk-act-clear" data-range-clear>Quitar selección</button>`
    : `<span class="wk-act-hint">${what}</span>`;
  const height = (v) => (v / (max * HEADROOM) * 100).toFixed(2);
  const column = (d, k, tip, marks, label) => `<div class="wk-act-day${inSel(d) ? '' : ' wk-act-out'}" data-act-day="${d.day}" data-tip="${esc(tip)}">
      <span class="wk-act-bar">${marks}${labelled && label ? `<span class="wk-act-n">${label}</span>` : ''}</span>
      <span class="wk-act-x">${k % every ? '' : axisText(d.day)}</span></div>`;
  const byTurn = compare?.per === 'turno';
  const bars = compare
    ? compare.days.map((d, k) => column(d, k,
      [dayName(d.day), ...(byTurn ? [`${series[1]}: ${num(d.count)} en ${turnsText.format(d.turns)} ${d.turns === 1 ? 'turno' : 'turnos'}`, ...(d.value == null ? [] : [`Por turno: ${dec(d.value)}`])] : [`${series[1]}: ${num(d.count)}`]), `Media del equipo: ${avgText(compare.avg)}`, ...(d.value == null || compare.avg == null ? [] : [versus(d.value, compare.avg)])].join('\n'),
      d.value ? `<i class="${series[2]}" style="height:${height(d.value)}%"></i>` : '', d.value == null ? '' : byTurn ? dec(d.value) : num(d.value))).join('')
    : days.map((d, k) => column(d, k,
      [dayName(d.day), ...SERIES.map(([s, name]) => `${name}: ${num(d[s])}`), `Total: ${num(total(d))}`].join('\n'),
      SERIES.filter(([s]) => d[s]).map(([s, , cls]) => `<i class="${cls}" style="height:${height(d[s])}%"></i>`).join(''), total(d) ? num(total(d)) : '')).join('');
  // la línea, a la misma escala que las barras (su alto no cuenta los días de abajo: --wk-act-x)
  const line = compare?.avg == null ? '' : `<span class="wk-act-avg" style="--at:${height(compare.avg)}"><span>Media del equipo: ${dec(compare.avg)} por ${compare.per}</span></span>`;
  return `<section class="wk-block wk-activity"><div class="wk-block-h"><h3>${esc(title)}</h3>${hint}<span class="wk-act-keys">${legend}</span></div>
    <div class="wk-act-plot${n > 62 ? ' wk-act-dense' : ''}${stacked ? ' wk-act-tall' : ''}" data-act-plot>${labelled ? '' : `<span class="wk-act-max">máx. ${byTurn ? `${dec(max)} por turno` : `${num(max)} al día`}</span>`}${bars}${line}</div></section>`;
};
