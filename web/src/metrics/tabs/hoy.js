// Foto de hoy: cómo está el backlog ahora (a fecha de la última carga, se abriera cuando se abriera), con el selector de
// SISU o SGA arriba del todo. Lo recibido en el periodo, por preguntas, está en el Histórico (historico.js); la corona
// (stateCard) la comparte el Resumen (resumen.js).
import { esc } from '../../ui/html.js';
import { num, pct, dur } from '../format.js';
import { ages, meanAge } from '../backlog.js';
import { whoHas } from '../today.js';
import { sheetOf, sheetBody } from '../sheet.js';
import { isPicked } from '../view.js';
import { backlogParts } from './backlog.js';

// En qué estado está: el backlog ahora, en una corona (lo primero de Foto de hoy y del Resumen): lo abierto (en el
// centro), repartido por su estado, con las situaciones de la pestaña Backlog (model.js, SITUATIONS): Asignada (sin tocar
// o devuelta a la cola), Pendiente (proveedor), Pendiente (cliente) y En curso; lo que espera por otro motivo, solo si lo
// hay. Suman lo abierto. Comparando, una corona por lado y, debajo, las cifras de cada uno. Devuelve la tarjeta de P: lo
// abierto de cada lado (bySide).
export const stateCard = (t) => {
  const { m, ch, name } = t;
  const { DIMS, CMP, CO } = m;
  const PARTS = [
    ['asig', 'Asignada', [1, 2], 'En Asignada: sin tocar o devueltas a la cola.'],
    ['prov', 'Pendiente (proveedor)', [3], 'En Pendiente por una acción de un tercero (desarrollo, proveedor…).'],
    ['cli', 'Pendiente (cliente)', [4], 'En Pendiente por una acción o respuesta del centro o del cliente.'],
    ['curso', 'En curso', [0], 'Alguien está trabajando en ellas.'],
    ['otro', 'Pendiente (otro motivo)', [5], 'En Pendiente con otro motivo o sin motivo informado.'],
  ].map(([cls, label, sits, tip]) => ({ cls, label, sits, tip, f: sits.map((k) => `sit:${k}`).join('|') }));
  // (lo sin técnico de las búsquedas del equipo ya es de Indra: model.js, SEARCH_OWNER)
  const haveNow = (P) => {
    const ks = CO(), one = ks.length === 1;
    const total = (k) => P[k].length, share = (v, k) => (total(k) ? pct(v / total(k)) : '—');
    const count = P.map((l) => PARTS.map((p) => l.filter((i) => p.sits.includes(DIMS.sit.get(i))).length));
    const shown = PARTS.filter((p, j) => p.cls !== 'otro' || ks.some((k) => count[k][j]));
    const at = (p, k) => count[k][PARTS.indexOf(p)];
    const rings = ks.map((k) => `<figure class="mt-dn-fig">${one ? '' : `<figcaption>${esc(name(k))}</figcaption>`}${ch.donut(shown.map((p) => ({ ...p, v: at(p, k) })), [num(total(k)), 'incidencias'], one ? 116 : 96)}</figure>`).join('');
    const head = one ? '' : `<tr class="mt-dn-head"><th></th>${ks.map((k) => `<th class="mt-num">${esc(name(k))}</th>`).join('')}</tr>`;
    const row = (p) => `<tr class="mt-clk" data-f${p.f.includes('|') ? '2' : ''}="${p.f}" data-tip="${esc(p.tip)}"><th><i class="mt-dn-sw mt-dn-${p.cls}"></i>${p.label}</th>${ks.map((k) => `<td class="mt-num"><b>${num(at(p, k))}</b><small>${share(at(p, k), k)}</small></td>`).join('')}</tr>`;
    const sum = `<tr class="mt-dn-sum" data-tip="Lo abierto ahora, se abriera cuando se abriera."><th>Incidencias</th>${ks.map((k) => `<td class="mt-num"><b>${num(total(k))}</b><small>ahora</small></td>`).join('')}</tr>`;
    return `<div class="mt-dn ${one ? '' : 'mt-dn-cmp'}"><div class="mt-dn-rings">${rings}</div><table class="mt-dn-legend">${head}${shown.map(row).join('')}${sum}</table></div>`;
  };
  // filtrado por Pendiente (proveedor): un enlace a Escalados, en Activas y sin ese filtro, que allí sobra (Activas ya es
  // lo escalado y abierto) y vaciaría Histórico (metrics-view.js, data-esc-now y data-rm)
  // link: un enlace a Foto de hoy, debajo (el Resumen; en la propia Foto de hoy, no)
  return (P, { link = false } = {}) => {
    const toHoy = link ? '<p class="mt-dn-go"><button class="mt-go" data-go="hoy" data-tip="Abre Foto de hoy: el backlog de ahora, por antigüedad, prioridad, centro y módulo, quién tiene qué y la sábana.">Ver Foto de hoy →</button></p>' : '';
    const toEscalated = m.isSel('sit', 3) ? '<p class="mt-dn-go"><button class="mt-go" data-go="escalados" data-esc-now data-rm="sit:3" data-tip="Abre Escalados en Activas: todo lo escalado y abierto, con sus tiempos, sus proyectos Jira y los malos escalados.">Ver en Escalados →</button></p>' : '';
    return ch.card('En qué estado está', haveNow(P) + toEscalated + toHoy, { span: CMP() ? 's12' : 's4', sub: 'Lo abierto, por su estado. Clic en uno para filtrar.' });
  };
};

