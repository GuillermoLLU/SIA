// Escalar, por pasos y uno solo a la vista, con el aspecto de Resolver (las clases rv-*):
// 1) las coincidencias: si alguna es el mismo problema, se actualiza ese escalado con un comentario
// (y acaba ahí); si no, se crea uno nuevo por los demás; 2) a quién, del catálogo;
// 3) el motivo, que empieza con la nota [ANALISIS] de Remedy, con sus archivos; 4) lo que pide el
// destino (prioridad del Jira, lo mínimo y la evidencia); y 5) el resumen, como el de Resolver.
// Al acabar se queda con el escalado a la vista. No se pasa de paso sin lo obligatorio (escalate.js).
// Sin las notas del método no se abre: el mismo aviso que Resolver (resolveBlocked). La vista
// (escalate-view.js) vuelve a pintar lo que depende de lo escrito: requirementsHtml, linkedText,
// summaryHtml, filesHtml y doneHtml.
import { esc } from '../ui/html.js';
import { BACK_ARROW } from '../ui/wizard.js';
import { loaderHtml, phasesHtml } from '../ui/loader.js';
import { when } from './format.js';
import { ticketCheck, JIRA_PRIORITIES, jiraPriority, opensTicket, destOf, minimumsOf, checkedMins, priorityLabel, feedComment, STEPS, LAST, FEED, FLOWS } from './escalate.js';
import { doneMark, noteMeter, localShort, issueRef, CHECK, MISSING } from './resolve-form.js';
import { noteQuality } from './quality.js';
import { toHtml, imageTag } from './tag-editor.js';

// [título, quién va, si el título ya dice el nivel]: entonces el botón no lo repite.
const GROUPS = [
  ['N3 por SIGLO', (d) => d.level === 'N3' && d.via === 'SIGLO', true],
  ['N2 por IOP', (d) => d.via === 'IOP', true],
  ['Otros canales', (d) => !(d.level === 'N3' && d.via === 'SIGLO') && d.via !== 'IOP', false],
];
// «SISUPAC · N3 SISU» → «SISUPAC · SISU»; «N2 Courier Support» → «Courier Support»; «ERA · N3» → «ERA».
export const withoutLevel = (name) => name.replace(/\bN[23]\b\s*/g, '').replace(/\s*·\s*$/, '').trim();

// «Otro escalado», comprobado al teclear.
export const linkedText = (raw) => {
  const t = ticketCheck(raw);
  return t.state === 'empty' ? '' : t.state === 'bad' ? `<small class="bad">«${esc(t.bad)}» no es una clave: PROYECTO-número o INC y 12 dígitos.</small>`
    : t.state === 'many' ? `<small class="bad">Hay ${t.tickets.length} claves: escribe solo una.</small>`
    : `<small class="ok">Correcto${t.changed ? `: se guardará como <b>${esc(t.value)}</b>` : ''}.</small>`;
};

// Lo que se abre con el asistente: lo que dejó el borrador o, si no hay, lo que toca. Si la foto
// ya trae un ticket, se propone unirla a él; el motivo empieza con la nota de análisis y el
// comentario para actualizar el escalado, con lo nuevo de esta incidencia.
export const startValues = ({ issue, open, check, saved }) => {
  if (saved) return { ...saved, comment: saved.comment || feedComment(issue, check) };
  const known = ticketCheck(issue.vendorTicket);
  const fromPhoto = known.state === 'ok' ? known.value : '';
  const listed = open.some((o) => o.ticket === fromPhoto);
  return { mode: fromPhoto ? 'link' : 'escalate', jiraPriority: jiraPriority(issue.priority), reason: check.analysis?.text ?? '', comment: feedComment(issue, check),
    ...(fromPhoto ? (listed ? { linked: fromPhoto } : { linked: 'other', linkedOther: fromPhoto }) : {}) };
};

// Al abrir por el paso 1, con las notas del método completas: el modal ya abierto y, en su cuerpo,
// antes que nada, la búsqueda de escalados del mismo problema (de momento, de prueba) con el cargador
// común y sus fases. Al acabar entran los pasos (escalate-view.js).
export const searchingHtml = () => `<div class="iss-esc-searching">${loaderHtml({ title: '' })}</div>`;
// Lo que se busca, con los criterios del equipo: en SGA, el mismo centro; en SISU, el mismo módulo.
export const searchPhases = (issue) => phasesHtml([issue.sisu ? 'Mismo módulo' : `Mismo centro · ${issue.center || '—'}`, 'Resumen parecido']);

