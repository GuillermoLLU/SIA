// Atender la llamada de un centro desde el panel (dominio y HTML, sin E/S; el
// cableado, incoming-view.js). En la columna derecha, bajo «Hoy», una tarjeta para
// buscar la incidencia por su número (sea de quien sea); al elegirla, una
// ventana ancha: a la izquierda su detalle, para atender bien la llamada; a la
// derecha, como en Seguimiento, sus últimas notas y debajo el teléfono y lo que
// se habló.
// Solo deja registro: no se resuelve, no se coge ni se mueve. La llamada queda
// como una llamada atendida (CALLOK) en el Seguimiento de la issue (call.js).
import { esc } from '../ui/html.js';
import { STATUS_ES, SEVERITY_ES, when, age } from './format.js';
import { originOf } from './origin.js';
import { notesFeed, isPhone } from './notes.js';
import { noteItemHtml } from './notes-html.js';

const svg = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const PHONE = svg('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>');
const SEARCH = svg('<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>');

// Las cifras que se buscan (lo mismo que el bridge, server/issues/search.js)
export const MIN_DIGITS = 4;
export const digitsOf = (q) => String(q ?? '').replace(/\D/g, '');

// La tarjeta del panel
export const incomingCardHtml = () => `<section class="iss-card inc-card" aria-label="Llamada de un centro">
    <div class="iss-card-h"><h3><i class="inc-ic">${PHONE}</i>Llamada de un centro</h3></div>
    <p class="inc-help">Busca su incidencia para ver el detalle y dejar nota de la llamada.</p>
    <div class="inc-search">
      <i class="inc-ic">${SEARCH}</i>
      <input data-incoming-q type="search" inputmode="numeric" autocomplete="off" spellcheck="false" placeholder="Número de incidencia (INC…)" aria-label="Número de la incidencia" aria-controls="inc-hits" />
      <div class="inc-hits" id="inc-hits" data-incoming-hits role="listbox" hidden></div>
    </div>
  </section>`;

// El número con lo buscado resaltado (por el final, que es lo que se dicta)
const markedId = (id, digits) => {
  const at = digits ? id.lastIndexOf(digits) : -1;
  return at < 0 ? esc(id) : `${esc(id.slice(0, at))}<u>${esc(digits)}</u>${esc(id.slice(at + digits.length))}`;
};
// Lo que sale al buscar: cada incidencia con su número, su título y, debajo,
// su centro, su estado y quién la lleva en SIA. active: la elegida con las flechas.
export const hitsHtml = (results, q, active = 0) => {
  const digits = digitsOf(q);
  if (!results.length) return `<p class="inc-none">Ninguna incidencia con «${esc(digits)}» en la foto.</p>`;
  return results.map((r, k) => `<button type="button" class="inc-hit" role="option" aria-selected="${k === active}" data-incoming-open="${esc(r.id)}">
      <b class="inc-id">${markedId(r.id, digits)}</b><span class="inc-t">${esc(r.text)}</span>
      <small>Centro ${esc(r.center || '—')} · ${esc(STATUS_ES[r.status] || r.status)} · ${r.holder ? esc(r.holder) : 'sin coger en SIA'}</small>
    </button>`).join('');
};

// ¿Se puede guardar? Lo que se habló, siempre; el teléfono, si se pone, que lo sea.
export const incomingReady = ({ phone = '', comment = '' } = {}) => !!String(comment).trim() && (!String(phone).trim() || isPhone(phone));

// Las últimas notas del Seguimiento (de Remedy y de SIA, llamadas incluidas) que
// se enseñan en la ventana, plegadas → { recent, total }
const RECENT = 6;
export const recentOf = (issue, timeline = []) => {
  const notes = notesFeed({ worklog: issue.worklog, timeline }).filter((e) => e.kind === 'note');
  return { recent: notes.slice(-RECENT), total: notes.length };
};

// La ventana: el detalle de la issue a la izquierda y, a la derecha, sus últimas
// notas con lo que se habló debajo.
// recent y total: las últimas notas y cuántas hay (recentOf)
const fact = (label, value, cls = '') => `<div class="${cls}"><dt>${label}</dt><dd>${value}</dd></div>`;
export const recentHtml = (recent, { open = new Set(), now = new Date() } = {}) => recent.map((e) => noteItemHtml(e, { open: open.has(e.key), now })).join('');
export const incomingModalHtml = ({ issue: i, recent = [], total = 0, now = new Date() }) => `<div class="iss-modal inc-modal" data-incoming-modal>
  <form class="iss-act-form inc-form" data-incoming-form novalidate>
    <header><h3><i class="inc-ic">${PHONE}</i>Llamada del centro</h3>${i.link ? `<a href="${esc(i.link)}" target="_blank" rel="noopener" title="Abrir en Remedy">${esc(i.id)} ↗</a>` : `<span>${esc(i.id)}</span>`}</header>
    <div class="inc-body">
     <div class="inc-col inc-detail">
      <p class="inc-title">${esc(i.text)}</p>
      <dl class="inc-facts">
        ${fact('Criticidad', `${esc(SEVERITY_ES[i.priority] || i.priority || '—')}${i.prio ? ' <small>priorizada</small>' : ''}`, `k-sev ${esc(i.priority || '')}`)}
        ${fact('Origen', originOf(i), `k-origin${i.sisu ? ' sisu' : ''}`)}
        ${fact('Centro', `<span class="iss-code">${esc(i.center || '—')}</span>`)}
        ${fact('Estado', esc(STATUS_ES[i.status] || i.status || '—'))}
        ${fact('La lleva', i.claimedBy ? `${esc(i.claimedBy.name)} <small>en SIA</small>` : i.assignee ? `${esc(i.assignee)} <small>en Remedy</small>` : 'Nadie')}
        ${fact('Creada', `${when(i.reported)} <small>hace ${age(i.reported, now)}</small>`)}
      </dl>
      <h4 class="iss-sub">Lo que dice el centro</h4>
      <div class="iss-notes inc-said">${esc(i.notes || 'Sin descripción.')}</div>
     </div>
     <div class="inc-side">
      <div class="inc-col inc-notes">
       <h4 class="iss-sub">Últimas notas <span class="iss-low">· ${recent.length < total ? `${recent.length} de ${total}` : total}</span></h4>
       ${recent.length ? `<ol class="nt-list inc-recent" data-incoming-recent>${recentHtml(recent, { now })}</ol>` : '<p class="inc-none">Todavía no hay notas.</p>'}
      </div>
      <div class="inc-call">
       <label class="iss-field inc-phone" for="inc-f-phone"><span>Teléfono <i>(opcional)</i></span><input id="inc-f-phone" name="phone" type="tel" inputmode="tel" autocomplete="off" placeholder="El número desde el que llaman" /></label>
       <label class="iss-field inc-said-now" for="inc-f-comment"><span>Lo que se habló</span><textarea id="inc-f-comment" name="comment" rows="4" placeholder="Qué pide el centro y qué le has dicho…"></textarea></label>
       <p class="iss-act-note">Solo queda registrada la llamada en el Seguimiento de la issue: no se resuelve, no se coge ni se mueve. Aún no llega a Remedy: irá por SIGLO cuando lo conectemos.</p>
       <p class="iss-act-err" hidden></p>
       <footer><button type="button" class="lab-btn" data-incoming-cancel>Cancelar</button><button type="submit" class="lab-btn primary" disabled>Guardar llamada</button></footer>
      </div>
     </div>
    </div>
  </form>
</div>`;
