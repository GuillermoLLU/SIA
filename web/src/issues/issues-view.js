// Vista «Issues»: tablero por estado con cada columna ya ordenada (lo que toca
// primero, arriba), el mes en curso por defecto y los anteriores a propósito.
// Ficha lateral al pulsar una; sus acciones irán por SIGLO (aún desactivadas).
import './issues.css';
import { esc, fold } from '../ui/html.js';
import { ISSUES_ICON } from '../users/views.js';
import { SEVERITY_ES, columns, firstTouch, matches, previousMonths, byCenter, summary, duration, minutesSince, monthOf, dayOf } from './board.js';

const PAGE = 30;
const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const STATUS_ES = { ASSIGNED: 'Asignada', IN_PROGRESS: 'En curso', PENDING: 'Pendiente', RESOLVED: 'Resuelta',
  Assigned: 'Asignada', 'In Progress': 'En curso', Pending: 'Pendiente', Resolved: 'Resuelta', Closed: 'Cerrada', Cancelled: 'Cancelada' };
const REASON_ES = {
  NO_FURTHER_ACTION_REQUIRED: 'Sin más acción', ESCALATED_ACCORDING_TO_PROCEDURE: 'Escalada',
  THIRD_PARTY_VENDOR_ACTION_REQD: 'Pendiente de proveedor', CLIENT_ACTION_REQUIRED: 'Pendiente del cliente',
  CUSTOMER_FOLLOW_UP_REQUIRED: 'Seguimiento del cliente', REQUEST_SSGG: 'Petición SSGG', PURCHASE_ORDER_APPROVAL: 'Aprobación de pedido',
  BAD_ASSIGNMENT: 'Mal asignada', SUPPLIER_DELIVERY: 'Entrega de proveedor', VERIFY_SOLUTION: 'Verificar solución',
  LOCAL_SITE_ACTION_REQUIRED: 'Acción en el centro',
};
const RESOLVED_GOAL = 20; // objetivo por turno: 15–20

