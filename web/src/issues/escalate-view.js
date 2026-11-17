// Escalar una issue: el asistente por pasos encima de la pantalla de trabajo (escalate-form.js
// pinta; aquí el cableado), con el comportamiento de Resolver: las piezas comunes (ui/wizard.js),
// el borrador solo en la BBDD local y el cierre por fases. Al acabar se queda con el ticket a la
// vista hasta cerrar. De momento no sale nada hacia Remedy ni Jira: al cerrar, la vista avisa (onEscalated).
import { onEscape } from '../ui/dialog.js';
import { esc } from '../ui/html.js';
import { BACK_ARROW, NEXT_ARROW, slideStep, flashEmpty, fadeOut as fade, runPhases } from '../ui/wizard.js';
import { escalateForm, requirementsHtml, linkedText, summaryHtml, filesHtml, ticketHtml, doneHtml, closePhases, searchHtml, searchPhases } from './escalate-form.js';
import { resolveBlocked, noteMeter, localShort } from './resolve-form.js';
import { stepMissing, stepWarning, resumeStep, resultTicket, targetOf, titleOf, nextOf, prevOf, findEscalations, LAST, FEED, FLOWS } from './escalate.js';
import { syncEditor, setEditorText, toText, insertChip, removeChips } from './tag-editor.js';
import { hasFiles } from './chip-drag.js';

const AUTOSAVE_MS = 800;   // el mismo que Resolver

