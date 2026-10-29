// La pantalla de trabajo de una issue. A la izquierda, en pestañas: el
// detalle de la issue (por defecto), las notas de trabajo de Remedy, las
// relacionadas y su histórico en SIA (por dónde ha pasado y las notas
// internas del equipo). A la derecha, sus datos clave y debajo la resolución
// asistida por IA (issue-chat.js), que vive mientras la issue esté abierta.
// Las parecidas, por conectar: solo su hueco.
import { esc } from '../ui/html.js';
import { STATUS_ES, REASON_ES, SEVERITY_ES, when, whenIso, whenLabel, newestFirst, age } from './format.js';
import { item } from './parts.js';

const WORK_TABS = [
  { key: 'detail', label: 'Detalle' },
  { key: 'remedy', label: 'Notas de Remedy' },
  { key: 'related', label: 'Relacionadas' },
  { key: 'trail', label: 'Histórico y notas' },
];

// El histórico en SIA: lo que da el bridge en `timeline` (movimientos y notas,
// de la más antigua a la más nueva), pintado al revés, lo reciente arriba. Va
// aparte para poder refrescarlo al añadir o editar una nota.
export const trailTab = (n) => `${WORK_TABS.find((t) => t.key === 'trail').label}${n ? `<span>${n}</span>` : ''}`;
// Las notas de trabajo de Remedy (worklog de la foto): quién, cuándo y qué,
// la más reciente arriba y abierta; el resto, plegadas con su primera línea,
// y se abren al pulsar la tarjeta. Sin la columna en la foto (cargada antes
// de leerla), se pide un CSV nuevo.
export const firstLine = (text) => { const l = String(text).trim().split('\n')[0]; return l.length > 90 ? `${l.slice(0, 90)}…` : l; };
export const worklogHtml = (worklog, now = new Date()) => {
  if (!worklog) return '<p class="iss-empty">La foto cargada no trae las notas de Remedy: carga un CSV nuevo de la consulta.</p>';
  if (!worklog.length) return '<p class="iss-empty">Sin notas de trabajo en Remedy.</p>';
  return `<div class="iss-wl">${newestFirst(worklog).map((n, k) => `<details class="iss-wl-card"${k === 0 ? ' open' : ''}>
      <summary><b>${esc(n.who)}</b><span class="iss-wl-peek">${esc(firstLine(n.text))}</span><time>${whenLabel(n.at, now)}</time></summary>
      <p>${esc(n.text)}</p>
    </details>`).join('')}</div>`;
};

// Quién: un avatar con sus iniciales (sin nombre, un interrogante).
const initials = (name) => (name || '').trim().split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
const avatar = (name) => `<span class="iss-avatar${name ? '' : ' unknown'}" aria-hidden="true">${esc(initials(name))}</span>`;
const who = (name) => `<b>${esc(name || 'Alguien')}</b>`;

// Cada entrada del feed: avatar, cabecera (quién hizo qué, y la hora) y, si
// lo hay, el texto (la nota o el motivo del traspaso) como comentario.
const DID = {
  claimed: (t) => `${who(t.by)} cogió la issue`,
  released: (t) => `${who(t.by)} devolvió la issue a la cola`,
  transferred: (t) => `${who(t.by)} traspasó la issue a ${who(t.to)}`,
  note: (t) => `${who(t.by)} escribió una nota`,
};
// Una nota la edita quien la escribió, durante las 24 h siguientes (la misma
// regla que el bridge, server/issues/notes.js; aquí solo decide si se enseña el botón).
export const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000;
export const canEditNote = (t, meId, now) => t.type === 'note' && !!meId && t.byId === meId && now.getTime() - new Date(t.at).getTime() <= EDIT_WINDOW_MS;

const trailItem = (t, meId, now) => `<li class="iss-feed-item" data-entry="${t.type === 'note' ? esc(String(t.id)) : ''}">${avatar(t.by)}<div class="iss-feed-body">
      <header><span class="iss-feed-did">${(DID[t.type] || ((x) => esc(x.type)))(t)}</span>${canEditNote(t, meId, now) ? `<button type="button" class="iss-feed-edit" data-edit-note="${esc(String(t.id))}">Editar</button>` : ''}${t.edited ? `<small>editada ${whenLabel(t.edited, now)}</small>` : ''}<time>${whenLabel(t.at, now)}</time></header>
      ${t.text ? `<div class="iss-feed-text" data-note-text>${t.type === 'transferred' ? '<span class="iss-feed-label">Motivo</span>' : ''}${esc(t.text)}</div>` : ''}
    </div></li>`;

