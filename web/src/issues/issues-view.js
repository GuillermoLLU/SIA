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
import { workScreen, trailHtml, trailTab, releaseDialogHtml, sendsNote, noteEditorHtml } from './work-screen.js';
import { ACTIONS, actionForm, readAction, isComplete, chaseNote, chaseTarget } from './actions.js';
import { createResolver } from './resolve-view.js';
import { mountChipDrag } from './chip-drag.js';
import { knowsOrigin, originOf } from './origin.js';
import { crossfade } from '../ui/crossfade.js';
import { mountTips } from './tip.js';
import { createEscalator } from './escalate-view.js';
import { DESTINATIONS, OPEN_TICKETS } from './escalate-mock.js';

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
    root.innerHTML = workScreen({ issue: i, sameCenter, timeline, now, mine, meId: me?.id, tab: workTab });
    animateEnter(root.querySelector('.iss-work-page'), 'iss-opening', ISSUE_ENTER_MS);
    if (workTab === 'trail') scrollTrailToStart();
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
    if (!onDesk || picking || openPicker(root)) return;
    api.desk().then((d) => {
      if (!onDesk || picking || openPicker(root)) return;
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

  // El histórico va con lo más reciente arriba: al enseñarlo, arriba del todo.
  const scrollTrailToStart = () => { const box = root.querySelector('[data-trail]'); if (box) box.scrollTop = 0; };
  // Las pestañas de la pantalla de trabajo.
  const showTab = (key) => {
    workTab = key;
    root.querySelectorAll('[data-wtab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.wtab === key)));
    root.querySelectorAll('[data-wpanel]').forEach((p) => { p.hidden = p.dataset.wpanel !== key; });
    if (key === 'trail') scrollTrailToStart();
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

  root.addEventListener('click', async (e) => {
    const t = e.target;
    if (pickClick(root, t)) return;
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
      const act = t.closest('[data-act]');
      if (act) {
        if (act.disabled) return;   // un segundo clic mientras se abre: un solo modal
        act.disabled = true;
        try { return await openAction(act.dataset.act); } finally { act.disabled = false; }
      }
      if (t.closest('[data-act-cancel]') || (t.classList.contains('iss-modal') && !pressedInModal())) return closeAction();
      const ed = t.closest('[data-edit-note]');
      if (ed) return openNoteEditor(ed.dataset.editNote);
      if (t.closest('[data-edit-cancel]')) return refreshTrail();
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
  const closeAction = () => { resolver.close(); escalator.close(); root.querySelector('.iss-modal')?.remove(); offEscape?.(); offEscape = null; };
  // Resolver vive en su módulo (resolve-view.js); al resolver, la ventana ya se ha ido y la mesa se pone al día con un cruce.
  // Las fichas [imagenN] se mueven igual en los editores de Resolver y de Escalar (chip-drag.js).
  const chipDrag = mountChipDrag(root);
  const resolver = createResolver(root, { api, dialogs, toast, onResolved: async () => {
    const fresh = await api.desk().catch(() => null);
    closeAction();
    crossfade(() => { if (fresh) { data = fresh; now = new Date(); } renderDesk(); root.scrollTop = 0; });
    toast?.('Informe enviado e incidencia resuelta. De momento no sale hacia Remedy (falta conectar SIGLO).');
  } });

  // Escalar vive en su módulo (escalate-view.js), con el catálogo y los tickets abiertos de prueba
  // (escalate-mock.js). Al cerrar tras escalar, la incidencia ya está tratada: se vuelve a la mesa, como
  // al resolver (aún no sale hacia Remedy, así que la mesa no cambia).
  const escalator = createEscalator(root, { api, dialogs, toast, dests: DESTINATIONS, tickets: OPEN_TICKETS, onEscalated: async (target, mode) => {
    const rootCause = issue?.status === 'RESOLVED';
    const fresh = await api.desk().catch(() => null);
    closeAction();
    crossfade(() => { if (fresh) { data = fresh; now = new Date(); } renderDesk(); root.scrollTop = 0; });
    toast?.(`${mode === 'link' ? `Unida a ${target}` : `Escalada a ${target}${rootCause ? ' por la causa raíz' : ''}`}. De momento no sale hacia Remedy (falta conectar SIGLO).`);
  } });

  const openAction = async (key) => {
    closeAction();
    if (key === 'resolve') return resolver.open(opened, issue?.link || null, closeAction);
    // Escape: con la lista del selector abierta la cierra; si no, cierra la ventana
    if (key === 'escalate') return escalator.open(issue, issue?.link || null, () => (openPicker(root) ? closePickers(root) : closeAction()));
    // traspasar: solo a quien tiene el conocimiento de su origen (SGA, SISU)
    if (key === 'transfer') people = (await api.teammates()).filter((p) => knowsOrigin(p.groups, issue));
    const empty = key === 'transfer' ? `Nadie más tiene el conocimiento de ${originOf(issue)}` : '';
    root.insertAdjacentHTML('beforeend', `<div class="iss-modal">${actionForm(key, opened, people, empty)}</div>`);
    root.querySelector('.iss-act-form textarea, .iss-act-form input:not([type=hidden]), .iss-act-form select')?.focus();
    // Escape: con la lista del selector abierta la cierra; si no, cierra el modal
    offEscape = onEscape(() => (openPicker(root) ? closePickers(root) : closeAction()));
  };
  // Tras añadir una nota, el histórico se repinta en su sitio.
  const refreshTrail = async () => {
    const items = await api.timeline(opened);
    const box = root.querySelector('[data-trail]');
    if (box) box.innerHTML = trailHtml(items, new Date(), me?.id);
    scrollTrailToStart();
    const tab = root.querySelector('[data-wtab="trail"]');
    if (tab) tab.innerHTML = trailTab(items.length);
  };
  // El botón de enviar, apagado hasta que estén todos los campos obligatorios.
  // Resolver y Escalar (por pasos) llevan su propia validación: aquí, los demás.
  const syncSubmit = (form) => { if (['resolve', 'escalate'].includes(form.dataset.actForm)) return; form.querySelector('[type=submit]').disabled = !isComplete(form.dataset.actForm, Object.fromEntries(new FormData(form))); };
  root.addEventListener('input', (e) => {
    const form = e.target.closest('[data-act-form]');
    if (form) return syncSubmit(form);
    const nf = e.target.closest('[data-note-form]');
    if (nf) nf.querySelector('[type=submit]').disabled = !nf.note.value.trim();
  });
  // Editar una nota propia: el editor ocupa el sitio del texto; Guardar manda
  // el cambio y se repinta el histórico; Cancelar o Escape lo deja como estaba.
  const openNoteEditor = (noteId) => {
    const item = root.querySelector(`[data-entry="${noteId}"]`);
    const text = item?.querySelector('[data-note-text]');
    if (!text) return;
    text.outerHTML = noteEditorHtml(text.textContent);
    const ta = item.querySelector('[data-note-edit] textarea');
    ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
  };
  const saveNote = async (form) => {
    const body = form.note.value.trim();
    if (!body) return;
    const noteId = Number(form.closest('[data-entry]').dataset.entry);
    form.querySelector('[type=submit]').disabled = true;
    try { await api.editNote(opened, noteId, body); await refreshTrail(); toast?.('Nota editada.'); }
    catch (err) { toast?.(err.message); form.querySelector('[type=submit]').disabled = false; }
  };
  // La nota interna, desde el pie del histórico: se guarda, se repinta y se
  // baja hasta ella.
  const sendNote = async (form) => {
    const text = form.note.value.trim();
    if (!text) return;
    const btn = form.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      await api.addNote(opened, text);
      form.note.value = '';
      await refreshTrail();
      toast?.('Nota añadida.');
    } catch (err) { toast?.(err.message); btn.disabled = false; }
  };
  root.addEventListener('keydown', (e) => {
    if (e.target.matches('[data-note-edit] textarea')) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return refreshTrail(); }
      if (sendsNote(e)) { e.preventDefault(); return saveNote(e.target.closest('[data-note-edit]')); }
      return;
    }
    if (!e.target.matches('[data-note-form] textarea') || !sendsNote(e)) return;
    e.preventDefault();
    sendNote(e.target.closest('[data-note-form]'));
  });
  root.addEventListener('submit', async (e) => {
    const ne = e.target.closest('[data-note-edit]');
    if (ne) { e.preventDefault(); return saveNote(ne); }
    const nf = e.target.closest('[data-note-form]');
    if (nf) { e.preventDefault(); return sendNote(nf); }
    const form = e.target.closest('[data-act-form]');
    if (!form) return;
    e.preventDefault();
    const key = form.dataset.actForm;
    if (key === 'resolve' || key === 'escalate') return;   // lo atienden resolve-view.js y escalate-view.js
    const raw = Object.fromEntries(new FormData(form));
    const { missing, values } = readAction(key, raw);
    const err = form.querySelector('.iss-act-err');
    const fail = (text) => { err.textContent = text; err.hidden = false; form.querySelector('[type=submit]').disabled = false; };
    if (missing) return fail(`Falta: ${missing}.`);
    form.querySelector('[type=submit]').disabled = true;
    try {
      if (key === 'transfer') {
        const who = people.find((p) => p.id === values.to)?.name || 'un compañero';
        await api.transfer(opened, values.to, values.comment);
        closeAction();
        await loadDesk();
        return toast?.(`Traspasada a ${who}.`);
      }
      if (key === 'chase') {
        await api.addNote(opened, chaseNote(issue, values.message));
        closeAction();
        await refreshTrail();
        return toast?.(`Reclamación ${chaseTarget(issue)} anotada en el histórico. Aún no le llega: irá por SIGLO cuando lo conectemos.`);
      }
      closeAction();
      toast?.(`${ACTIONS[key].label}: preparado, pero aún no se envía a Remedy (falta conectar SIGLO).`);
    } catch (e2) { fail(e2.message); }
  });
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
    dispose: () => { resolver.dispose(); escalator.close(); chipDrag.dispose(); clearInterval(refresher); window.removeEventListener('focus', picked); closeChat(); },
  };
};
