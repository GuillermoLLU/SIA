// Escalar, en cuatro pasos y uno solo a la vista, con el aspecto de Resolver (las clases rv-*):
// 1) a quién: un equipo del catálogo o unirla a un ticket ya abierto (al unir, todo acaba aquí);
// 2) qué pasa, que empieza con la nota [ANALISIS] de Remedy; 3) cómo se envía, lo que pida el
// destino; y 4) revisar y escalar. No se pasa de paso sin lo obligatorio (escalate.js). Sin las
// notas del método no se abre: el mismo aviso que Resolver (resolveBlocked). La vista (escalate-view.js)
// vuelve a pintar las piezas que dependen de lo escrito: sendHtml, channelOf, linkedText y summaryHtml.
import { esc } from '../ui/html.js';
import { when } from './format.js';
import { pickerHtml } from '../ui/picker.js';
import { ticketCheck, JIRA_PRIORITIES, jiraPriority, n3Subject, isDev, opensTicket, channelOf, destOf, STEPS, LAST } from './escalate.js';
import { doneMark, noteMeter, localShort, short, issueRef } from './resolve-form.js';
import { noteQuality } from './quality.js';

const GROUPS = [
  ['N3 por SIGLO', (d) => d.level === 'N3' && d.via === 'SIGLO'],
  ['N2 por IOP', (d) => d.via === 'IOP'],
  ['Otros canales', (d) => !(d.level === 'N3' && d.via === 'SIGLO') && d.via !== 'IOP'],
];
const destGroups = (dests) => [
  ...GROUPS.map(([label, test]) => ({ label, options: dests.filter(test).map((d) => ({ value: d.id, label: d.name })) })),
  { label: 'Fuera del mapa', options: [{ value: 'other', label: 'Otro equipo, fuera del mapa' }] },
];

// El ticket «otro» al unir, comprobado al teclear.
export const linkedText = (raw) => {
  const t = ticketCheck(raw);
  return t.state === 'empty' ? '' : t.state === 'bad' ? `<small class="bad">«${esc(t.bad)}» no es un ticket: PROYECTO-número o INC y 12 dígitos.</small>`
    : t.state === 'many' ? `<small class="bad">Hay ${t.tickets.length} tickets: escribe solo uno.</small>`
    : `<small class="ok">Correcto${t.changed ? `: se guardará como <b>${esc(t.value)}</b>` : ''}.</small>`;
};

// Lo que se abre con el asistente: lo que dejó el borrador o, si no hay, lo que toca. Si la foto
// ya trae un ticket, se propone unirla a él; «Qué pasa» empieza con la nota de análisis.
export const startValues = ({ issue, open, check, saved }) => {
  if (saved) return saved;
  const known = ticketCheck(issue.vendorTicket);
  const fromPhoto = known.state === 'ok' ? known.value : '';
  const listed = open.some((o) => o.ticket === fromPhoto);
  return { mode: fromPhoto ? 'link' : 'escalate', jiraPriority: jiraPriority(issue.priority), reason: check.analysis?.text ?? '',
    ...(fromPhoto ? (listed ? { linked: fromPhoto } : { linked: 'other', linkedOther: fromPhoto }) : {}) };
};

// N3 de desarrollo: lo mínimo que hay que enviar (proceso de soporte, 2.3).
const devBox = (issue, dest) => `<section class="iss-esc-dev">
          <h4>Lo mínimo para N3 de desarrollo</h4>
          <ul>
            <li>El formulario de SIGLO, con el análisis previo y las evidencias.</li>
            <li>Si has llamado, un chat con la persona de desarrollo, el responsable técnico y la referencia de N3. Asunto: <code>${esc(n3Subject(issue, dest))}</code></li>
            <li>Los logs, copiados a soporteSGA.</li>
          </ul>
        </section>`;

// Al unir: la nota [ANTECEDENTES] de Remedy, que dice por qué es el mismo problema.
const backgroundBox = (n) => (n ? `<section class="iss-esc-dev iss-esc-bg">
              <h4>Antecedentes <small>${esc(short(n.at))} · ${esc(n.who)}</small></h4>
              <p>${esc(n.text)}</p>
            </section>` : '');

