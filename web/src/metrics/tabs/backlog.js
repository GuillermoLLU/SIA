// Lo pendiente en detalle (backlog.js): su situación, los tramos de antigüedad y lo que conviene vigilar. Ya no es una
// pestaña: lo pinta Foto de hoy (hoy.js), con lo abierto ahora (se abriera cuando se abriera). De un solo lado, el panel
// (sin el total: está en la corona) y las tablas de detalle; comparando, las cifras de cómo está lo pendiente de cada
// uno y su tabla (sin la de qué tiene pendiente: es el «Cómo se reparte» de Foto de hoy).
import { esc } from '../../ui/html.js';
import { num, dec, pct, dur } from '../format.js';
import { OLD_DAYS } from '../rules.js';
import { situations, ages, OLD_FILTER, watchList, pendingCells, backlogFigures, reopened, REOPEN_FILTER, REOPEN_TIP,
  misrouted, MISROUTED_FILTER, MISROUTED_TIP } from '../backlog.js';
import { blocksOf } from '../pieces.js';

export const backlogParts = (t) => {
  const { m, ch, heads, prioRows, asRows, late, old, escd, cardsOf, CARD_ROWS, days, topRows, teamNames, headsNote, sideTable } = t;
  const { C, CRIT, OPEN, SIDE, bySide } = m;
  const { card, kpis, kpiCo, matrix } = ch;
  const SITUATION = situations(m), AGES = ages(m), reop = reopened(m), misr = misrouted(m);
  // Lo pendiente, de un vistazo y en orden (el total, en la corona de Foto de hoy): en qué punto está (en curso, sin tocar, devuelta y en espera de
  // un tercero, del cliente u otro motivo, que suman el total), en una barra; lo que conviene vigilar dentro
  // (se solapa: no se suma) y, a la derecha, lo que se le pase (Foto de hoy: la antigüedad media). open: lo abierto que
  // se mira (con las sin asignar, si las hay). Solo con un lado.
  const stockPanel = (open, aside = '') => {
    const count = (test) => open.filter(test).length;
    const sit = SITUATION.map((x, k) => ({ ...x, k, v: count(x.test) })).filter((x) => x.v);
    const share = (x) => (open.length ? x.v / open.length : 0);
    const bar = `<div class="mt-st-track">${sit.map((x) => {
      const p = share(x);
      return `<i class="mt-sit${x.k}" style="width:${(p * 100).toFixed(2)}%" data-f="${x.f}" data-tip="${esc(`${x.label}\n${num(x.v)} de ${num(open.length)} (${pct(p)})\n${x.tip}`)}">${p >= 0.07 ? pct(p) : ''}</i>`;
    }).join('')}</div>`;
    const watch = watchList(m).map(([l, test, tip, f]) => [l, count(test), tip, f]);
    const where = `<section class="mt-st mt-st-where"><h4>¿En qué punto están?<small>suman las pendientes</small></h4>
      <div class="mt-st-row">${bar}</div>
      <div class="mt-st-legend">${sit.map((x) => `<div class="mt-clk" data-f="${x.f}" data-tip="${esc(x.tip)}"><span><i class="mt-sit${x.k}"></i>${x.label}</span><b>${num(x.v)}</b><em>${pct(share(x))}</em></div>`).join('')}</div></section>`;
    const watchHtml = `<section class="mt-st mt-st-watch"><h4>A vigilar<small>dentro de las pendientes; se solapan</small></h4>
      ${watch.map(([l, v, tip, f]) => `<div class="mt-st-item mt-clk" data-f${f.includes('|') ? '2' : ''}="${f}" data-tip="${esc(tip)}"><span>${l}</span><b>${num(v)}</b></div>`).join('')}</section>`;
    return `<div class="mt-stock mt-st-nototal ${aside ? '' : 'mt-st-noapart'}">${where}${watchHtml}${aside}</div>`;
  };
  // Lo pendiente, comparando: no cuánto hay (depende de lo que entra), sino cómo está. Cada fila, por lado: sus issues
  // (con personas, la media por persona del equipo), qué parte son de sus pendientes y cuánto llevan abiertas de media.
  // En verde, el lado que va mejor solo en lo que depende de él (r.better): entre empresas, por el %; con personas, por
  // las issues (con 8–10 pendientes, una sola mueve el % diez puntos). Lo que espera a otros, sin color. La fila de las
  // pendientes, al final, como en el resto de tablas.
  const pendCmp = (rowsDef, op) => {
    const T = bySide(op), pp = m.perHead(), H = heads();
    const cells = (r) => {
      const { v, main, old } = pendingCells(m, T, H, pp, r);
      const ok = (on) => (on ? 'mt-better' : '');
      return [0, 1].map((k) => `<td class="mt-num ${k ? 'mt-msep' : 'mt-gsep'} ${ok(pp && main === k)}">${H[k] > 1 ? dec(v[k].c) : num(v[k].c)}</td>
        <td class="mt-num mt-mix-p ${ok(!pp && main === k)}">${v[k].sh == null ? '—' : pct(v[k].sh)}</td><td class="mt-num ${ok(old === k)}">${dur(v[k].age)}</td>`).join('');
    };
    const rowAttrs = (r) => (r.f ? `data-f${r.f.includes('|') ? '2' : ''}="${r.f}" ${r.tip ? `data-tip="${esc(r.tip)}"` : ''}` : '');
    return sideTable({ cls: 'mt-pend2', cols: '<th class="mt-num">Incidencias</th><th class="mt-num">%</th><th class="mt-num" data-tip="Lo que llevan abiertas, de media.">Antigüedad</th>',
      blocks: blocksOf(rowsDef), cells, lead: { label: 'Pendientes', cells: cells({}) }, leadAtEnd: true, rowAttrs });
  };
  // Comparando (now: lo abierto ahora, de los dos lados; A: lo recibido en el periodo, para lo que entra al día): las
  // cifras de cómo está lo pendiente de cada uno (sin cuántas ni su antigüedad media: están en la corona y en Foto de
  // hoy) y su tabla. Sin lo que no tiene responsable (no es de nadie: no hay con qué compararlo) ni las tablas de detalle
  // por módulo, centro y escalado (son para gestionar el propio backlog; para comparar un módulo o un centro, se
  // filtra). Sin tarjetas: cada empresa las usa a su manera.
  const cmpParts = (now, A) => {
    const T = bySide(A), op = now.filter((i) => OPEN[i]), P = bySide(op), pp = m.perHead(), d = days() || 1;
    const H = heads(), each = pp ? ' por persona' : '', names = teamNames();
    const sit = (k) => (i) => m.DIMS.sit.get(i) === k;
    const { part, stock } = backlogFigures(m, T, P, H, pp, d);
    const partFig = (label, test, better, note) => kpiCo(pp ? `${label}${each}` : `% ${label.toLowerCase()}`, part(test), pp ? (s) => dec(s.v) : (s) => pct(s.v), { val: (s) => s.v, better, note: `${note}${headsNote()}`, names });
    const pendRows = [
      { head: 'Situación', note: 'Suman las pendientes.' },
      ...SITUATION.map((x, k) => ({ ...x, better: k === 1 || k === 2 ? 'low' : null })).filter((x) => op.some(x.test)),
      { head: 'A vigilar', note: 'Dentro de las pendientes; se solapan.' },
      { label: 'Fuera de plazo', test: late, f: 'sl:4', better: 'low', tip: 'Nunca han pasado a En curso y ya superan el plazo de su prioridad.' },
      { label: `Con más de ${OLD_DAYS} días`, test: old, f: OLD_FILTER, better: 'low', tip: `Llevan más de ${OLD_DAYS} días abiertas.` },
      { label: 'Escaladas', test: escd, f: 'es:1', tip: 'Han estado en Pendiente de un tercero, estén ahora en el estado que estén.' },
      { label: 'Mal escaladas', test: misr, f: MISROUTED_FILTER, better: 'low', tip: MISROUTED_TIP },
      { label: 'Reabiertas', test: reop, f: REOPEN_FILTER, better: 'low', tip: REOPEN_TIP },
      { label: 'Críticas', test: (i) => C.pr[i] === CRIT, f: `pr:${CRIT}` },
    ];
    return {
      kpis: [kpiCo('Días de entrada acumulados', stock, (s) => dec(s.v), { val: (s) => s.v, better: 'low', note: 'Lo abierto ahora entre lo que entra al día en el periodo: cuántos días de trabajo tiene acumulados cada uno. Así se compara quien recibe mucho con quien recibe poco.' }),
        partFig('Sin tocar', sit(1), 'low', 'En Asignada y sin ningún movimiento desde que se abrieron'),
        partFig('Fuera de plazo', late, 'low', 'Nunca han pasado a En curso y ya superan el plazo de su prioridad'),
        partFig(`Con más de ${OLD_DAYS} días`, old, 'low', `Llevan más de ${OLD_DAYS} días abiertas`),
        partFig('Escaladas', escd, null, 'Han estado en Pendiente de un tercero: dependen de otros')],
      table: card('Cómo está lo pendiente', pendCmp(pendRows, op), { span: 's12', sub: `${pp ? 'Incidencias de cada uno; las de la empresa, la media por persona de su equipo.' : 'Qué parte de sus pendientes está en cada situación.'} En verde, quien va mejor en lo que depende de él; lo que espera a otros, sin color. Clic en una fila para filtrar.` }),
    };
  };

  // De un solo lado (now: lo abierto ahora y lo cerrado, como lo da m.today(); lo sin técnico de las búsquedas del
  // equipo ya va con Indra: model.js, SEARCH_OWNER)
  const single = (now, aside = '') => {
    const A = now, inA = (i) => SIDE[i] < 2;
    const op = A.filter((i) => OPEN[i] && inA(i));
    // lo pendiente: su situación y, aparte, lo que hay que vigilar
    // solo las situaciones que hay (una sin ninguna issue no aporta y quita sitio)
    const SIT = SITUATION.filter((x) => op.some(x.test));
    const pend = { label: 'Pendientes', test: inA };
    const stateRows = [
      { head: 'Situación', note: 'Suman las pendientes.' },
      ...SIT.map((s) => ({ ...s, test: (i) => inA(i) && s.test(i) })),
      { head: 'A vigilar', note: 'Dentro de las pendientes.' },
      { label: 'Fuera de plazo', tip: 'Sin iniciar: nunca han pasado a En curso y ya superan su SLA.', test: (i) => inA(i) && late(i), f: 'sl:4' },
      { label: 'Sin tocar', tip: 'En Asignada y sin ningún movimiento desde que se abrieron: nadie las ha mirado.', test: (i) => inA(i) && m.DIMS.sit.get(i) === 1, f: 'sit:1' },
      { label: 'Escaladas', tip: 'Han estado en Pendiente de un tercero.', test: (i) => inA(i) && escd(i), f: 'es:1' },
      { label: 'Mal escaladas', tip: MISROUTED_TIP, test: (i) => inA(i) && misr(i), f: MISROUTED_FILTER },
      { label: 'Reabiertas', tip: REOPEN_TIP, test: (i) => inA(i) && reop(i), f: REOPEN_FILTER },
      { label: 'PRIO', test: (i) => inA(i) && cardsOf(i).includes(2), f: 'tj:2' },
      { label: 'Críticas', test: (i) => inA(i) && C.pr[i] === CRIT, f: `pr:${CRIT}` },
    ];
    const prioCards = [{ head: 'Prioridad' }, ...asRows(prioRows()), { head: 'Tarjeta', note: 'Una PRIO cuenta también en su SGA o SISU.' }, ...asRows(CARD_ROWS())];
    const modRows = topRows('mo', op, 12), esc3 = op.filter((i) => m.C.vt[i] > 0);   // con ticket de tercero, por su proyecto Jira
    const st = { total: true, foot: pend };

    return [
      stockPanel(op, aside),
      card('En qué situación está y desde cuándo', matrix(stateRows, AGES, op, { ...st, share: true, of: op.length, corner: 'Antigüedad →' }),
        { span: 's6', sub: 'Las situaciones suman las pendientes. Debajo, lo que conviene vigilar dentro de ellas. Clic en una celda para filtrar.' }),
      card('Por prioridad y tarjeta', matrix(prioCards, SIT, op, { ...st, corner: 'Situación →' }), { span: 's6', sub: 'En qué situación está lo pendiente de cada prioridad y tarjeta.' }),
      card('Por módulo: en qué situación', matrix(modRows, SIT, op, { ...st, corner: 'Módulo · situación →' }), { span: 's6', sub: 'Los 12 módulos con más pendientes; «Resto», los demás. Clic en una celda para filtrar.' }),
      card('Por módulo: desde cuándo', matrix(modRows, AGES, op, { ...st, corner: 'Módulo · antigüedad →' }), { span: 's6', sub: 'Los mismos módulos, por lo que lleva abierto lo suyo.' }),
      card('Escaladas: a quién y desde cuándo', esc3.length ? matrix(topRows('vp', esc3, 10), AGES, esc3, { total: true, foot: { label: 'Escaladas', test: () => true }, corner: 'Proyecto Jira · antigüedad →' }) : '<p class="mt-mut mt-small">Nada escalado.</p>',
        { span: 's6', sub: 'Lo pendiente con ticket de tercero, por el proyecto Jira al que se escaló; «(sin clave Jira)», las de un ticket que no es de Jira. Clic en una celda para filtrar.' }),
      card('Por centro: desde cuándo', matrix(topRows('ce', op, 10), AGES, op, { ...st, corner: 'Centro · antigüedad →' }), { span: 's6', sub: 'Los 10 centros con más pendientes; «Resto», los demás.' })];
  };
  return { single, cmpParts };
};
