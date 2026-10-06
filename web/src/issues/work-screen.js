// La pantalla de trabajo de una issue. A la izquierda, en pestañas: el
// análisis de la IA (con los logs y datos que haya recopilado), el detalle de
// la issue y las relacionadas. A la derecha, el chat de la issue (con el
// conocimiento), que vive mientras la issue esté abierta.
// De momento son las cajas: el análisis, las parecidas y el chat se conectarán.
import { esc } from '../ui/html.js';
import { STATUS_ES, REASON_ES, when, age } from './format.js';
import { sev, origin, item } from './parts.js';

const pending = (text) => `<p class="iss-pending">${text}</p>`;

export const WORK_TABS = [
  { key: 'ai', label: 'Análisis de la IA' },
  { key: 'detail', label: 'Detalle' },
  { key: 'related', label: 'Relacionadas' },
];

export const workScreen = ({ issue: i, sameCenter, now, mine, tab = 'ai' }) => `<div class="iss-page iss-work-page">
  <header class="iss-work-h">
    <button class="iss-back" data-back>← Mi mesa</button>
    <div class="iss-meta">${sev(i.priority)}<span class="iss-code">${esc(i.center || '—')}</span>${origin(i)}${i.prio ? '<span class="iss-prio">Priorizada por negocio</span>' : ''}
      <a href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.id)} ↗</a></div>
    <div class="iss-title-row">
      <div>
        <h2>${esc(i.text)}</h2>
        <p class="iss-state">${esc(STATUS_ES[i.status] || i.status)}${i.reason ? ` · ${esc(REASON_ES[i.reason] || i.reason)}` : ''} · reportada hace ${age(i.reported, now)}${i.claimedBy ? ` · cogida por ${esc(i.claimedBy.name)}` : ''}</p>
      </div>
      <div class="iss-actions">
        <button class="lab-btn primary" disabled title="Irá por SIGLO">Resolver</button>
        <button class="lab-btn" disabled title="Irá por SIGLO">Escalar</button>
        <button class="lab-btn" disabled title="Irá por SIGLO">Añadir nota</button>
        ${mine ? '<button class="lab-btn" data-release>Devolver a la cola</button>' : ''}
      </div>
    </div>
  </header>

  <div class="iss-work">
    <section class="iss-card iss-work-main">
      <div class="iss-wtabs" role="tablist">
        ${WORK_TABS.map((t) => `<button role="tab" data-wtab="${t.key}" aria-selected="${t.key === tab}">${t.label}${t.key === 'related' && sameCenter.length ? `<span>${sameCenter.length}</span>` : ''}</button>`).join('')}
      </div>

      <div class="iss-wpanel" data-wpanel="ai"${tab === 'ai' ? '' : ' hidden'}>
        <div class="iss-panel-h"><span class="iss-badge">Por conectar</span></div>
        <div class="iss-ai-grid">
          <div><h4 class="iss-sub">Resumen</h4>${pending('Qué pasa, en dos líneas.')}</div>
          <div><h4 class="iss-sub">Causa probable</h4>${pending('Lo que apuntan los datos y casos parecidos.')}</div>
          <div class="wide"><h4 class="iss-sub">Pasos sugeridos</h4>${pending('Qué hacer para resolverla, en orden.')}</div>
          <div class="wide"><h4 class="iss-sub">Logs y datos recopilados</h4>
            <div class="iss-evidence-h"><span>Fuente</span><span>Hora</span><span>Detalle</span></div>
            ${pending('Lo que el análisis automático haya recogido (logs, consultas, datos del centro), cada uno con su fuente y su hora.')}
          </div>
        </div>
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

      <div class="iss-wpanel" data-wpanel="related"${tab === 'related' ? '' : ' hidden'}>
        ${i.related ? `<h4 class="iss-sub">Enlazadas en Remedy</h4><p class="iss-linked">${i.related.split('|').map((x) => `<span>${esc(x.trim())}</span>`).join('')}</p>` : ''}
        <h4 class="iss-sub">Del mismo centro <span class="iss-low">· ${sameCenter.length}</span></h4>
        ${sameCenter.length ? `<div class="iss-items">${sameCenter.map((x) => item(x, 'doing', now)).join('')}</div>` : '<p class="iss-empty">Ninguna otra abierta de este centro.</p>'}
        <h4 class="iss-sub">Parecidas <span class="iss-badge">Por conectar</span></h4>
        ${pending('Issues de otros centros con el mismo problema y cómo se resolvieron.')}
      </div>
    </section>

    <aside class="iss-card iss-chat" aria-label="Chat de la issue">
      <div class="iss-card-h"><h3>Chat de la issue</h3><span class="iss-badge">Por conectar</span></div>
      <p class="iss-chat-note">Conectado al conocimiento del equipo. Sigue abierto mientras la issue lo esté: puedes salir y volver.</p>
      <div class="iss-chat-log">${pending(`Pregunta lo que necesites sobre ${esc(i.id)}: el chat ya sabe de qué issue hablas.`)}</div>
      <form class="iss-chat-input" onsubmit="return false">
        <textarea rows="2" placeholder="Pregunta sobre esta issue…" disabled></textarea>
        <button class="lab-btn primary" disabled>Enviar</button>
      </form>
    </aside>
  </div>
</div>`;
