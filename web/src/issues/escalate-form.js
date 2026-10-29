// El modal de Escalar: pasar la issue a otro equipo (del catálogo o de fuera)
// o unirla a un ticket de proveedor ya abierto. Solo hace falta saber a quién
// o a qué ticket; lo demás se recomienda, no bloquea. Lo que depende de lo
// escrito son piezas que la vista vuelve a pintar al teclear: escalateLive.
import { esc } from '../ui/html.js';
import { when, duration } from './format.js';
import { localShort } from './resolve-form.js';
import { pickField } from './actions.js';
import { ticketCheck, deadlines, formalClock, clockText, JIRA_PRIORITIES, jiraPriority, n3Subject, isDev, opensTicket } from './escalate.js';

const VIA = { SIGLO: 'por SIGLO', IOP: 'por IOP', MoninBot: 'por MoninBot', Correo: 'por correo' };
const OPENS = { jira: 'abre un Jira', remedy: 'abre una incidencia de Remedy', none: 'no abre ticket' };
const GROUPS = [
  ['N3 · el equipo que mantiene el módulo (por SIGLO)', (d) => d.level === 'N3' && d.via === 'SIGLO'],
  ['N2 · otro equipo de soporte (por IOP)', (d) => d.via === 'IOP'],
  ['Otros canales', (d) => !(d.level === 'N3' && d.via === 'SIGLO') && d.via !== 'IOP'],
];

const destGroups = (dests) => [
  ...GROUPS.map(([label, test]) => ({ label, options: dests.filter(test).map((d) => ({ value: d.id, label: d.name })) })),
  { label: 'Fuera del mapa', options: [{ value: 'other', label: 'Otro equipo, fuera del mapa' }] },
];

// Qué pasa al escalar a ese destino, dicho para quien no lo ha hecho nunca.
const destText = (v, dest) => !v.dest ? 'Del mapa de escalado de soporte ECOM. Si no sabes cuál, busca el módulo que falla.'
  : !dest ? 'Fuera del mapa: escribe el equipo y cuenta abajo cómo se lo has hecho llegar.'
  : `${dest.level === 'N3' ? 'N3, el equipo que mantiene el módulo' : 'Otro equipo de soporte (N2)'}. Se escala ${VIA[dest.via]} y ${OPENS[dest.opens]}`
    + (opensTicket(dest) ? ': el ticket llega solo a la issue.' : ': no queda rastro en ninguna herramienta, así que cuenta abajo qué has enviado.')
    + (dest.via === 'Correo' ? ' Si es alta o crítica, llama además.' : '');

// El ticket «otro» al vincular, comprobado al teclear.
const linkedText = (raw) => {
  const t = ticketCheck(raw);
  return t.state === 'empty' ? '' : t.state === 'bad' ? `<small class="bad">«${esc(t.bad)}» no es un ticket: PROYECTO-número o INC y 12 dígitos.</small>`
    : t.state === 'many' ? `<small class="bad">Hay ${t.tickets.length} tickets: escribe solo uno.</small>`
    : `<small class="ok">Correcto${t.changed ? `: se guardará como <b>${esc(t.value)}</b>` : ''}.</small>`;
};

// Las piezas que cambian con lo escrito. `v`: valores del formulario.
export const escalateLive = (v, { issue, dests }) => {
  const dest = dests.find((d) => d.id === v.dest) || null;
  const opens = opensTicket(dest);
  const rightPrio = v.jiraPriority === jiraPriority(issue.priority);
  const check = (ok, text, hint) => `<li class="${ok ? 'ok' : 'todo'}"><span aria-hidden="true">${ok ? '✓' : '○'}</span>${text}${hint ? ` <i>${hint}</i>` : ''}</li>`;
  const checklist = `<ul class="iss-esc-check">
      ${check(String(v.reason ?? '').trim().length >= 20, 'Explicas qué has visto y qué has probado', 'el destino lo necesita para no devolvértela')}
      ${dest?.opens === 'jira' ? check(rightPrio, 'Prioridad del Jira según su criticidad', rightPrio ? '' : 'la elegida no es la que le toca') : ''}
      ${opens ? '' : check(String(v.sent ?? '').trim(), 'Cuentas qué has enviado y por dónde', 'sin herramienta, es la única prueba del escalado')}
    </ul>`;
  return {
    html: {
      dest: `<small>${esc(destText(v, dest))}</small>`,
      sentTag: opens ? '(opcional)' : '(recomendado)',
      linked: linkedText(v.linkedOther),
      check: checklist,
      subject: esc(n3Subject(issue, dest)),
    },
    show: { other: v.dest === 'other', jira: dest?.opens === 'jira', dev: isDev(dest) },
  };
};

