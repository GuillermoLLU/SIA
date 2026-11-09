// Vista «Issues»: la mesa de cada persona. Arriba, lo inmediato: la
// siguiente que le toca (la elige la regla; la cola de la base evita que dos
// cojan la misma) y su día. En medio, su histórico medido en SIA (se llena
// con el uso). Abajo, el seguimiento de lo suyo. Al abrir una, la pantalla de
// trabajo (work-screen.js). La mesa se refresca sola.
import './issues.css';
import { esc } from '../ui/html.js';
import { LISTS, snapshotInfo, age, weekBars } from './format.js';
import { sev, origin, item } from './parts.js';
import { onEscape } from '../ui/dialog.js';
import { pickClick, openPicker, closePickers } from '../ui/picker.js';
import { workScreen, trailHtml, trailTab, releaseDialogHtml, sendsNote, noteEditorHtml } from './work-screen.js';
import { ACTIONS, actionForm, readAction, isComplete } from './actions.js';
import { resolveForm, resolveReview, resumeStep, stepMissing, STEPS, MAX_FILE, fileBox, localShort } from './resolve-form.js';
import { readEscalate, createEscalateDrafts } from './escalate.js';
import { escalateForm, escalateLive } from './escalate-form.js';
import { DESTINATIONS, OPEN_TICKETS } from './escalate-mock.js';

const GOAL = { min: 15, max: 20 }; // resueltas por turno, lo que dice el equipo
const REFRESH_MS = 15000;