export const hoyTab = (t) => {
  const { m, ch, ui, grid, ask, section, selRow, asRows, prioRows, topRows, mixCmp } = t;
  const { C, OPEN, DIMS, CMP, CO, isSel, bySide } = m;
  const { card, kpis, kpiCo } = ch;
  const stateOf = stateCard(t), detail = backlogParts(t);

  // --- El backlog ahora: lo abierto a fecha de la última carga, se abriera cuando se abriera (no
  // depende del periodo; sí de los filtros y de lo que se mira arriba). Sus cifras y cómo se reparte (cómo ha ido día
  // a día, en el Histórico: evolucion.js).
  const nowRows = (op) => [
    { head: 'Antigüedad', note: 'Desde que se abrió.' }, ...ages(m),
    { head: 'Prioridad' }, ...asRows(prioRows()),
    { head: 'Centro', note: 'Los 8 con más.' }, ...topRows('ce', op, 8),
    { head: 'Módulo', note: 'Los 8 con más.' }, ...topRows('mo', op, 8),
  ];

  // Arriba del todo, SISU o SGA (por el módulo: model.js, DIMS.ss): un selector que pone o quita ese filtro, así que
  // vale para todas las pestañas y sale con los demás filtros, donde también se quita
  const systemPicker = () => {
    const opt1 = (label, k) => { const on = isPicked(m.S.f, 'ss', k);
      return `<button class="mt-seg-b ${on ? 'mt-on' : ''}" data-only="ss:${k ?? ''}" aria-pressed="${on}"${k == null ? '' : ' data-tip="Clic: solo esta. Ctrl+clic: sumarla o, si ya está, quitarla."'}>${label}</button>`; };
    return `<div class="mt-seg" role="group" aria-label="SISU o SGA">${opt1('Todo', null)}${[0, 1].map((k) => opt1(DIMS.ss.label(k), k)).join('')}</div>`;
  };
  // y a su lado, la criticidad (tabs/common.js, prioPicker): cada una con lo abierto ahora
  const prioPicker = () => t.prioPicker(m.today(false, 'pr').filter((i) => OPEN[i]));

  // Quién tiene qué: lo abierto ahora de cada persona, con su total (today.js). Clic en una persona: todo, solo de ella.
  const whoCard = () => {
    const { op, cols: PCOLS, who, tot } = whoHas(m);
    return `<div class="mt-tablewrap"><table><thead><tr><th>Persona</th>${PCOLS.map(([l]) => `<th class="mt-num">${l}</th>`).join('')}</tr></thead><tbody>${who.map((r) => `<tr class="mt-clk ${isSel('as', r.k) ? 'mt-sel' : ''}" data-f="as:${r.k}"><td>${CMP() ? `<i class="mt-sw mt-c${m.SIDE[op.find((i) => C.as[i] === r.k)]}"></i>` : ''}${esc(m.DIMS.as.label(r.k))}</td>${r.v.map((v) => `<td class="mt-num">${v || ''}</td>`).join('')}</tr>`).join('')}
      <tr class="mt-grp"><td>Total</td>${tot.map((v) => `<td class="mt-num">${num(v)}</td>`).join('')}</tr></tbody></table></div>`;
  };

  // La sábana: lo abierto ahora, con los filtros y los lados de arriba (sheet.js); el botón la exporta entera a CSV
  // (metrics-view.js, data-export).
  const sheetCard = () => {
    const list = sheetOf(m);
    ui.hoySheet = { list };   // lo que exporta el botón (metrics-view.js)
    const body = sheetBody(m, list, { ui, id: 'res-sheet', expanded: ui.exp['res-sheet'], more: ch.more, empty: 'Nada abierto con estos filtros.' });
    return card('Sábana de incidencias', body, { span: 's12', sub: 'Lo abierto ahora, con los filtros y los lados de arriba, de la más antigua a la más reciente. Exportar a CSV las descarga todas, con su enlace a Remedy, para abrirlas en Excel.' });
  };

  const backlogNow = (A) => {
    const all = bySide(m.today()), op = m.today().filter((i) => OPEN[i]), P = all.map((l) => l.filter((i) => OPEN[i])), cos = CO(), cmp = CMP();
    const S0 = P[cos[0]];
    // la antigüedad media (el total ya está en la corona): sin comparar, en una baldosa cuadrada (dos columnas de la
    // rejilla); comparando, con la diferencia
    const ageBox = () => `<section class="mt-st mt-st-age"><h4>Antigüedad media</h4><div class="mt-st-big"><b>${dur(meanAge(m, S0))}</b></div><p>lo que llevan abiertas, de media</p></section>`;
    // lo primero, la corona (en qué estado está); sin comparar, a su lado en qué punto está y debajo la baldosa y la
    // prioridad; comparando, la corona sola en su fila, la antigüedad con la diferencia y una tabla de dos lados
    const ring = stateOf(P);
    // y debajo, lo pendiente en detalle (lo que era la pestaña Backlog: backlog.js): en qué punto está, qué vigilar y
    // sus tablas; comparando, sus cifras junto a la antigüedad media y la tabla de cómo está lo de cada uno
    const cp = cmp ? detail.cmpParts(m.today(), A) : null;
    const top = cmp
      ? [ring, kpis(kpiCo('Antigüedad media', [0, 1].map((k) => ({ n: P[k].length, v: meanAge(m, P[k]) })), (s) => dur(s.v), { val: (s) => s.v, better: 'low', note: 'Lo que llevan abiertas, de media.' }), ...cp.kpis),
        card('Cómo se reparte', mixCmp(nowRows(op), op, 'Pendientes'), { span: 's12', sub: 'De cada uno, cuántas y qué parte de lo suyo. Clic en una fila para filtrar.' }),
        section('¿En qué punto está lo pendiente?'), cp.table]
      : (() => {
        // sin comparar: a la derecha de la corona, en qué punto está lo pendiente (el panel, con la antigüedad media al
        // final); debajo, las tablas de detalle (la antigüedad, el centro y el módulo ya están en ellas; la prioridad, en
        // el selector de arriba)
        const [panel, ...tables] = detail.single(m.today(), ageBox());
        return [ring, panel.replace('class="mt-stock ', 'class="mt-stock mt-st-side '),
          section('Lo pendiente en detalle', 'su situación, lo que conviene vigilar y desde cuándo.'), ...tables];
      })();
    return [section('¿Cómo está el backlog ahora?', 'lo abierto a fecha de la última carga, se abriera cuando se abriera.'), ...top,
      card('Quién tiene qué', whoCard(), { span: 's12', sub: 'Lo abierto ahora de cada persona. Clic en una persona para ver todas las métricas solo de ella.' }),
      sheetCard()];
  };

  return (A) => grid(`<div class="mt-hoy-picks">${systemPicker()}${prioPicker()}</div>`, ask('hoy'), ...backlogNow(A));
};
