// El panel lateral del Backlog: una issue entera (lo que dice el centro, su
// ficha y las notas de Remedy) y lo que se puede hacer con ella desde aquí:
// priorizarla (cuenta como priorizada por negocio para las reglas) o
// asignarla a alguien del equipo. Solo HTML; el cableado está en backlog-view.js.
import { esc } from '../ui/html.js';
import { SEVERITY_ES, STATUS_ES, REASON_ES, when, whenIso, age } from '../issues/format.js';
import { sev, origin } from '../issues/parts.js';
import { worklogHtml } from '../issues/work-screen.js';

// La priorización a mano: la que hay, o el botón para ponerla.
const pinHtml = ({ pinned, prio, busy }) => (pinned
  ? `<div class="bl-act"><h5>Priorizada</h5><p>Por ${esc(pinned.by || 'alguien')} el ${whenIso(pinned.at)}. Cuenta como priorizada por negocio.</p><button class="lab-btn" data-unpin ${busy ? 'disabled' : ''}>Quitar prioridad</button></div>`
  : `<div class="bl-act"><h5>Priorizar</h5><p>${prio ? 'Ya viene priorizada por negocio desde Remedy.' : 'Contará como priorizada por negocio: las reglas con ese criterio la suben.'}</p><button class="lab-btn primary" data-pin ${busy || prio ? 'disabled' : ''}>${busy ? 'Priorizando…' : 'Priorizar'}</button></div>`);

// Asignarla a alguien del equipo (people: [{ id, name }]).
const assignHtml = ({ people, busy }) => `<form class="bl-act bl-act-form" data-assign-form><h5>Asignar</h5><p>Pasará a la mesa de esa persona, como cogida.</p>
    <div class="bl-act-row"><select name="to" required><option value="">Elige a quién…</option>${people.map((u) => `<option value="${esc(u.id)}">${esc(u.name)}</option>`).join('')}</select><button type="submit" class="lab-btn primary" ${busy ? 'disabled' : ''}>${busy ? 'Asignando…' : 'Asignar'}</button></div></form>`;

// detail: lo que da GET /backlog/:id
export const sidePanel = ({ detail, people, busy, error, now }) => {
  const { issue: i, pinned, claimedBy } = detail;
  return `<header class="bl-side-h">
      <span class="iss-code">${esc(i.id)}</span>${i.link ? `<a class="bl-side-link" href="${esc(i.link)}" target="_blank" rel="noopener">Abrir en Remedy ↗</a>` : ''}
      <button class="modal-close" data-side-close aria-label="Cerrar">×</button>
    </header>
    <div class="bl-side-body">
      <h3 class="bl-side-title">${esc(i.text)}</h3>
      <p class="iss-line">${sev(i.priority)}<span class="iss-code">${esc(i.center || '—')}</span>${origin(i)}${pinned ? '<span class="iss-prio">Priorizada por el equipo</span>' : i.prio ? '<span class="iss-prio">Priorizada por negocio</span>' : ''}<span class="iss-when">hace ${age(i.reported, now)}</span></p>
      ${claimedBy ? `<p class="bl-side-warn">Ya la tiene ${esc(claimedBy.name)} desde el ${whenIso(claimedBy.at)}: ha salido de la cola.</p>` : ''}
      ${error ? `<p class="bl-rules-err">${esc(error)}</p>` : ''}
      <div class="bl-acts">${claimedBy ? '' : pinHtml({ pinned, prio: i.prio && !pinned, busy }) + assignHtml({ people, busy })}</div>
      <h4 class="iss-sub">Lo que dice el centro <span class="iss-low">· ${when(i.reported)}</span></h4>
      <div class="iss-notes">${esc(i.notes || 'Sin descripción.')}</div>
      <h4 class="iss-sub">Ficha</h4>
      <dl class="iss-kv">
        <dt>Estado</dt><dd>${esc(STATUS_ES[i.status] || i.status)}${i.reason ? ` · ${esc(REASON_ES[i.reason] || i.reason)}` : ''}</dd>
        <dt>Criticidad</dt><dd>${esc(SEVERITY_ES[i.priority] || i.priority)}</dd>
        <dt>Categoría</dt><dd>${esc(i.category || '—')}</dd>
        <dt>Responsable</dt><dd>${esc(i.assignee || 'Nadie en Remedy')}</dd>
        <dt>Reportada</dt><dd>${when(i.reported)}</dd>
        <dt>Último cambio</dt><dd>${when(i.modified)}</dd>
      </dl>
      <details class="bl-side-wl"><summary>Notas de Remedy${i.worklog?.length ? ` <span>${i.worklog.length}</span>` : ''}</summary>${worklogHtml(i.worklog, now)}</details>
    </div>`;
};
