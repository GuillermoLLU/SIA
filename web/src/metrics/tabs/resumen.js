// Resumen: cómo está el backlog ahora (a fecha de la última carga, se abriera cuando se abriera), con el selector de
// SISU o SGA arriba del todo. Lo recibido en el periodo, por preguntas, está en el Histórico (historico.js).
import { esc } from '../../ui/html.js';
import { num, pct, dur } from '../format.js';
import { ages, meanAge } from '../backlog.js';
import { blocksOf } from '../pieces.js';
import { whoHas } from '../today.js';
import { sheetOf, sheetBody } from '../sheet.js';

export const resumenTab = (t) => {
  const { m, ch, ui, grid, ask, name, section, selRow, asRows, prioRows, topRows, mixCmp } = t;
  const { C, OPEN, DIMS, CMP, CO, isSel, bySide } = m;
  const { card, legend, kpis, kpiCo } = ch;
  // El backlog ahora, en una corona (lo primero del Resumen): lo abierto (en el centro), repartido por su estado, con
  // las situaciones de la pestaña Backlog (model.js, SITUATIONS): Asignada (sin tocar o devuelta a la cola), Pendiente
  // (proveedor), Pendiente (cliente) y En curso; lo que espera por otro motivo, solo si lo hay. Suman lo abierto.
  // Comparando, una corona por lado y, debajo, las cifras de cada uno. P: lo abierto de cada lado (bySide).
  const PARTS = [
    ['asig', 'Asignada', [1, 2], 'En Asignada: sin tocar o devueltas a la cola.'],
    ['prov', 'Pendiente (proveedor)', [3], 'En Pendiente por una acción de un tercero (desarrollo, proveedor…).'],
    ['cli', 'Pendiente (cliente)', [4], 'En Pendiente por una acción o respuesta del centro o del cliente.'],
    ['curso', 'En curso', [0], 'Alguien está trabajando en ellas.'],
    ['otro', 'Pendiente (otro motivo)', [5], 'En Pendiente con otro motivo o sin motivo informado.'],
  ].map(([cls, label, sits, tip]) => ({ cls, label, sits, tip, f: sits.map((k) => `sit:${k}`).join('|') }));
  const haveNow = (P) => {
    const ks = CO(), one = ks.length === 1, share = (v, k) => (P[k].length ? pct(v / P[k].length) : '—');
    const count = P.map((l) => PARTS.map((p) => l.filter((i) => p.sits.includes(DIMS.sit.get(i))).length));
    const shown = PARTS.filter((p, j) => p.cls !== 'otro' || ks.some((k) => count[k][j]));
    const at = (p, k) => count[k][PARTS.indexOf(p)];
    const rings = ks.map((k) => `<figure class="mt-dn-fig">${one ? '' : `<figcaption>${esc(name(k))}</figcaption>`}${ch.donut(shown.map((p) => ({ ...p, v: at(p, k) })), [num(P[k].length), 'pendientes'], one ? 116 : 96)}</figure>`).join('');
    const head = one ? '' : `<tr class="mt-dn-head"><th></th>${ks.map((k) => `<th class="mt-num">${esc(name(k))}</th>`).join('')}</tr>`;
    const row = (p) => `<tr class="mt-clk" data-f${p.f.includes('|') ? '2' : ''}="${p.f}" data-tip="${esc(p.tip)}"><th><i class="mt-dn-sw mt-dn-${p.cls}"></i>${p.label}</th>${ks.map((k) => `<td class="mt-num"><b>${num(at(p, k))}</b><small>${share(at(p, k), k)}</small></td>`).join('')}</tr>`;
    const sum = `<tr class="mt-dn-sum" data-tip="Lo abierto ahora, se abriera cuando se abriera."><th>Pendientes</th>${ks.map((k) => `<td class="mt-num"><b>${num(P[k].length)}</b><small>ahora</small></td>`).join('')}</tr>`;
    return `<div class="mt-dn ${one ? '' : 'mt-dn-cmp'}"><div class="mt-dn-rings">${rings}</div><table class="mt-dn-legend">${head}${shown.map(row).join('')}${sum}</table></div>`;
  };

  // --- El backlog ahora: lo abierto a fecha de la última carga, se abriera cuando se abriera (no
  // depende del periodo; sí de los filtros y de lo que se mira arriba). Sus cifras y cómo se reparte (cómo ha ido día
  // a día, en el Histórico: evolucion.js).
  const nowRows = (op) => [
    { head: 'Antigüedad', note: 'Desde que se abrió.' }, ...ages(m),
    { head: 'Prioridad' }, ...asRows(prioRows()),
    { head: 'Centro', note: 'Los 8 con más.' }, ...topRows('ce', op, 8),
    { head: 'Módulo', note: 'Los 8 con más.' }, ...topRows('mo', op, 8),
  ];
  const fAttr = (f) => (f ? `data-f${f.includes('|') ? '2' : ''}="${f}"` : '');
  // un bloque de filas, de un solo lado: cuántas, qué parte de lo pendiente y una barra con esa parte
  const barList = (rows, op) => `<table class="mt-blist">${rows.map((r) => ({ ...r, n: op.filter(r.test).length })).filter((r) => r.n).map((r) => {
    const sh = op.length ? r.n / op.length : 0;
    return `<tr class="${r.f ? 'mt-clk' : ''} ${selRow(r.f) ? 'mt-sel' : ''}" ${fAttr(r.f)} ${r.tip ? `data-tip="${esc(r.tip)}"` : ''}><th>${esc(r.label)}</th>
      <td class="mt-num">${num(r.n)}</td><td class="mt-num mt-mut">${pct(sh)}</td><td class="mt-blist-bar"><i class="mt-c${CO()[0]}" style="width:${(sh * 100).toFixed(1)}%"></i></td></tr>`;
  }).join('')}</table>`;

  // Arriba del todo, SISU o SGA (por el módulo: model.js, DIMS.ss): un selector que pone o quita ese filtro, así que
  // vale para todas las pestañas y sale con los demás filtros, donde también se quita
  const systemPicker = () => {
    const on = m.S.f.ss?.size === 1 ? [...m.S.f.ss][0] : null;
    const opt1 = (label, k) => `<button class="mt-seg-b ${on === k ? 'mt-on' : ''}" data-only="ss:${k ?? ''}" aria-pressed="${on === k}">${label}</button>`;
    return `<div class="mt-seg" role="group" aria-label="SISU o SGA">${opt1('Todo', null)}${[0, 1].map((k) => opt1(DIMS.ss.label(k), k)).join('')}</div>`;
  };

  // Quién tiene qué: lo abierto ahora de cada persona, con su total (today.js). Clic en una persona: todo, solo de ella.
  const whoCard = () => {
    const { op, cols: PCOLS, who, tot } = whoHas(m);
    return `<div class="mt-tablewrap"><table><thead><tr><th>Persona</th>${PCOLS.map(([l]) => `<th class="mt-num">${l}</th>`).join('')}</tr></thead><tbody>${who.map((r) => `<tr class="mt-clk ${isSel('as', r.k) ? 'mt-sel' : ''}" data-f="as:${r.k}"><td>${CMP() ? `<i class="mt-sw mt-c${m.SIDE[op.find((i) => C.as[i] === r.k)]}"></i>` : ''}${esc(m.DIMS.as.label(r.k))}</td>${r.v.map((v) => `<td class="mt-num">${v || ''}</td>`).join('')}</tr>`).join('')}
      <tr class="mt-grp"><td>Total</td>${tot.map((v) => `<td class="mt-num">${num(v)}</td>`).join('')}</tr></tbody></table></div>`;
  };

  // La sábana: lo abierto ahora, con los filtros y los lados de arriba (sheet.js); el botón la exporta entera a CSV
  // (metrics-view.js, data-export).
  const sheetCard = () => {
    const body = sheetBody(m, sheetOf(m), { id: 'res-sheet', expanded: ui.exp['res-sheet'], more: ch.more, empty: 'Nada abierto con estos filtros.' });
    return card('Sábana de incidencias', body, { span: 's12', sub: 'Lo abierto ahora, con los filtros y los lados de arriba, de la más antigua a la más reciente. Exportar a CSV las descarga todas, con su enlace a Remedy, para abrirlas en Excel.' });
  };

  const backlogNow = () => {
    const all = bySide(m.today()), op = m.today().filter((i) => OPEN[i]), P = all.map((l) => l.filter((i) => OPEN[i])), cos = CO(), cmp = CMP();
    const S0 = P[cos[0]];
    // la antigüedad media (el total ya está en la corona): sin comparar, en una baldosa cuadrada (dos columnas de la
    // rejilla); comparando, con la diferencia
    const ageTile = () => `<section class="mt-card mt-s2 mt-tile"><h3>Antigüedad media</h3><div class="mt-tile-figs"><div class="mt-tile-v"><b>${dur(meanAge(m, S0))}</b><span>lo que llevan abiertas, de media</span></div></div></section>`;
    const blocks = blocksOf(nowRows(op));
    // lo primero, la corona (en qué estado está); sin comparar, en su fila la baldosa y la prioridad, y debajo los demás
    // repartos; comparando, la corona sola en su fila, la antigüedad con la diferencia y una tabla de dos lados
    const ring = card('En qué estado está', haveNow(P), { span: cmp ? 's12' : 's4', sub: 'Lo abierto, por su estado. Clic en uno para filtrar.' });
    const blockCard = (b, span) => card(b.head, barList(b.rows, S0), { span, sub: b.note || '' });
    const byHead = (h) => blocks.find((b) => b.head === h);
    const top = cmp
      ? [ring, kpis(kpiCo('Antigüedad media', [0, 1].map((k) => ({ n: P[k].length, v: meanAge(m, P[k]) })), (s) => dur(s.v), { val: (s) => s.v, better: 'low', note: 'Lo que llevan abiertas, de media.' })),
        card('Cómo se reparte', mixCmp(nowRows(op), op, 'Pendientes'), { span: 's12', sub: 'De cada uno, cuántas y qué parte de lo suyo. Clic en una fila para filtrar.' })]
      : [ring, ageTile(), blockCard(byHead('Prioridad'), 's6'), ...['Antigüedad', 'Centro', 'Módulo'].map((h) => blockCard(byHead(h), 's4'))];
    return [section('¿Cómo está el backlog ahora?', 'lo abierto a fecha de la última carga, se abriera cuando se abriera.'), ...top,
      card('Quién tiene qué', whoCard(), { span: 's12', sub: 'Lo abierto ahora de cada persona. Clic en una persona para ver todas las métricas solo de ella.' }),
      sheetCard()];
  };

  return () => grid(systemPicker(), ask('resumen'), ...backlogNow());
};
