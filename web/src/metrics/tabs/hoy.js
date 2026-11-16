// Foto de hoy: lo abierto ahora mismo, en listas para actuar (today.js). Cada lista, con su enlace a Remedy.
import { esc } from '../../ui/html.js';
import { num, nice, title, dateOf } from '../format.js';
import { CARDS } from '../model.js';
import { IDLE_DAYS, RECENT_CRIT_DAYS } from '../rules.js';
import { todayLists } from '../today.js';

const REMEDY = 'https://itx.onbmc.com/arsys/servlet/ViewFormServlet?server=onbmc-s&form=HPD:Help+Desk&qual=%271000000161%27%3D%22';
const incId = (id) => `INC${String(id).padStart(12, '0')}`;

export const hoyTab = (t) => {
  const { m, ch, ui, grid, ask, cardsOf } = t;
  const { C, DI, BASE, CRIT, SIDE, CMP, isSel, bySide } = m;
  const { card, kpi, kpis, kpiCo, more } = ch;

  return () => {
    const { op, lm, idle, waits, late, prio, stale, people, one, crit: crit3, prioList, lateList: lateL, vendor, client, staleList: stale3, orphan, all, cols: PCOLS, who, tot } = todayLists(m);
    const T = bySide(op), now = m.SNAP, days = (min) => Math.floor(min / 1440);
    const count = (test) => T.map((l) => ({ n: l.length || 1, v: l.filter(test).length }));
    // una lista de issues: cada fila con su enlace a Remedy
    const list = (id, rowsIn, o = {}) => {
      const top = o.top || 10, all = ui.exp[id], shown = all ? rowsIn.slice(0, 500) : rowsIn.slice(0, top);
      const head = ['Issue', 'Abierta', 'Título', 'Prioridad', 'Tarjeta', 'Estado', ...(one ? [] : ['Responsable']), 'Antigüedad', ...(lm ? ['Sin cambios'] : []), 'Ticket de tercero'];
      const body = shown.map((i) => `<tr><td><a href="${REMEDY}${incId(C.id[i])}%22" target="_blank" rel="noopener">${incId(C.id[i])}</a></td><td>${dateOf(BASE, C.rep[i]).slice(0, 5)}</td>
        <td class="mt-subj" data-tip="${esc(C.su[i])}">${esc(C.su[i])}</td><td>${nice(DI.prio[C.pr[i]])}</td><td>${cardsOf(i).filter((k) => k < 3).map((k) => CARDS[k]).join(' · ')}</td>
        <td>${nice(DI.status[C.st[i]])}${C.rs[i] ? ` · <span class="mt-mut">${esc(title(DI.reason[C.rs[i]]))}</span>` : ''}</td>
        ${one ? '' : `<td><span class="mt-pill mt-p${SIDE[i]}">${esc(m.DIMS.as.label(C.as[i]))}</span></td>`}
        <td class="mt-num">${days(now - C.rep[i])} d</td>${lm ? `<td class="mt-num">${days(idle(i))} d</td>` : ''}<td>${C.vk[i] ? esc(DI.vkey[C.vk[i]]) : C.vt[i] ? esc(m.DIMS.vt.label(C.vt[i])) : ''}</td></tr>`).join('');
      return rowsIn.length ? `<div class="mt-tablewrap ${all ? 'mt-scroll' : ''}"><table class="mt-list"><thead><tr>${head.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${body}</tbody></table></div>${more(id, rowsIn.length, top)}` : '<p class="mt-mut mt-small">Ninguna.</p>';
    };
    // quién tiene qué: lo abierto de cada persona
    const whoTable = `<div class="mt-tablewrap"><table><thead><tr><th>Persona</th>${PCOLS.map(([l]) => `<th class="mt-num">${l}</th>`).join('')}</tr></thead><tbody>${who.map((r) => `<tr class="mt-clk ${isSel('as', r.k) ? 'mt-sel' : ''}" data-f="as:${r.k}"><td>${CMP() ? `<i class="mt-sw mt-c${m.SIDE[op.find((i) => C.as[i] === r.k)]}"></i>` : ''}${esc(m.DIMS.as.label(r.k))}</td>${r.v.map((v) => `<td class="mt-num">${v || ''}</td>`).join('')}</tr>`).join('')}
      <tr class="mt-grp"><td>Total</td>${tot.map((v) => `<td class="mt-num">${num(v)}</td>`).join('')}</tr></tbody></table></div>`;
    const sub = (x) => `${x} Pasa el ratón por un título para leerlo entero.`;
    return grid(ask('hoy'),
      kpis(kpiCo('Abiertas', count(() => true), (s) => num(s.v), { val: (s) => s.v }),
        kpiCo('Críticas abiertas', count((i) => C.pr[i] === CRIT), (s) => num(s.v), { val: (s) => s.v }),
        kpiCo('PRIO abiertas', count(prio), (s) => num(s.v), { val: (s) => s.v }),
        kpiCo('Sin iniciar, fuera de plazo', count(late), (s) => num(s.v), { val: (s) => s.v, better: 'low' }),
        kpiCo('Esperando a un tercero', count((i) => waits(i) === 'v'), (s) => num(s.v), { val: (s) => s.v }),
        kpiCo('Esperando al cliente', count((i) => waits(i) === 'c'), (s) => num(s.v), { val: (s) => s.v }),
        lm ? kpiCo(`Sin cambios en ${IDLE_DAYS} días`, count(stale), (s) => num(s.v), { val: (s) => s.v, better: 'low' }) : '',
        people ? '' : kpi('Sin asignar', num(orphan.length), 'SGA, SISU o PRIO, sin nadie', 'mt-t2')),
      lm ? '' : '<p class="mt-note">Para ver lo que lleva días sin cambios, carga de nuevo el CSV: los datos guardados son de antes de que se leyera el último cambio de cada issue.</p>',
      card('Quién tiene qué', whoTable, { span: 's12', sub: 'Lo abierto de cada persona. Clic en una persona para ver todas las métricas solo de ella.' }),
      card(`Críticas de los últimos ${RECENT_CRIT_DAYS} días`, list('hoy-crit', crit3), { span: 's12', sub: sub(`Todas las críticas abiertas en los ${RECENT_CRIT_DAYS} últimos días, resueltas o no, de la más reciente a la más antigua.`) }),
      card('PRIO abiertas', list('hoy-prio', prioList), { span: 's12', sub: sub('Priorizadas por negocio, de la más antigua a la más reciente.') }),
      card('Sin iniciar y fuera de plazo', list('hoy-late', lateL), { span: 's12', sub: sub('Abiertas que nunca han pasado a En curso y ya superan el plazo de su prioridad.') }),
      ...(people ? [] : [card('Sin asignar', list('hoy-orphan', orphan), { span: 's12', sub: sub('En SGA, SISU o PRIO, sin responsable.') })]),
      card(`Sin cambios desde hace más de ${IDLE_DAYS} días`, lm ? list('hoy-stale', stale3) : '<p class="mt-mut mt-small">Carga de nuevo el CSV para verlo.</p>', { span: 's12', sub: sub(`Abiertas en las que nadie ha tocado nada en ${IDLE_DAYS} días, de la más parada a la menos.`) }),
      card('Esperando a un tercero', list('hoy-vendor', vendor), { span: 's12', sub: sub('Pendientes de una acción de un tercero (desarrollo, proveedor…), con su ticket.') }),
      card('Esperando al cliente', list('hoy-client', client), { span: 's12', sub: sub('Pendientes de una acción o de una respuesta del centro o del cliente.') }),
      card('Todo lo abierto', list('hoy-all', all, { top: 15 }), { span: 's12', sub: sub('La sábana del backlog: todo lo abierto, de lo más antiguo a lo más reciente.') }));
  };
};
