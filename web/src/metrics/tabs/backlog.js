// Backlog: lo pendiente (backlog.js), su situación, los tramos de antigüedad y lo que conviene vigilar.
// De un solo lado, el panel y las tablas de detalle; comparando, cómo está lo pendiente de cada uno.
import { esc } from '../../ui/html.js';
import { num, dec, pct } from '../format.js';
import { OLD_DAYS } from '../rules.js';
import { situations, ages, OLD_FILTER, orphansIn as orphansOf, watchList, pendingCells, backlogFigures } from '../backlog.js';
import { blocksOf } from '../pieces.js';

export const backlogTab = (t) => {
  const { m, ch, grid, ask, heads, prioRows, asRows, late, old, escd, cardsOf, CARD_ROWS, days, topRows, volume, teamNames, headsNote, sideTable, mixCmp } = t;
  const { C, S, CRIT, OPEN, SIDE, CMP, CO, stats, bySide } = m;
  const { card, kpis, kpiCo, matrix } = ch;
  const SITUATION = situations(m), AGES = ages(m), orphansIn = () => orphansOf(m);
  // Lo pendiente, de un vistazo y en orden: el total; en qué punto está (en curso, sin tocar, devuelta y en espera de
  // un tercero, del cliente u otro motivo, que suman el total), en una barra; lo que conviene vigilar dentro
  // (se solapa: no se suma) y, aparte, lo de nuestras tarjetas que no tiene a nadie (no está en el total).
  // Solo con un lado: comparando, backlogCmp.
  const stockPanel = (T, ST) => {
    const k0 = CO()[0], people = S.sides.some((s) => s?.people);
    const open = T[k0].filter((i) => OPEN[i]), count = (test) => open.filter(test).length;
    const sit = SITUATION.map((x, k) => ({ ...x, k, v: count(x.test) })).filter((x) => x.v);
    const share = (x) => (open.length ? x.v / open.length : 0);
    const bar = `<div class="mt-st-track">${sit.map((x) => {
      const p = share(x);
      return `<i class="mt-sit${x.k}" style="width:${(p * 100).toFixed(2)}%" data-f="${x.f}" data-tip="${esc(`${x.label}\n${num(x.v)} de ${num(open.length)} (${pct(p)})\n${x.tip}`)}">${p >= 0.07 ? pct(p) : ''}</i>`;
    }).join('')}</div>`;
    const watch = watchList(m).map(([l, test, tip, f]) => [l, count(test), tip, f]);
    const total = `<section class="mt-st mt-st-total"><h4>Pendientes</h4><div class="mt-st-big"><b>${num(ST[k0].open)}</b></div>
      <p>sin resolver, de ${num(ST[k0].n)} recibidas en el periodo</p></section>`;
    const where = `<section class="mt-st mt-st-where"><h4>¿En qué punto están?<small>suman las pendientes</small></h4>
      <div class="mt-st-row">${bar}</div>
      <div class="mt-st-legend">${sit.map((x) => `<div class="mt-clk" data-f="${x.f}" data-tip="${esc(x.tip)}"><span><i class="mt-sit${x.k}"></i>${x.label}</span><b>${num(x.v)}</b><em>${pct(share(x))}</em></div>`).join('')}</div></section>`;
    const watchHtml = `<section class="mt-st mt-st-watch"><h4>A vigilar<small>dentro de las pendientes; se solapan</small></h4>
      ${watch.map(([l, v, tip, f]) => `<div class="mt-st-item mt-clk" data-f${f.includes('|') ? '2' : ''}="${f}" data-tip="${esc(tip)}"><span>${l}</span><b>${num(v)}</b></div>`).join('')}</section>`;
    const apart = people ? '' : `<section class="mt-st mt-st-apart"><h4>Aparte</h4><div class="mt-st-big"><b>${num(orphansIn().length)}</b></div>
      <p><b>Sin responsable</b>: de SGA, SISU o PRIO y sin nadie asignado. No están en las pendientes.</p></section>`;
    return `<div class="mt-stock ${people ? 'mt-st-noapart' : ''}">${total}${where}${watchHtml}${apart}</div>`;
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
        <td class="mt-num mt-mix-p ${ok(!pp && main === k)}">${v[k].sh == null ? '—' : pct(v[k].sh)}</td><td class="mt-num ${ok(old === k)}">${v[k].age == null ? '—' : dec(v[k].age)}</td>`).join('');
    };
    const rowAttrs = (r) => (r.f ? `data-f${r.f.includes('|') ? '2' : ''}="${r.f}" ${r.tip ? `data-tip="${esc(r.tip)}"` : ''}` : '');
    return sideTable({ cls: 'mt-pend2', cols: '<th class="mt-num">Issues</th><th class="mt-num">%</th><th class="mt-num" data-tip="Lo que llevan abiertas, de media, en días.">Antigüedad (días)</th>',
      blocks: blocksOf(rowsDef), cells, lead: { label: 'Pendientes', cells: cells({}) }, leadAtEnd: true, rowAttrs });
  };
  // Backlog, comparando: las cifras de arriba, cómo está lo pendiente de cada uno y qué tiene pendiente. Sin lo que no
  // tiene responsable (no es de nadie: no hay con qué compararlo) ni las tablas de detalle por módulo, centro y escalado
  // (son para gestionar el propio backlog; para comparar un módulo o un centro, se filtra). Sin tarjetas: cada empresa
  // las usa a su manera.
  const backlogCmp = (A) => {
    const T = bySide(A), P = T.map((l) => l.filter((i) => OPEN[i])), op = A.filter((i) => OPEN[i]), pp = m.perHead(), d = days() || 1;
    const H = heads(), each = pp ? ' por persona' : '', names = teamNames();
    const sit = (k) => (i) => m.DIMS.sit.get(i) === k;
    const { part, age, stock } = backlogFigures(m, T, P, H, pp, d);
    const partFig = (label, test, better, note) => kpiCo(pp ? `${label}${each}` : `% ${label.toLowerCase()}`, part(test), pp ? (s) => dec(s.v) : (s) => pct(s.v), { val: (s) => s.v, better, note: `${note}${headsNote()}`, names });
    const pendRows = [
      { head: 'Situación', note: 'Suman las pendientes.' },
      ...SITUATION.map((x, k) => ({ ...x, better: k === 1 || k === 2 ? 'low' : null })).filter((x) => op.some(x.test)),
      { head: 'A vigilar', note: 'Dentro de las pendientes; se solapan.' },
      { label: 'Fuera de plazo', test: late, f: 'sl:4', better: 'low', tip: 'Nunca han pasado a En curso y ya superan el plazo de su prioridad.' },
      { label: `Con más de ${OLD_DAYS} días`, test: old, f: OLD_FILTER, better: 'low', tip: `Llevan más de ${OLD_DAYS} días abiertas.` },
      { label: 'Escaladas', test: escd, f: 'es:1', tip: 'Con ticket de tercero, estén en el estado que estén.' },
      { label: 'Críticas', test: (i) => C.pr[i] === CRIT, f: `pr:${CRIT}` },
    ];
    const mixRows = [{ head: 'Prioridad' }, ...asRows(prioRows()), { head: 'Módulo' }, ...topRows('mo', op, 8)];
    return grid(ask('backlog'),
      kpis(kpiCo(`Pendientes${each}`, volume(P), pp ? (s) => dec(s.v) : (s) => num(s.v), { val: (s) => s.v, note: `sin resolver, de lo recibido en el periodo${headsNote()}`, names }),
        kpiCo('Días de entrada acumulados', stock, (s) => dec(s.v), { val: (s) => s.v, better: 'low', note: 'Las pendientes entre lo que entra al día: cuántos días de trabajo tiene acumulados cada uno. Así se compara quien recibe mucho con quien recibe poco.' }),
        kpiCo('Antigüedad media, en días', age, (s) => dec(s.v), { val: (s) => s.v, better: 'low', note: 'Lo que llevan abiertas las pendientes, de media.' }),
        partFig('Sin tocar', sit(1), 'low', 'En Asignada y sin ningún movimiento desde que se abrieron'),
        partFig('Fuera de plazo', late, 'low', 'Nunca han pasado a En curso y ya superan el plazo de su prioridad'),
        partFig(`Con más de ${OLD_DAYS} días`, old, 'low', `Llevan más de ${OLD_DAYS} días abiertas`),
        partFig('Escaladas', escd, null, 'Con ticket de tercero: dependen de otros')),
      card('Cómo está lo pendiente', pendCmp(pendRows, op), { span: 's12', sub: `${pp ? 'Issues de cada uno; las de la empresa, la media por persona de su equipo.' : 'Qué parte de sus pendientes está en cada situación.'} En verde, quien va mejor en lo que depende de él; lo que espera a otros, sin color. Clic en una fila para filtrar.` }),
      card('Qué tiene pendiente cada uno', mixCmp(mixRows, op, 'Pendientes'), { span: 's12', sub: 'Los 8 módulos con más pendientes; «Resto», los demás. Clic en una fila para filtrar.' }));
  };

  return (A) => {
    if (CMP()) return backlogCmp(A);
    const T = bySide(A), ST = T.map(stats), inA = (i) => SIDE[i] < 2;
    const op = A.filter((i) => OPEN[i]), people = S.sides.some((s) => s?.people), orphans = people ? [] : orphansIn();
    // lo pendiente: su situación y, aparte, lo que hay que vigilar
    // solo las situaciones que hay (una sin ninguna issue no aporta y quita sitio)
    const SIT = SITUATION.filter((x) => op.some(x.test));
    const pend = { label: 'Pendientes', test: inA };
    const stateRows = [
      { head: 'Situación', note: 'Suman las pendientes.' },
      ...SIT.map((s) => ({ ...s, test: (i) => inA(i) && s.test(i) })),
      { head: 'A vigilar', note: 'Dentro de las pendientes.' },
      { label: 'Fuera de plazo', tip: 'Sin iniciar: nunca han pasado a En curso y ya superan su SLA.', test: (i) => inA(i) && late(i), f: 'sl:4' },
      { label: 'Escaladas', tip: 'Con ticket de tercero.', test: (i) => inA(i) && escd(i), f: 'es:1' },
      { label: 'PRIO', test: (i) => inA(i) && cardsOf(i).includes(2), f: 'tj:2' },
      { label: 'Críticas', test: (i) => inA(i) && C.pr[i] === CRIT, f: `pr:${CRIT}` },
      ...(orphans.length ? [{ head: 'Aparte', note: 'SGA, SISU o PRIO sin nadie asignado.' }, { label: 'Sin responsable', test: (i) => !C.as[i] }] : []),
    ];
    const prioCards = [{ head: 'Prioridad' }, ...asRows(prioRows()), { head: 'Tarjeta', note: 'Una PRIO cuenta también en su SGA o SISU.' }, ...asRows(CARD_ROWS())];
    const modRows = topRows('mo', op, 12), esc3 = op.filter(escd);
    const st = { total: true, foot: pend };

    return grid(ask('backlog'),
      stockPanel(T, ST),
      card('En qué situación está y desde cuándo', matrix(stateRows, AGES, [...op, ...orphans], { ...st, share: true, of: op.length, corner: 'Antigüedad →' }),
        { span: 's6', sub: 'Las situaciones suman las pendientes. Debajo, lo que conviene vigilar dentro de ellas, y aparte lo que no tiene responsable. Clic en una celda para filtrar.' }),
      card('Por prioridad y tarjeta', matrix(prioCards, SIT, op, { ...st, corner: 'Situación →' }), { span: 's6', sub: 'En qué situación está lo pendiente de cada prioridad y tarjeta.' }),
      card('Por módulo: en qué situación', matrix(modRows, SIT, op, { ...st, corner: 'Módulo · situación →' }), { span: 's6', sub: 'Los 12 módulos con más pendientes; «Resto», los demás. Clic en una celda para filtrar.' }),
      card('Por módulo: desde cuándo', matrix(modRows, AGES, op, { ...st, corner: 'Módulo · antigüedad →' }), { span: 's6', sub: 'Los mismos módulos, por lo que lleva abierto lo suyo.' }),
      card('Escaladas: a quién y desde cuándo', esc3.length ? matrix(topRows('vt', esc3, 10), AGES, esc3, { total: true, foot: { label: 'Escaladas', test: () => true }, corner: 'Destino · antigüedad →' }) : '<p class="mt-mut mt-small">Nada escalado.</p>',
        { span: 's6', sub: 'Lo pendiente con ticket de tercero, por destino del escalado (prefijo del ticket).' }),
      card('Por centro: desde cuándo', matrix(topRows('ce', op, 10), AGES, op, { ...st, corner: 'Centro · antigüedad →' }), { span: 's6', sub: 'Los 10 centros con más pendientes; «Resto», los demás.' }));
  };
};
