// Las acciones sobre una issue (resolver, escalar, traspasar, reclamar al tercero): su
// formulario, qué hace falta para enviarlo y cuáles tiene cada issue según su estado.
// Traspasar se queda en SIA (la base de la instancia); resolver, escalar y reclamar irán a
// Remedy por SIGLO y, de momento, no se envían (la reclamación queda como nota interna).
// Las notas internas se escriben en la pestaña Notas internas.
import { esc } from '../ui/html.js';
import { peoplePicker } from '../ui/picker.js';
import { thirdOf } from './format.js';

export const ACTIONS = {
  resolve: {
    label: 'Resolver', title: 'Resolver la issue', ok: 'Resolver',
    // la nota interna y los tres puntos del mensaje al centro; el formulario
    // es propio (resolve-form.js), aquí solo lo que hace falta para enviarlo
    fields: [
      { name: 'note', label: 'Nota interna de resolución', kind: 'text', required: true },
      { name: 'what', label: '¿Qué ha ocurrido?', kind: 'text', required: true },
      { name: 'how', label: '¿Cómo se ha resuelto?', kind: 'text', required: true },
      { name: 'prevent', label: '¿Qué se hará para que no se repita?', kind: 'text', required: true },
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
  // insistir a quien la tiene parada (proveedor, cliente, el equipo al que se escaló)
  chase: {
    label: 'Reclamar respuesta', title: 'Reclamar respuesta', ok: 'Reclamar',
    fields: [
      { name: 'message', label: 'Qué le reclamas', kind: 'text', required: true },
    ],
  },
};

// El selector de persona es el propio de la app (ui/picker.js); abrir,
// elegir y cerrar lo lleva la vista (issues-view.js).
// empty: lo que dice sin nadie a quien elegir (p. ej. nadie más con el conocimiento de su origen)
const picker = (f, people, empty) => peoplePicker({ name: f.name, id: `iss-f-${f.name}`, people, empty: empty || 'No hay más personas en Issues' });

const field = (f, people, empty) => {
  const id = `iss-f-${f.name}`;
  const label = `<span>${f.label}${f.required ? '' : ' <i>(opcional)</i>'}</span>`;
  const hint = f.hint ? `<small>${f.hint}</small>` : '';
  // el selector no va dentro de un <label>: un clic en su lista rebotaría al botón
  if (f.kind === 'person') return `<div class="iss-field">${label}${picker(f, people, empty)}${hint}</div>`;
  const input = f.kind === 'text' ? `<textarea id="${id}" name="${f.name}" rows="5"></textarea>` : `<input id="${id}" name="${f.name}" />`;
  return `<label class="iss-field" for="${id}">${label}${input}${hint}</label>`;
};

export const actionForm = (key, issueId, people = [], empty = '') => {
  const a = ACTIONS[key];
  return `<form class="iss-act-form" data-act-form="${key}" novalidate>
    <header><h3>${a.title}</h3><span>${esc(issueId)}</span></header>
    ${a.fields.map((f) => field(f, people, empty)).join('')}
    ${a.local ? '' : '<p class="iss-act-note">Aún no se envía a Remedy: irá por SIGLO cuando lo conectemos.</p>'}
    <p class="iss-act-err" hidden></p>
    <footer><button type="button" class="lab-btn" data-act-cancel>Cancelar</button><button type="submit" class="lab-btn primary" disabled>${a.ok}</button></footer>
  </form>`;
};

// Qué se puede hacer con una issue: pendiente de un tercero, reclamarle respuesta; si no, resolverla
// o escalarla. Traspasarla a un compañero o devolverla a la cola, solo si es de uno (cogida en SIA):
// la base no mueve una issue que no tienes. Traspasar no mira el tope de en curso.
export const actionsFor = (issue, mine) => [
  ...(issue.status === 'PENDING' ? ['chase'] : ['resolve', 'escalate']),
  ...(mine ? ['transfer'] : []),
  ...(mine && issue.status !== 'PENDING' ? ['release'] : []),
];

// «Reclamar respuesta» aún no llega al tercero: queda en el histórico como nota, con a quién y qué.
// chaseTarget: «a Proveedor», o «al tercero» si el motivo no dice a quién.
export const chaseTarget = (issue) => { const third = thirdOf(issue); return third ? `a ${third}` : 'al tercero'; };
export const chaseNote = (issue, message) => `Reclamado ${chaseTarget(issue)}: ${message}`;

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
