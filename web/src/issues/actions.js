// Las acciones sobre una issue (resolver, escalar, traspasar): su formulario
// y qué hace falta para enviarlo. Traspasar se queda en SIA (la base de la
// instancia); resolver y escalar irán a Remedy por SIGLO y, de momento, no se
// envían. Las notas internas se escriben en la pestaña Notas internas.
import { esc } from '../ui/html.js';

export const ACTIONS = {
  resolve: {
    label: 'Resolver', title: 'Resolver la issue', ok: 'Resolver',
    // la nota interna y los tres puntos del mensaje al centro; el formulario
    // es propio (resolve-form.js), aquí solo lo que hace falta para enviarlo
    fields: [
      { name: 'note', label: 'Nota interna de resolución', kind: 'text', required: true },
      { name: 'what', label: '¿Qué ocurrió?', kind: 'text', required: true },
      { name: 'how', label: '¿Cómo se resolvió?', kind: 'text', required: true },
      { name: 'prevent', label: '¿Qué se hará para evitarlo?', kind: 'text', required: true },
    ],
  },
  // el formulario es propio (escalate-form.js) y se lee con readEscalate
  escalate: {
    label: 'Escalar',
  },
  transfer: {
    label: 'Traspasar', title: 'Traspasar a un compañero', ok: 'Traspasar', local: true,
    fields: [
      { name: 'to', label: 'Compañero', kind: 'person', required: true },
      { name: 'comment', label: 'Motivo', kind: 'text', required: true },
    ],
  },
};

// El desplegable de la web es propio (el nativo no se puede pintar): un campo
// oculto con el valor, un botón con lo elegido y la lista debajo. Abrir, elegir
// y cerrar lo lleva la vista (issues-view.js) por data-pick-*. `groups`:
// [{ label?, options: [{ value, label }] }]; `name` o `attr`, el campo oculto.
export const pickField = ({ id, name = '', attr = '', value = '', placeholder = '', groups, disabled = false }) => {
  const chosen = groups.flatMap((g) => g.options).find((o) => o.value === value);
  return `<div class="iss-pick" data-pick>
      <input type="hidden"${name ? ` name="${name}"` : ''}${attr ? ` ${attr}` : ''} value="${esc(value)}">
      <button type="button" id="${id}" class="iss-pick-btn" data-pick-btn aria-haspopup="listbox" aria-expanded="false"${disabled ? ' disabled' : ''}><span data-pick-label${chosen ? '' : ' class="iss-pick-ph"'}>${esc(chosen ? chosen.label : placeholder)}</span></button>
      <ul class="iss-pick-list" role="listbox" hidden>${groups.map((g) => `${g.label ? `<li role="presentation" class="iss-pick-group">${esc(g.label)}</li>` : ''}${g.options.map((o) => `<li role="option" data-pick-opt="${esc(o.value)}" aria-selected="${o.value === value}">${esc(o.label)}</li>`).join('')}`).join('')}</ul>
    </div>`;
};

// El selector de persona de Traspasar.
const picker = (f, people) => pickField({ id: `iss-f-${f.name}`, name: f.name, disabled: !people.length,
  placeholder: people.length ? 'Elige a quién' : 'No hay más personas en Issues', groups: [{ options: people.map((p) => ({ value: p.id, label: p.name })) }] });

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
export const isComplete = (key, values) => !readAction(key, values).missing;

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