// openChat(host, issue) → { dispose }: el chat de la issue (lo pone main.js).
// dialogs: los diálogos de la app (ui/dialog.js), para confirmar antes de devolver.
export const mountIssuesView = (root, { api, me, toast, openChat, dialogs }) => {
  const failed = (text) => (toast?.error || toast)?.(text);   // lo que falla, en rojo
  let data = null, rule = 'basic', now = new Date(), opened = null, onDesk = false, workTab = 'detail', chat = null, loading = false, picking = false;
  let attached = null; // Resolver: el adjunto guardado en el borrador abierto ({ name, type, size })
  let issue = null; // la issue abierta: Escalar mira su criticidad, su estado y su ticket
  const closeChat = () => { chat?.dispose(); chat = null; };

  // Cargar la foto (el CSV de la consulta de Remedy, hasta leer de Remedy).
  const loadButton = (label) => `<label class="iss-load ${loading ? 'iss-busy' : ''}">${loading ? 'Cargando…' : label}<input type="file" accept=".csv,text/csv" data-csv hidden ${loading ? 'disabled' : ''}></label>`;

  const kpi = (label, value, hint) => `<div class="iss-kpi"><span>${label}</span><b>${value}</b><small>${hint}</small></div>`;

  // Cogidas por semana (SGA / SISU), lo medido en SIA.
  const weeksChart = (weeks) => `<div class="iss-bars" role="img" aria-label="Incidencias cogidas por semana, últimas ${weeks.length} semanas">
      ${weekBars(weeks).map(({ week, sga, sisu, total, sgaPct, sisuPct }) => `<div class="iss-bar" title="Semana del ${week.slice(8)}/${week.slice(5, 7)}: ${total} (SGA ${sga}, SISU ${sisu})">
          <small>${total || ''}</small><i class="sisu" style="height:${sisuPct}%"></i><i style="height:${sgaPct}%"></i><span>${+week.slice(8)}/${+week.slice(5, 7)}</span></div>`).join('')}
    </div>`;

  const renderDesk = () => {
    closeChat();
    onDesk = true;
    if (!data.taken) {
      root.innerHTML = `<div class="iss-page"><h2 class="iss-title">Incidencias</h2>
        <div class="iss-none"><b>Aún no hay incidencias</b><span>De momento se cargan con el CSV de la consulta de Remedy (vale el mismo que el de Métricas); cuando SIA lea de Remedy, saldrán de ahí.</span>${loadButton('Cargar CSV')}</div></div>`;
      return;
    }
    const { today, history, next } = data;
    const lists = LISTS.map((l) => ({ ...l, items: data.desk.filter(l.test).sort(l.sort) }));
    const count = (key) => lists.find((l) => l.key === key).items.length;
    const used = history.weeks.some((w) => w.sga + w.sisu);
    root.innerHTML = `<div class="iss-page">
      <header class="iss-top"><h2 class="iss-title">Hola, ${esc((me?.name || '').split(' ')[0] || 'equipo')}</h2>${(({ text, stale }) => `<span class="iss-snap${stale ? ' stale' : ''}" ${stale ? 'title="La foto de Remedy no es de hoy: carga un CSV nuevo para ponerla al día. Lo medido en SIA sí es de hoy."' : ''}>${text}${stale ? ' · sin actualizar' : ''}</span>`)(snapshotInfo(data.taken, now))}${loadButton('Cargar otro CSV')}</header>

      <div class="iss-row1">
        <section class="iss-card iss-next">
          <h3>La siguiente que te toca</h3>
          ${next ? `<div class="iss-preview">
              <span class="iss-line">${sev(next.priority)}<span class="iss-code">${esc(next.center || '—')}</span>${origin(next)}${next.prio ? '<span class="iss-prio">Priorizada por negocio</span>' : ''}<span class="iss-when">hace ${age(next.reported, now)}</span></span>
              <p>${esc(next.text)}</p>
            </div>` : '<p class="iss-empty">No queda ninguna sin coger.</p>'}
          <div class="iss-go">
            <button class="iss-take" data-take ${next ? '' : 'disabled'}>Coger la siguiente</button>
            <label class="iss-rule">Regla <select data-rule>${data.rules.map((r) => `<option value="${esc(r.id)}"${r.id === rule ? ' selected' : ''}>${esc(r.label)}</option>`).join('')}</select></label>
            <span class="iss-queue">${data.free} sin coger en la cola</span>
          </div>
        </section>
        <section class="iss-card iss-today">
          <h3>Hoy</h3>
          <div class="iss-big"><b>${today.resolved}</b><span>resueltas · objetivo ${GOAL.min}–${GOAL.max}<br>${today.sga} de SGA · ${today.sisu} de SISU</span></div>
          <div class="iss-progress" role="img" aria-label="${today.resolved} de ${GOAL.max}"><i style="width:${Math.min(100, today.resolved / GOAL.max * 100)}%"></i><em style="left:${GOAL.min / GOAL.max * 100}%"></em></div>
          <dl><dt>Cogidas en SIA</dt><dd>${history.claimedToday}</dd><dt>En curso</dt><dd>${count('doing')}</dd><dt>Pendientes de terceros</dt><dd>${count('waiting')}</dd></dl>
        </section>
      </div>

      <div class="iss-row2">
        <section class="iss-card">
          <div class="iss-card-h"><h3>Mi histórico en SIA · cogidas por semana</h3><span class="iss-legend"><i></i>SGA <i class="sisu"></i>SISU</span></div>
          ${weeksChart(history.weeks)}
          <p class="iss-foot">${used ? 'Medido con el uso de SIA.' : 'Se irá llenando con el uso de SIA: cada incidencia que cojas cuenta.'} Las resueltas se sumarán cuando se resuelva desde SIA.</p>
        </section>
        <div class="iss-kpis">
          ${kpi('Cogidas por semana', history.perWeek, `media de las últimas ${history.weeks.length} semanas`)}
          ${kpi('Cogidas a tiempo', history.onTimePct == null ? '—' : `${history.onTimePct} %`, 'críticas en 15 min, altas en 2 h')}
          ${kpi('Tiempo típico de resolución', '—', 'cuando se resuelva desde SIA')}
        </div>
      </div>

      <div class="iss-cols">
        ${lists.map((l) => `<section class="iss-card iss-col">
          <div class="iss-card-h"><h3>${l.label}</h3><span>${l.items.length}</span></div>
          <div class="iss-items">${l.items.slice(0, 12).map((i) => item(i, l.key, now)).join('') || `<p class="iss-empty">${l.empty}</p>`}</div>
        </section>`).join('')}
      </div>
    </div>`;
  };

  const renderIssue = ({ issue: i, sameCenter, timeline }) => {
    onDesk = false;
    const mine = i.claimedBy && data?.desk.some((d) => d.id === i.id && d.claimed);
    if (opened !== i.id) workTab = 'detail';
    opened = i.id;
    issue = i;
    closeChat();
    closeAction();
    now = new Date(); // el histórico y las edades, a la hora de abrirla
    root.innerHTML = workScreen({ issue: i, sameCenter, timeline, now, mine, meId: me?.id, tab: workTab });
    if (workTab === 'trail') scrollTrailToStart();
    chat = openChat?.(root.querySelector('.iss-chat-body'), i) || null;
    root.scrollTop = 0;
  };

  const loadDesk = async () => {
    data = await api.desk();
    now = new Date();
    renderDesk();
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
  root.addEventListener('click', async (e) => {
    const t = e.target;
    if (pickClick(root, t, (pick) => syncSubmit(pick.closest('[data-act-form]')))) return;
    // con el diálogo de elegir fichero abierto no se repinta la mesa: el
    // cambio llegaría a un input que ya no está en la página
    if (t.matches('[data-csv]')) { picking = true; return; }
    try {
      const take = t.closest('[data-take]');
      if (take) {
        take.disabled = true;
        const seen = data.next?.id;
        const { id } = await api.next(rule);
        await loadDesk();
        if (!id) return toast?.('No queda ninguna sin coger.');
        if (seen && id !== seen) toast?.('La que veías ya la había cogido otra persona: te toca la siguiente.');
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
      if (t.closest('[data-act-cancel]') || t.classList.contains('iss-modal')) return closeAction();
      if (t.closest('[data-step-next]')) return stepNext(t.closest('form'));
      if (t.closest('[data-step-back]')) { const form = t.closest('form'); return moveTo(form, Number(form.dataset.step) - 1); }
      if (t.closest('[data-file-clear]')) return setFile(t.closest('form'), null);
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
  const closeAction = () => { flushSave(); root.querySelector('.iss-modal')?.remove(); offEscape?.(); offEscape = null; };

  // Resolver: los tres pasos. No se sale de uno sin lo obligatorio; el 3 se
  // pinta con lo escrito, como se va a enviar.
  const showErr = (form, text) => { const err = form.querySelector('.iss-act-err'); err.textContent = text || ''; err.hidden = !text; };
  const goStep = (form, n) => {
    form.dataset.step = String(n);
    form.elements.step.value = String(n);   // va en el borrador: al volver se retoma aquí
    showErr(form, null);
    form.querySelectorAll('[data-rstep]').forEach((p) => { p.hidden = p.dataset.rstep !== String(n); });
    form.querySelectorAll('[data-step-mark]').forEach((m) => {
      const k = Number(m.dataset.stepMark);
      m.classList.toggle('done', k < n);
      if (k === n) m.setAttribute('aria-current', 'step'); else m.removeAttribute('aria-current');
    });
    const last = n === STEPS.length;
    // «¿Cómo se resolvió?» empieza con la nota interna recién escrita, si aún está vacío
    const how = form.elements.how;
    if (n === 2 && !how.value.trim()) how.value = form.elements.note?.value || '';
    if (last) {
      const { values } = readAction('resolve', Object.fromEntries(new FormData(form)));
      form.querySelector('[data-rstep="3"]').innerHTML = resolveReview(values, attached, { lang: form.elements.lang.value, hour: new Date().getHours() });
    }
    form.querySelector('[data-act-cancel]').hidden = n !== 1;
    form.querySelector('[data-step-back]').hidden = n === 1;
    const next = form.querySelector('[data-step-next]');
    next.hidden = last;
    next.textContent = `Siguiente: ${STEPS[n]?.title.toLowerCase() ?? ''}`;
    form.querySelector('[data-confirm-send]').hidden = !last;
    (last ? form.querySelector('[data-confirm-send]') : form.querySelector(`[data-rstep="${n}"] textarea`))?.focus();
  };
  const stepNext = async (form) => {
    const n = Number(form.dataset.step);
    const missing = stepMissing(n, Object.fromEntries(new FormData(form)));
    if (missing) {
      showErr(form, `Falta: ${missing}`);
      return [...form.querySelectorAll(`[data-rstep="${n}"] textarea`)].find((a) => !a.value.trim())?.focus();
    }
    if (n + 1 === STEPS.length) await saving;   // la revisión enseña el adjunto aunque aún se estuviera guardando
    if (form.isConnected) moveTo(form, n + 1);
  };
  // Cambiar de paso guarda el borrador, aunque no se haya escrito nada más.
  const moveTo = (form, n) => { goStep(form, n); saveNow(form); };
  // El adjunto (uno): se guarda en el borrador en cuanto se elige o se suelta.
  const base64 = (file) => new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] || '');
    r.onerror = () => ko(r.error);
    r.readAsDataURL(file);
  });
  // Todo lo que escribe en el borrador (el texto y el adjunto) va en una sola
  // cola, `saving`. Lo que lo lee o lo borra (abrir, revisar, confirmar,
  // descartar) espera a que acabe: si no, un guardado tardío traería un estado
  // viejo o volvería a crear el borrador ya borrado. Cada trabajo guarda el id
  // de su issue, por si mientras tanto se abre otra.
  let autosave = null, saving = Promise.resolve();
  const enqueue = (job) => (saving = saving.then(job).catch(() => {}));
  const setFile = (form, file) => {
    if (file && file.size > MAX_FILE) return showErr(form, 'El adjunto pasa de 15 MB: elige otro más pequeño.');   // el mismo texto que el bridge
    if (file && !file.size) return showErr(form, 'El archivo está vacío (o es una carpeta): elige otro.');
    showErr(form, null);
    const id = opened, box = form.querySelector('[data-file-box]');
    box.innerHTML = '<p class="iss-file-on">Guardando…</p>';
    return enqueue(async () => {
      let got = null;
      try { got = file ? await api.saveDraftFile(id, { name: file.name, type: file.type, data: await base64(file) }) : await api.dropDraftFile(id); }
      catch (e) { showErr(form, `No se ha podido guardar el adjunto: ${e.message}`); }
      if (!form.isConnected) return;   // el modal ya se cerró: no se toca el de otra issue
      if (got) {
        attached = got.file || null;
        form.querySelector('[data-autosave]').textContent = `Borrador guardado ${localShort(got.at)}`;
      }
      box.innerHTML = fileBox(attached);
    });
  };
  // Lo escrito se guarda solo, un momento después de dejar de teclear, y al cerrar.
  const saveNow = (form) => {
    const label = form.querySelector('[data-autosave]');
    const id = opened, fields = Object.fromEntries(new FormData(form));
    return enqueue(() => api.saveDraft(id, fields)
      .then(({ at }) => { label.textContent = `Borrador guardado ${localShort(at)}`; })
      .catch((e) => { label.textContent = `No se ha podido guardar el borrador: ${e.message}`; }));
  };
  const flushSave = () => {
    if (!autosave) return;
    clearTimeout(autosave); autosave = null;
    const form = root.querySelector('[data-act-form="resolve"]');
    if (form) saveNow(form);
  };
  root.addEventListener('input', (e) => {
    const form = e.target.closest('[data-act-form="resolve"]');
    if (!form || e.target.matches('[data-file]')) return;   // el adjunto se guarda aparte (setFile)
    showErr(form, null);   // lo que faltaba ya se está escribiendo
    clearTimeout(autosave);
    autosave = setTimeout(() => { autosave = null; saveNow(form); }, 800);
  });
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
    if (key === 'transfer') people = await api.teammates();
    // Resolver: lo que hay en Remedy, lo que falta y mi borrador los da el
    // bridge, que también dice si se puede (mía, en la foto y aún abierta)
    let start = null;
    if (key === 'resolve') {
      await saving;   // lo que se guardaba al cerrar, antes de leer el borrador
      start = await api.startResolve(opened);
      attached = start.draft?.file || null;
    }
    const form = key === 'resolve' ? resolveForm(opened, start.check, start.draft) : key === 'escalate' ? escalateModal() : actionForm(key, opened, people);
    root.insertAdjacentHTML('beforeend', `<div class="iss-modal">${form}</div>`);
    root.querySelector(key === 'escalate' ? '#iss-f-dest' : '.iss-act-form textarea, .iss-act-form input:not([type=hidden]), .iss-act-form select')?.focus();
    // Resolver se retoma en el paso en el que se quedó (también enfoca lo suyo)
    const resume = key === 'resolve' ? resumeStep(start.check, start.draft) : 1;
    if (resume > 1) goStep(root.querySelector('[data-act-form="resolve"]'), resume);
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
  // Resolver (por pasos) y Escalar (no bloquea) llevan su propia validación: aquí, los demás.
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
    if (key === 'resolve' && Number(form.dataset.step) < STEPS.length) return stepNext(form);
    const raw = Object.fromEntries(new FormData(form));
    const { missing, values } = key === 'escalate' ? readEscalate(raw, DESTINATIONS) : readAction(key, raw);
    const err = form.querySelector('.iss-act-err');
    const fail = (text) => { err.textContent = text; err.hidden = false; form.querySelector('[type=submit]').disabled = false; };
    if (missing) return fail(`Falta: ${missing}.`);
    // Resolver solo se envía desde el último paso, ya revisado. El bridge lo
    // vuelve a comprobar todo y, si cumple, borra el borrador.
    if (key === 'resolve') {
      const send = form.querySelector('[data-confirm-send]');
      if (send.disabled) return;   // un segundo clic mientras se envía
      send.disabled = true;
      // la issue y lo escrito de ESTE formulario, aunque mientras se abra otra
      const id = opened, fields = Object.fromEntries(new FormData(form));
      // lo último escrito, guardado antes: si el bridge lo rechaza, no se pierde
      if (autosave) { clearTimeout(autosave); autosave = null; saveNow(form); }
      try {
        await saving;
        await api.resolve(id, fields);
      } catch (err) { send.disabled = false; return showErr(form, err.message); }
      if (form.isConnected) closeAction();   // si ya se cerró, no se cierra el de otra issue
      return toast?.('Resolver: comprobado, pero aún no se envía a Remedy (falta conectar SIGLO).');
    }
    if (key === 'escalate') {
      const rootCause = issue.status === 'RESOLVED';
      escDrafts.drop(opened);   // escalada o unida: ya no hay nada pendiente
      closeAction();
      return toast?.(values.mode === 'link'
        ? `Unida a ${values.ticket}: pasa a Pendiente (proveedor), sin otro escalado. Aún no se envía a Remedy.`
        : `Escalada a ${values.destName}: ${rootCause ? 'queda registrada la causa raíz y sigue Resuelta' : 'pasa a Pendiente (proveedor) y se avisa al centro'}.${values.todo.length ? ` Añádele ${values.todo.join(' y ')} en «Notas internas».` : ''} Aún no se envía a Remedy.`);
    }
    form.querySelector('[type=submit]').disabled = true;
    try {
      if (key === 'transfer') {
        const who = people.find((p) => p.id === values.to)?.name || 'un compañero';
        await api.transfer(opened, values.to, values.comment);
        closeAction();
        await loadDesk();
        return toast?.(`Traspasada a ${who}.`);
      }
      closeAction();
      toast?.(`${ACTIONS[key].label}: preparado, pero aún no se envía a Remedy (falta conectar SIGLO).`);
    } catch (e2) { fail(e2.message); }
  });
  // Soltar el adjunto en cualquier parte del modal de Resolver, en el paso del
  // mensaje al centro, que es el que lo lleva. Fuera de ahí no pasa nada: el
  // navegador no abre ni descarga el archivo (en toda la página, no solo aquí).
  const dropZone = (e) => e.target.closest?.('[data-act-form="resolve"][data-step="2"]');
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  const ignoreDrop = (e) => {
    if (!hasFiles(e) || (root.contains(e.target) && dropZone(e))) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'none';
  };
  document.addEventListener('dragover', ignoreDrop);
  document.addEventListener('drop', ignoreDrop);
  root.addEventListener('dragover', (e) => { const z = dropZone(e); if (z) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; z.classList.add('over'); } });
  root.addEventListener('dragleave', (e) => { const z = dropZone(e); if (z && !z.contains(e.relatedTarget)) z.classList.remove('over'); });
  root.addEventListener('drop', (e) => {
    const z = dropZone(e);
    if (!z) return;
    e.preventDefault();
    z.classList.remove('over');
    const files = e.dataTransfer.files;
    if (!files.length) return;
    setFile(z, files[0]);
    if (files.length > 1) toast?.('Solo se adjunta uno: el primero.');
  });

  const upload = async (file) => {
    if (!file) return;
    loading = true;
    renderDesk();
    try {
      const { meta } = await api.upload(file);
      toast?.(`Foto cargada: ${meta.issues} incidencias.`);
    } catch (e) {
      failed(e.message);
    }
    loading = false;
    await loadDesk();
  };

  root.addEventListener('change', (e) => {
    if (e.target.matches('[data-file]') && e.target.files[0]) return setFile(e.target.closest('form'), e.target.files[0]);
    const form = e.target.closest('[data-act-form]');
    if (form) return syncSubmit(form);
    if (e.target.matches('[data-rule]')) rule = e.target.value;
    if (e.target.matches('[data-csv]')) { picking = false; upload(e.target.files[0]); }
  });
  const picked = () => { picking = false; };
  window.addEventListener('focus', picked);

  // Refresco: solo con la mesa a la vista (no mientras se trabaja una issue).
  const refresher = setInterval(() => {
    if (!onDesk || picking || root.hidden || document.visibilityState !== 'visible') return;
    const y = root.scrollTop;
    api.desk().then((d) => { data = d; now = new Date(); if (onDesk) { renderDesk(); root.scrollTop = y; } }).catch(() => {});
  }, REFRESH_MS);

  return {
    show: () => loadDesk().catch((err) => { root.innerHTML = `<div class="iss-page"><p class="iss-empty">No se pudieron cargar las incidencias: ${esc(err.message)}</p></div>`; }),
    dispose: () => { clearInterval(refresher); window.removeEventListener('focus', picked); document.removeEventListener('dragover', ignoreDrop); document.removeEventListener('drop', ignoreDrop); closeChat(); },
  };
};
