// Escalar, en cinco pasos y uno solo a la vista, con el aspecto de Resolver (las clases rv-*):
// 1) si ya hay un ticket abierto (si lo hay, se une y todo acaba aquí); 2) a quién, del catálogo;
// 3) el motivo, que empieza con la nota [ANALISIS] de Remedy, con sus archivos; 4) lo que pide el
// destino (prioridad del Jira, lo mínimo y la evidencia); y 5) el resumen, como el de Resolver.
// Al acabar se queda con el ticket a la vista. No se pasa de paso sin lo obligatorio (escalate.js).
// Sin las notas del método no se abre: el mismo aviso que Resolver (resolveBlocked). La vista
// (escalate-view.js) vuelve a pintar lo que depende de lo escrito: requirementsHtml, linkedText,
// summaryHtml, filesHtml y doneHtml.
import { esc } from '../ui/html.js';
import { when } from './format.js';
import { ticketCheck, JIRA_PRIORITIES, jiraPriority, opensTicket, destOf, minimumsOf, checkedMins, priorityLabel, STEPS, LAST } from './escalate.js';
import { doneMark, noteMeter, localShort, short, issueRef, CHECK, MISSING } from './resolve-form.js';
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

// El ticket «otro» al unir, comprobado al teclear.
export const linkedText = (raw) => {
  const t = ticketCheck(raw);
  return t.state === 'empty' ? '' : t.state === 'bad' ? `<small class="bad">«${esc(t.bad)}» no es un ticket: PROYECTO-número o INC y 12 dígitos.</small>`
    : t.state === 'many' ? `<small class="bad">Hay ${t.tickets.length} tickets: escribe solo uno.</small>`
    : `<small class="ok">Correcto${t.changed ? `: se guardará como <b>${esc(t.value)}</b>` : ''}.</small>`;
};

// Lo que se abre con el asistente: lo que dejó el borrador o, si no hay, lo que toca. Si la foto
// ya trae un ticket, se propone unirla a él; el motivo empieza con la nota de análisis.
export const startValues = ({ issue, open, check, saved }) => {
  if (saved) return saved;
  const known = ticketCheck(issue.vendorTicket);
  const fromPhoto = known.state === 'ok' ? known.value : '';
  const listed = open.some((o) => o.ticket === fromPhoto);
  return { mode: fromPhoto ? 'link' : 'escalate', jiraPriority: jiraPriority(issue.priority), reason: check.analysis?.text ?? '',
    ...(fromPhoto ? (listed ? { linked: fromPhoto } : { linked: 'other', linkedOther: fromPhoto }) : {}) };
};

// Al unir: la nota [ANTECEDENTES] de Remedy, que dice por qué es el mismo problema.
const backgroundBox = (n) => (n ? `<section class="iss-esc-dev iss-esc-bg">
              <h4>Antecedentes <small>${esc(short(n.at))} · ${esc(n.who)}</small></h4>
              <p>${esc(n.text)}</p>
            </section>` : '');