const when = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)} ${s.slice(11, 16)}` : '—');
const initials = (name) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]).join('');

export const mountIssuesView = (root, { api }) => {
  let data = { taken: null, issues: [] };
  let now = new Date(), current = monthOf(now), centers = new Map();
  const state = { scope: 'current', month: null, origin: 'all', q: '', shown: {} };

  root.innerHTML = `
    <div class="iss-head">
      <h2>Issues</h2><span class="iss-snap"></span>
      <div class="iss-seg" role="group" aria-label="Alcance">
        <button data-scope="current" aria-pressed="true"></button><button data-scope="previous" aria-pressed="false"></button>
      </div>
    </div>
    <div class="iss-head">
      <div class="iss-chips" role="group" aria-label="Origen">
        ${[['all', 'Todas'], ['sga', 'SGA'], ['sisu', 'SISU'], ['prio', 'Priorizadas']].map(([k, t]) => `<button data-origin="${k}" aria-pressed="${k === 'all'}">${t}</button>`).join('')}
      </div>
      <input class="settings-input iss-search" type="search" placeholder="Buscar centro, INC o texto" aria-label="Buscar issue" />
    </div>
    <section class="iss-strip" aria-label="Resumen"></section>
    <section class="iss-board" aria-label="Tablero"></section>
    <aside class="iss-drawer" hidden aria-label="Ficha de la issue"></aside>`;
  const $ = (s) => root.querySelector(s);

  const card = (i) => {
    const f = firstTouch(i, now), same = (centers.get(i.center)?.length || 1) - 1;
    return `<button class="iss-card ${esc(i.priority)}" data-id="${esc(i.id)}">
      <span class="iss-row"><span class="iss-sev ${esc(i.priority)}">${esc(SEVERITY_ES[i.priority] || i.priority)}</span>${i.center ? `<span class="iss-code">${esc(i.center)}</span>` : ''}<span class="iss-age" title="Reportada ${when(i.reported)}">${duration(minutesSince(i.reported, now))}</span></span>
      ${f ? `<span class="iss-sla${f.late ? ' late' : ''}">${f.late ? `Fuera de plazo · ${duration(-f.left)}` : `Quedan ${Math.ceil(f.left)} min para cogerla`}</span>` : ''}
      <span class="iss-text">${esc(i.text)}</span>
      <span class="iss-row">${i.sisu ? '<span class="iss-tag sisu">SISU</span>' : '<span class="iss-tag">SGA</span>'}${i.prio ? '<span class="iss-tag prio">PRIO</span>' : ''}${i.status === 'PENDING' && i.reason ? `<span class="iss-tag">${esc(REASON_ES[i.reason] || i.reason)}</span>` : ''}${same ? `<span class="iss-tag same" title="Otras issues abiertas del mismo centro">+${same} del centro</span>` : ''}
        ${i.assignee ? `<span class="iss-who" title="${esc(i.assignee)}">${esc(initials(i.assignee))}</span>` : '<span class="iss-who none">Sin asignar</span>'}</span>
    </button>`;
  };

  const renderStrip = (list) => {
    const s = summary(list, data.issues, now);
    let html = `
      <div class="iss-stat${s.late ? ' alert' : ''}"><span>Altas y críticas sin coger, fuera de plazo</span><b>${s.late}</b><span>de ${s.unassigned} sin asignar</span></div>
      <div class="iss-stat${s.critical ? ' alert' : ''}"><span>Críticas abiertas</span><b>${s.critical}</b><span>15 min para empezar a gestionarlas</span></div>
      <div class="iss-stat"><span>Priorizadas por negocio</span><b>${s.prio}</b><span>etiqueta PRIO</span></div>
      <div class="iss-stat"><span>Resueltas hoy</span><b>${s.resolvedToday}</b><span>objetivo por turno: 15–20</span>
        <div class="iss-goal" role="img" aria-label="${s.resolvedToday} de ${RESOLVED_GOAL}"><i style="width:${Math.min(100, s.resolvedToday / RESOLVED_GOAL * 100)}%"></i><em></em></div></div>`;
    if (state.scope === 'previous') {
      const months = previousMonths(data.issues, current), max = Math.max(1, ...months.map((m) => m.count));
      html += `<div class="iss-stat wide"><span>Abiertas de meses anteriores · pulsa un mes para filtrar</span>
        <div class="iss-months">${months.map(({ month, count }) => `<button data-month="${month}" aria-pressed="${state.month === month}" title="${count} issues"><small>${count}</small><i style="height:${Math.max(3, count / max * 40)}px"></i><small>${MONTHS[+month.slice(5) - 1]}${month.slice(0, 4) === current.slice(0, 4) ? '' : ` ${month.slice(2, 4)}`}</small></button>`).join('')}</div></div>`;
    }
    $('.iss-strip').innerHTML = html;
  };

  const render = () => {
    if (!data.taken) {
      $('.iss-snap').textContent = '';
      $('.iss-strip').innerHTML = '';
      $('.iss-board').innerHTML = `<div class="pn-empty"><span class="pn-empty-ico">${ISSUES_ICON}</span><b>Aún no hay issues</b><span>De momento se leen del CSV más reciente que se deje en la carpeta «issues» del workspace de SIA.</span></div>`;
      return;
    }
    const q = fold(state.q);
    const list = data.issues.filter((i) => matches(i, { ...state, q }, current, fold));
    const cur = data.issues.filter((i) => i.reported.startsWith(current)).length;
    $('.iss-snap').textContent = `Foto del ${when(`${dayOf(now)} ${now.toTimeString().slice(0, 5)}`)} · ${data.issues.length} abiertas`;
    $('[data-scope="current"]').textContent = `Mes en curso · ${cur}`;
    $('[data-scope="previous"]').textContent = `Recuperar anteriores · ${data.issues.length - cur}`;
    renderStrip(list);
    $('.iss-board').innerHTML = columns(now).map((c) => {
      const items = list.filter(c.test).sort(c.sort);
      const n = state.shown[c.key] || PAGE;
      return `<div class="iss-col"><div class="iss-col-h"><h3>${c.title}<span>${items.length}</span></h3><p>${c.hint}</p></div>
        <div class="iss-list">${items.slice(0, n).map(card).join('') || '<div class="iss-none">Nada aquí.</div>'}
        ${items.length > n ? `<button class="iss-more" data-more="${c.key}">Ver ${Math.min(PAGE, items.length - n)} más de ${items.length - n}</button>` : ''}</div></div>`;
    }).join('');
  };

  const open = (id) => {
    const i = data.issues.find((x) => x.id === id);
    if (!i) return;
    const f = firstTouch(i, now), same = (centers.get(i.center) || []).filter((x) => x.id !== i.id);
    const d = $('.iss-drawer');
    d.innerHTML = `<div class="iss-dh"><button class="iss-x" data-close aria-label="Cerrar">×</button>
        <span class="iss-row"><span class="iss-sev ${esc(i.priority)}">${esc(SEVERITY_ES[i.priority] || i.priority)}</span>${i.center ? `<span class="iss-code">${esc(i.center)}</span>` : ''}${i.sisu ? '<span class="iss-tag sisu">SISU</span>' : '<span class="iss-tag">SGA</span>'}${i.prio ? '<span class="iss-tag prio">PRIO</span>' : ''}</span>
        <h3>${esc(i.text)}</h3>
        ${f ? `<span class="iss-sla${f.late ? ' late' : ''}">${f.late ? `Fuera de plazo de primera gestión · ${duration(-f.left)}` : `Quedan ${Math.ceil(f.left)} min para cogerla`}</span>` : ''}
      </div>
      <div class="iss-db">
        <div class="iss-acts"><button class="lab-btn primary" disabled>Asignármela</button><button class="lab-btn" disabled>Añadir nota</button><button class="lab-btn" disabled>Escalar</button><button class="lab-btn" disabled>Resolver</button></div>
        <p class="iss-note">Las acciones irán a través de SIGLO; de momento, desactivadas.</p>
        <dl class="iss-kv">
          <dt>Incidencia</dt><dd>${i.link ? `<a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.id)} ↗</a>` : esc(i.id)}</dd>
          <dt>Centro</dt><dd>${esc(i.center || '—')}</dd>
          <dt>Estado</dt><dd>${esc(STATUS_ES[i.status] || i.status)}${i.reason ? ` · ${esc(REASON_ES[i.reason] || i.reason)}` : ''}</dd>
          <dt>Asignada a</dt><dd>${esc(i.assignee || 'Nadie')}</dd>
          <dt>Grupo</dt><dd>${esc(i.group || '—')}</dd>
          <dt>Reportada</dt><dd>${when(i.reported)} · hace ${duration(minutesSince(i.reported, now))}</dd>
          <dt>Último cambio</dt><dd>${when(i.modified)}</dd>
          ${i.vendorTicket ? `<dt>Ticket proveedor</dt><dd>${esc(i.vendorTicket)}</dd>` : ''}
          ${i.related ? `<dt>Relacionada</dt><dd>${esc(i.related)}</dd>` : ''}
        </dl>
        ${same.length ? `<div class="iss-sec"><h4>Del mismo centro · ${same.length} abiertas</h4><div class="iss-rel">${same.slice(0, 8).map((x) => `<button data-id="${esc(x.id)}"><span class="iss-sev ${esc(x.priority)}">${esc(SEVERITY_ES[x.priority] || x.priority)}</span><span>${esc(x.text)}</span></button>`).join('')}</div></div>` : ''}
        <div class="iss-sec"><h4>Estados</h4><ol class="iss-tl">${i.changes.map(([t, a, b]) => `<li><time>${when(t)}</time><span>${a && a !== b ? `${esc(STATUS_ES[a] || a)} → ` : ''}<b>${esc(STATUS_ES[b] || b)}</b></span></li>`).join('') || '<li>Sin cambios registrados</li>'}</ol></div>
      </div>`;
    d.hidden = false;
  };
  const close = () => { $('.iss-drawer').hidden = true; };

  root.addEventListener('click', (e) => {
    const t = e.target;
    const more = t.closest('[data-more]');
    if (more) { state.shown[more.dataset.more] = (state.shown[more.dataset.more] || PAGE) + PAGE; return render(); }
    const c = t.closest('.iss-card, .iss-rel [data-id]');
    if (c) return open(c.dataset.id);
    if (t.closest('[data-close]')) return close();
    const o = t.closest('[data-origin]');
    if (o) { state.origin = o.dataset.origin; root.querySelectorAll('[data-origin]').forEach((x) => x.setAttribute('aria-pressed', String(x === o))); state.shown = {}; return render(); }
    const m = t.closest('[data-month]');
    if (m) { state.month = state.month === m.dataset.month ? null : m.dataset.month; state.shown = {}; return render(); }
    const s = t.closest('[data-scope]');
    if (s) { state.scope = s.dataset.scope; state.month = null; state.shown = {}; root.querySelectorAll('[data-scope]').forEach((x) => x.setAttribute('aria-pressed', String(x === s))); return render(); }
  });
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });
  $('.iss-search').addEventListener('input', (e) => { state.q = e.target.value.trim(); state.shown = {}; render(); });

  return {
    show: async () => {
      try { data = await api.load(); }
      catch (e) { $('.iss-board').innerHTML = `<div class="pn-empty"><b>No se pudieron cargar las issues</b><span>${esc(e.message)}</span></div>`; return; }
      now = data.taken ? new Date(data.taken) : new Date();
      current = monthOf(now);
      centers = byCenter(data.issues);
      render();
    },
  };
};
