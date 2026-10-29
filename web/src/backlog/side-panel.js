// El panel lateral del Backlog: una issue entera (lo que dice el centro, su
// ficha y las notas de Remedy) y lo que se puede hacer con ella desde aquí:
// asignarla a alguien del equipo; priorizarla será poner la etiqueta PRIO en
// Remedy, pendiente de tener acceso (el botón, de momento, lo dice). Solo
// HTML; el cableado está en backlog-view.js.
import { esc } from '../ui/html.js';
import { SEVERITY_ES, STATUS_ES, REASON_ES, when, whenIso, age } from '../issues/format.js';
import { sev, origin } from '../issues/parts.js';
import { worklogHtml } from '../issues/work-screen.js';
import { pickerHtml } from '../ui/picker.js';

// Priorizar: la prioridad es la etiqueta PRIO de Remedy, que pone negocio.
const pinHtml = ({ prio }) => `<div class="bl-act"><h5>Priorizar</h5>
    <button class="lab-btn primary" data-pin ${prio ? 'disabled' : ''}>${prio ? 'Ya priorizada' : 'Priorizar'}</button>
    <small class="bl-act-note">Pendiente: es la etiqueta PRIO de Remedy y SIA aún no puede escribirla.</small></div>`;

// Asignarla a alguien del equipo (people: [{ id, name }]), con el selector propio de la app.
const assignHtml = ({ people, busy }) => `<form class="bl-act bl-act-form" data-assign-form><h5>Asignar</h5>
    <div class="bl-act-row">${pickerHtml({ name: 'to', id: 'bl-assign-to', options: people, empty: 'Nadie en Issues' })}<button type="submit" class="lab-btn primary" ${busy ? 'disabled' : ''}>${busy ? 'Asignando…' : 'Asignar'}</button></div>
    <small class="bl-act-note">Pasará a su mesa como cogida.</small></form>`;

// detail: lo que da GET /backlog/:id
export const sidePanel = ({ detail, people, busy, error, now }) => {
  const { issue: i, claimedBy } = detail;
  return `<header class="bl-side-h">
      <span class="iss-code">${esc(i.id)}</span>${i.link ? `<a class="bl-side-link" href="${esc(i.link)}" target="_blank" rel="noopener">Abrir en Remedy ↗</a>` : ''}
      <button class="modal-close" data-side-close aria-label="Cerrar">×</button>
    </header>
    <div class="bl-side-body">
      <h3 class="bl-side-title">${esc(i.text)}</h3>
      <p class="iss-line">${sev(i.priority)}<span class="iss-code">${esc(i.center || '—')}</span>${origin(i)}${i.prio ? '<span class="iss-prio">Priorizada por negocio</span>' : ''}<span class="iss-when">hace ${age(i.reported, now)}</span></p>
      ${claimedBy ? `<p class="bl-side-warn">Ya la tiene ${esc(claimedBy.name)} desde el ${whenIso(claimedBy.at)}: ha salido de la cola.</p>` : ''}
      ${error ? `<p class="bl-rules-err">${esc(error)}</p>` : ''}
      <div class="bl-acts">${claimedBy ? '' : pinHtml({ prio: i.prio }) + assignHtml({ people, busy })}</div>
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