// Paso 1: una coincidencia (findEscalations): el escalado, por qué ha salido y abrirlo para comparar.
const foundCard = (o, v, dests) => card('linked', o.ticket, v.linked === o.ticket,
  `<span><b class="iss-mono">${esc(o.ticket)}</b> · ${esc(dests.find((d) => d.id === o.dest)?.name || '')}</span><small>${esc(o.title)} · ${o.issues} ${o.issues === 1 ? 'issue' : 'issues'} esperando · abierto el ${when(o.since)}</small>
              <span class="iss-esc-why"><small>${o.why.map(esc).join(' · ')}</small><button type="button" class="rv-link" data-ticket-detail="${esc(o.ticket)}">Ver detalle</button></span>`);

// El detalle de un ticket sugerido, sin salir de SIA: ocupa todo el modal, sin su título, sus pasos
// ni su pie; solo «Volver al listado» arriba (escalate-view.js). De momento, con los datos de prueba
// (escalate-mock.js).
const fact = (label, value) => `<div><dt>${label}</dt><dd>${value}</dd></div>`;
// Arriba, una sola fila: «Volver al listado» a la izquierda, el título centrado y el ticket a la derecha.
export const ticketDetailHtml = (o, dests) => `<header class="iss-esc-detail-h">
      <button type="button" class="lab-btn iss-esc-detail-back" data-detail-back>${BACK_ARROW}Volver al listado</button>
      <h3>${esc(o.title)}</h3>
      <b class="iss-mono">${esc(o.ticket)}</b>
    </header>
    <dl class="iss-esc-facts">
      ${fact('Estado', `<span class="iss-esc-state">${esc(o.state || '—')}</span>`)}
      ${fact('Prioridad', esc(o.priority ? priorityLabel(o.priority) : '—'))}
      ${fact('Equipo', esc(dests.find((d) => d.id === o.dest)?.name || '—'))}
      ${fact('Abierto', o.since ? when(o.since) : '—')}
      ${fact('Último movimiento', o.moved ? when(o.moved) : '—')}
      ${fact('Esperando', `${o.issues} ${o.issues === 1 ? 'incidencia' : 'incidencias'}`)}
    </dl>
    ${o.description ? `<section class="iss-esc-detail-sec"><h4>Descripción</h4><p>${esc(o.description)}</p></section>` : ''}
    <section class="iss-esc-detail-sec"><h4>Último comentario</h4>${o.comment ? `<p><small>${esc(o.comment.by)} · ${when(o.comment.at)}</small>${esc(o.comment.text)}</p>` : '<p class="iss-esc-none-text">Aún sin comentarios.</p>'}</section>
    ${o.waiting?.length ? `<section class="iss-esc-detail-sec"><h4>Incidencias esperando</h4><ul class="iss-esc-waiting">${o.waiting.map((w) => `<li><span class="iss-mono">${esc(w.id)}</span> · ${esc(w.center)}</li>`).join('')}</ul></section>` : ''}`;

// Una opción que se elige pulsando la tarjeta entera; el radio no se ve.
const card = (name, value, checked, body, cls = '') => `<label class="iss-esc-card${cls}"><input type="radio" class="iss-sr" name="${name}" value="${esc(value)}"${checked ? ' checked' : ''} />${body}</label>`;
const SEARCH = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
const INFO = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/></svg>';

// Paso 2: los destinos por nivel y canal, como el selector de idioma de Resolver: un botón por
// destino, el elegido en negro. Cada uno con su ayuda (de momento sin documentación detrás).
const destCards = (dests, v) => [
  ...GROUPS.map(([label, test, plain]) => [label, dests.filter(test), plain]),
  ['Fuera del mapa', [{ id: 'other', name: 'Otro equipo, fuera del mapa' }], false],
].map(([label, list, plain]) => `<section class="iss-esc-group">
            <h4>${label}</h4>
            <div class="iss-esc-dests">${list.map((d) => `<div class="iss-esc-dest"><label class="iss-esc-seg"><input type="radio" class="iss-sr" name="dest" value="${esc(d.id)}"${v.dest === d.id ? ' checked' : ''} /><span>${esc(plain ? withoutLevel(d.name) : d.name)}</span></label>${d.id === 'other' ? ''
    : `<button type="button" class="iss-esc-info" data-dest-help="${esc(d.id)}" aria-label="Qué cubre ${esc(d.name)}" title="Qué cubre">${INFO}</button>`}</div>`).join('')}${list[0].id === 'other'
    ? `<label class="iss-field iss-esc-otherbox" for="iss-f-destOther" data-esc-other${v.dest === 'other' ? '' : ' hidden'}><input id="iss-f-destOther" name="destOther" value="${esc(v.destOther || '')}" placeholder="Equipo o proveedor" aria-label="Equipo o proveedor" /></label>` : ''}</div>
          </section>`).join('');

