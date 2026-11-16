// Entrantes: lo que entra, cómo se va cerrando y lo que queda pendiente, con tablas que cuadran (flow.js):
// cada una con su total, y los totales iguales a las cifras de arriba. Debajo de las cifras, lo que entra frente a lo
// atendido día a día: de lo que entró, o de todo (evolucion.js; antes, en el Histórico).
import { num, dec, pct, nice } from '../format.js';
import { CARDS } from '../model.js';
import { OLD_DAYS, DAY } from '../rules.js';
import { closedInPeriod as closedIn, ledger as ledgerOf } from '../flow.js';
import { opt } from './common.js';
import { evolutionOf } from './evolucion.js';

const PLURAL = { CRITICAL: 'Críticas', HIGH: 'Altas', MEDIUM: 'Medias', LOW: 'Bajas' };

// Mes a mes (o día a día con un solo mes): de lo recibido en cada tramo, cuánto se ha cerrado y cuánto
// sigue abierto (por cerrar), y el movimiento del tramo: lo resuelto en él,
// el saldo y lo que quedaba pendiente al cerrarlo. La fila Total cuadra con las cifras de arriba.
// En dos bloques, de izquierda a derecha: lo recibido ese mes y qué ha sido de ello (cuánto se cerró
// en el propio mes, cuánto hasta hoy y qué queda), y lo que pasó en el mes (lo resuelto, cuánto era de
// meses anteriores, el saldo y la pila que quedó, con lo envejecido).
const LEDGER_GROUPS = [['Lo recibido ese mes', 4], ['Lo que pasó en el mes', 5]];
// Cada dato: [nombre, cómo se ve, nota]. De un solo lado (comparando, ledgerCmp).
const LEDGER = [
  ['Recibidas', (s) => num(s.in), 'Incidencias abiertas en ese mes (o día).'],
  ['% cerrado en el mes', (s) => (s.in ? pct(s.same / s.in, 1) : '—'), 'De las recibidas en ese mes, las que se cerraron antes de acabar el mismo mes. Se puede comparar entre meses: cuanto más bajo, más se queda para después.'],
  ['% cerrado hasta hoy', (s) => (s.in ? pct(s.closed / s.in, 1) : '—'), 'De las recibidas en ese mes, las que ya están resueltas, cerradas o canceladas hoy. En los meses pasados tiende al 100 %.'],
  ['Por cerrar', (s) => num(s.still), 'De las recibidas en ese mes, las que siguen sin resolver hoy. Su total es el backlog del periodo.'],
  ['Resueltas', (s) => num(s.out), 'Lo que se resolvió dentro de ese mes (o día), se abriera cuando se abriera dentro del periodo.'],
  ['De meses anteriores', (s) => num(s.prev), 'De las resueltas en el mes, las que se abrieron en un mes anterior: el esfuerzo que se va en sacar backlog.'],
  ['Saldo', (s) => `${s.out - s.in > 0 ? '+' : ''}${num(s.out - s.in)}`, 'Resueltas menos recibidas en el mes: en positivo, la pila baja; en negativo, crece.'],
  ['Pendientes al cierre', (s) => num(s.open), 'De lo recibido desde el inicio del periodo, lo que seguía abierto al acabar el mes (o el día).'],
  [`Con más de ${OLD_DAYS} días`, (s) => num(s.old), `De las pendientes al cierre, las que ya llevaban más de ${OLD_DAYS} días abiertas: si sube, el backlog envejece.`],
];
// Comparando: cada dato en dos columnas, una por lado, con su valor (no la diferencia). Entre empresas, lo que
// depende de cuánto entra va en relación a lo que entra, para poder compararlo; con personas, el volumen es la
// media por persona (la de la empresa, de todo su equipo: model.js, heads) y los % no cambian. En verde, el lado
// que va mejor, solo en lo que tiene un mejor; en naranja ('warn'), el que más saca de meses anteriores: un aviso de
// que se abre más de lo que se cierra. Cada dato: [nombre, valor, tipo (p %, n número, v volumen), mejor, nota].
const LEDGER_CMP = {
  co: [['Lo recibido ese mes', [
    ['Recibidas', (s) => s.in, 'n', null, 'Incidencias abiertas en ese mes.'],
    ['% cerrado en el mes', (s) => (s.in ? s.same / s.in : null), 'p', 'high', 'De las recibidas en ese mes, las cerradas antes de acabar el mismo mes.'],
    ['% cerrado hasta hoy', (s) => (s.in ? s.closed / s.in : null), 'p', 'high', 'De las recibidas en ese mes, las que ya están resueltas, cerradas o canceladas hoy.']]],
  ['Lo que pasó en el mes', [
    ['Resueltas por cada 100 recibidas', (s) => (s.in ? s.out / s.in * 100 : null), 'n', 'high', 'Más de 100: se resolvió más de lo que entró y la pila bajó; menos de 100, creció.'],
    ['% de meses anteriores', (s) => (s.out ? s.prev / s.out : null), 'p', 'warn', 'De lo resuelto en el mes, lo que se abrió en un mes anterior: el esfuerzo en sacar backlog.'],
    [`% pendientes con más de ${OLD_DAYS} días`, (s) => (s.open ? s.old / s.open : null), 'p', 'low', `De lo pendiente al acabar el mes, lo que ya llevaba más de ${OLD_DAYS} días abierto: si sube, el backlog envejece.`]]]],
  pp: [['Lo recibido ese mes', [
    ['Recibidas', (s) => s.in, 'v', null, 'Incidencias abiertas en ese mes.'],
    ['% cerrado en el mes', (s) => (s.in ? s.same / s.in : null), 'p', 'high', 'De las recibidas en ese mes, las cerradas antes de acabar el mismo mes.']]],
  ['Lo que pasó en el mes', [
    ['Resueltas', (s) => s.out, 'v', 'high', 'Lo resuelto en el mes, se abriera cuando se abriera.'],
    ['De meses anteriores', (s) => s.prev, 'v', 'warn', 'De lo resuelto en el mes, lo que se abrió en un mes anterior.'],
    ['Pendientes al cierre', (s) => s.open, 'v', null, 'Lo que seguía abierto al acabar el mes.'],
    [`Con más de ${OLD_DAYS} días`, (s) => s.old, 'v', null, `De las pendientes al cierre, las que ya llevaban más de ${OLD_DAYS} días abiertas.`]]]],
};

