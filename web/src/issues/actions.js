// Las acciones sobre una issue (resolver, escalar, añadir nota, traspasar):
// su formulario y qué hace falta para enviarlo. Irán a Remedy por SIGLO; de
// momento el formulario está activo pero no se envía nada.
import { esc } from '../ui/html.js';

export const ACTIONS = {
  resolve: {
    label: 'Resolver', title: 'Resolver la issue', ok: 'Resolver',
    // la nota interna y los tres puntos del mensaje al centro; el formulario
    // es propio (resolve-form.js), aquí solo lo que hace falta para enviarlo
    fields: [
      { name: 'note', label: 'Nota interna de resolución', kind: 'text', required: true },
      { name: 'what', label: 'Qué ocurrió', kind: 'text', required: true },
      { name: 'how', label: 'Cómo se resolvió', kind: 'text', required: true },
      { name: 'prevent', label: 'Qué se hará para evitarlo', kind: 'text', required: true },
    ],
  },
  escalate: {
    label: 'Escalar', title: 'Escalar la issue', ok: 'Escalar',
    fields: [
      { name: 'to', label: 'A quién', kind: 'line', required: true, hint: 'Grupo o proveedor.' },
      { name: 'reason', label: 'Motivo', kind: 'text', required: true },
    ],
  },
  note: {
    label: 'Añadir nota', title: 'Añadir una nota', ok: 'Añadir',
    fields: [{ name: 'note', label: 'Nota', kind: 'text', required: true }],
  },
  transfer: {
    label: 'Traspasar', title: 'Traspasar a un compañero', ok: 'Traspasar',
    fields: [
      { name: 'to', label: 'Compañero', kind: 'person', required: true },
      { name: 'comment', label: 'Comentario', kind: 'text', required: false, hint: 'Lo que debe saber quien la recibe.' },
    ],
  },
};

const field = (f, people) => {
  const id = `iss-f-${f.name}`;
  const input = f.kind === 'text' ? `<textarea id="${id}" name="${f.name}" rows="5"></textarea>`
    : f.kind === 'person' ? `<select id="${id}" name="${f.name}"><option value="">${people.length ? 'Elige a quién' : 'No hay más personas en Issues'}</option>${people.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>`
    : `<input id="${id}" name="${f.name}" />`;
  return `<label class="iss-field" for="${id}"><span>${f.label}${f.required ? '' : ' <i>(opcional)</i>'}</span>${input}${f.hint ? `<small>${f.hint}</small>` : ''}</label>`;
};

export const actionForm = (key, issueId, people = []) => {
  const a = ACTIONS[key];
  return `<form class="iss-act-form" data-act-form="${key}" novalidate>
    <header><h3>${a.title}</h3><span>${esc(issueId)}</span></header>
    ${a.fields.map((f) => field(f, people)).join('')}
    <p class="iss-act-note">Aún no se envía a Remedy: irá por SIGLO cuando lo conectemos.</p>
    <p class="iss-act-err" hidden></p>
    <footer><button type="button" class="lab-btn" data-act-cancel>Cancelar</button><button type="submit" class="lab-btn primary">${a.ok}</button></footer>
  </form>`;
};

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