// El reloj del escalado formal, arriba y a la vista.
const clockLine = (issue, now) => {
  const d = deadlines(issue.priority), c = formalClock(issue, now);
  return `<p class="iss-esc-clock${c.late ? ' late' : ''}"><b>${clockText(c)}</b> ${c.late ? 'del plazo para' : 'para'} el escalado formal · ${d.label}: ${duration(d.formal)} desde que se ${c.from}</p>`;
};

// El detalle de los plazos y, en altas y críticas, los niveles: plegado.
const deadlineBox = (issue) => {
  const d = deadlines(issue.priority);
  const urgent = issue.priority === 'CRITICAL' || issue.priority === 'HIGH';
  return `<details class="iss-esc-box"><summary>Plazos y qué hacer si no responden</summary>
      <p>El escalado formal va con el análisis previo y las evidencias, en menos de ${duration(d.formal)}.</p>
      <p>El destino tiene que confirmar que lo ha recibido en menos de ${duration(d.ack)}${issue.priority === 'HIGH' ? ', con nota pública y teléfono con 3 intentos' : ''}.</p>
      ${urgent ? '<p class="iss-esc-levels">Estás en el <b>nivel 1</b> (N3, Operaciones o desarrollo). Si no hay solución, nivel 2: el responsable técnico del módulo. A la 1 h sin diagnóstico ni plan, nivel 3: el responsable funcional. <i>Manual de Remedy, sección 07.</i></p>' : ''}
    </details>`;
};

// N3 de desarrollo: lo mínimo que hay que enviar (proceso de soporte, 2.3).
const devBox = (issue, dest) => `<section class="iss-esc-dev" data-esc-when="dev"${isDev(dest) ? '' : ' hidden'}>
      <h4>Lo mínimo para N3 de desarrollo</h4>
      <ul>
        <li>El formulario de SIGLO, con el análisis previo y las evidencias.</li>
        <li>Si has llamado, un chat con la persona de desarrollo, el responsable técnico y la referencia de N3. Asunto: <code data-esc-live="subject">${esc(n3Subject(issue, dest))}</code></li>
        <li>Los logs, copiados a soporteSGA.</li>
      </ul>
    </section>`;

// Una opción que se elige pulsando la tarjeta entera; el radio no se ve.
const card = (name, value, checked, body) => `<label class="iss-esc-card"><input type="radio" class="iss-sr" name="${name}" value="${esc(value)}"${checked ? ' checked' : ''} />${body}</label>`;