export const entradaTab = (t) => {
  const { m, ch, grid, ask, REQ, slaPct, heads, monthRows, prioRows, asRows, shareOf, table, cardsOf, days, topRows, volume, teamNames, headsNote, mixCmp, pairTable } = t;
  const { C, DI, S, PRIOS, slaLabel, CMP, stats, bySide } = m;
  const { card, kpis, kpiCo, matrix } = ch;
  const evolution = evolutionOf(t);
  const ledgerCmp = (units, per, day) => {
    const pp = m.perHead(), H = heads(), groups = LEDGER_CMP[pp ? 'pp' : 'co'];
    const dayText = (x) => (day ? x.replace('pasó en el mes', 'pasó en el día').replace('ese mes', 'ese día').replace('en el mes', 'el mismo día').replace('meses anteriores', 'días anteriores').replace('acabar el mes', 'acabar el día').replace('el mismo mes', 'el mismo día') : x);
    // los volúmenes ('v'), por persona; el resto, tal cual. En ocre ('warn'), el que más saca de meses anteriores.
    const defs = groups.flatMap(([, d]) => d).map(([l, f, type, better, note]) => [dayText(l),
      (x) => { const v = f(x.s); return v != null && type === 'v' ? v / x.H : v; },
      (v, x) => (type === 'p' ? pct(v) : type === 'n' || x.H === 1 ? num(Math.round(v)) : dec(v)), better, dayText(note)]);
    const row = (label, j, u = {}) => ({ label, x: [0, 1].map((k) => ({ s: per[k][j], H: H[k] })), cls: u.f ? 'mt-clk' : u.after ? 'mt-mut' : '', attrs: u.f ? `data-f="${u.f}"` : '' });
    return pairTable(day ? 'Día' : 'Mes', defs, [...units.map((u, j) => row(u.label, j, u)), { ...row('Total', units.length), cls: 'mt-tot' }],
      () => Infinity, groups.map(([l, d]) => [dayText(l), d.length]));
  };
  const ledger = (A) => {
    const { units, per, day } = ledgerOf(m, A);
    if (CMP()) return ledgerCmp(units, per, day);
    const DAY_NAMES = { '% cerrado en el mes': '% cerrado el mismo día', 'De meses anteriores': 'De días anteriores' };
    const defs = day ? LEDGER.map((d) => (DAY_NAMES[d[0]] ? [DAY_NAMES[d[0]], ...d.slice(1)] : d)) : LEDGER;
    const row = (label, j, attrs = '') => `<tr ${attrs}><td>${label}</td>${defs.map(([, f]) => `<td class="mt-num">${f(per[0][j])}</td>`).join('')}</tr>`;
    const groups = LEDGER_GROUPS.map(([l, n]) => [day ? l.replace('mes', 'día') : l, n]);
    return table(day ? 'Día' : 'Mes', defs.map(([l, , tip]) => [l, tip]), units.map((u, j) => row(u.label, j, u.f ? `class="mt-clk" data-f="${u.f}"` : u.after ? 'class="mt-mut"' : '')).join('') + row('Total', units.length, 'class="mt-tot"'), groups);
  };

  return (A) => {
    const T = bySide(A), ST = T.map(stats), d = days() || 1, sharePct = (s) => opt(pct)(s.v);
    const closed = closedIn(m), each = m.perHead() ? ' por persona' : '';
    // lo que entra, mes a mes, por prioridad, tipo de servicio, tarjeta y tipo de operación; comparando, sin tarjeta
    // (cada empresa las usa a su manera: no se comparan)
    const months = asRows(monthRows());
    const inRows = [
      { head: 'Prioridad' }, ...asRows(prioRows()),
      { head: 'Tipo de servicio' }, ...topRows('sv', A, 4),
      ...(CMP() ? [] : [{ head: 'Tarjeta', note: 'Una PRIO cuenta también en su SGA o SISU.' }, ...CARDS.map((c, k) => ({ label: c, test: (i) => cardsOf(i).includes(k), f: `tj:${k}` }))]),
      { head: 'Tipo de operación' }, ...topRows('op', A, 7),
    ];
    return grid(ask('entrada'),
      kpis(kpiCo(`Recibidas${each}`, volume(T), (s) => num(Math.round(s.v)), { val: (s) => Math.round(s.v), note: `abiertas en el periodo${headsNote()}`, names: teamNames() }),
        kpiCo(`Entran al día${each}`, volume(T, d), (s) => dec(s.v), { val: (s) => s.v, note: `de media, en días naturales${headsNote()}`, names: teamNames() }),
        kpiCo(`Resolvemos al día${each}`, volume(closed, d), (s) => dec(s.v), { val: (s) => s.v, note: `de media, todo lo resuelto o cerrado en el periodo${headsNote()}`, names: teamNames() }),
        // de lo que entró en el periodo, lo que pasó a Resuelta el mismo día en que entró (como en la gráfica de entrantes
        // frente a atendidas: backlog.js, flowByDay)
        kpiCo('% resuelto el día que entra', shareOf(T, (i) => (C.eR?.[i] || []).includes(Math.floor(C.rep[i] / DAY))), sharePct,
          { val: (s) => s.v, better: 'high', pctSign: true, note: 'de lo que entró, resuelto el mismo día' }),
        // y gestionado: resuelto o escalado (pasado a Pendiente de proveedor) el mismo día en que entró
        kpiCo('% gestionado el día que entra', shareOf(T, (i) => { const d = Math.floor(C.rep[i] / DAY); return (C.eR?.[i] || []).includes(d) || (C.eV?.[i] || []).includes(d); }), sharePct,
          { val: (s) => s.v, better: 'high', pctSign: true, note: 'de lo que entró, resuelto o escalado el mismo día' }),
        // de cada prioridad, la parte que se empezó dentro de su SLA de inicio (de la apertura al primer paso a En curso;
        // las abiertas sin empezar y ya fuera de plazo cuentan como fuera: model.js, stats sla), como en SLAs
        ...PRIOS.map((p) => kpiCo(`% ${PLURAL[DI.prio[p]] || nice(DI.prio[p])} en SLA`, T.map((l) => { const st = stats(l.filter((i) => C.pr[i] === p)); return { n: st.n, v: st.sla }; }), sharePct,
          { val: (s) => s.v, better: 'high', pctSign: true, note: `empezadas en ${slaLabel(p).split(' · ')[1]}` }))),
      evolution({ views: ['flow', 'flowAll'] }),
      card(m.daily() ? 'Día a día: lo que entra, lo que se cierra y lo que queda' : 'Mes a mes: lo que entra, lo que se cierra y lo que queda', ledger(A),
        { span: 's12', sub: CMP() ? '' : `«Por cerrar»: de lo recibido cada mes, lo que sigue abierto hoy; su total son las pendientes de la pestaña Backlog. Pasa el ratón por una cabecera para ver qué cuenta.${S.from === S.to ? '' : ' Clic en un mes para filtrar; con un solo mes, día a día.'}` }),
      CMP() ? card('Qué recibe cada uno', mixCmp(inRows, A), { span: 's12' })
        : card('Qué entra cada mes', matrix(inRows, months, A, { total: true, share: true, foot: { label: 'Recibidas', test: () => true }, footTop: true, corner: 'Mes de apertura →' }),
          { span: 's12', sub: 'Recibidas de cada tipo cada mes; cada bloque suma las recibidas (salvo Tarjeta, donde una PRIO cuenta dos veces). * mes incompleto. Clic en una celda para filtrar.' }));
  };
};