// Paso 3: lo que pide el destino. Lo que no le toca va oculto, para no perderlo si se cambia de destino.
export const sendHtml = (v, { issue, dests }) => {
  const dest = destOf(v, dests);
  const jira = dest?.opens === 'jira', evidence = !opensTicket(dest);
  return `${jira ? `<div class="iss-field"><span>Prioridad del Jira</span>${pickerHtml({ id: 'iss-f-jira', name: 'jiraPriority', value: v.jiraPriority || jiraPriority(issue.priority), groups: [{ options: JIRA_PRIORITIES.map((p) => ({ value: p.id, label: `${p.label} · ${p.when}` })) }] })}</div>`
      : `<input type="hidden" name="jiraPriority" value="${esc(v.jiraPriority || '')}" />`}
        ${isDev(dest) ? devBox(issue, dest) : ''}
        ${evidence ? `<label class="iss-field rv-grow" for="iss-f-sent"><span>¿Qué has enviado y por dónde?</span><textarea class="rv-ed" id="iss-f-sent" name="sent">${esc(v.sent || '')}</textarea></label>`
      : `<input type="hidden" name="sent" value="${esc(v.sent || '')}" />`}`;
};

// Paso 4: lo escrito en cada paso (pulsar uno vuelve a él), como «Lo que has escrito» de Resolver.
const EXCERPT = 180;
const excerpt = (s) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > EXCERPT ? `${t.slice(0, EXCERPT - 1).trimEnd()}…` : t; };
export const summaryHtml = (v, dests) => {
  const dest = destOf(v, dests);
  const prio = dest?.opens === 'jira' ? JIRA_PRIORITIES.find((p) => p.id === v.jiraPriority)?.label : '';
  const q = noteQuality(v.reason);
  const items = [
    { n: 1, title: 'A quién', text: dest?.name || v.destOther },
    { n: 2, title: 'Qué pasa', text: v.reason, level: q.level, label: q.label },
    { n: 3, title: 'Cómo se envía', text: [channelOf(dest), prio && `Prioridad del Jira: ${prio}`, opensTicket(dest) ? '' : v.sent].filter(Boolean).join(' · ') },
  ];
  return items.map((it) => `<li><button type="button" data-go="${it.n}" title="Volver a ${it.title}"><span class="rv-sum-h"><b>${it.title}</b>${it.label ? `<em data-level="${it.level}">${it.label}</em>` : ''}</span><span class="rv-sum-x">${esc(excerpt(it.text))}</span></button></li>`).join('');
};

// Al escalar: lo que hace SIA (de momento, un simulacro, como el cierre de Resolver).
export const closePhases = (v, rootCause) => (v.mode === 'link'
  ? ['Uniendo al ticket', 'Pasando a Pendiente (proveedor)']
  : ['Registrando el escalado', 'Avisando al centro', ...(rootCause ? [] : ['Pasando a Pendiente (proveedor)'])]
).map((t) => `<li><i></i>${t}</li>`).join('');

