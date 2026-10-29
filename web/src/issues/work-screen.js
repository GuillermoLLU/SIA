// La pantalla de trabajo de una issue. A la izquierda, en pestañas: el
// análisis de la IA, el detalle de la issue, las relacionadas y su recorrido
// en SIA (por dónde ha pasado y las notas del equipo). A la derecha,
// sus datos clave y debajo el chat de la issue (con el conocimiento,
// issue-chat.js), que vive mientras la issue esté abierta. El análisis (lo
// hará el harness del equipo) y las parecidas, por conectar: solo sus huecos.
import { esc } from '../ui/html.js';
import { STATUS_ES, REASON_ES, SEVERITY_ES, when, whenIso, dayLabel, timeIso, age } from './format.js';
import { item } from './parts.js';

const pending = (text) => `<p class="iss-pending">${text}</p>`;

const WORK_TABS = [
  { key: 'ai', label: 'Análisis de la IA' },
  { key: 'detail', label: 'Detalle' },
  { key: 'related', label: 'Relacionadas' },
  { key: 'trail', label: 'Recorrido y notas' },
];

// El recorrido en SIA: movimientos y notas por orden (lo que da el bridge en
// `timeline`). Se pinta aparte para poder refrescarlo al añadir una nota.
export const trailTab = (n) => `Recorrido y notas${n ? `<span>${n}</span>` : ''}`;
const MOVES = {
  claimed: (t) => `<b>${esc(t.by || 'Alguien')}</b> la cogió`,
  released: (t) => `<b>${esc(t.by || 'Alguien')}</b> la devolvió a la cola`,
  transferred: (t) => `<b>${esc(t.by || 'Alguien')}</b> la traspasó a <b>${esc(t.to || 'alguien')}</b>`,
};
// Un movimiento: una línea discreta. Una nota: una tarjeta con quién y cuándo.
const trailItem = (t) => (t.type === 'note'
  ? `<li class="iss-trail-note${t.kind === 'transfer' ? ' transfer' : ''}"><div class="iss-trail-card"><header><b>${esc(t.by || 'Alguien')}</b>${t.kind === 'transfer' ? '<i class="iss-tag">Motivo del traspaso</i>' : ''}<time>${timeIso(t.at)}</time>${t.edited ? `<small>· editada ${whenIso(t.edited)}</small>` : ''}</header><p>${esc(t.text)}</p></div></li>`
  : `<li class="iss-trail-move"><span>${(MOVES[t.type] || ((x) => esc(x.type)))(t)}</span><time>${timeIso(t.at)}</time></li>`);
// Agrupado por día, del más antiguo al más reciente. `now` solo decide «Hoy» y «Ayer».
export const trailHtml = (timeline = [], now = new Date()) => {
  if (!timeline.length) return '<p class="iss-empty">Nadie la ha movido ni anotado en SIA todavía.</p>';
  const days = [];
  for (const t of timeline) {
    const day = dayLabel(t.at, now);
    if (days.at(-1)?.day !== day) days.push({ day, items: [] });
    days.at(-1).items.push(t);
  }
  return days.map(({ day, items }) => `<section class="iss-trail-day"><h5>${day}</h5><ol class="iss-trail-list">${items.map(trailItem).join('')}</ol></section>`).join('');
};

// Qué es esta pestaña, en una línea.
export const trailHint = () => '<p class="iss-trail-hint">Aquí queda todo lo que pasa con esta issue en SIA: quién la coge, la devuelve o la traspasa, y las notas internas del equipo. Nada de esto sale a Remedy.</p>';

// Escribir una nota interna, al pie del recorrido. Enviar se enciende con texto.
const SEND = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>';
export const noteFormHtml = () => `<form class="iss-note-form" data-note-form novalidate>
    <textarea name="note" rows="1" placeholder="Escribe una nota interna para el equipo…" aria-label="Nota interna"></textarea>
    <button type="submit" class="iss-send" aria-label="Enviar" title="Enviar (Intro)" disabled>${SEND}</button>
  </form>`;

// El cuerpo del diálogo de confirmación al devolver a la cola.
export const releaseDialogHtml = (id, text) => `<div class="iss-dlg-issue"><span class="iss-dlg-code">${esc(id)}</span><span class="iss-dlg-text">${esc(text || '')}</span></div>
  <p class="iss-dlg-p">Volverá a la cola y podrá cogerla cualquier compañero.</p>`;

const aiSection = (title, text) => `<section class="iss-ai-sec"><h4 class="iss-sub">${title}</h4>${pending(text)}</section>`;
const aiPanel = () => `
  <div class="iss-panel-h"><span class="iss-badge">Por conectar</span></div>
  ${aiSection('Resumen', 'Qué pasa, en pocas líneas.')}
  ${aiSection('Causa probable', 'Lo que apuntan los datos y casos parecidos.')}
  ${aiSection('Pasos sugeridos', 'Qué hacer para resolverla, en orden.')}
  ${aiSection('Logs y datos recopilados', 'Lo que haya recogido el análisis automático, una fila por fuente.')}`;

export const workScreen = ({ issue: i, sameCenter, timeline = [], now, mine, tab = 'ai' }) => `<div class="iss-page iss-work-page">
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
        ${WORK_TABS.map((t) => `<button role="tab" data-wtab="${t.key}" aria-selected="${t.key === tab}">${t.key === 'trail' ? trailTab(timeline.length) : t.label}${t.key === 'related' && sameCenter.length ? `<span>${sameCenter.length}</span>` : ''}</button>`).join('')}
      </div>

      <div class="iss-wpanel" data-wpanel="ai"${tab === 'ai' ? '' : ' hidden'}>${aiPanel()}</div>

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

      <div class="iss-wpanel" data-wpanel="related"${tab === 'related' ? '' : ' hidden'}>
        ${i.related ? `<h4 class="iss-sub">Enlazadas en Remedy</h4><p class="iss-linked">${i.related.split('|').map((x) => `<span>${esc(x.trim())}</span>`).join('')}</p>` : ''}
        <h4 class="iss-sub">Del mismo centro <span class="iss-low">· ${sameCenter.length}</span></h4>
        ${sameCenter.length ? `<div class="iss-items">${sameCenter.map((x) => item(x, 'doing', now)).join('')}</div>` : '<p class="iss-empty">Ninguna otra abierta de este centro.</p>'}
        <h4 class="iss-sub">Parecidas <span class="iss-badge">Por conectar</span></h4>
        ${pending('Issues de otros centros con el mismo problema y cómo se resolvieron.')}
      </div>

      <div class="iss-wpanel iss-trail-panel" data-wpanel="trail"${tab === 'trail' ? '' : ' hidden'}>
        ${trailHint()}
        <div class="iss-trail-scroll" data-trail>${trailHtml(timeline, now)}</div>
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
    <aside class="iss-card iss-chat" aria-label="Chat de la issue">
      <div class="iss-card-h"><h3>Chat de la issue</h3></div>
      <p class="iss-chat-note">Con el conocimiento del equipo y los datos de ${esc(i.id)}. Sigue abierto mientras la issue lo esté: puedes salir y volver.</p>
      <div class="iss-chat-body"></div>
    </aside>
    </div>
  </div>
</div>`;