// Paso 4: lo que pide el destino. La prioridad del Jira, en tarjetas con su explicación aparte; lo
// mínimo, en casillas; la evidencia, si no queda rastro en una herramienta. Lo que no le toca va
// oculto, para no perderlo si se cambia de destino.
export const requirementsHtml = (v, { issue, dests }) => {
  const dest = destOf(v, dests), due = jiraPriority(issue.priority);
  const mins = minimumsOf(issue, dest), checked = checkedMins(v);
  const prio = v.jiraPriority || due;
  const parts = [
    dest?.opens === 'jira' ? `<section class="iss-esc-req"><h4>Prioridad del Jira</h4>
          <div class="iss-esc-prios">${JIRA_PRIORITIES.map((p) => card('jiraPriority', p.id, prio === p.id, `<b>${p.label}</b>${p.id === due ? '<em>La de su criticidad</em>' : ''}<small>${p.when}</small>`)).join('')}</div>
        </section>` : '',
    mins.length ? `<section class="iss-esc-req" data-mins-box><h4>Lo mínimo para ${esc(dest.name)}</h4>
          <ul class="iss-esc-mins">${mins.map((m) => `<li${m.required ? '' : ' class="opt"'}><label><input type="checkbox" class="iss-sr" data-min="${m.key}"${checked.includes(m.key) ? ' checked' : ''} /><i>${CHECK}${MISSING}</i><span><b>${m.title}</b>${esc(m.text)}</span><small data-on>Hecho</small><small data-off>${m.required ? 'Falta' : 'Si aplica'}</small></label>${m.subject
    ? `<p class="iss-esc-subject"><code>${esc(m.subject)}</code><button type="button" class="rv-link" data-copy="${esc(m.subject)}">Copiar asunto</button></p>` : ''}</li>`).join('')}</ul>
        </section>` : '',
    opensTicket(dest) ? '' : `<section class="iss-field iss-esc-req"><h4>¿Qué has enviado y por dónde?</h4>
          <textarea class="rv-ed iss-esc-sent" id="iss-f-sent" name="sent" aria-label="Qué has enviado y por dónde" placeholder="Correo a las 10:12 con logs y captura">${esc(v.sent || '')}</textarea>
        </section>`,
  ].filter(Boolean);
  return `${parts.join('') || '<p class="iss-esc-none">No pide nada más.</p>'}
        ${dest?.opens === 'jira' ? '' : `<input type="hidden" name="jiraPriority" value="${esc(v.jiraPriority || '')}" />`}
        ${opensTicket(dest) ? `<input type="hidden" name="sent" value="${esc(v.sent || '')}" />` : ''}
        <input type="hidden" name="mins" value="${esc(v.mins || '')}" />`;
};

// Los archivos del motivo (de momento solo se listan, como «Otros archivos» de Resolver: no salen de SIA).
// Las imágenes, como en Resolver: su miniatura con su [imagenN], que se arrastra al texto para
// colocarla (chip-drag.js); los demás archivos, en lista. files: [{ name, size, n?, url? }] (n y url, solo las imágenes).
export const filesHtml = (files) => {
  const drop = (x, i) => `<button type="button" class="rv-img-x" data-file-drop="${i}" aria-label="Quitar ${esc(x.name)}">×</button>`;
  const images = files.map((x, i) => (x.n ? `<figure class="rv-img" draggable="true" data-img="${x.n}" title="${esc(x.name)} · ${kb(x.size)}. Arrástrala al texto para colocarla"><img src="${esc(x.url)}" alt="" /><figcaption>${imageTag(x.n)}</figcaption>${drop(x, i)}</figure>` : '')).join('');
  const others = files.map((x, i) => (x.n ? '' : `<li><span>${esc(x.name)}</span><small>${kb(x.size)}</small>${drop(x, i)}</li>`)).join('');
  return `${images}${others ? `<ul class="rv-extras">${others}</ul>` : ''}`;
};

