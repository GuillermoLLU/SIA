// Vista «Issues»: la mesa de cada persona. Arriba, cómo trabaja en general y la cola; debajo, lo
// suyo: En curso y Resueltas a la izquierda, Seguimiento a la derecha. A la derecha del todo, su
// día, con el botón de asignar la siguiente (la cola de la base evita que dos cojan la misma), y
// su histórico medido en SIA (se llena con el uso). Al abrir una, la pantalla de trabajo
// (work-screen.js). La mesa se refresca sola.
import './issues.css';
import { esc } from '../ui/html.js';
import { LISTS, snapshotInfo, duration, weekBars } from './format.js';
import { item, REFRESH_ICON } from './parts.js';
import { onEscape } from '../ui/dialog.js';
import { pressStartedIn } from '../ui/dom.js';
import { pickClick, openPicker, closePickers } from '../ui/picker.js';
import { workScreen, releaseDialogHtml } from './work-screen.js';
import { createNotes } from './notes-view.js';
import { actionForm, readAction, isComplete, chaseNote, chaseTarget, contactNote } from './actions.js';
import { createResolver } from './resolve-view.js';
import { knowsOrigin, originOf } from './origin.js';
import { crossfade } from '../ui/crossfade.js';
import { mountTips } from './tip.js';
import { readEscalate, createEscalateDrafts } from './escalate.js';
import { escalateForm, escalateLive } from './escalate-form.js';
import { DESTINATIONS, OPEN_TICKETS } from './escalate-mock.js';
import { callForm, callReady, callNote, suggestedPhone } from './call.js';
import { transferForm, readTransfer, transferNote } from './transfer.js';
import { TEAMS } from './transfer-mock.js';
import { createIncoming } from './incoming-view.js';
import { incomingCardHtml } from './incoming.js';

const GOAL = { min: 15, max: 20 }; // resueltas por turno, lo que dice el equipo
const REFRESH_MS = 15000;

const DESK_ENTER_MS = 1800; // lo que dura la cascada de entrada, con la espera a la barra (issues.css, app/intro.js)
const ISSUE_ENTER_MS = 1000; // lo que dura la entrada de una issue (issues.css)

// openChat(host, issue) → { dispose }: el chat de la issue (lo pone main.js).
// dialogs: los diálogos de la app (ui/dialog.js), para confirmar antes de devolver.