// root: la vista de Issues; api: issues-api.js; dialogs: ui/dialog.js (los avisos); dests y tickets: el
// catálogo y los escalados abiertos (de prueba), sobre los que se buscan las coincidencias; onEscalated(target, mode): ya escalada o unida, al cerrar.
export const createEscalator = (root, { api, dialogs, toast, dests, tickets, onEscalated }) => {
  let opened = null, issue = null, check = null, found = [], offEscape = null, closeIt = null, timer = null, done = null;
  // los del motivo: de momento solo se listan (no van al borrador ni salen de SIA); las imágenes van
  // numeradas, como en Resolver, para colocarlas en el texto como [imagenN]
  let files = [], lastImage = 0;
  const form = () => root.querySelector('[data-act-form="escalate"]');
  const values = (f) => Object.fromEntries(new FormData(f));
  const ctx = () => ({ dests, issue });
  const showErr = (f, text) => { const err = f.querySelector('.iss-act-err'); err.textContent = text || ''; err.hidden = !text; };

  /* ── El borrador: una sola cola de guardados, como en Resolver ── */
  let autosave = null, saving = Promise.resolve();
  const enqueue = (job) => (saving = saving.then(job).catch(() => {}));
  const saveNow = (f) => {
    const label = f.querySelector('[data-autosave]');
    const id = opened, fields = values(f);
    return enqueue(() => api.saveEscalateDraft(id, fields)
      .then(({ at }) => { label.textContent = `Borrador guardado ${localShort(at)}`; })
      .catch((e) => { label.textContent = `No se ha podido guardar el borrador: ${e.message}`; }));
  };
  const flushSave = () => {
    if (!autosave) return;
    clearTimeout(autosave); autosave = null;
    const f = form();
    if (f) saveNow(f);
  };

  /* ── Los pasos ── */
  const isLink = (f) => f.elements.mode.value === 'link';
  // El pie y la barra según el flujo y el paso. En el 1, con un ticket elegido, «Actualizar escalado» y, al
  // lado, «Nuevo escalado»; sin ticket, solo el nuevo. La barra enseña los pasos del flujo (FLOWS).
  // Al actualizar, el botón dice eso mismo. En el resumen, primero «Ver el ticket» y, con el borrador a la vista,
  // «Escalar» (como Resolver).
  const flowOf = (f) => FLOWS[isLink(f) ? 'link' : 'escalate'];
  // En el paso 1, las dos respuestas («No, nuevo escalado» y «Sí, actualizar escalado») si hay
  // coincidencias o se ha elegido uno; sin ninguna, solo «No».
  const answers = (f) => found.length > 0 || isLink(f);
  const syncFoot = (f) => {
    const n = Number(f.dataset.step), link = isLink(f), viewing = 'viewing' in f.dataset, mode = f.elements.mode.value;
    const flow = flowOf(f);
    f.querySelectorAll('[data-step-mark]').forEach((m) => {
      const k = Number(m.dataset.stepMark);
      m.hidden = !flow.includes(k);
      m.classList.toggle('last', k === flow.at(-1));
    });
    const next = f.querySelector('[data-step-next]'), send = f.querySelector('[data-confirm-send]');
    const to = nextOf(mode, n), both = n === 1 && answers(f);
    next.hidden = !to;
    if (to) next.innerHTML = `${n === 1 ? (both ? 'Sí, actualizar escalado' : 'No, nuevo escalado') : titleOf(to)}${NEXT_ARROW}`;
    f.querySelector('[data-esc-new]').hidden = !both;
    f.querySelector('[data-esc-preview]').hidden = !(n === LAST && !viewing);
    send.hidden = !((n === LAST && viewing) || n === FEED);
    send.textContent = n === FEED ? titleOf(FEED) : 'Crear escalado';
    if (n > 1) f.querySelector('[data-step-back]').innerHTML = `${BACK_ARROW}${titleOf(viewing ? LAST - 1 : prevOf(mode, n))}`;   // a la izquierda, adónde se vuelve
  };
  // El borrador del ticket ocupa el paso, con su título centrado y sin la barra de pasos, como el
  // informe de Resolver; volver lo quita y deja el resumen.
  const showTicket = (f, on) => {
    if (on) f.dataset.viewing = ''; else delete f.dataset.viewing;
    f.querySelector('[data-esc-review]').hidden = on;
    f.querySelector('[data-esc-cap]').hidden = !on;
    const box = f.querySelector('[data-esc-ticket]');
    box.hidden = !on;
    if (on) box.innerHTML = ticketHtml(values(f), { ...ctx(), check, files });
    f.querySelector('.rv-steps').hidden = on;
    syncFoot(f);
    if (on) f.querySelector('[data-confirm-send]').focus({ preventScroll: true });
  };
  const goStep = (f, n) => {
    const prev = Number(f.dataset.step);
    if ('viewing' in f.dataset) showTicket(f, false);
    f.dataset.step = String(n);
    f.elements.step.value = String(n);   // va en el borrador: al volver se retoma aquí
    showErr(f, null);
    f.querySelectorAll('[data-rstep]').forEach((p) => { p.hidden = p.dataset.rstep !== String(n); });
    slideStep(f, prev, n);
    f.querySelectorAll('[data-step-mark]').forEach((m) => {
      const k = Number(m.dataset.stepMark);
      const flow = flowOf(f);
      m.classList.toggle('done', flow.indexOf(k) > -1 && flow.indexOf(k) < flow.indexOf(n));
      if (k === n) m.setAttribute('aria-current', 'step'); else m.removeAttribute('aria-current');
    });
    if (n === 1 && f.querySelector('[name="linked"]:checked')) f.elements.mode.value = 'link';   // de vuelta al 1 con un ticket elegido: se puede unir
    if (n === FEED) f.querySelector('[data-esc-feed-ticket]').textContent = targetOf(values(f), dests);
    const back = f.querySelector('[data-step-back]');
    back.hidden = n === 1;
    syncFoot(f);
    if (n === LAST) f.querySelector('[data-summary]').innerHTML = summaryHtml(values(f), { ...ctx(), check, files });
    f.querySelector('.rv-body').scrollTop = 0;
    // sin desplazar: enfocar mientras entra deslizándose se vería como un salto
    (n === LAST ? f.querySelector('[data-esc-preview]') : f.querySelector(`[data-rstep="${n}"] :is(.rv-ed, textarea, input:checked, input:not([type=hidden]):not([type=file]))`))?.focus({ preventScroll: true });
    f.querySelector('.rv-body').scrollLeft = 0;
  };
  const moveTo = (f, n) => { goStep(f, n); saveNow(f); };
  // Lo que falta (stepMissing): en un campo de texto, el aviso en su centro, como en Resolver; en una
  // lista (el ticket, el equipo, lo mínimo), en el centro del paso.
  const LIST = { linked: '.iss-esc-open', dest: '[data-rstep="2"] .rv-text', mins: '[data-mins-box]' };
  const flashMissing = (f, { field, text }) => {
    if (LIST[field]) return flashEmpty(f.querySelector(LIST[field]), f.querySelector('.rv-body'), text);
    const el = field === 'reason' ? editor(f) : f.elements[field];   // el motivo se escribe en su editor
    flashEmpty(el, el.closest('.iss-field, .iss-esc-open'), text);
  };
  // → true si el paso n está completo; si no, lo señala
  const complete = (f, n) => {
    const missing = stepMissing(n, values(f), ctx());
    if (missing) flashMissing(f, missing);
    return !missing;
  };
  // Lo que se le puede pasar al técnico (escalate.js): se puede seguir, pero avisando. → true si sigue
  const confirmed = async (f, n) => {
    const w = stepWarning(n, values(f), { ...ctx(), found });
    if (!w) return true;
    const ok = await dialogs.open({ title: w.title, centered: true, okLabel: w.ok, bodyHTML: `<p class="iss-dlg-p">${esc(w.text)}</p>` });
    return ok && f.isConnected;
  };
  const setMode = (f, mode) => { f.elements.mode.value = mode; syncFoot(f); };
  const stepNext = async (f) => {
    const n = Number(f.dataset.step);
    // «Sí, actualizar escalado» sin haber elegido ninguno: se pide, como cualquier campo que falta
    if (n === 1 && answers(f) && !isLink(f)) return flashMissing(f, { field: 'linked', text: 'Elige el escalado para seguir' });
    const to = nextOf(f.elements.mode.value, n);
    if (to && complete(f, n) && await confirmed(f, n)) moveTo(f, to);
  };
  // «Nuevo escalado» con un ticket elegido: se suelta el ticket elegido y se sigue por el escalado.
  const startNew = (f) => {
    f.querySelectorAll('[name="linked"]').forEach((r) => { r.checked = false; });
    setMode(f, 'escalate');
    moveTo(f, 2);
  };
  // Pulsar un paso de arriba (o una fila del resumen): hacia atrás, siempre; hacia delante, hasta
  // donde esté todo completo (si falta algo por el camino, se para ahí y lo señala).
  const jumpTo = (f, target) => {
    const current = Number(f.dataset.step);
    if (target === current) return;
    if (isLink(f)) return target === 1 ? moveTo(f, 1) : stepNext(f);   // al unir solo hay dos: ida y vuelta
    if (target < current) return moveTo(f, target);
    for (let k = current; k < target; k++) {
      const missing = stepMissing(k, values(f), ctx());
      if (!missing) continue;
      if (k !== current) moveTo(f, k);
      return flashMissing(f, missing);
    }
    moveTo(f, target);
  };

  /* ── Lo que cambia con lo escrito ── */
  // La nota de análisis que ya estaba en Remedy: «Restaurar» asoma en cuanto se cambia.
  const syncRestore = (f) => {
    const mark = f.querySelector('[data-restore-note]');
    if (!mark) return;
    const changed = f.elements.reason.value !== mark.dataset.original;
    mark.classList.toggle('changed', changed);
    mark.disabled = !changed;
  };
  // El destino decide lo que se pide en el paso 4; el de fuera del mapa, su nombre.
  const syncDest = (f) => {
    const v = values(f);
    f.querySelector('[data-esc-other]').hidden = v.dest !== 'other';
    f.querySelector('[data-esc-reqs]').innerHTML = requirementsHtml(v, ctx());
  };
  // Las casillas de lo mínimo van en un solo campo («form,logs»), que es el que guarda el borrador.
  const syncMins = (f) => { f.elements.mins.value = [...f.querySelectorAll('[data-min]:checked')].map((c) => c.dataset.min).join(','); };
  const paintFiles = (f) => { f.querySelector('[data-esc-file-list]').innerHTML = filesHtml(files); };

  /* ── Escalar: lo de antes se va, las fases en el centro y queda el ticket a la vista ── */
  // las fases y los difuminados (ui/wizard.js), con su temporizador en `timer` para pararlos al cerrar
  const track = (id) => { timer = id; };
  const fadeOut = (el) => fade(el, track);
  const submit = async (f) => {
    const n = Number(f.dataset.step), link = isLink(f);
    if (link ? n !== FEED : n < LAST) return stepNext(f);   // Intro en un paso: siguiente
    if (!link && !('viewing' in f.dataset)) return showTicket(f, true);   // primero, el borrador del ticket
    const send = f.querySelector('[data-confirm-send]');
    if (send.disabled) return;   // un segundo clic mientras se envía
    send.disabled = true;
    if (link && !complete(f, FEED)) { send.disabled = false; return; }
    const id = opened, fields = values(f);
    if (autosave) { clearTimeout(autosave); autosave = null; saveNow(f); }
    const work = (async () => { await saving; await api.escalate(id, fields); })();
    work.catch(() => {});
    const review = f.querySelector('[data-esc-review]');
    for (const b of f.querySelectorAll('footer .lab-btn')) b.hidden = true;
    f.querySelector('.rv-steps').hidden = true;
    // se va el borrador del ticket; al unir no se ha pasado por el resumen: se va el comentario y las
    // fases salen en el sitio del último
    await Promise.all((link ? [f.querySelector(`[data-rstep="${FEED}"]`)] : [f.querySelector('[data-esc-ticket]'), f.querySelector('[data-esc-cap]')]).map(fadeOut));
    if (!f.isConnected) return;
    if (link) { review.hidden = true; f.querySelector(`[data-rstep="${LAST}"]`).hidden = false; }
    const loader = f.querySelector('[data-loader]');
    loader.hidden = false;
    try {
      await Promise.all([work, runPhases(loader, link ? 'Actualizando el escalado' : 'Escalando la incidencia', closePhases(fields, issue.status === 'RESOLVED'), { alive: () => f.isConnected, track })]);
    } catch (err) {
      if (!f.isConnected) return;
      clearTimeout(timer);
      loader.hidden = true;
      f.querySelector('.rv-steps').hidden = false;
      send.disabled = false;
      goStep(f, link ? FEED : LAST);   // de vuelta al resumen (o al comentario, al unir)
      review.hidden = false;
      return showErr(f, err.message);
    }
    if (!f.isConnected) return;
    // queda a la vista lo hecho y el ticket, hasta que se cierre
    await fadeOut(loader);
    done = { target: targetOf(fields, dests), mode: fields.mode };
    const box = f.querySelector('[data-esc-done]');
    box.innerHTML = doneHtml(resultTicket(fields, dests), done.target, done.mode, issue.status === 'RESOLVED');
    box.hidden = false;
    const closeBtn = f.querySelector('[data-esc-close]');
    closeBtn.hidden = false;
    f.querySelector('[data-autosave]').hidden = true;   // el borrador ya se ha borrado
    closeBtn.focus({ preventScroll: true });
  };
  // Cerrar tras escalar: la ventana se funde y la vista avisa.
  const finish = async () => {
    const d = done;
    done = null;
    root.querySelector('.iss-modal')?.classList.add('closing');
    await new Promise((ok) => setTimeout(ok, 400));
    onEscalated(d.target, d.mode);
  };
  // Copiar el ticket o el asunto del chat N3: el botón lo confirma un momento y vuelve a su texto.
  const copy = async (btn) => {
    try {
      await navigator.clipboard.writeText(btn.dataset.copy);
      const label = btn.textContent;
      btn.textContent = 'Copiado';
      setTimeout(() => { btn.textContent = label; }, 1500);
    } catch { toast?.('No se ha podido copiar: selecciónalo y cópialo a mano.'); }
  };

  /* ── Los listeners, acotados al formulario de Escalar ── */
  const inForm = (e) => e.target.closest?.('[data-act-form="escalate"]');
  root.addEventListener('click', (e) => {
    const f = inForm(e);
    if (!f) {
      // el aviso de notas sin cubrir: de momento solo se avisa; el comando al chat llegará con la resolución asistida
      if (e.target.closest?.('[data-escalate-chat]')) { closeIt?.(); toast?.('Se lanzaría un comando al chat para completar las notas del método.'); }
      return;
    }
    const t = e.target;
    // las ayudas aún no tienen nada detrás: la IA del chat y la documentación de cada destino llegarán después
    if (t.closest('[data-esc-help]')) return toast?.('Se abriría el chat de la incidencia para que la IA te ayude a elegir el destino.');
    const jira = t.closest('[data-jira-open]');   // dentro de la tarjeta: abrirlo no la elige
    if (jira) { e.preventDefault(); return toast?.(`Se abriría ${jira.dataset.jiraOpen} en Jira para compararlo.`); }
    const help = t.closest('[data-dest-help]');
    if (help) { e.preventDefault(); return toast?.(`Aquí irá qué cubre ${dests.find((d) => d.id === help.dataset.destHelp)?.name}: la documentación está por hacer.`); }
    if (t.closest('[data-esc-close]')) return finish();
    const copyBtn = t.closest('[data-copy]');
    if (copyBtn) return copy(copyBtn);
    const drop = t.closest('[data-file-drop]');
    if (drop) return dropFile(f, Number(drop.dataset.fileDrop));
    if (t.closest('[data-step-next]')) return stepNext(f);
    if (t.closest('[data-esc-new]')) return startNew(f);
    const mark = t.closest('[data-step-mark], [data-go]');
    if (mark) return jumpTo(f, Number(mark.dataset.stepMark ?? mark.dataset.go));
    if (t.closest('[data-esc-preview]')) return showTicket(f, true);
    // desde el borrador del ticket, «atrás» vuelve al resumen
    if (t.closest('[data-step-back]')) return 'viewing' in f.dataset ? showTicket(f, false) : moveTo(f, prevOf(f.elements.mode.value, Number(f.dataset.step)));
    if (t.closest('[data-restore-note]')) {
      const ed = editor(f);
      setEditorText(ed, f.querySelector('[data-restore-note]').dataset.original);
      ed.dispatchEvent(new Event('input', { bubbles: true }));   // la barra, el botón y el borrador, al día
      ed.focus();
    }
  });
  root.addEventListener('submit', (e) => { const f = inForm(e); if (f) { e.preventDefault(); submit(f); } });
  // Una imagen entra numerada, con su miniatura y su ficha en el texto donde esté el cursor, como en
  // Resolver; quitarla la quita también del texto.
  const editor = (f) => f.querySelector('[data-ed="reason"]');
  const addFiles = (f, list) => {
    for (const file of list) {
      const image = file.type.startsWith('image/');
      files = [...files, { name: file.name, size: file.size, ...(image ? { n: ++lastImage, url: URL.createObjectURL(file) } : {}) }];
      if (image) insertChip(editor(f), lastImage);
    }
    paintFiles(f);
  };
  const dropFile = (f, i) => {
    const x = files[i];
    files = files.filter((_, k) => k !== i);
    if (x.n) {
      URL.revokeObjectURL(x.url);
      removeChips(editor(f), x.n);
      editor(f).dispatchEvent(new Event('input', { bubbles: true }));
    }
    paintFiles(f);
  };
  // Pegar una captura en el motivo la añade (el texto pegado sigue yendo al texto).
  root.addEventListener('paste', (e) => {
    const f = inForm(e);
    const images = [...(e.clipboardData?.files || [])].filter((x) => x.type.startsWith('image/'));
    if (!f || !images.length || !e.target.closest?.('[data-ed="reason"]')) return;
    e.preventDefault();
    addFiles(f, images);
  });
  root.addEventListener('change', (e) => {
    const f = inForm(e);
    if (!f || !e.target.matches('[data-esc-files]') || !e.target.files.length) return;
    addFiles(f, e.target.files);
    e.target.value = '';
  });
  // Arrastrar archivos sobre el motivo, como en Resolver: el modal se marca como destino (.rv.over) y
  // lo soltado va a la lista. Sin que siga hasta la página, que los rechaza fuera de los asistentes.
  const dropZone = (e) => hasFiles(e) && e.target.closest?.('[data-act-form="escalate"][data-step="3"]');
  root.addEventListener('dragover', (e) => {
    const z = dropZone(e);
    if (!z) return;
    e.preventDefault(); e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
    z.classList.add('over');
  });
  root.addEventListener('dragleave', (e) => { const z = dropZone(e); if (z && !z.contains(e.relatedTarget)) z.classList.remove('over'); });
  root.addEventListener('drop', (e) => {
    const z = dropZone(e);
    if (!z) return;
    e.preventDefault(); e.stopPropagation();
    z.classList.remove('over');
    addFiles(z, e.dataTransfer.files);
  });
  root.addEventListener('input', (e) => {
    const f = inForm(e);
    if (!f || e.target.matches('[data-esc-files]')) return;
    const t = e.target;
    if (t.name === 'linked') setMode(f, 'link');   // elegir un ticket es unirla a él
    if (t.name === 'linkedOther') f.querySelector('[data-esc-linked]').innerHTML = linkedText(t.value);
    if (t.name === 'dest' || t.name === 'destOther') syncDest(f);
    if (t.name === 'dest' && t.value === 'other') f.elements.destOther.focus();   // fuera del mapa: a escribir su nombre
    if (t.matches('[data-min]')) syncMins(f);
    if (t.name === 'comment') f.querySelector('[data-meter="comment"]').outerHTML = noteMeter(t.value, 'comment');
    if (t.matches('[data-ed="reason"]')) {   // el editor lleva su texto al campo oculto, como en Resolver
      syncEditor(t);
      syncRestore(f);
      f.querySelector('[data-meter]').outerHTML = noteMeter(toText(t), 'reason');
    }
    showErr(f, null);
    clearTimeout(autosave);
    autosave = setTimeout(() => { autosave = null; saveNow(f); }, AUTOSAVE_MS);
  });
  // Escribir en «Otro ticket» lo elige, sin buscar su tarjeta.
  root.addEventListener('focusin', (e) => {
    if (e.target.name !== 'linkedOther' || !inForm(e)) return;
    const radio = e.target.closest('label').querySelector('[name="linked"]');
    if (!radio.checked) { radio.checked = true; radio.dispatchEvent(new Event('input', { bubbles: true })); }
  });

  // Cerrar: lo pendiente de guardar se guarda, y se para lo que estuviera en marcha. Si ya se había
  // escalado, la vista avisa igual.
  const close = () => {
    flushSave(); clearTimeout(timer); timer = null; offEscape?.(); offEscape = null; opened = null; closeIt = null;
    for (const x of files) if (x.url) URL.revokeObjectURL(x.url);   // las miniaturas, fuera de memoria
    files = [];
    if (done) { const d = done; done = null; onEscalated(d.target, d.mode); }
  };

  return {
    // Abrir Escalar sobre la issue abierta: el bridge dice si se puede (las notas del método) y da
    // mi borrador. Sin las notas, el aviso. Con ellas, si se empieza por el paso 1, primero se buscan
    // las recurrencias en Jira (searchHtml) y luego el asistente; si se retoma más adelante, directo.
    // onClose: lo que cierra la ventana (Escape, el aviso).
    async open(theIssue, link, onClose) {
      await saving;   // lo que se guardaba al cerrar, antes de leer el borrador
      const start = await api.startEscalate(theIssue.id);
      opened = theIssue.id; issue = theIssue; check = start.check; found = findEscalations(theIssue, tickets); closeIt = onClose; files = []; lastImage = 0; done = null;
      offEscape = onEscape(onClose);
      if (start.check.missing.length) {
        root.insertAdjacentHTML('beforeend', `<div class="iss-modal">${resolveBlocked(issue.id, start.check, { title: 'Aún no se puede escalar', chat: 'data-escalate-chat' })}</div>`);
        root.querySelector('[data-escalate-chat]').focus();
        return;
      }
      const resume = resumeStep(start.draft, ctx());
      const formHtml = () => escalateForm({ issue, dests, found, check: start.check, saved: start.draft, link });
      if (resume === 1) {
        root.insertAdjacentHTML('beforeend', `<div class="iss-modal">${searchHtml(issue.id, start.check)}</div>`);
        const box = root.querySelector('.rb-search');
        const alive = () => opened === theIssue.id && box.isConnected;
        await runPhases(box.querySelector('[data-loader]'), 'Buscando escalados del mismo problema', searchPhases(issue), { alive, track });
        await fadeOut(box);
        if (!alive()) return;
        box.outerHTML = formHtml();
      } else root.insertAdjacentHTML('beforeend', `<div class="iss-modal">${formHtml()}</div>`);
      const f = form();
      syncFoot(f);
      if (resume > 1) goStep(f, resume); else f.querySelector('[name="linked"]:checked, [name="linked"]')?.focus();
    },
    close,
  };
};
