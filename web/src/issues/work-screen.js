// La pantalla de trabajo de una issue. A la izquierda, el trabajo de arriba
// abajo: lo que dice el centro, el análisis de la IA, los logs y datos que ha
// recopilado y la ficha. A la derecha, fijo, el chat de la issue (con el
// conocimiento), que vive mientras la issue esté abierta.
// De momento son las cajas: el análisis, los logs y el chat se conectarán.
import { esc } from '../ui/html.js';
import { STATUS_ES, REASON_ES, when, age } from './format.js';
import { sev, origin, item } from './parts.js';

const pending = (text) => `<p class="iss-pending">${text}</p>`;

export const workScreen = ({ issue: i, sameCenter, now, mine }) => `<div class="iss-page iss-work-page">
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
    <div class="iss-work-main">
      <section class="iss-card">
        <div class="iss-card-h"><h3>Lo que dice el centro</h3><span>${when(i.reported)}</span></div>
        <div class="iss-notes">${esc(i.notes || 'Sin descripción.')}</div>
        ${i.resolution ? `<h4 class="iss-sub">Resolución en Remedy</h4><div class="iss-notes">${esc(i.resolution)}</div>` : ''}
      </section>

      <section class="iss-card iss-ai">
        <div class="iss-card-h"><h3>Análisis de la IA</h3><span class="iss-badge">Por conectar</span></div>
        <div class="iss-ai-grid">
          <div><h4 class="iss-sub">Resumen</h4>${pending('Qué pasa, en dos líneas.')}</div>
          <div><h4 class="iss-sub">Causa probable</h4>${pending('Lo que apuntan los datos y casos parecidos.')}</div>
          <div class="wide"><h4 class="iss-sub">Pasos sugeridos</h4>${pending('Qué hacer para resolverla, en orden.')}</div>
        </div>
      </section>

      <section class="iss-card">
        <div class="iss-card-h"><h3>Logs y datos recopilados</h3><span class="iss-badge">Por conectar</span></div>
        <div class="iss-evidence">
          <div class="iss-evidence-h"><span>Fuente</span><span>Hora</span><span>Detalle</span></div>
          ${pending('Lo que el análisis automático haya recogido (logs, consultas, datos del centro), cada uno con su fuente y su hora.')}
        </div>
      </section>

      <div class="iss-facts">
        <section class="iss-card">
          <h3>Ficha</h3>
          <dl class="iss-kv">
            <dt>Categoría</dt><dd>${esc(i.category || '—')}</dd>
            <dt>Grupo</dt><dd>${esc(i.group || '—')}</dd>
            <dt>Responsable</dt><dd>${esc(i.assignee || 'Nadie en Remedy')}</dd>
            <dt>Reportada</dt><dd>${when(i.reported)}</dd>
            <dt>Último cambio</dt><dd>${when(i.modified)}</dd>
            ${i.vendorTicket ? `<dt>Ticket proveedor</dt><dd>${esc(i.vendorTicket)}</dd>` : ''}
          </dl>
        </section>
        <section class="iss-card">
          <h3>Historial</h3>
          <ol class="iss-tl">${i.changes.map(([t, a, b]) => `<li><time>${when(t)}</time>${a && a !== b ? `${esc(STATUS_ES[a] || a)} → ` : ''}${esc(STATUS_ES[b] || b)}</li>`).join('') || '<li>Sin cambios de estado.</li>'}</ol>
        </section>
      </div>

      ${sameCenter.length ? `<section class="iss-card">
        <div class="iss-card-h"><h3>Otras del mismo centro</h3><span>${sameCenter.length}</span></div>
        <div class="iss-items">${sameCenter.slice(0, 10).map((x) => item(x, 'doing', now)).join('')}</div>
      </section>` : ''}
    </div>

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
