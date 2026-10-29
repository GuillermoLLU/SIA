// Las acciones sobre una issue (resolver, escalar, añadir nota, traspasar):
// su formulario y qué hace falta para enviarlo. Añadir nota y traspasar se
// quedan en SIA (la base de la instancia); resolver y escalar irán a Remedy
// por SIGLO y, de momento, no se envían.
import { esc } from '../ui/html.js';

export const ACTIONS = {
  resolve: {
    label: 'Resolver', title: 'Resolver la issue', ok: 'Resolver',
    fields: [{ name: 'resolution', label: 'Resolución', kind: 'text', required: true, hint: 'Qué se ha hecho. Es lo que verá el centro.' }],
  },
  escalate: {
    label: 'Escalar', title: 'Escalar la issue', ok: 'Escalar',
    fields: [
      { name: 'to', label: 'A quién', kind: 'line', required: true, hint: 'Grupo o proveedor.' },
      { name: 'reason', label: 'Motivo', kind: 'text', required: true },
    ],
  },
  note: {
    label: 'Añadir nota', title: 'Añadir una nota', ok: 'Añadir', local: true,
    fields: [{ name: 'note', label: 'Nota', kind: 'text', required: true, hint: 'Interna, para el equipo. La verá quien abra la issue en SIA.' }],
  },
  transfer: {
    label: 'Traspasar', title: 'Traspasar a un compañero', ok: 'Traspasar', local: true,
    fields: [
      { name: 'to', label: 'Compañero', kind: 'person', required: true },
      { name: 'comment', label: 'Motivo', kind: 'text', required: true },
    ],
  },
};

// El selector de persona es propio (el desplegable nativo no se puede pintar):
// un campo oculto con el id, un botón con el nombre elegido y la lista debajo.
// Abrir, elegir y cerrar lo lleva la vista (issues-view.js) por data-pick-*.
const picker = (f, people) => `<div class="iss-pick" data-pick>
      <input type="hidden" name="${f.name}" value="">
      <button type="button" id="iss-f-${f.name}" class="iss-pick-btn" data-pick-btn aria-haspopup="listbox" aria-expanded="false" ${people.length ? '' : 'disabled'}><span data-pick-label class="iss-pick-ph">${people.length ? 'Elige a quién' : 'No hay más personas en Issues'}</span></button>
      <ul class="iss-pick-list" role="listbox" hidden>${people.map((p) => `<li role="option" data-pick-opt="${esc(p.id)}" aria-selected="false">${esc(p.name)}</li>`).join('')}</ul>
    </div>`;

const field = (f, people) => {
  const id = `iss-f-${f.name}`;
  const label = `<span>${f.label}${f.required ? '' : ' <i>(opcional)</i>'}</span>`;
  const hint = f.hint ? `<small>${f.hint}</small>` : '';
  // el selector no va dentro de un <label>: un clic en su lista rebotaría al botón
  if (f.kind === 'person') return `<div class="iss-field">${label}${picker(f, people)}${hint}</div>`;
  const input = f.kind === 'text' ? `<textarea id="${id}" name="${f.name}" rows="5"></textarea>` : `<input id="${id}" name="${f.name}" />`;
  return `<label class="iss-field" for="${id}">${label}${input}${hint}</label>`;
};

export const actionForm = (key, issueId, people = []) => {
  const a = ACTIONS[key];
  return `<form class="iss-act-form" data-act-form="${key}" novalidate>
    <header><h3>${a.title}</h3><span>${esc(issueId)}</span></header>
    ${a.fields.map((f) => field(f, people)).join('')}
    ${a.local ? '' : '<p class="iss-act-note">Aún no se envía a Remedy: irá por SIGLO cuando lo conectemos.</p>'}
    <p class="iss-act-err" hidden></p>
    <footer><button type="button" class="lab-btn" data-act-cancel>Cancelar</button><button type="submit" class="lab-btn primary" disabled>${a.ok}</button></footer>
  </form>`;
};

// ¿Están todos los obligatorios? Mientras no, el botón de enviar sigue apagado.
export const isComplete = (key, values) => ACTIONS[key].fields.every((f) => !f.required || String(values[f.name] ?? '').trim());

// Los valores del formulario, o el primer campo obligatorio vacío.
export const readAction = (key, values) => {
  const out = {};
  for (const f of ACTIONS[key].fields) {
    const v = String(values[f.name] ?? '').trim();
    if (f.required && !v) return { missing: f.label };
    out[f.name] = v;
  }
  return { values: out };
};