// `issue`: la issue (ya con el caso de prueba aplicado); `dests` y `open`:
// el catálogo y los tickets abiertos; `v`: lo que ya hay escrito; `cases`:
// los casos de prueba (solo en desarrollo) y `caseId`, el elegido; `saved`:
// { at } si lo escrito viene de antes de cerrar el modal.
export const escalateForm = ({ issue, now, dests, open, v = {}, cases = null, caseId = '', saved = null }) => {
  const rootCause = issue.status === 'RESOLVED';
  // Si la foto ya trae un ticket, puede que esté escalada: se propone unirla a él.
  const known = ticketCheck(issue.vendorTicket);
  const fromPhoto = known.state === 'ok' ? known.value : '';
  const listed = open.some((o) => o.ticket === fromPhoto);
  const values = { mode: 'escalate', jiraPriority: jiraPriority(issue.priority),
    ...(fromPhoto ? (listed ? { linked: fromPhoto } : { linked: 'other', linkedOther: fromPhoto }) : {}), ...v };
  const dest = dests.find((d) => d.id === values.dest) || null;
  const live = escalateLive(values, { issue, dests });
  const link = values.mode === 'link';
  return `<form class="iss-act-form iss-esc" data-act-form="escalate" novalidate>
    <header><h3>${rootCause ? 'Escalar por la causa raíz' : 'Escalar la issue'}</h3><span class="iss-act-id">${esc(issue.id)}</span></header>
    ${cases ? `<div class="iss-test"><span>Datos de prueba</span>${pickField({ id: 'iss-f-case', attr: 'data-esc-case', value: caseId, groups: [{ options: cases.map((c) => ({ value: c.id, label: c.label })) }] })}</div>` : ''}
    ${saved ? `<p class="iss-saved">Sigues con lo que dejaste a las ${localShort(saved.at.toISOString()).slice(-5)}. <button type="button" class="lab-btn" data-esc-drop>Descartar y empezar de nuevo</button></p>` : ''}
    <p class="iss-esc-intro">${rootCause
      ? 'Está Resuelta con una solución temporal: se registra el escalado de la causa raíz y la issue sigue Resuelta.'
      : 'Cuando en soporte no se puede resolver, se pasa al equipo que puede. La issue queda en Pendiente (proveedor) hasta que contesten.'}</p>
    ${clockLine(issue, now)}
    ${fromPhoto && !link ? `<p class="iss-esc-hint"><span>Remedy ya trae el ticket <b class="iss-mono">${esc(fromPhoto)}</b>: puede que ya esté escalada.</span><button type="button" class="lab-btn" data-esc-use-link>Unirla a ${esc(fromPhoto)}</button></p>` : ''}

    <div class="iss-esc-mode" role="radiogroup" aria-label="¿Qué vas a hacer?">
      ${card('mode', 'escalate', !link, '<b>Escalar a otro equipo</b><small>Nadie lo ha escalado aún: elige el equipo y cuéntale qué pasa.</small>')}
      ${card('mode', 'link', link, '<b>Unir a un ticket ya abierto</b><small>El mismo problema ya está escalado: espera a ese ticket, sin escalar dos veces.</small>')}
    </div>

    <div data-esc-mode="escalate"${link ? ' hidden' : ''}>
      <div class="iss-field"><span>¿A qué equipo se escala?</span>${pickField({ id: 'iss-f-dest', name: 'dest', value: values.dest || '', placeholder: 'Elige el equipo', groups: destGroups(dests) })}<span data-esc-live="dest">${live.html.dest}</span></div>
      <label class="iss-field" for="iss-f-destOther" data-esc-when="other"${live.show.other ? '' : ' hidden'}><span>Equipo o proveedor</span><input id="iss-f-destOther" name="destOther" value="${esc(values.destOther || '')}" placeholder="Ej.: Soporte de transporte" /></label>
      <div class="iss-field" data-esc-when="jira"${live.show.jira ? '' : ' hidden'}><span>Prioridad del Jira</span>
        ${pickField({ id: 'iss-f-jira', name: 'jiraPriority', value: values.jiraPriority, groups: [{ options: JIRA_PRIORITIES.map((p) => ({ value: p.id, label: `${p.label} · ${p.when}` })) }] })}
        <small>Por su criticidad le toca «${JIRA_PRIORITIES.find((p) => p.id === jiraPriority(issue.priority)).label}»: ya está puesta.</small></div>
      <label class="iss-field" for="iss-f-reason"><span>¿Por qué se escala?</span><textarea id="iss-f-reason" name="reason" rows="3" placeholder="Ej.: desde las 10:00 el túnel RFID de la mesa 3 tarda de 8 a 12 s. Reiniciado el servicio, sigue igual.">${esc(values.reason || '')}</textarea><small>Qué has visto y qué has probado. Antes, mira si hay un procedimiento para resolverlo en soporte.</small></label>
      <label class="iss-field" for="iss-f-sent"><span>¿Qué se ha enviado? <i data-esc-live="sentTag">${live.html.sentTag}</i></span><textarea id="iss-f-sent" name="sent" rows="2" placeholder="Ej.: logs del proceso y una captura del error, por correo a las 10:12.">${esc(values.sent || '')}</textarea></label>
      ${devBox(issue, dest)}
      <section class="iss-esc-before"><h4>Para que llegue bien <i>(no bloquea)</i></h4><div data-esc-live="check">${live.html.check}</div></section>
    </div>

    <div data-esc-mode="link"${link ? '' : ' hidden'}>
      <fieldset class="iss-esc-open"><legend>¿A qué ticket la unes?</legend>
        ${open.map((o) => card('linked', o.ticket, values.linked === o.ticket, `<span><b class="iss-mono">${esc(o.ticket)}</b> · ${esc(dests.find((d) => d.id === o.dest)?.name || '')}</span><small>${esc(o.title)} · ${o.issues} ${o.issues === 1 ? 'issue' : 'issues'} esperando · abierto el ${when(o.since)}</small>`)).join('')}
        ${card('linked', 'other', values.linked === 'other', `<b>Otro ticket</b><input name="linkedOther" class="iss-mono" value="${esc(values.linkedOther || '')}" placeholder="PROYECTO-número o INC…" aria-label="Otro ticket" /><span data-esc-live="linked">${live.html.linked}</span>`)}
      </fieldset>
      <label class="iss-field" for="iss-f-why"><span>¿Por qué es el mismo problema? <i>(opcional)</i></span><textarea id="iss-f-why" name="why" rows="2">${esc(values.why || '')}</textarea></label>
    </div>

    ${deadlineBox(issue)}

    <p class="iss-act-note">Aún no se envía a Remedy: irá cuando lo conectemos.</p>
    <p class="iss-act-err" hidden></p>
    <footer><button type="button" class="lab-btn" data-act-cancel>Cancelar</button><button type="submit" class="lab-btn primary" data-esc-ok>${link ? 'Unir al ticket' : 'Escalar'}</button></footer>
  </form>`;
};