// Paso 5: lo escrito, como «Lo que has escrito» de Resolver: las notas del método que trae Remedy
// y lo de cada paso, con su calidad; pulsar uno de los pasos vuelve a él.
const EXCERPT = 180;
const excerpt = (s) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > EXCERPT ? `${t.slice(0, EXCERPT - 1).trimEnd()}…` : t; };
// files: cuántos archivos lleva, en la etiqueta del título (como las imágenes en Resolver).
const item = ({ n, title, text, q, files = 0 }) => {
  const head = `<span class="rv-sum-h"><b>${title}</b>${q ? `<em data-level="${q.level}">${q.label}</em>` : ''}${files ? `<small>${FILE_ICON}${files} ${files === 1 ? 'archivo' : 'archivos'}</small>` : ''}</span><span class="rv-sum-x">${esc(excerpt(text))}</span>`;
  return `<li>${n ? `<button type="button" data-go="${n}" title="Volver a ${title}">${head}</button>` : `<div class="rv-sum-note">${head}</div>`}</li>`;
};
export const summaryHtml = (v, { issue, dests, check, files = [] }) => {
  const dest = destOf(v, dests), mins = minimumsOf(issue, dest), checked = checkedMins(v);
  const reqs = [
    dest?.opens === 'jira' && `Prioridad del Jira: ${priorityLabel(v.jiraPriority)}`,
    mins.length && `Lo mínimo: ${mins.filter((m) => checked.includes(m.key)).length} de ${mins.length} confirmado`,
    !opensTicket(dest) && v.sent,
  ].filter(Boolean).join(' · ');
  return [
    { title: 'Notas del método', text: check.notes.map((x) => x.label).join(' · '), q: { level: 'ok', label: 'Completas' } },   // ya comprobadas al entrar
    { n: 2, title: 'A quién', text: dest?.name || v.destOther },
    { n: 3, title: 'Motivo', text: v.reason, q: noteQuality(v.reason), files: files.length },
    { n: 4, title: 'Requisitos', text: reqs || 'No pide nada más' },
  ].map(item).join('');
};

// Antes de escalar, el borrador de lo que se abre, como el «Borrador del informe» de Resolver: con lo
// escrito en cada paso, las notas que necesita el destino y los adjuntos. Se puede retocar (de momento no sale de SIA).
const ticketKind = (dest) => (!dest ? 'sin herramienta' : dest.opens === 'jira' ? `Jira de ${dest.project}` : dest.opens === 'remedy' ? 'incidencia de Remedy' : 'sin herramienta');
const kb = (size) => `${Math.max(1, Math.round(size / 1024))} KB`;
const noteOf = (check, key) => check.notes.find((n) => n.key === key)?.note?.text;
export const ticketHtml = (v, { issue, dests, check, files = [] }) => {
  const dest = destOf(v, dests), mins = minimumsOf(issue, dest), checked = checkedMins(v);
  const rows = [
    ['Destino', `${dest?.name || v.destOther} · ${ticketKind(dest)}`],
    dest?.opens === 'jira' && ['Prioridad del Jira', priorityLabel(v.jiraPriority)],
    ['Título', `${issue.id} · ${issue.text || ''}`],
    ['Motivo del escalado', v.reason],
    noteOf(check, 'initial') && ['Situación inicial', noteOf(check, 'initial')],
    noteOf(check, 'recurrence') && ['Recurrencia', noteOf(check, 'recurrence')],
    check.analysis && check.analysis.text.trim() !== String(v.reason ?? '').trim() && ['Análisis', check.analysis.text],
    check.background && ['Antecedentes', check.background.text],
    mins.length && ['Lo mínimo', mins.filter((m) => checked.includes(m.key)).map((m) => m.title).join(' · ') || 'Nada confirmado'],
    !opensTicket(dest) && ['Evidencia', v.sent],
  ].filter(Boolean);
  return `<div class="rv-rpanel"><section class="rv-rep rv-rep-mail">
          <div class="rv-rep-edit" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Borrador del escalado">${rows.map(([h, p]) => `<h5>${h}</h5><p>${esc(p || '')}</p>`).join('')}</div>
          ${files.map((x) => `<div class="rv-rep-att"><i>${FILE_ICON}</i><div><b>${esc(x.name)}</b><small>Adjunto · ${kb(x.size)}</small></div></div>`).join('')}
        </section></div>`;
};