// Una opción que se elige pulsando la tarjeta entera; el radio no se ve.
const card = (name, value, checked, body) => `<label class="iss-esc-card"><input type="radio" class="iss-sr" name="${name}" value="${esc(value)}"${checked ? ' checked' : ''} />${body}</label>`;
const stepper = () => `<ol class="rv-steps">${STEPS.map((s) => `<li data-step-mark="${s.n}"${s.n === LAST ? ' class="last"' : ''}${s.n === 1 ? ' aria-current="step"' : ''}><i>${s.n}</i><span>${s.title}</span></li>`).join('')}</ol>`;
// `issue`: la issue abierta; `dests` y `open`: el catálogo y los tickets abiertos; `check`: lo que
// dice el bridge (las notas y la de análisis); `saved`: el borrador, si lo hay; `link`: su ticket en Remedy.
export const escalateForm = ({ issue, dests, open, check, saved = null, link = null }) => {
  const v = startValues({ issue, open, check, saved });
  const linkMode = v.mode === 'link', rootCause = issue.status === 'RESOLVED';
  const analysis = check.analysis;
  return `<form class="iss-act-form rv iss-esc" data-act-form="escalate" data-step="1" novalidate>
    <header class="rv-head"><h3>${rootCause ? 'Escalar por la causa raíz' : 'Escalar incidencia'}</h3>${issueRef(issue.id, link)}</header>
    ${stepper()}
    <input type="hidden" name="step" value="1" />
    <div class="rv-body">
      <section class="rv-step rv-step-one" data-rstep="1">
        <div class="rv-cap"><b>¿A quién se escala?</b></div>
        <div class="rv-text">
          <div class="iss-esc-mode" role="radiogroup" aria-label="Qué vas a hacer">
            ${card('mode', 'escalate', !linkMode, '<b>Escalar a un equipo</b>')}
            ${card('mode', 'link', linkMode, '<b>Unir a un ticket abierto</b>')}
          </div>
          <div data-esc-mode="escalate"${linkMode ? ' hidden' : ''}>
            <div class="iss-field">${pickerHtml({ id: 'iss-f-dest', name: 'dest', value: v.dest || '', placeholder: 'Elige el equipo', groups: destGroups(dests) })}</div>
            <label class="iss-field" for="iss-f-destOther" data-esc-other${v.dest === 'other' ? '' : ' hidden'}><span>Equipo o proveedor</span><input id="iss-f-destOther" name="destOther" value="${esc(v.destOther || '')}" /></label>
          </div>
          <fieldset class="iss-esc-open" data-esc-mode="link"${linkMode ? '' : ' hidden'}>
            ${backgroundBox(check.background)}
            ${open.map((o) => card('linked', o.ticket, v.linked === o.ticket, `<span><b class="iss-mono">${esc(o.ticket)}</b> · ${esc(dests.find((d) => d.id === o.dest)?.name || '')}</span><small>${esc(o.title)} · ${o.issues} ${o.issues === 1 ? 'issue' : 'issues'} esperando · abierto el ${when(o.since)}</small>`)).join('')}
            ${card('linked', 'other', v.linked === 'other', `<b>Otro ticket</b><input name="linkedOther" class="iss-mono" value="${esc(v.linkedOther || '')}" placeholder="PROYECTO-número o INC…" aria-label="Otro ticket" /><span data-esc-linked>${linkedText(v.linkedOther)}</span>`)}
          </fieldset>
        </div>
      </section>

      <section class="rv-step rv-step-one" data-rstep="2" hidden>
        <div class="rv-cap"><b>¿Qué pasa?</b>${analysis ? doneMark(analysis, (v.reason ?? '') !== analysis.text) : ''}</div>
        <div class="rv-text">
          <div class="iss-field rv-grow"><textarea class="rv-ed" id="iss-f-reason" name="reason" aria-label="Qué pasa">${esc(v.reason || '')}</textarea>${noteMeter(v.reason, 'reason')}</div>
        </div>
      </section>

      <section class="rv-step rv-step-one" data-rstep="3" hidden>
        <div class="rv-cap"><b>¿Cómo se envía?</b><em data-esc-channel>${esc(channelOf(destOf(v, dests)))}</em></div>
        <div class="rv-text" data-esc-send>${sendHtml(v, { issue, dests })}</div>
      </section>

      <section class="rv-step rv-step-one" data-rstep="${LAST}" hidden>
        <div class="rv-cap" data-esc-cap><b>Revisar</b><em>${rootCause ? 'Sigue Resuelta' : 'Pasa a Pendiente (proveedor) · se avisa al centro'}</em></div>
        <div class="rv-text">
          <section class="rv-gen-sum" data-esc-review><ol data-summary></ol></section>
          <div class="rv-loader" data-loader hidden>
            <h4 class="rv-loader-title" data-loader-title></h4>
            <i class="rv-spin"></i>
            <ol class="rv-phases" data-phases></ol>
          </div>
        </div>
      </section>
    </div>
    <p class="iss-act-err" hidden></p>
    <footer>
      <small class="iss-autosave" data-autosave>${saved?.at ? `Borrador guardado ${localShort(saved.at)}` : 'El borrador se guarda solo mientras escribes'}</small>
      <button type="button" class="lab-btn rv-back" data-step-back hidden>Atrás</button>
      <button type="button" class="lab-btn primary rv-next" data-step-next>${STEPS[1].title}</button>
      <button type="submit" class="lab-btn primary rv-next" data-confirm-send hidden>Escalar</button>
    </footer>
  </form>`;
};
