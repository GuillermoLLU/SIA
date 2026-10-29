// Vista «Issues»: la mesa de cada persona. Arriba, lo inmediato: la
// siguiente que le toca (la elige la regla; la cola de la base evita que dos
// cojan la misma) y su día. En medio, su histórico medido en SIA (se llena
// con el uso). Abajo, el seguimiento de lo suyo. Al abrir una, la pantalla de
// trabajo (work-screen.js). La mesa se refresca sola.
import './issues.css';
import { esc } from '../ui/html.js';
import { LISTS, when, age, stamp, weekBars } from './format.js';
import { sev, origin, item } from './parts.js';
import { workScreen } from './work-screen.js';
import { ACTIONS, actionForm, readAction } from './actions.js';
import { resolveForm, resolveReview, stepMissing, STEPS, MAX_FILE, fileBox, localShort } from './resolve-form.js';

const GOAL = { min: 15, max: 20 }; // resueltas por turno, lo que dice el equipo
const REFRESH_MS = 15000;

// openChat(host, issueId) → { dispose }: el chat de la issue (lo pone main.js).
export const mountIssuesView = (root, { api, me, toast, openChat }) => {
  let data = null, rule = 'basic', now = new Date(), opened = null, onDesk = false, workTab = 'ai', chat = null, loading = false, picking = false;
  let attached = null; // Resolver: el adjunto guardado en el borrador abierto ({ name, type, size })
  const closeChat = () => { chat?.dispose(); chat = null; };

  // Cargar la foto (el CSV de la consulta de Remedy, hasta leer de Remedy).
  const loadButton = (label) => `<label class="iss-load ${loading ? 'iss-busy' : ''}">${loading ? 'Cargando…' : label}<input type="file" accept=".csv,text/csv" data-csv hidden ${loading ? 'disabled' : ''}></label>`;

  const kpi = (label, value, hint) => `<div class="iss-kpi"><span>${label}</span><b>${value}</b><small>${hint}</small></div>`;

  // Cogidas por semana (SGA / SISU), lo medido en SIA.
  const weeksChart = (weeks) => `<div class="iss-bars" role="img" aria-label="Issues cogidas por semana, últimas ${weeks.length} semanas">
      ${weekBars(weeks).map(({ week, sga, sisu, total, sgaPct, sisuPct }) => `<div class="iss-bar" title="Semana del ${week.slice(8)}/${week.slice(5, 7)}: ${total} (SGA ${sga}, SISU ${sisu})">
          <small>${total || ''}</small><i class="sisu" style="height:${sisuPct}%"></i><i style="height:${sgaPct}%"></i><span>${+week.slice(8)}/${+week.slice(5, 7)}</span></div>`).join('')}
    </div>`;

  const renderDesk = () => {
    closeChat();
    onDesk = true;
    if (!data.taken) {
      root.innerHTML = `<div class="iss-page"><h2 class="iss-title">Issues</h2>
        <div class="iss-none"><b>Aún no hay issues</b><span>De momento se cargan con el CSV de la consulta de Remedy (vale el mismo que el de Métricas); cuando SIA lea de Remedy, saldrán de ahí.</span>${loadButton('Cargar CSV')}</div></div>`;
      return;
    }
    const { today, history, next } = data;
    const lists = LISTS.map((l) => ({ ...l, items: data.desk.filter(l.test).sort(l.sort) }));
    const count = (key) => lists.find((l) => l.key === key).items.length;
    const used = history.weeks.some((w) => w.sga + w.sisu);
    root.innerHTML = `<div class="iss-page">
      <header class="iss-top"><h2 class="iss-title">Hola, ${esc((me?.name || '').split(' ')[0] || 'equipo')}</h2><span class="iss-snap">Datos de Remedy del ${when(stamp(now))}</span>${loadButton('Cargar otro CSV')}</header>

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
          <p class="iss-foot">${used ? 'Medido con el uso de SIA.' : 'Se irá llenando con el uso de SIA: cada issue que cojas cuenta.'} Las resueltas se sumarán cuando se resuelva desde SIA.</p>
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

  const renderIssue = ({ issue: i, sameCenter }) => {
    onDesk = false;
    const mine = i.claimedBy && data?.desk.some((d) => d.id === i.id && d.claimed);
    if (opened !== i.id) workTab = 'ai';
    opened = i.id;
    closeChat();
    closeAction();
    root.innerHTML = workScreen({ issue: i, sameCenter, now, mine, tab: workTab });
    chat = openChat?.(root.querySelector('.iss-chat-body'), i.id) || null;
    root.scrollTop = 0;
  };

  const loadDesk = async () => {
    data = await api.desk();
    now = data.taken ? new Date(data.taken) : new Date();
    renderDesk();
  };
  const openIssue = async (id) => renderIssue(await api.get(id));

  root.addEventListener('click', async (e) => {
    const t = e.target;
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
      if (wt) {
        workTab = wt.dataset.wtab;
        root.querySelectorAll('[data-wtab]').forEach((b) => b.setAttribute('aria-selected', String(b === wt)));
        root.querySelectorAll('[data-wpanel]').forEach((p) => { p.hidden = p.dataset.wpanel !== workTab; });
        return;
      }
      const act = t.closest('[data-act]');
      if (act) {
        if (act.disabled) return;   // un segundo clic mientras se abre: un solo modal
        act.disabled = true;
        try { return await openAction(act.dataset.act); } finally { act.disabled = false; }
      }
      if (t.closest('[data-act-cancel]') || t.classList.contains('iss-modal')) return closeAction();
      if (t.closest('[data-step-next]')) return stepNext(t.closest('form'));
      if (t.closest('[data-step-back]')) { const form = t.closest('form'); return goStep(form, Number(form.dataset.step) - 1); }
      if (t.closest('[data-file-clear]')) return setFile(t.closest('form'), null);
      if (t.closest('[data-saved-drop]')) { clearTimeout(autosave); autosave = null; await saving; await api.dropDraft(opened); return openAction('resolve'); }
      const r = t.closest('[data-id]');
      if (r) return openIssue(r.dataset.id);
      if (t.closest('[data-back]')) { renderDesk(); root.scrollTop = 0; return; }
      const rel = t.closest('[data-release]');
      if (rel) { rel.disabled = true; await api.release(opened); await loadDesk(); return toast?.('Devuelta a la cola.'); }
    } catch (err) { toast?.(err.message); }
  });
  // Acciones: su formulario encima de la pantalla de trabajo. De momento se
  // valida y se avisa: nada sale hacia Remedy hasta conectar SIGLO.
  let people = [];
  const closeAction = () => { flushSave(); root.querySelector('.iss-modal')?.remove(); };

  // Resolver: los tres pasos. No se sale de uno sin lo obligatorio; el 3 se
  // pinta con lo escrito, como se va a enviar.
  const showErr = (form, text) => { const err = form.querySelector('.iss-act-err'); err.textContent = text || ''; err.hidden = !text; };
  const goStep = (form, n) => {
    form.dataset.step = String(n);
    showErr(form, null);
    form.querySelectorAll('[data-rstep]').forEach((p) => { p.hidden = p.dataset.rstep !== String(n); });
    form.querySelectorAll('[data-step-mark]').forEach((m) => {
      const k = Number(m.dataset.stepMark);
      m.classList.toggle('done', k < n);
      if (k === n) m.setAttribute('aria-current', 'step'); else m.removeAttribute('aria-current');
    });
    const last = n === STEPS.length;
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
  const stepNext = (form) => {
    const n = Number(form.dataset.step);
    const missing = stepMissing(n, Object.fromEntries(new FormData(form)));
    if (missing) {
      showErr(form, `Falta: ${missing}`);
      return [...form.querySelectorAll(`[data-rstep="${n}"] textarea`)].find((a) => !a.value.trim())?.focus();
    }
    goStep(form, n + 1);
  };
  // El adjunto (uno): se guarda en el borrador en cuanto se elige o se suelta.
  const base64 = (file) => new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result).split(',')[1] || '');
    r.onerror = () => ko(r.error);
    r.readAsDataURL(file);
  });
  const setFile = async (form, file) => {
    if (file && file.size > MAX_FILE) return showErr(form, 'El adjunto pasa de 10 MB: elige otro más pequeño.');   // el mismo texto que el bridge
    if (file && !file.size) return showErr(form, 'El archivo está vacío (o es una carpeta): elige otro.');
    showErr(form, null);
    const box = form.querySelector('[data-file-box]');
    box.innerHTML = '<p class="iss-file-on">Guardando…</p>';
    try {
      const got = file ? await api.saveDraftFile(opened, { name: file.name, type: file.type, data: await base64(file) }) : await api.dropDraftFile(opened);
      attached = got.file || null;
      form.querySelector('[data-autosave]').textContent = `Borrador guardado ${localShort(got.at)}`;
    } catch (e) { showErr(form, `No se ha podido guardar el adjunto: ${e.message}`); }
    box.innerHTML = fileBox(attached);
  };
  // Lo escrito se guarda solo, un momento después de dejar de teclear, y al
  // cerrar. `saving`: el guardado en curso, para que confirmar espere a que
  // acabe (si no, llegaría después y volvería a crear el borrador).
  let autosave = null, saving = Promise.resolve();
  const saveNow = (form) => {
    const label = form.querySelector('[data-autosave]');
    const id = opened, fields = Object.fromEntries(new FormData(form));
    saving = saving.then(() => api.saveDraft(id, fields))
      .then(({ at }) => { label.textContent = `Borrador guardado ${localShort(at)}`; })
      .catch((e) => { label.textContent = `No se ha podido guardar el borrador: ${e.message}`; });
    return saving;
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
    clearTimeout(autosave);
    autosave = setTimeout(() => { autosave = null; saveNow(form); }, 800);
  });
  const openAction = async (key) => {
    closeAction();
    if (key === 'transfer') people = await api.teammates();
    // Resolver: lo que hay en Remedy, lo que falta y mi borrador los da el
    // bridge, que también dice si se puede (mía, en la foto y aún abierta)
    let start = null;
    if (key === 'resolve') {
      start = await api.startResolve(opened);
      attached = start.draft?.file || null;
    }
    const form = key === 'resolve' ? resolveForm(opened, start.check, start.draft) : actionForm(key, opened, people);
    root.insertAdjacentHTML('beforeend', `<div class="iss-modal">${form}</div>`);
    root.querySelector('.iss-act-form textarea, .iss-act-form input:not([type=hidden]), .iss-act-form select')?.focus();
  };
  root.addEventListener('submit', async (e) => {
    const form = e.target.closest('[data-act-form]');
    if (!form) return;
    e.preventDefault();
    const key = form.dataset.actForm;
    if (key === 'resolve' && Number(form.dataset.step) < STEPS.length) return stepNext(form);
    const { missing, values } = readAction(key, Object.fromEntries(new FormData(form)));
    const err = form.querySelector('.iss-act-err');
    if (missing) { err.textContent = `Falta: ${missing}.`; err.hidden = false; return; }
    // Resolver solo se envía desde el último paso, ya revisado. El bridge lo
    // vuelve a comprobar todo y, si cumple, borra el borrador.
    if (key === 'resolve') {
      const send = form.querySelector('[data-confirm-send]');
      if (send.disabled) return;   // un segundo clic mientras se envía
      send.disabled = true;
      // lo último escrito, guardado antes: si el bridge lo rechaza, no se pierde
      if (autosave) { clearTimeout(autosave); autosave = null; saveNow(form); }
      try {
        await saving;
        await api.resolve(opened, Object.fromEntries(new FormData(form)));
      } catch (err) { send.disabled = false; return showErr(form, err.message); }
      closeAction();
      return toast?.('Resolver: comprobado, pero aún no se envía a Remedy (falta conectar SIGLO).');
    }
    closeAction();
    const who = key === 'transfer' ? people.find((p) => p.id === values.to)?.name : null;
    toast?.(`${ACTIONS[key].label}${who ? ` a ${who}` : ''}: preparado, pero aún no se envía a Remedy (falta conectar SIGLO).`);
  });
  // Soltar el adjunto en su zona. Fuera de ella no pasa nada: el navegador no
  // abre ni descarga el archivo (en toda la página, no solo en esta vista).
  const dropZone = (e) => e.target.closest?.('[data-drop]');
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
    const files = e.dataTransfer.files;
    if (!files.length) return z.classList.remove('over');
    setFile(z.closest('form'), files[0]);
    if (files.length > 1) toast?.('Solo se adjunta uno: el primero.');
  });
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape' && root.querySelector('.iss-modal')) closeAction(); });

  const upload = async (file) => {
    if (!file) return;
    loading = true;
    renderDesk();
    try {
      const { meta } = await api.upload(file);
      toast?.(`Foto cargada: ${meta.issues} issues.`);
    } catch (e) {
      toast?.(e.message);
    }
    loading = false;
    await loadDesk();
  };

  root.addEventListener('change', (e) => {
    if (e.target.matches('[data-rule]')) rule = e.target.value;
    if (e.target.matches('[data-csv]')) { picking = false; upload(e.target.files[0]); }
    if (e.target.matches('[data-file]') && e.target.files[0]) setFile(e.target.closest('form'), e.target.files[0]);
  });
  // Con el diálogo de elegir fichero abierto no se repinta la mesa: el
  // cambio llegaría a un input que ya no está en la página.
  root.addEventListener('click', (e) => { if (e.target.matches('[data-csv]')) picking = true; });
  const picked = () => { picking = false; };
  window.addEventListener('focus', picked);

  // Refresco: solo con la mesa a la vista (no mientras se trabaja una issue).
  const refresher = setInterval(() => {
    if (!onDesk || picking || root.hidden || document.visibilityState !== 'visible') return;
    const y = root.scrollTop;
    api.desk().then((d) => { data = d; now = d.taken ? new Date(d.taken) : new Date(); if (onDesk) { renderDesk(); root.scrollTop = y; } }).catch(() => {});
  }, REFRESH_MS);

  return {
    show: () => loadDesk().catch((err) => { root.innerHTML = `<div class="iss-page"><p class="iss-empty">No se pudieron cargar las issues: ${esc(err.message)}</p></div>`; }),
    dispose: () => { clearInterval(refresher); window.removeEventListener('focus', picked); document.removeEventListener('dragover', ignoreDrop); document.removeEventListener('drop', ignoreDrop); closeChat(); },
  };
};