// Al acabar: lo que se ha hecho y el escalado, para copiar su clave. Hasta conectar Jira, el nuevo es
// de ejemplo y se dice. result: resultTicket (escalate.js).
export const doneHtml = (result, target, mode, rootCause) => `<i class="iss-esc-done-ok" aria-hidden="true">✓</i>
          <h4>${mode === 'link' ? 'Escalado actualizado' : `Nuevo escalado a ${esc(target)}`}</h4>
          <p>${mode === 'link' ? 'Comentado en Jira y en Remedy · Pendiente (proveedor)' : !rootCause ? 'Registrado en Remedy · Pendiente (proveedor) · Centro avisado' : 'Registrado en Remedy · Sigue Resuelta'}</p>
          ${result ? `<div class="iss-esc-ticket"><span>Escalado</span><code>${esc(result.ticket)}</code><button type="button" class="lab-btn" data-copy="${esc(result.ticket)}">Copiar</button></div>
          ${result.sample ? '<small>De ejemplo hasta conectar Jira</small>' : ''}` : ''}`;

// Al escalar: lo que hace SIA (de momento, un simulacro, como el cierre de Resolver). Al crear, el
// escalado nuevo se registra en Remedy con su clave y lo nuevo ([NUEVO ESCALADO]); al actualizar, el
// comentario va al escalado y a Remedy ([ACTUALIZAR ESCALADO]).
export const closePhases = (v, rootCause) => phasesHtml(v.mode === 'link'
  ? ['Comentando en el escalado', 'Registrando en Remedy', 'Pasando a Pendiente (proveedor)']
  : ['Creando el escalado', 'Registrando en Remedy', 'Avisando al centro', ...(rootCause ? [] : ['Pasando a Pendiente (proveedor)'])]);

// La barra lleva los pasos de los dos flujos; la vista enseña los del elegido (FLOWS) y marca su último.
// La barra de pasos: la decisión del principio (unir o nuevo, el 1) no es un paso, así que no sale y
// el nuevo escalado se numera del 1 al 4. Al abrir no se ve; la enseña escalate-view.js en el flujo elegido.
const stepper = (mode) => {
  const flow = FLOWS[mode === 'link' ? 'link' : 'escalate'];
  return `<ol class="rv-steps" hidden>${STEPS.filter((s) => s.n !== 1).map((s) => `<li data-step-mark="${s.n}"${s.n === flow.at(-1) ? ' class="last"' : ''}${flow.includes(s.n) ? '' : ' hidden'}><i>${s.n === FEED ? 1 : s.n - 1}</i><span>${s.title}</span></li>`).join('')}</ol>`;
};
const FILE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>';