// El editor de una nota, en el sitio de su texto: Intro guarda, Escape cancela.
export const noteEditorHtml = (text) => `<form class="iss-note-edit" data-note-edit novalidate>
    <textarea name="note" rows="3" aria-label="Editar la nota">${esc(text)}</textarea>
    <footer><button type="button" class="lab-btn" data-edit-cancel>Cancelar</button><button type="submit" class="lab-btn primary">Guardar</button></footer>
  </form>`;
// Lo más reciente arriba; cada entrada con su cuándo («HOY 13:05» o «22/10 12:06»).
// meId: quién mira, para ofrecer «Editar» solo en sus notas recientes.
export const trailHtml = (timeline = [], now = new Date(), meId = null) => (timeline.length
  ? `<ol class="iss-trail-list">${newestFirst(timeline).map((t) => trailItem(t, meId, now)).join('')}</ol>`
  : '<p class="iss-empty">Nadie la ha movido ni anotado en SIA todavía.</p>');

// El arranque de la resolución asistida: solo el botón; si no se puede, el
// motivo debajo y el botón apagado.
export const assistHtml = (error = null) => `<div class="iss-assist">
    <button class="lab-btn primary iss-assist-go" data-assist ${error ? 'disabled' : ''}>Iniciar resolución asistida por IA</button>
    ${error ? `<p class="iss-assist-hint">${esc(error)}</p>` : ''}
  </div>`;

// En el campo de nota, Intro envía; Mayús+Intro salta de línea.
export const sendsNote = (e) => e.key === 'Enter' && !e.shiftKey;

// Escribir una nota interna, al pie del histórico. Enviar se enciende con texto.
const SEND = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>';
export const noteFormHtml = () => `<form class="iss-note-form" data-note-form novalidate>
    <textarea name="note" rows="1" placeholder="Escribe una nota interna para el equipo…" aria-label="Nota interna"></textarea>
    <button type="submit" class="iss-send" aria-label="Enviar" title="Enviar (Intro)" disabled>${SEND}</button>
  </form>`;

// El cuerpo del diálogo de confirmación al devolver a la cola.
export const releaseDialogHtml = (id, text) => `<div class="iss-dlg-issue"><span class="iss-dlg-code">${esc(id)}</span><span class="iss-dlg-text">${esc(text || '')}</span></div>
  <p class="iss-dlg-p">Volverá a la cola y podrá cogerla cualquier compañero.</p>`;

