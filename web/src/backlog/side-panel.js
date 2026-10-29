// El panel lateral del Backlog: una issue entera (lo que dice el centro, su
// ficha y las notas de Remedy) y lo que se puede hacer con ella desde aquí:
// priorizarla (la primera de la cola, en todas las reglas o en algunas) o
// asignarla a alguien del equipo. Solo HTML; el cableado está en backlog-view.js.
import { esc } from '../ui/html.js';
import { SEVERITY_ES, STATUS_ES, REASON_ES, when, whenIso, age } from '../issues/format.js';
import { sev, origin } from '../issues/parts.js';
import { worklogHtml } from '../issues/work-screen.js';

// Con qué reglas cuenta una priorización, en palabras.
export const pinnedRules = (pin, rules) => (pin.rules.length ? pin.rules.map((id) => rules.find((r) => r.id === id)?.label || 'una regla borrada').join(', ') : 'todas las reglas');

// La priorización: la que hay, o el formulario para ponerla (abierto o no).
const pinHtml = ({ pinned, rules, pinForm, busy }) => {
  if (pinned) {
    return `<div class="bl-act"><h5>Priorizada</h5><p>Por ${esc(pinned.by || 'alguien')} el ${whenIso(pinned.at)}, para ${esc(pinnedRules(pinned, rules))}.</p>
      <button class="lab-btn" data-unpin ${busy ? 'disabled' : ''}>Quitar prioridad</button></div>`;
  }
  if (!pinForm) return `<div class="bl-act"><h5>Priorizar</h5><p>Irá la primera de la cola.</p><button class="lab-btn primary" data-pin-open>Priorizar</button></div>`;
  return `<form class="bl-act bl-act-form" data-pin-form><h5>Priorizar</h5><p>¿Para qué reglas va la primera?</p>
      <label class="bl-check"><input type="checkbox" data-pin-all ${pinForm.all ? 'checked' : ''}> Todas las reglas</label>
      <div class="bl-checks"${pinForm.all ? ' hidden' : ''}>${rules.map((r) => `<label class="bl-check"><input type="checkbox" name="rule" value="${esc(r.id)}" ${pinForm.rules.includes(r.id) ? 'checked' : ''}> ${esc(r.label)}</label>`).join('')}</div>
      <div class="bl-act-btns"><button type="button" class="lab-btn" data-pin-cancel>Cancelar</button><button type="submit" class="lab-btn primary" ${busy ? 'disabled' : ''}>${busy ? 'Priorizando…' : 'Confirmar'}</button></div></form>`;
};

// Asignarla a alguien del equipo (people: [{ id, name }]).
const assignHtml = ({ people, busy }) => `<form class="bl-act bl-act-form" data-assign-form><h5>Asignar</h5><p>Pasará a la mesa de esa persona, como cogida.</p>
    <div class="bl-act-row"><select name="to" required><option value="">Elige a quién…</option>${people.map((u) => `<option value="${esc(u.id)}">${esc(u.name)}</option>`).join('')}</select><button type="submit" class="lab-btn primary" ${busy ? 'disabled' : ''}>${busy ? 'Asignando…' : 'Asignar'}</button></div></form>`;

// detail: lo que da GET /backlog/:id · rules: las reglas (para el formulario y para decir cuáles)
export const sidePanel = ({ detail, rules, people, pinForm, busy, error, now }) => {
  const { issue: i, pinned, claimedBy } = detail;
  return `<header class="bl-side-h">
      <span class="iss-code">${esc(i.id)}</span>${i.link ? `<a class="bl-side-link" href="${esc(i.link)}" target="_blank" rel="noopener">Abrir en Remedy ↗</a>` : ''}
      <button class="modal-close" data-side-close aria-label="Cerrar">×</button>
    </header>
    <div class="bl-side-body">
      <h3 class="bl-side-title">${esc(i.text)}</h3>
      <p class="iss-line">${sev(i.priority)}<span class="iss-code">${esc(i.center || '—')}</span>${origin(i)}${i.prio ? '<span class="iss-prio">Priorizada por negocio</span>' : ''}<span class="iss-when">hace ${age(i.reported, now)}</span></p>
      ${claimedBy ? `<p class="bl-side-warn">Ya la tiene ${esc(claimedBy.name)} desde el ${whenIso(claimedBy.at)}: ha salido de la cola.</p>` : ''}
      ${error ? `<p class="bl-rules-err">${esc(error)}</p>` : ''}
      <div class="bl-acts">${claimedBy ? '' : pinHtml({ pinned, rules, pinForm, busy }) + assignHtml({ people, busy })}</div>
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