// `issue`: la issue abierta; `dests`: el catálogo; `found`: las coincidencias (findEscalations);
// `check`: lo que dice el bridge (las notas, la de análisis y la de antecedentes); `saved`: el
// borrador, si lo hay; `link`: su ticket en Remedy.
export const escalateForm = ({ issue, dests, found = [], check, saved = null, link = null }) => {
  const v = startValues({ issue, open: found, check, saved });
  const rootCause = issue.status === 'RESOLVED';
  const analysis = check.analysis;
  return `<form class="iss-act-form rv iss-esc" data-act-form="escalate" data-step="1" novalidate>
    <header class="rv-head"><h3>${rootCause ? 'Escalar por la causa raíz' : 'Escalar incidencia'}</h3>${issueRef(issue.id, link)}</header>
    ${stepper(v.mode)}
    <input type="hidden" name="step" value="1" />
    <input type="hidden" name="mode" value="${v.mode === 'link' ? 'link' : 'escalate'}" />
    <div class="rv-body">
      <section class="rv-step rv-step-one iss-esc-pick" data-rstep="1">
        <div class="iss-esc-find">
          <input type="radio" class="iss-sr" name="linked" value="other" tabindex="-1" aria-hidden="true"${v.linked === 'other' ? ' checked' : ''} />
          <i>${SEARCH}</i>
          <input name="linkedOther" class="iss-mono" value="${esc(v.linkedOther || '')}" placeholder="Busca un ticket de Jira: PROYECTO-número o INC…" aria-label="Buscar un ticket de Jira" autocomplete="off" spellcheck="false" />
          <span data-esc-linked>${linkedText(v.linkedOther)}</span>
        </div>
        <div class="rv-cap"><b>Tickets que pueden tener similitud con esta incidencia</b></div>
        <div class="rv-text">
          <fieldset class="iss-esc-open">
            ${found.length ? found.map((o) => foundCard(o, v, dests)).join('') : '<p class="iss-esc-none">Ningún escalado del mismo problema</p>'}
          </fieldset>
        </div>
      </section>

      <section class="rv-step rv-step-one" data-rstep="${FEED}" hidden>
        <div class="rv-cap"><b>Comentario para <span class="iss-mono" data-esc-feed-ticket></span></b><small class="iss-esc-from">Se añade al escalado y a Remedy</small></div>
        <div class="rv-text">
          <div class="iss-field rv-grow"><textarea class="rv-ed iss-esc-comment" id="iss-f-comment" name="comment" aria-label="Comentario para el escalado">${esc(v.comment || '')}</textarea>${noteMeter(v.comment, 'comment')}</div>
        </div>
      </section>

      <section class="rv-step rv-step-one" data-rstep="2" hidden>
        <div class="rv-cap"><b>¿A quién se escala?</b><button type="button" class="rv-link iss-esc-ai" data-esc-help>¿Dudas? Pregúntale a la IA</button></div>
        <div class="rv-text iss-esc-scroll">
          ${destCards(dests, v)}
        </div>
      </section>

      <section class="rv-step" data-rstep="3" hidden>
        <div class="rv-cap"><b>Motivo del escalado</b>${analysis ? doneMark(analysis, (v.reason ?? '') !== analysis.text) : ''}</div>
        <div class="rv-text">
          <div class="iss-field rv-grow"><div class="rv-ed" contenteditable="plaintext-only" id="iss-f-reason" data-ed="reason" role="textbox" aria-multiline="true" aria-label="Motivo del escalado">${toHtml(v.reason || '')}</div><input type="hidden" name="reason" value="${esc(v.reason || '')}" />${noteMeter(v.reason, 'reason')}</div>
        </div>
        <aside class="rv-dock" data-esc-dock>
          <p class="rv-dock-hint">Suelta aquí los archivos</p>
          <div class="iss-esc-files" data-esc-file-list></div>
          <label class="rv-dock-add"><input type="file" multiple data-esc-files />${FILE_ICON}<span>Archivos</span><small>Pulsa, pega o arrastra</small></label>
        </aside>
      </section>

      <section class="rv-step rv-step-one" data-rstep="4" hidden>
        <div class="rv-cap"><b>Lo que pide el destino</b></div>
        <div class="rv-text iss-esc-scroll" data-esc-reqs>${requirementsHtml(v, { issue, dests })}</div>
      </section>

      <section class="rv-step rv-step-one" data-rstep="${LAST}" hidden>
        <div class="rv-cap rv-cap-center rv-cap-final" data-esc-cap hidden><b>Borrador del escalado</b></div>
        <div class="rv-text">
          <section class="rv-gen-sum iss-esc-review" data-esc-review>
            <h4>Lo que has escrito</h4>
            <ol data-summary></ol>
          </section>
          <div class="rv-review" data-esc-ticket hidden></div>
          ${loaderHtml({ title: '' }).replace('data-loader>', 'data-loader hidden>')}
          <div class="iss-esc-done" data-esc-done hidden></div>
        </div>
      </section>
    </div>
    <p class="iss-act-err" hidden></p>
    <footer>
      <small class="iss-autosave" data-autosave>${saved?.at ? `Borrador guardado ${localShort(saved.at)}` : 'El borrador se guarda solo mientras escribes'}</small>
      <button type="button" class="lab-btn rv-back" data-step-back hidden>Atrás</button>
      <button type="button" class="lab-btn primary rv-next" data-step-next>${STEPS[1].title}</button>
      <button type="button" class="lab-btn primary rv-next" data-esc-preview hidden>Ver el escalado</button>
      <button type="submit" class="lab-btn primary rv-next" data-confirm-send hidden>Crear escalado</button>
      <button type="button" class="lab-btn primary rv-next" data-esc-close hidden>Cerrar</button>
    </footer>
    <section class="iss-esc-detail" data-esc-detail hidden></section>
  </form>`;
};