// Una opción que se elige pulsando la tarjeta entera; el radio no se ve.
const card = (name, value, checked, body, cls = '') => `<label class="iss-esc-card${cls}"><input type="radio" class="iss-sr" name="${name}" value="${esc(value)}"${checked ? ' checked' : ''} />${body}</label>`;
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
          <p class="iss-esc-hint">${esc(dest?.name || v.destOther || 'Este destino')} no abre ticket: lo que escribas aquí es la prueba del escalado.</p>
          <textarea class="rv-ed iss-esc-sent" id="iss-f-sent" name="sent" aria-label="Qué has enviado y por dónde" placeholder="Ej.: correo a las 10:12 con los logs del proceso y una captura del error.">${esc(v.sent || '')}</textarea>
        </section>`,
  ].filter(Boolean);
  return `${parts.join('') || '<p class="iss-esc-none">No pide nada más.</p>'}
        ${dest?.opens === 'jira' ? '' : `<input type="hidden" name="jiraPriority" value="${esc(v.jiraPriority || '')}" />`}
        ${opensTicket(dest) ? `<input type="hidden" name="sent" value="${esc(v.sent || '')}" />` : ''}
        <input type="hidden" name="mins" value="${esc(v.mins || '')}" />`;
};

// Los archivos del motivo (de momento solo se listan, como «Otros archivos» de Resolver: no salen de SIA).
// Las imágenes, como en Resolver: su miniatura con su [imagenN], que se arrastra al texto para
// colocarla (los manejadores de las fichas son los de resolve-view.js, para cualquier .rv-ed de la
// vista); los demás archivos, en lista. files: [{ name, size, n?, url? }] (n y url, solo las imágenes).
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
    ...check.notes.map((x) => ({ title: x.label, text: x.note?.text, q: noteQuality(x.note?.text) })),
    { n: 2, title: 'A quién', text: dest?.name || v.destOther },
    { n: 3, title: 'Motivo', text: v.reason, q: noteQuality(v.reason), files: files.length },
    { n: 4, title: 'Requisitos', text: reqs || 'No pide nada más' },
  ].map(item).join('');
};

// Antes de escalar, el borrador de lo que se abre, como el «Borrador del informe» de Resolver: con lo
// escrito en cada paso, las notas del método y los adjuntos. Se puede retocar (de momento no sale de SIA).
const ticketKind = (dest) => (!dest ? 'sin ticket' : dest.opens === 'jira' ? `Jira de ${dest.project}` : dest.opens === 'remedy' ? 'incidencia de Remedy' : 'sin ticket');
const kb = (size) => `${Math.max(1, Math.round(size / 1024))} KB`;
export const ticketHtml = (v, { issue, dests, check, files = [] }) => {
  const dest = destOf(v, dests), mins = minimumsOf(issue, dest), checked = checkedMins(v);
  const rows = [
    ['Destino', `${dest?.name || v.destOther} · ${ticketKind(dest)}`],
    dest?.opens === 'jira' && ['Prioridad del Jira', priorityLabel(v.jiraPriority)],
    ['Título', `${issue.id} · ${issue.text || ''}`],
    ['Motivo del escalado', v.reason],
    check.analysis && ['Análisis previo', check.analysis.text],
    check.background && ['Antecedentes', check.background.text],
    mins.length && ['Lo mínimo', mins.filter((m) => checked.includes(m.key)).map((m) => m.title).join(' · ') || 'Nada confirmado'],
    !opensTicket(dest) && ['Evidencia', v.sent],
  ].filter(Boolean);
  return `<div class="rv-rtools"><small>Puedes retocar el texto antes de escalar</small></div>
        <div class="rv-rpanel"><section class="rv-rep rv-rep-mail">
          <div class="rv-rep-edit" contenteditable="true" role="textbox" aria-multiline="true" aria-label="Borrador del ticket">${rows.map(([h, p]) => `<h5>${h}</h5><p>${esc(p || '')}</p>`).join('')}</div>
          ${files.map((x) => `<div class="rv-rep-att"><i>${FILE_ICON}</i><div><b>${esc(x.name)}</b><small>Adjunto · ${kb(x.size)}</small></div></div>`).join('')}
        </section></div>`;
};

// Al acabar: lo que se ha hecho y el ticket, para copiarlo. Hasta conectar Jira, el de un escalado es
// de ejemplo y se dice. result: resultTicket (escalate.js).
export const doneHtml = (result, target, mode, rootCause) => `<i class="iss-esc-done-ok" aria-hidden="true">✓</i>
          <h4>${mode === 'link' ? `Unida a ${esc(target)}` : `Escalada a ${esc(target)}`}</h4>
          <p>${mode === 'link' || !rootCause ? 'Pasa a Pendiente (proveedor) y se avisa al centro.' : 'Queda registrada la causa raíz y sigue Resuelta.'}</p>
          ${result ? `<div class="iss-esc-ticket"><span>${result.sample ? 'Ticket generado' : 'Ticket'}</span><code>${esc(result.ticket)}</code><button type="button" class="lab-btn" data-copy="${esc(result.ticket)}">Copiar</button></div>
          ${result.sample ? '<small>De ejemplo: el ticket real llegará al conectar Jira.</small>' : ''}` : ''}`;

// Al escalar: lo que hace SIA (de momento, un simulacro, como el cierre de Resolver).
export const closePhases = (v, rootCause) => (v.mode === 'link'
  ? ['Uniendo al ticket', 'Pasando a Pendiente (proveedor)']
  : ['Registrando el escalado', 'Avisando al centro', ...(rootCause ? [] : ['Pasando a Pendiente (proveedor)'])]
).map((t) => `<li><i></i>${t}</li>`).join('');

const stepper = () => `<ol class="rv-steps">${STEPS.map((s) => `<li data-step-mark="${s.n}"${s.n === LAST ? ' class="last"' : ''}${s.n === 1 ? ' aria-current="step"' : ''}><i>${s.n}</i><span>${s.title}</span></li>`).join('')}</ol>`;
const FILE_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>';

// `issue`: la issue abierta; `dests` y `open`: el catálogo y los tickets abiertos; `check`: lo que
// dice el bridge (las notas, la de análisis y la de antecedentes); `saved`: el borrador, si lo hay;
// `link`: su ticket en Remedy.
export const escalateForm = ({ issue, dests, open, check, saved = null, link = null }) => {
  const v = startValues({ issue, open, check, saved });
  const rootCause = issue.status === 'RESOLVED';
  const analysis = check.analysis;
  return `<form class="iss-act-form rv iss-esc" data-act-form="escalate" data-step="1" novalidate>
    <header class="rv-head"><h3>${rootCause ? 'Escalar por la causa raíz' : 'Escalar incidencia'}</h3>${issueRef(issue.id, link)}</header>
    ${stepper()}
    <input type="hidden" name="step" value="1" />
    <input type="hidden" name="mode" value="${v.mode === 'link' ? 'link' : 'escalate'}" />
    <div class="rv-body">
      <section class="rv-step rv-step-one" data-rstep="1">
        <div class="rv-cap"><b>¿Ya hay un ticket abierto?</b><button type="button" class="rv-link iss-esc-ai" data-esc-ai>Buscarlo con la IA</button></div>
        <div class="rv-text">
          <fieldset class="iss-esc-open">
            ${backgroundBox(check.background)}
            ${open.map((o) => card('linked', o.ticket, v.linked === o.ticket, `<span><b class="iss-mono">${esc(o.ticket)}</b> · ${esc(dests.find((d) => d.id === o.dest)?.name || '')}</span><small>${esc(o.title)} · ${o.issues} ${o.issues === 1 ? 'issue' : 'issues'} esperando · abierto el ${when(o.since)}</small>`)).join('')}
            ${card('linked', 'other', v.linked === 'other', `<b>Otro ticket</b><input name="linkedOther" class="iss-mono" value="${esc(v.linkedOther || '')}" placeholder="PROYECTO-número o INC…" aria-label="Otro ticket" /><span data-esc-linked>${linkedText(v.linkedOther)}</span>`)}
          </fieldset>
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
        <div class="rv-cap rv-cap-center rv-cap-final" data-esc-cap hidden><b>Borrador del ticket</b><em>Revísalo antes de escalar</em></div>
        <div class="rv-text">
          <section class="rv-gen-sum iss-esc-review" data-esc-review>
            <h4>Lo que has escrito</h4>
            <p class="iss-esc-after">Al escalar, ${rootCause ? 'queda registrada la causa raíz y la issue sigue Resuelta.' : 'la issue pasa a Pendiente (proveedor) y se avisa al centro.'}</p>
            <ol data-summary></ol>
          </section>
          <div class="rv-review" data-esc-ticket hidden></div>
          <div class="rv-loader" data-loader hidden>
            <h4 class="rv-loader-title" data-loader-title></h4>
            <i class="rv-spin"></i>
            <ol class="rv-phases" data-phases></ol>
          </div>
          <div class="iss-esc-done" data-esc-done hidden></div>
        </div>
      </section>
    </div>
    <p class="iss-act-err" hidden></p>
    <footer>
      <small class="iss-autosave" data-autosave>${saved?.at ? `Borrador guardado ${localShort(saved.at)}` : 'El borrador se guarda solo mientras escribes'}</small>
      <button type="button" class="lab-btn rv-back" data-step-back hidden>Atrás</button>
      <button type="button" class="lab-btn rv-next" data-step-next>${STEPS[1].title}</button>
      <button type="button" class="lab-btn primary rv-next" data-esc-preview hidden>Ver el ticket</button>
      <button type="submit" class="lab-btn primary rv-next" data-confirm-send hidden>Escalar</button>
      <button type="button" class="lab-btn primary rv-next" data-esc-close hidden>Cerrar</button>
    </footer>
  </form>`;
};
