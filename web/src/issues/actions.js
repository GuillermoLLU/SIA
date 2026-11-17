// Las acciones sobre una issue (resolver, escalar, llamar al centro, traspasar, reclamar al tercero): su
// formulario, qué hace falta para enviarlo y cuáles tiene cada issue según su estado.
// Resolver, escalar y reclamar irán a Remedy por SIGLO y, de momento, no se envían (la
// reclamación queda como nota interna). Traspasar, a un compañero se queda en SIA (la base
// de la instancia) y a otro equipo queda como nota (transfer.js).
// Las notas se escriben en la pestaña Seguimiento.
import { esc } from '../ui/html.js';
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
  // la ventana es propia (call.js): el teléfono y lo que se habló; queda como nota
  call: {
    label: 'Llamada',
  },
  // la ventana es propia (transfer.js): a un compañero o a otro equipo, con su motivo
  transfer: {
    label: 'Traspasar',
  },
  // insistir a quien la tiene parada (proveedor, cliente, el equipo al que se escaló)
  chase: {
    label: 'Reclamar respuesta', title: 'Reclamar respuesta', ok: 'Reclamar',
    fields: [
      { name: 'message', label: 'Qué le reclamas', kind: 'text', required: true },
    ],
  },
};

const field = (f) => {
  const id = `iss-f-${f.name}`;
  const label = `<span>${f.label}${f.required ? '' : ' <i>(opcional)</i>'}</span>`;
  const hint = f.hint ? `<small>${f.hint}</small>` : '';
  const input = f.kind === 'text' ? `<textarea id="${id}" name="${f.name}" rows="5"></textarea>` : `<input id="${id}" name="${f.name}" />`;
  return `<label class="iss-field" for="${id}">${label}${input}${hint}</label>`;
};

export const actionForm = (key, issueId) => {
  const a = ACTIONS[key];
  return `<form class="iss-act-form" data-act-form="${key}" novalidate>
    <header><h3>${a.title}</h3><span>${esc(issueId)}</span></header>
    ${a.fields.map(field).join('')}
    <p class="iss-act-note">Aún no se envía a Remedy: irá por SIGLO cuando lo conectemos.</p>
    <p class="iss-act-err" hidden></p>
    <footer><button type="button" class="lab-btn" data-act-cancel>Cancelar</button><button type="submit" class="lab-btn primary" disabled>${a.ok}</button></footer>
  </form>`;
};

// Qué se puede hacer con una issue: pendiente de un tercero, reclamarle respuesta; si no, resolverla,
// escalarla o llamar al centro (pendiente, la llamada va aparte, en la cabecera: work-screen.js).
// Traspasarla a un compañero o devolverla a la cola, solo si es de uno (cogida en SIA): la base no
// mueve una issue que no tienes. Traspasar no mira el tope de en curso.
export const actionsFor = (issue, mine) => [
  ...(issue.status === 'PENDING' ? ['chase'] : ['resolve', 'escalate', 'call']),
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