export const mountIssuesView = (root, { api, me, toast, openChat, dialogs }) => {
  const failed = (text) => (toast?.error || toast)?.(text);   // lo que falla, en rojo
  let data = null, now = new Date(), opened = null, onDesk = false, workTab = 'detail', chat = null, loading = false, picking = false;
  let issue = null; // la issue abierta: Escalar mira su criticidad, su estado y su ticket
  const closeChat = () => { chat?.dispose(); chat = null; };
  // la pestaña Seguimiento (las notas) vive en su módulo (notes-view.js): plegar, escribir, editar
  const notes = createNotes({ root, api, toast, me });
  // «Llamada de un centro» en el panel: buscar la incidencia y dejar nota de la llamada (incoming-view.js)
  const incoming = createIncoming({ root, api, toast });
  // el tooltip de «Traspasada» se saca al body: al repintar, fuera, o se quedaría flotando
  const hideTip = mountTips(root);

  // Cargar la foto (el CSV de la consulta de Remedy, hasta leer de Remedy).
  const fileLabel = (cls, label, title = '') => `<label class="${cls} ${loading ? 'iss-busy' : ''}" title="${title}">${loading ? 'Cargando…' : label}<input type="file" accept=".csv,text/csv" data-csv hidden ${loading ? 'disabled' : ''}></label>`;
  const loadButton = (label) => fileLabel('iss-load', label);
  // La fecha de los datos es también el botón de cargar otra foto.
  const snapButton = ({ date, stale }) => fileLabel(`iss-date${stale ? ' stale' : ''}`, `${date}${stale ? REFRESH_ICON : ''}`, stale ? 'Datos de Remedy sin actualizar: pulsa para cargar un CSV nuevo. Lo medido en SIA sí es de hoy.' : 'Datos de Remedy: pulsa para cargar otro CSV');

  const kpi = (label, value, hint) => `<div class="iss-kpi" title="${hint}"><span>${label}</span><b>${value}</b><small>${hint}</small></div>`;

  // Cogidas por semana (SGA / SISU), lo medido en SIA: una fila por semana, la última arriba.
  const weeksChart = (weeks) => `<div class="iss-weeks" role="img" aria-label="Issues cogidas por semana, últimas ${weeks.length} semanas">
      ${weekBars(weeks).map(({ week, sga, sisu, total, sgaPct, sisuPct }) => `<div class="iss-week" title="Semana del ${week.slice(8)}/${week.slice(5, 7)}: ${total} (SGA ${sga}, SISU ${sisu})">
          <span>${+week.slice(8)}/${+week.slice(5, 7)}</span><div class="iss-week-bar"><i style="width:${sgaPct}%"></i><i class="sisu" style="width:${sisuPct}%"></i></div><small>${total || ''}</small></div>`).join('')}
    </div>`;

  const renderDesk = () => {
    closeChat();
    hideTip();
    onDesk = true;
    if (!data.taken) {
      root.innerHTML = `<div class="iss-page">
        <div class="iss-none"><b>Aún no hay issues</b><span>De momento se cargan con el CSV de la consulta de Remedy (vale el mismo que el de Métricas); cuando SIA lea de Remedy, saldrán de ahí.</span>${loadButton('Cargar CSV')}</div></div>`;
      return;
    }
    const { today, history, next } = data;
    const lists = LISTS.map((l) => ({ ...l, items: data.desk.filter(l.test).sort(l.sort) }));
    const count = (key) => lists.find((l) => l.key === key).items.length;
    const used = history.weeks.some((w) => w.sga + w.sisu);
    root.innerHTML = `<div class="iss-page iss-desk-page">
      <div class="iss-desk">
        <div class="iss-main">
          <div class="iss-kpis">
            ${kpi('Cogidas por semana', history.perWeek, `media de las últimas ${history.weeks.length} semanas`)}
            ${kpi('Cogidas a tiempo', history.onTimePct == null ? '—' : `${history.onTimePct} %`, 'críticas en 15 min, altas en 2 h')}
            ${kpi('Tiempo medio en coger', history.avgPickMin == null ? '—' : duration(history.avgPickMin), 'desde que entra la issue')}
            ${kpi('Tiempo típico de resolución', '—', 'cuando se resuelva desde SIA')}
            ${kpi('Cola', data.free, 'sin coger, de lo que puedes llevar')}
          </div>
        <div class="iss-cols">
          ${lists.map((l) => `<section class="iss-card iss-col" data-list="${l.key}">
            <div class="iss-card-h"><h3>${l.label}</h3><span>${l.items.length}</span>${l.key === 'waiting' ? `<button type="button" class="iss-refresh" data-refresh title="Volver a leer la mesa">${REFRESH_ICON}Refrescar</button>` : ''}</div>
            <div class="iss-items">${l.items.slice(0, 12).map((i) => item(i, l.key, now)).join('') || `<p class="iss-empty">${l.empty}</p>`}</div>
          </section>`).join('')}
        </div>
        </div>
        <aside class="iss-rail">
        <section class="iss-card iss-today">
          <div class="iss-card-h"><h3>Hoy</h3>${snapButton(snapshotInfo(data.taken, now))}</div>
          <div class="iss-big"><b>${today.resolved}</b><span>resueltas · objetivo ${GOAL.min}–${GOAL.max}<br>${today.sga} de SGA · ${today.sisu} de SISU</span></div>
          <div class="iss-progress" role="img" aria-label="${today.resolved} de ${GOAL.max}"><i style="width:${Math.min(100, today.resolved / GOAL.max * 100)}%"></i><em style="left:${GOAL.min / GOAL.max * 100}%"></em></div>
          <dl><dt>Cogidas en SIA</dt><dd>${history.claimedToday}</dd><dt>En curso</dt><dd>${count('doing')} <small>/ ${data.maxDoing}</small></dd><dt>Pendientes de terceros</dt><dd>${count('waiting')}</dd></dl>
          <button class="iss-take" data-take ${next && data.canTake ? '' : 'disabled'}>Asignar siguiente issue</button>
          ${data.canTake ? '' : '<p class="iss-foot iss-full"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/></svg>No puedes tener más en curso</p>'}
        </section>
        ${incomingCardHtml()}
        <section class="iss-card iss-hist">
          <div class="iss-card-h"><h3>Histórico semanal</h3><span class="iss-legend"><i></i>SGA <i class="sisu"></i>SISU</span></div>
          ${weeksChart(history.weeks)}
          <p class="iss-foot">${used ? 'Medido con el uso de SIA.' : 'Se irá llenando con el uso de SIA: cada issue que cojas cuenta.'} Las resueltas se sumarán cuando se resuelva desde SIA.</p>
        </section>
        </aside>
      </div>
    </div>`;
  };

  // La cascada de entrada, solo mientras dura: una animación activa encerraría los desplegables.
  const animateEnter = (el, cls, ms) => {
    el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  };

  const renderIssue = ({ issue: i, sameCenter, timeline }) => {
    onDesk = false;
    const mine = i.claimedBy && data?.desk.some((d) => d.id === i.id && d.claimed);
    if (opened !== i.id) workTab = 'detail';
    opened = i.id;
    issue = i;
    closeChat();
    closeAction();
    hideTip();
    now = new Date(); // el histórico y las edades, a la hora de abrirla
    notes.attach(i, timeline);
    root.innerHTML = workScreen({ issue: i, sameCenter, timeline, now, mine, meId: me?.id, tab: workTab });
    animateEnter(root.querySelector('.iss-work-page'), 'iss-opening', ISSUE_ENTER_MS);
    if (workTab === 'notes') notes.shown();
    const chatHost = root.querySelector('.iss-chat-body');   // pendiente de un tercero no hay chat
    chatHost?.addEventListener('chat-open', () => foldKeys(true)); // con el chat en marcha, los datos se pliegan a su resumen
    chat = chatHost ? openChat?.(chatHost, i) || null : null;
    root.scrollTop = 0;
  };

  const loadDesk = async () => {
    data = await api.desk();
    now = new Date();
    renderDesk();
  };
  // La mesa al día sin que se note: solo si se está viendo y sin un selector abierto.
  const refreshQuietly = () => {
    const still = () => !onDesk || picking || openPicker(root) || incoming.busy(); // ni con el buscador de llamadas en uso
    if (still()) return;
    api.desk().then((d) => {
      if (still()) return;
      const before = now;
      const changed = JSON.stringify(d) !== JSON.stringify(data); // igual y en el mismo minuto, no se toca: nada que parpadee
      data = d; now = new Date();
      if (!changed && now.getMinutes() === before.getMinutes()) return; // el minuto: las edades («hace 5 min»)
      const scrolled = () => [root, ...root.querySelectorAll('.iss-items')]; // repintar no mueve lo que se estaba leyendo
      const tops = scrolled().map((el) => el.scrollTop);
      renderDesk();
      scrolled().forEach((el, i) => { el.scrollTop = tops[i] ?? 0; });
    }).catch(() => {});
  };
  // Al entrar en la vista, la mesa llega en cascada: la primera vez cuando llegan los datos; al
  // volver, al momento con lo que ya había, y se pone al día por detrás. Si se dejó una issue
  // abierta (p. ej. para ir al Chat), se vuelve a esa issue, que entra como al abrirla.
  const showDesk = async () => {
    if (!data) {
      await loadDesk();
      animateEnter(root, 'iss-enter', DESK_ENTER_MS);
      return;
    }
    if (!onDesk && opened) { const page = root.querySelector('.iss-work-page'); if (page) animateEnter(page, 'iss-opening', ISSUE_ENTER_MS); return; }
    now = new Date();
    renderDesk();
    animateEnter(root, 'iss-enter', DESK_ENTER_MS);
    refreshQuietly();
  };
  const openIssue = async (id) => renderIssue(await api.get(id));

  // Las pestañas de la pantalla de trabajo.
  const showTab = (key) => {
    workTab = key;
    root.querySelectorAll('[data-wtab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.wtab === key)));
    root.querySelectorAll('[data-wpanel]').forEach((p) => { p.hidden = p.dataset.wpanel !== key; });
    if (key === 'notes') notes.shown(); // las notas van como una conversación: abajo, en lo último
  };
  // Pulsar el fondo cierra la ventana de una acción; soltar fuera tras seleccionar texto dentro, no.
  const pressedInModal = pressStartedIn(root, (t) => !!t.closest('.iss-modal > *'));
  // los datos clave plegados a una línea (o desplegados); el chat ampliado a toda la pantalla de trabajo (o no)
  const foldKeys = (fold) => {
    const keys = root.querySelector('.iss-keys');
    if (!keys) return;
    keys.classList.toggle('folded', fold);
    keys.querySelector('[data-keys-toggle]')?.setAttribute('aria-expanded', String(!fold));
  };
  // (el cuadro de datos se recoge animando su alto real, que el CSS no conoce: de lo que mide a 0, y vuelta)
  const widenChat = (wide) => {
    const page = root.querySelector('.iss-work-page');
    if (!page) return;
    const keys = page.querySelector('.iss-keys');
    if (keys) {
      keys.style.maxHeight = `${wide ? keys.offsetHeight : keys.scrollHeight}px`;
      if (wide) requestAnimationFrame(() => { keys.style.maxHeight = '0px'; });
      else keys.addEventListener('transitionend', function done(e) { if (e.propertyName !== 'max-height') return; keys.style.maxHeight = ''; keys.removeEventListener('transitionend', done); });
    }
    page.classList.toggle('chat-wide', wide);
    const b = page.querySelector('[data-chat-expand]');
    if (b) { b.title = wide ? 'Volver al tamaño normal' : 'Ampliar el chat'; b.setAttribute('aria-label', b.title); }
  };

  // «Otras acciones»: el menú bajo el botón de la cabecera. Otro clic (también en una de sus
  // acciones, que además se abre) o Escape lo cierra.
  let offMore = null;
  const closeMore = () => {
    const btn = root.querySelector('[data-more][aria-expanded="true"]');
    if (btn) { btn.setAttribute('aria-expanded', 'false'); btn.nextElementSibling.hidden = true; }
    offMore?.(); offMore = null;
  };
  const toggleMore = (btn) => {
    const open = btn.getAttribute('aria-expanded') === 'true';
    closeMore();
    if (open) return;
    btn.setAttribute('aria-expanded', 'true');
    btn.nextElementSibling.hidden = false;
    offMore = onEscape(closeMore);
  };

  root.addEventListener('click', async (e) => {
    const t = e.target;
    if (pickClick(root, t)) return;
    const more = t.closest('[data-more]');
    if (more) return toggleMore(more);
    closeMore();
    const fold = t.closest('[data-keys-toggle]');
    if (fold) return foldKeys(fold.getAttribute('aria-expanded') === 'true');
    if (t.closest('[data-chat-expand]')) return widenChat(!root.querySelector('.iss-work-page')?.classList.contains('chat-wide'));
    // con el diálogo de elegir fichero abierto no se repinta la mesa: el
    // cambio llegaría a un input que ya no está en la página
    if (t.matches('[data-csv]')) { picking = true; return; }
    try {
      // refrescar la mesa (Seguimiento): volver a leerla, con el botón ocupado mientras tanto
      const refresh = t.closest('[data-refresh]');
      if (refresh) {
        refresh.disabled = true;
        refresh.classList.add('busy');
        try { await loadDesk(); } finally { refresh.disabled = false; refresh.classList.remove('busy'); }   // si falla, se puede volver a intentar
        return toast?.('Mesa al día');
      }
      const take = t.closest('[data-take]');
      if (take) {
        take.disabled = true;
        const { id } = await api.next();
        await loadDesk();
        if (!id) return toast?.('No queda ninguna sin coger.');
        return openIssue(id);
      }
      const wt = t.closest('[data-wtab]');
      if (wt) return showTab(wt.dataset.wtab);
      const mode = t.closest('[data-transfer-mode]');
      if (mode) return switchTransfer(mode.closest('form'), mode.dataset.transferMode);
      const act = t.closest('[data-act]');
      if (act) {
        if (act.disabled) return;   // un segundo clic mientras se abre: un solo modal
        act.disabled = true;
        try { return await openAction(act.dataset.act); } finally { act.disabled = false; }
      }
      if (t.closest('[data-act-cancel]') || (t.classList.contains('iss-modal') && !pressedInModal())) return closeAction();
      const r = t.closest('[data-id]');
      if (r) return openIssue(r.dataset.id);
      if (t.closest('[data-back]')) { renderDesk(); root.scrollTop = 0; return; }
      const rel = t.closest('[data-release]');
      if (rel) {
        rel.disabled = true;
        const ok = !dialogs || await dialogs.open({ title: 'Devolver a la cola', centered: true, okLabel: 'Devolver',
          bodyHTML: releaseDialogHtml(opened, data?.desk.find((d) => d.id === opened)?.text) });
        if (!ok) { rel.disabled = false; return; }
        await api.release(opened);
        await loadDesk();
        return toast?.('Devuelta a la cola.');
      }
    } catch (err) { failed(err.message); }
  });
  // Acciones: su formulario encima de la pantalla de trabajo. De momento se
  // valida y se avisa: nada sale hacia Remedy hasta conectar SIGLO.
  let people = [], offEscape = null;
  const closeAction = () => { resolver.close(); root.querySelector('.iss-modal')?.remove(); offEscape?.(); offEscape = null; };
  // Resolver vive en su módulo (resolve-view.js); al resolver, la ventana ya se ha ido y la mesa se pone al día con un cruce.
  const resolver = createResolver(root, { api, dialogs, toast, onResolved: async () => {
    const fresh = await api.desk().catch(() => null);
    closeAction();
    crossfade(() => { if (fresh) { data = fresh; now = new Date(); } renderDesk(); root.scrollTop = 0; });
    toast?.('Informe enviado e incidencia resuelta. De momento no sale hacia Remedy (falta conectar SIGLO).');
  } });

  // Escalar: el catálogo y los tickets abiertos son de prueba (escalate-mock.js).
  // Lo escrito se guarda por issue hasta escalar o unir (escDrafts).
  const escDrafts = createEscalateDrafts();
  const escalateModal = () => escalateForm({ issue, dests: DESTINATIONS, open: OPEN_TICKETS, v: escDrafts.get(opened) || {} });
  const refreshEscalate = (form) => {
    const v = Object.fromEntries(new FormData(form));
    escDrafts.save(opened, v);
    const live = escalateLive(v, { issue, dests: DESTINATIONS });
    for (const [k, html] of Object.entries(live.html)) form.querySelector(`[data-esc-live="${k}"]`).innerHTML = html;
    for (const k of ['other', 'jira', 'dev']) form.querySelector(`[data-esc-when="${k}"]`).hidden = !live.show[k];
    const link = v.mode === 'link';
    form.querySelector('[data-esc-mode="escalate"]').hidden = link;
    form.querySelector('[data-esc-mode="link"]').hidden = !link;
    form.querySelector('.iss-esc-hint')?.toggleAttribute('hidden', link);
    form.querySelector('[data-esc-ok]').textContent = link ? 'Unir al ticket' : 'Escalar';
  };
  root.addEventListener('input', (e) => { const form = e.target.closest('[data-act-form="escalate"]'); if (form) refreshEscalate(form); });
  // Escribir en «Otro ticket» o pulsar «Unirla a…» elige esa opción sin buscar el radio.
  root.addEventListener('focusin', (e) => { if (e.target.name === 'linkedOther') e.target.closest('label').querySelector('[name="linked"]').checked = true; });
  root.addEventListener('click', (e) => {
    const use = e.target.closest('[data-esc-use-link]');
    if (!use) return;
    const form = use.closest('form');
    form.querySelector('[name="mode"][value="link"]').checked = true;
    refreshEscalate(form);
  });

  const openAction = async (key) => {
    closeAction();
    if (key === 'resolve') return resolver.open(opened, issue?.link || null, closeAction);
    // traspasar: solo a quien tiene el conocimiento de su origen (SGA, SISU)
    if (key === 'transfer') people = (await api.teammates()).filter((p) => knowsOrigin(p.groups, issue));
    const empty = key === 'transfer' ? `Nadie más tiene el conocimiento de ${originOf(issue)}` : '';
    // la llamada: su ventana (call.js), con el teléfono de la última llamada o el de contacto del centro
    const suggested = key === 'call' ? suggestedPhone(notes.entries(), issue?.notes) : null;
    const modal = key === 'escalate' ? escalateModal()
      : key === 'call' ? callForm(opened, suggested)
      : key === 'transfer' ? transferForm(opened, { people, empty, teams: TEAMS })
      : actionForm(key, opened);
    root.insertAdjacentHTML('beforeend', `<div class="iss-modal">${modal}</div>`);
    const first = key === 'escalate' ? '#iss-f-dest' : key === 'call' ? (suggested.phone ? '#iss-f-comment' : '#iss-f-phone') : '.iss-act-form textarea, .iss-act-form input:not([type=hidden]), .iss-act-form select';
    root.querySelector(first)?.focus();
    // Escape: con la lista del selector abierta la cierra; si no, cierra el modal
    offEscape = onEscape(() => (openPicker(root) ? closePickers(root) : closeAction()));
  };
  // Traspasar: «A un compañero» o «A otro equipo» cambia el formulario en el sitio; el motivo se queda.
  const switchTransfer = (form, mode) => {
    closePickers(root);
    form.elements.mode.value = mode;
    form.querySelectorAll('[data-transfer-mode]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.transferMode === mode)));
    form.querySelectorAll('[data-transfer-pane]').forEach((p) => { p.hidden = p.dataset.transferPane !== mode; });
    form.querySelector('.iss-act-err').hidden = true;
    syncSubmit(form);
  };
  // El botón de enviar, apagado hasta que estén todos los campos obligatorios.
  // Resolver (por pasos) y Escalar (no bloquea) llevan su propia validación: aquí, los demás.
  // La llamada lleva dos: «Guardar llamada» (teléfono y lo hablado) y «No responden» (solo el teléfono).
  const syncSubmit = (form) => {
    const key = form.dataset.actForm;
    if (['resolve', 'escalate'].includes(key)) return;
    const values = Object.fromEntries(new FormData(form));
    if (key === 'call') {
      const ready = callReady(values);
      form.querySelector('[value="answered"]').disabled = !ready.answered;
      form.querySelector('[value="noanswer"]').disabled = !ready.noAnswer;
      return;
    }
    if (key === 'transfer') { form.querySelector('[type=submit]').disabled = !!readTransfer(values, TEAMS).missing; return; }
    form.querySelector('[type=submit]').disabled = !isComplete(key, values);
  };
  root.addEventListener('input', (e) => {
    const form = e.target.closest('[data-act-form]');
    if (form) syncSubmit(form);
  });
  root.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-act-form]');
    if (!form) return;
    e.preventDefault();
    const key = form.dataset.actForm;
    if (key === 'resolve') return;   // lo atiende resolve-view.js
    if (key === 'call') return saveCall(form, e.submitter?.value === 'answered');
    if (key === 'transfer') return saveTransfer(form);
    const raw = Object.fromEntries(new FormData(form));
    const { missing, values } = key === 'escalate' ? readEscalate(raw, DESTINATIONS) : readAction(key, raw);
    const err = form.querySelector('.iss-act-err');
    const fail = (text) => { err.textContent = text; err.hidden = false; form.querySelector('[type=submit]').disabled = false; };
    if (missing) return fail(`Falta: ${missing}.`);
    if (key === 'escalate') {
      const rootCause = issue.status === 'RESOLVED';
      escDrafts.drop(opened);   // escalada o unida: ya no hay nada pendiente
      closeAction();
      return toast?.(values.mode === 'link'
        ? `Unida a ${values.ticket}: pasa a Pendiente (proveedor), sin otro escalado. Aún no se envía a Remedy.`
        : `Escalada a ${values.destName}: ${rootCause ? 'queda registrada la causa raíz y sigue Resuelta' : 'pasa a Pendiente (proveedor) y se avisa al centro'}.${values.todo.length ? ` Añádele ${values.todo.join(' y ')} en Seguimiento.` : ''} Aún no se envía a Remedy.`);
    }
    form.querySelector('[type=submit]').disabled = true;
    try {
      // contactar con el centro: nota pública en Seguimiento; lo que hará con SIGLO, en el aviso
      if (key === 'contact') {
        const note = contactNote(values.message);
        await api.addNote(opened, note.body, { visibility: note.visibility });
        closeAction();
        await notes.refresh();
        return toast?.('Mensaje al centro en Seguimiento. Cuando conectemos SIGLO, le llegará y la issue pasará a Pendiente (cliente).');
      }
      // lo que queda: reclamar respuesta, que se anota en Seguimiento
      await api.addNote(opened, chaseNote(issue, values.message));
      closeAction();
      await notes.refresh();
      toast?.(`Reclamación ${chaseTarget(issue)} anotada en Seguimiento. Aún no le llega: irá por SIGLO cuando lo conectemos.`);
    } catch (e2) { fail(e2.message); }
  });
  // Traspasar: a un compañero, la base la mueve y se vuelve a la mesa; a otro equipo, queda como
  // nota interna en Seguimiento hasta que SIGLO la lleve a Remedy (los equipos son de prueba).
  const saveTransfer = async (form) => {
    const { missing, values } = readTransfer(Object.fromEntries(new FormData(form)), TEAMS);
    const err = form.querySelector('.iss-act-err');
    const btn = form.querySelector('[type=submit]');
    const fail = (text) => { err.textContent = text; err.hidden = false; btn.disabled = false; };
    if (missing) return fail(`Falta: ${missing}.`);
    btn.disabled = true;
    try {
      if (values.mode === 'person') {
        const who = people.find((p) => p.id === values.to)?.name || 'un compañero';
        await api.transfer(opened, values.to, values.comment);
        closeAction();
        await loadDesk();
        return toast?.(`Traspasada a ${who}.`);
      }
      await api.addNote(opened, transferNote(values));
      closeAction();
      await notes.refresh();
      toast?.(`Traspaso a ${values.teamName} anotado en Seguimiento. Aún no llega a Remedy: irá por SIGLO cuando lo conectemos.`);
    } catch (e2) { fail(e2.message); }
  };
  // Registrar la llamada: una nota interna con su etiqueta de llamada (call.js), que Seguimiento pinta como un hito.
  const saveCall = async (form, answered) => {
    const values = Object.fromEntries(new FormData(form));
    const ready = callReady(values);
    const err = form.querySelector('.iss-act-err');
    const buttons = [...form.querySelectorAll('[type=submit]')];
    const fail = (text) => { err.textContent = text; err.hidden = false; syncSubmit(form); };
    if (!ready.noAnswer) return fail('Falta: el teléfono, con al menos cinco cifras.');
    if (answered && !ready.answered) return fail('Falta: lo que se habló.');
    buttons.forEach((b) => { b.disabled = true; });
    try {
      const note = callNote({ ...values, answered });
      await api.addNote(opened, note.body, { visibility: note.visibility, tag: note.tag });
      closeAction();
      await notes.refresh();
      toast?.(`${answered ? 'Llamada registrada' : 'Intento de llamada registrado'} en Seguimiento. Aún no llega a Remedy: irá por SIGLO cuando lo conectemos.`);
    } catch (e2) { fail(e2.message); }
  };
  const upload = async (file) => {
    if (!file) return;
    loading = true;
    renderDesk();
    try {
      const { meta } = await api.upload(file);
      toast?.(`Foto cargada: ${meta.issues} issues.`);
    } catch (e) {
      failed(e.message);
    }
    loading = false;
    await loadDesk();
  };

  root.addEventListener('change', (e) => {
    const form = e.target.closest('[data-act-form]');
    if (form) return syncSubmit(form);
    if (e.target.matches('[data-csv]')) { picking = false; upload(e.target.files[0]); }
  });
  const picked = () => { picking = false; };
  window.addEventListener('focus', picked);

  // Refresco: solo con la mesa a la vista (no mientras se trabaja una issue).
  const refresher = setInterval(() => {
    if (root.hidden || document.visibilityState !== 'visible') return;
    refreshQuietly();
  }, REFRESH_MS);

  return {
    show: () => showDesk().catch((err) => { root.innerHTML = `<div class="iss-page"><p class="iss-empty">No se pudieron cargar las issues: ${esc(err.message)}</p></div>`; }),
    dispose: () => { resolver.dispose(); notes.dispose(); incoming.dispose(); clearInterval(refresher); window.removeEventListener('focus', picked); closeChat(); },
  };
};