export const workScreen = ({ issue: i, sameCenter, timeline = [], now, mine, meId = null, tab = 'detail' }) => `<div class="iss-page iss-work-page">
  <header class="iss-work-h">
    <button class="iss-back" data-back>← Mi mesa</button>
    <div class="iss-title-row">
      <div>
        <h2>${esc(i.text)}</h2>
        <p class="iss-state">${esc(STATUS_ES[i.status] || i.status)}${i.reason ? ` · ${esc(REASON_ES[i.reason] || i.reason)}` : ''}</p>
      </div>
      <div class="iss-actions">
        <button class="lab-btn primary" data-act="resolve">Resolver</button>
        <button class="lab-btn" data-act="escalate">Escalar</button>
        <button class="lab-btn" data-act="transfer">Traspasar</button>
        ${mine ? '<button class="lab-btn" data-release>Devolver a la cola</button>' : ''}
      </div>
    </div>
  </header>

  <div class="iss-work">
    <section class="iss-card iss-work-main">
      <div class="iss-wtabs" role="tablist">
        ${WORK_TABS.map((t) => `<button role="tab" data-wtab="${t.key}" aria-selected="${t.key === tab}">${t.key === 'trail' ? trailTab(timeline.length) : t.label}${t.key === 'related' && sameCenter.length ? `<span>${sameCenter.length}</span>` : ''}${t.key === 'remedy' && i.worklog?.length ? `<span>${i.worklog.length}</span>` : ''}</button>`).join('')}
      </div>

      <div class="iss-wpanel" data-wpanel="detail"${tab === 'detail' ? '' : ' hidden'}>
        <h4 class="iss-sub">Lo que dice el centro <span class="iss-low">· ${when(i.reported)}</span></h4>
        <div class="iss-notes">${esc(i.notes || 'Sin descripción.')}</div>
        ${i.resolution ? `<h4 class="iss-sub">Resolución en Remedy</h4><div class="iss-notes">${esc(i.resolution)}</div>` : ''}
        <div class="iss-facts">
          <div><h4 class="iss-sub">Ficha</h4>
            <dl class="iss-kv">
              <dt>Categoría</dt><dd>${esc(i.category || '—')}</dd>
              <dt>Grupo</dt><dd>${esc(i.group || '—')}</dd>
              <dt>Responsable</dt><dd>${esc(i.assignee || 'Nadie en Remedy')}</dd>
              <dt>Reportada</dt><dd>${when(i.reported)}</dd>
              <dt>Último cambio</dt><dd>${when(i.modified)}</dd>
              ${i.vendorTicket ? `<dt>Ticket proveedor</dt><dd>${esc(i.vendorTicket)}</dd>` : ''}
            </dl>
          </div>
          <div><h4 class="iss-sub">Historial</h4>
            <ol class="iss-tl">${i.changes.map(([t, a, b]) => `<li><time>${when(t)}</time>${a && a !== b ? `${esc(STATUS_ES[a] || a)} → ` : ''}${esc(STATUS_ES[b] || b)}</li>`).join('') || '<li>Sin cambios de estado.</li>'}</ol>
          </div>
        </div>
      </div>

      <div class="iss-wpanel" data-wpanel="remedy"${tab === 'remedy' ? '' : ' hidden'}>
        <p class="iss-trail-hint">Lo que se ha ido anotando en Remedy sobre esta issue</p>
        ${worklogHtml(i.worklog, now)}
      </div>

      <div class="iss-wpanel" data-wpanel="related"${tab === 'related' ? '' : ' hidden'}>
        ${i.related ? `<h4 class="iss-sub">Enlazadas en Remedy</h4><p class="iss-linked">${i.related.split('|').map((x) => `<span>${esc(x.trim())}</span>`).join('')}</p>` : ''}
        <h4 class="iss-sub">Del mismo centro <span class="iss-low">· ${sameCenter.length}</span></h4>
        ${sameCenter.length ? `<div class="iss-items">${sameCenter.map((x) => item(x, 'doing', now)).join('')}</div>` : '<p class="iss-empty">Ninguna otra abierta de este centro.</p>'}
        <h4 class="iss-sub">Parecidas <span class="iss-badge">Por conectar</span></h4>
        <p class="iss-pending">Issues de otros centros con el mismo problema y cómo se resolvieron.</p>
      </div>

      <div class="iss-wpanel iss-trail-panel" data-wpanel="trail"${tab === 'trail' ? '' : ' hidden'}>
        <p class="iss-trail-hint">Por quién ha pasado esta issue y las notas internas del equipo</p>
        <div class="iss-trail-scroll" data-trail>${trailHtml(timeline, now, meId)}</div>
        ${noteFormHtml()}
      </div>
    </section>

    <div class="iss-side">
    <section class="iss-card iss-keys" aria-label="Datos clave">
      <div class="k-sev ${esc(i.priority)}"><span>Criticidad</span><b>${esc(SEVERITY_ES[i.priority] || i.priority)}</b><small>${i.prio ? 'priorizada por negocio' : '&nbsp;'}</small></div>
      <div class="k-origin${i.sisu ? ' sisu' : ''}"><span>Origen</span><b>${i.sisu ? 'SISU' : 'SGA'}</b><small>&nbsp;</small></div>
      <div class="k-center"><span>Centro</span><b class="iss-code">${esc(i.center || '—')}</b><small>&nbsp;</small></div>
      <div class="k-link"><span>Remedy</span><b>${i.link ? `<a href="${esc(i.link)}" target="_blank" rel="noopener">Abrir ↗</a>` : '—'}</b><small>${esc(i.id)}</small></div>
      <div class="k-created"><span>Creada</span><b>${when(i.reported)}</b><small>hace ${age(i.reported, now)}</small></div>
      <div class="k-claimed"><span>Asignada</span><b>${i.claimedBy?.at ? whenIso(i.claimedBy.at) : '—'}</b><small>${i.claimedBy ? `en SIA, ${esc(i.claimedBy.name)}` : 'nadie la ha cogido en SIA'}</small></div>
      <div class="k-open"><span>Abierta</span><b>${age(i.reported, now)}</b><small>desde que se creó</small></div>
      <div class="k-moved"><span>Último movimiento</span><b>${i.modified ? `hace ${age(i.modified, now)}` : '—'}</b><small>${when(i.modified)}</small></div>
    </section>
    <aside class="iss-card iss-chat" aria-label="Resolución asistida por IA">
      <div class="iss-chat-body"></div>
    </aside>
    </div>
  </div>
</div>`;
