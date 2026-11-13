// Resolver una issue: el asistente de cinco pasos encima de la pantalla de trabajo (resolve-form.js
// pinta; aquí el cableado). Guarda el borrador solo (texto e imágenes) en la BBDD local, mueve las
// fichas [imagenN] por el texto, simula de momento la redacción de la IA y el cierre, y al acabar
// avisa a la mesa (onResolved). Lo que no es de Resolver (la mesa, la issue, Escalar, Traspasar)
// sigue en issues-view.js.
import { esc } from '../ui/html.js';
import { onEscape } from '../ui/dialog.js';
import { BACK_ARROW, NEXT_ARROW, slideStep, flashEmpty, fadeOut as fade, runPhases as phasesIn } from '../ui/wizard.js';
import { readAction } from './actions.js';
import { resolveForm, resolveBlocked, resumeStep, stepMissing, STEPS, LAST, MAX_FILE, MAX_IMAGES, imagesDock, sectionImages, noteMeter, phasesHtml, closePhasesHtml, reportHtml, summaryHtml, localShort } from './resolve-form.js';
import { noteQuality, FULL } from './quality.js';
import { syncEditor, setEditorText, toText, insertChip, removeChips, rangeAtPoint, imageTag } from './tag-editor.js';

const AUTOSAVE_MS = 800;

const base64 = (file) => new Promise((ok, ko) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1] || '');
  r.onerror = () => ko(r.error);
  r.readAsDataURL(file);
});
const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');

// root: la vista de Issues (los listeners van ahí, acotados al formulario de Resolver).
// api: issues-api.js; dialogs: ui/dialog.js; toast: el aviso de la app;
// onResolved(): la issue está resuelta y la ventana ya se ha ido (la mesa se pone al día).
export const createResolver = (root, { api, dialogs, toast, onResolved }) => {
  let opened = null;        // la issue del formulario abierto
  let images = [];          // las del borrador ({ n, name, type, size, url })
  let extras = [];          // otros archivos del informe (de momento solo se listan)
  let offEscape = null;
  const form = () => root.querySelector('[data-act-form="resolve"]');
  const showErr = (f, text) => { const err = f.querySelector('.iss-act-err'); err.textContent = text || ''; err.hidden = !text; };

  /* ── El borrador: todo lo que escribe va en una sola cola (`saving`). Lo que lo lee o lo borra
     (abrir, generar, confirmar) espera a que acabe: si no, un guardado tardío traería un estado
     viejo. Cada trabajo guarda el id de su issue, por si mientras tanto se abre otra. ── */
  let autosave = null, saving = Promise.resolve();
  const enqueue = (job) => (saving = saving.then(job).catch(() => {}));
  const saveNow = (f) => {
    const label = f.querySelector('[data-autosave]');
    const id = opened, fields = Object.fromEntries(new FormData(f));
    return enqueue(() => api.saveDraft(id, fields)
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
  const goStep = (f, n) => {
    const prev = Number(f.dataset.step);
    f.dataset.step = String(n);
    f.querySelector('.rv-steps').hidden = false;   // de vuelta de un borrador, los pasos otra vez
    f.querySelector('[data-gen-cap]').classList.remove('rv-cap-final');
    f.elements.step.value = String(n);   // va en el borrador: al volver se retoma aquí
    showErr(f, null);
    f.querySelectorAll('[data-rstep]').forEach((p) => { p.hidden = p.dataset.rstep !== String(n); });
    slideStep(f, prev, n);
    f.querySelectorAll('[data-step-mark]').forEach((m) => {
      const k = Number(m.dataset.stepMark);
      m.classList.toggle('done', k < n);
      if (k === n) m.setAttribute('aria-current', 'step'); else m.removeAttribute('aria-current');
    });
    // la línea que sale de un grupo, en verde si todo el grupo está hecho
    f.querySelectorAll('.rv-steps-link').forEach((l) => l.classList.toggle('done', !!l.previousElementSibling?.querySelector('[data-step-mark]:last-child.done')));
    const last = n === LAST;
    const back = f.querySelector('[data-step-back]');
    back.hidden = n === 1;
    if (n > 1) back.innerHTML = `${BACK_ARROW}${STEPS[n - 2].title}`;   // a la izquierda, con el nombre del paso anterior
    const next = f.querySelector('[data-step-next]');
    next.hidden = last;
    if (!last) next.innerHTML = `${STEPS[n].title}${NEXT_ARROW}`;   // el nombre del paso al que se va
    f.querySelector('[data-confirm-send]').hidden = true;
    f.querySelector('[data-generate]').hidden = true;
    if (last) showGenerate(f);   // al llegar: las opciones y «Generar informe»; Resolver solo tras generar
    f.querySelector('.rv-body').scrollTop = 0;
    // sin desplazar: enfocar el campo mientras entra deslizándose movería el contenedor y se vería un salto
    (last ? f.querySelector('[data-confirm-send]') : f.querySelector(`[data-rstep="${n}"] .rv-ed`))?.focus({ preventScroll: true });
    f.querySelector('.rv-body').scrollLeft = 0;
  };
  // Cambiar de paso guarda el borrador, aunque no se haya escrito nada más.
  const moveTo = (f, n) => { goStep(f, n); saveNow(f); };
  const stepNext = async (f) => {
    const n = Number(f.dataset.step);
    const missing = stepMissing(n, Object.fromEntries(new FormData(f)));
    if (missing) {
      // el campo vacío parpadea en rojo con el aviso en su centro, y todo se va solo
      const ed = [...f.querySelectorAll(`[data-rstep="${n}"] .rv-ed`)].find((a) => !toText(a).trim());
      if (ed) flashEmpty(ed, ed.closest('.iss-field'), n === 1 ? 'Completa la descripción para seguir' : 'Responde a la pregunta para seguir');
      return;
    }
    // una nota muy breve: se puede seguir, pero avisando
    const field = STEPS[n - 1].fields[0];
    if (field && noteQuality(f.elements[field].value, FULL[field]).level === 'low' && dialogs) {
      const ok = await dialogs.open({ title: n === 1 ? 'La nota es muy breve' : 'La respuesta es muy breve', centered: true, okLabel: 'Continuar',
        bodyHTML: `<p class="iss-dlg-p">¿Seguro que quieres continuar? ${n === 1 ? 'La descripción' : 'La respuesta'} es muy breve y puede no tener la calidad esperada.</p>` });
      if (!ok || !f.isConnected) return;
    }
    if (n + 1 === LAST) await saving;   // el informe cuenta con las imágenes aunque aún se estuvieran guardando
    if (f.isConnected) moveTo(f, n + 1);
  };
  // Pulsar un paso de arriba (o una fila del resumen): hacia atrás, siempre; hacia delante, hasta
  // donde esté todo completo (si falta algo por el camino, se para en ese paso y lo señala).
  const jumpTo = async (f, target) => {
    const current = Number(f.dataset.step);
    if (target === current) return;
    if (target < current) return moveTo(f, target);
    const values = Object.fromEntries(new FormData(f));
    for (let k = current; k < target; k++) {
      if (!stepMissing(k, values)) continue;
      if (k !== current) moveTo(f, k);
      return stepNext(f);
    }
    if (target === LAST) await saving;
    if (f.isConnected) moveTo(f, target);
  };
  // La nota que ya estaba en Remedy: «Restaurar» asoma en cuanto se cambia y la deja como estaba.
  const syncRestore = (f) => {
    const mark = f.querySelector('[data-restore-note]');
    if (!mark) return;
    const changed = f.elements.note.value !== mark.dataset.original;
    mark.classList.toggle('changed', changed);
    mark.disabled = !changed;
  };
  const restoreNote = (f) => {
    const ed = f.querySelector('[data-ed="note"]');
    setEditorText(ed, f.querySelector('[data-restore-note]').dataset.original);
    ed.dispatchEvent(new Event('input', { bubbles: true }));   // la barra, el botón y el borrador, al día
    ed.focus();
  };

  /* ── Las imágenes: se guardan en el borrador en cuanto se pegan, se sueltan o se eligen, y entran
     en el texto como [imagenN] donde estaba el cursor (o al final del campo). ── */
  // Los muelles: el del paso 1 con todas las imágenes; el de cada pregunta, con las que nombra su texto.
  const paintImages = (f) => {
    for (const box of f.querySelectorAll('[data-images]')) {
      const name = box.dataset.for || null;
      box.outerHTML = imagesDock(name ? sectionImages(images, f.elements[name].value) : images, name, images.length);
    }
  };
  // El campo donde va la imagen: el que se pida; si no, el último en el que se escribió; si no, el del paso.
  let lastArea = null;
  const targetArea = (f, name = null) => (name ? f.querySelector(`[data-ed="${name}"]`) : lastArea?.isConnected && f.contains(lastArea) && !lastArea.closest('[hidden]') ? lastArea : f.querySelector(`[data-rstep="${f.dataset.step}"] .rv-ed`));
  const insertTag = (f, n, name = null) => {
    const ed = targetArea(f, name);
    if (!ed) return;
    insertChip(ed, n);   // donde esté el cursor; lanza «input»: se guarda solo
    ed.focus();
  };
  // field: a qué campo va la ficha (la pregunta del paso, o donde esté el cursor)
  const addImages = (f, files, field = null) => {
    const list = [...files].filter((x) => x.type.startsWith('image/'));
    if (!list.length) return showErr(f, 'Solo se adjuntan imágenes.');
    if (images.length + list.length > MAX_IMAGES) return showErr(f, `Como mucho ${MAX_IMAGES} imágenes por resolución.`);
    if (list.some((x) => x.size > MAX_FILE)) return showErr(f, 'Una imagen pasa de 15 MB: elige otra más pequeña.');   // el mismo texto que el bridge
    showErr(f, null);
    const id = opened;
    for (const file of list) {
      enqueue(async () => {
        let got = null;
        try { got = await api.saveDraftFile(id, { name: file.name, type: file.type, data: await base64(file) }); }
        catch (e) { if (f.isConnected) showErr(f, `No se ha podido guardar la imagen: ${e.message}`); }
        if (!got || !f.isConnected || opened !== id) return;   // el modal ya se cerró: no se toca el de otra issue
        images = [...images, { ...got.image, url: URL.createObjectURL(file) }];
        f.querySelector('[data-autosave]').textContent = `Borrador guardado ${localShort(got.at)}`;
        insertTag(f, got.image.n, field);   // la ficha primero: así la sección ya la nombra al pintar
        paintImages(f);
      });
    }
  };
  // Quitar una imagen la quita también del texto, en todos los campos.
  const removeImage = (f, n) => {
    const id = opened;
    images = images.filter((im) => im.n !== n);
    for (const ed of f.querySelectorAll('.rv-ed')) removeChips(ed, n);
    paintImages(f);
    saveNow(f);
    enqueue(async () => {
      try { await api.dropDraftFile(id, n); }
      catch (e) { if (f.isConnected) showErr(f, `No se ha podido quitar la imagen: ${e.message}`); }
    });
  };
  // Al retomar un borrador, sus miniaturas llegan del bridge una a una.
  const loadThumbs = (f) => {
    const id = opened;
    for (const im of images.filter((i) => !i.url)) {
      api.draftFile(id, im.n).then((got) => {
        if (opened !== id || !f.isConnected) return;
        images = images.map((i) => (i.n === im.n ? { ...i, url: `data:${got.type};base64,${got.data}` } : i));
        paintImages(f);
      }).catch(() => {});
    }
  };
  // Lo soltado va al campo del paso a la vista (en el 1, donde esté el cursor).
  const dropZone = (e) => e.target.closest?.(`[data-act-form="resolve"]:not([data-step="${LAST}"])`);
  const stepField = (f) => f.querySelector('[data-rstep]:not([hidden]) [data-images]')?.dataset.for || null;

  /* ── Mover una ficha: arrastrarla (desde el texto o desde el muelle) y soltarla en el punto del
     texto. Mientras se arrastra, el origen se atenúa y una línea del color de la ficha marca en
     vivo dónde caerá; sin la copia de la ficha pegada al ratón. ── */
  let dragChip = null;
  const ghost = new Image(); ghost.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const noDragImage = (e) => e.dataTransfer.setDragImage(ghost, 0, 0);
  const caret = document.createElement('i');
  caret.className = 'rv-caret';
  caret.hidden = true;
  document.body.append(caret);
  const showCaret = (ed, range) => {
    let r = range?.getBoundingClientRect();
    if (!r || (!r.height && !r.width)) { const b = ed.getBoundingClientRect(); r = { left: b.left + 10, top: b.top + 8, height: 20 }; }   // editor vacío: al principio
    Object.assign(caret.style, { left: `${r.left}px`, top: `${r.top}px`, height: `${r.height || 20}px` });
    caret.hidden = false;
  };
  const hideCaret = () => { caret.hidden = true; };

  /* ── El último paso, en tres estados: las opciones y «Generar informe»; el simulacro de la IA
     (las fases se marcan una a una); y el informe, para revisar y resolver. ── */
  let generating = null;
  let reportOriginal = '';   // el texto tal como lo devolvió la IA, para poder volver a él
  const genParts = (f) => ({ cap: f.querySelector('[data-gen-cap]'), gen: f.querySelector('[data-gen]'), btn: f.querySelector('[data-generate]'), loader: f.querySelector('[data-loader]'), review: f.querySelector('[data-review]'), warn: f.querySelector('[data-warn]'), title: f.querySelector('[data-gen-title]'), state: f.querySelector('[data-gen-state]'), send: f.querySelector('[data-confirm-send]') });
  // el título de arriba solo con el informe; antes, va dentro del bloque centrado o del proceso
  const genHead = (p, title, state = '') => { p.cap.hidden = !title; p.cap.classList.toggle('rv-cap-center', !state); p.title.textContent = title; p.state.textContent = state; p.state.hidden = !state; };
  const showGenerate = (f) => {
    clearTimeout(generating); generating = null;
    const p = genParts(f);
    p.gen.hidden = false; p.loader.hidden = true; p.review.hidden = true; p.warn?.setAttribute('hidden', '');
    genHead(p, '');
    f.querySelector('[data-summary]').innerHTML = summaryHtml(Object.fromEntries(new FormData(f)));
    p.send.hidden = true; p.btn.hidden = false;
    p.btn.focus({ preventScroll: true });
  };
  const showReview = (f, p) => {
    p.review.hidden = false; p.warn?.removeAttribute('hidden');
    genHead(p, 'Borrador del informe', 'Revísalo antes de resolver');
    p.send.hidden = false;
  };
  // El borrador de la IA (de momento, el de relleno) con lo escrito y las imágenes
  const repaintReview = (f) => {
    const { values } = readAction('resolve', Object.fromEntries(new FormData(f)));
    f.querySelector('[data-review]').innerHTML = reportHtml(values, images, { lang: f.elements.lang.value, hour: new Date().getHours(), issueId: opened });
    reportOriginal = f.querySelector('[data-rep-text]').innerHTML;
  };
  // o la pista, o el enlace para volver al texto de la IA: nunca los dos
  const syncRepTools = (f, changed) => { f.querySelector('[data-rep-hint]').hidden = changed; f.querySelector('[data-rep-restore]').hidden = !changed; };
  const restoreReport = (f) => { f.querySelector('[data-rep-text]').innerHTML = reportOriginal; syncRepTools(f, false); };
  // Las fases y los difuminados (ui/wizard.js), con su temporizador en `generating` para pararlos al cerrar
  const track = (id) => { generating = id; };
  const runPhases = (f, title, html) => phasesIn(genParts(f).loader, title, html, { alive: () => f.isConnected, track });
  const fadeOut = (el) => fade(el, track);
  const generate = async (f) => {
    const p = genParts(f);
    p.btn.hidden = true;
    genHead(p, '');   // el título va dentro del proceso, pegado al giro
    await fadeOut(p.gen);
    if (!f.isConnected) return;
    p.loader.hidden = false;
    await runPhases(f, 'Redactando el informe', phasesHtml(images.length > 0 || extras.length > 0));
    if (!f.isConnected) return;
    repaintReview(f);
    await fadeOut(p.loader);
    if (!f.isConnected) return;
    showReview(f, p);
    // con el borrador, los pasos de arriba se van y queda el título centrado, en mayúsculas
    f.querySelector('.rv-steps').hidden = true;
    p.cap.classList.add('rv-cap-center', 'rv-cap-final');
    p.send.focus({ preventScroll: true });
  };
  // Resolver: el informe se va, el proceso de cierre en el centro y, al acabar, la ventana se funde
  // y la mesa se pone al día (onResolved). Si el bridge lo rechaza, vuelve el borrador con el error.
  const finishResolve = async (f, work) => {
    const p = genParts(f);
    p.send.hidden = true;
    await Promise.all([fadeOut(p.review), fadeOut(p.cap), p.warn && fadeOut(p.warn)]);
    if (!f.isConnected) return;
    p.cap.classList.remove('rv-cap-center', 'rv-cap-final');
    p.loader.hidden = false;
    try {
      await Promise.all([work, runPhases(f, 'Resolviendo la incidencia', closePhasesHtml())]);
    } catch (err) {
      if (!f.isConnected) return;
      clearTimeout(generating);
      p.loader.hidden = true;
      showReview(f, p);
      return showErr(f, err.message);
    }
    if (!f.isConnected) return;
    root.querySelector('.iss-modal')?.classList.add('closing');
    await new Promise((done) => setTimeout(done, 400));
    onResolved();
  };
  const submit = async (f) => {
    if (Number(f.dataset.step) < LAST) return stepNext(f);   // Intro en un paso: siguiente
    const send = f.querySelector('[data-confirm-send]');
    if (send.disabled || send.hidden) return;   // un segundo clic mientras se envía
    send.disabled = true;
    // la issue y lo escrito de ESTE formulario, aunque mientras se abra otra
    const id = opened, fields = Object.fromEntries(new FormData(f));
    // lo último escrito, guardado antes: si el bridge lo rechaza, no se pierde
    if (autosave) { clearTimeout(autosave); autosave = null; saveNow(f); }
    const work = (async () => { await saving; await api.resolve(id, fields); })();
    work.catch(() => {});
    await finishResolve(f, work);
    send.disabled = false;
  };
  // «Descargar PDF»: el mensaje en una ventana de impresión, que el sistema guarda como PDF
  const downloadPdf = (f) => {
    const title = `Informe ${opened}`;
    const body = f.querySelector('[data-rpanel]').innerHTML;
    const w = window.open('', '_blank');
    if (!w) return toast?.('El navegador ha bloqueado la ventana del PDF.');
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
      body { margin: 40px; font: 14px/1.5 Helvetica, Arial, sans-serif; color: #000; } h1 { font-size: 20px; } h2 { margin: 28px 0 10px; font-size: 16px; }
      h5 { margin: 14px 0 4px; font-size: 11px; letter-spacing: .04em; text-transform: uppercase; color: #757575; } p { margin: 0 0 8px; white-space: pre-wrap; }
      .rv-rep-att { display: flex; align-items: center; gap: 10px; margin-top: 12px; } .rv-rep-att svg { width: 20px; height: 20px; } .rv-rep-att b { display: block; font-size: 13px; } .rv-rep-att small { font-size: 11px; color: #757575; }
    </style></head><body><h1>${esc(title)}</h1>${body}</body></html>`);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 300);   // con las imágenes ya pintadas
  };
  // Otros archivos (de momento solo se listan: no salen de SIA)
  const paintExtras = (f) => { f.querySelector('[data-extra-list]').innerHTML = extras.map((x, i) => `<li><span>${esc(x.name)}</span><small>${(x.size / 1024).toFixed(0)} KB</small><button type="button" class="rv-img-x" data-extra-drop="${i}" aria-label="Quitar ${esc(x.name)}">×</button></li>`).join(''); };

  /* ── Los listeners, acotados al formulario de Resolver ── */
  const inResolve = (e) => e.target.closest?.('[data-act-form="resolve"]');
  root.addEventListener('click', (e) => {
    const f = inResolve(e);
    if (!f) {
      // el aviso de puntos sin cubrir: de momento solo se avisa; el comando al chat llegará con la resolución asistida
      if (e.target.closest?.('[data-resolve-chat]')) { close(); root.querySelector('.iss-modal')?.remove(); toast?.('Se lanzaría un comando al chat para ayudar con la resolución.'); }
      return;
    }
    const t = e.target;
    if (t.closest('[data-step-next]')) return stepNext(f);
    const mark = t.closest('[data-step-mark], [data-go]');
    if (mark) return jumpTo(f, Number(mark.dataset.stepMark ?? mark.dataset.go));
    if (t.closest('[data-step-back]')) return moveTo(f, Number(f.dataset.step) - 1);
    if (t.closest('[data-restore-note]')) return restoreNote(f);
    if (t.closest('[data-generate]')) return generate(f);
    if (t.closest('[data-pdf]')) return downloadPdf(f);
    if (t.closest('[data-rep-restore]')) return restoreReport(f);
    const xd = t.closest('[data-extra-drop]');
    if (xd) { extras = extras.filter((_, i) => i !== Number(xd.dataset.extraDrop)); return paintExtras(f); }
    const dropImg = t.closest('[data-img-drop]');
    if (dropImg) return removeImage(f, Number(dropImg.dataset.imgDrop));
  });
  root.addEventListener('submit', (e) => { const f = inResolve(e); if (f) { e.preventDefault(); submit(f); } });
  // Lo que se escribe en un editor pasa a su campo oculto antes de que nadie lea el formulario,
  // y lo escrito se guarda solo un momento después de dejar de teclear.
  root.addEventListener('input', (e) => {
    const f = inResolve(e);
    if (!f || e.target.matches('[data-file]')) return;
    const ed = e.target;
    if (ed.matches('.rv-ed')) {
      syncEditor(ed);
      if (ed.dataset.ed !== 'note') paintImages(f);   // la pregunta nombra otras imágenes
      if (ed.dataset.ed === 'note') syncRestore(f);
      const meter = ed.closest('.iss-field').querySelector('[data-meter]');
      if (meter) meter.outerHTML = noteMeter(toText(ed), ed.dataset.ed);
    }
    const rep = ed.closest('[data-rep-text]');
    if (rep) return syncRepTools(f, rep.innerHTML !== reportOriginal);   // retocar el informe enseña «Volver al texto de la IA»
    showErr(f, null);   // lo que faltaba ya se está escribiendo
    clearTimeout(autosave);
    autosave = setTimeout(() => { autosave = null; saveNow(f); }, AUTOSAVE_MS);
  }, true);
  root.addEventListener('focusin', (e) => { if (e.target.matches?.('[data-act-form="resolve"] .rv-ed')) lastArea = e.target; });
  root.addEventListener('change', (e) => {
    const f = inResolve(e);
    if (!f || !e.target.files?.length) return;
    if (e.target.matches('[data-extra]')) { extras = [...extras, ...e.target.files]; paintExtras(f); e.target.value = ''; }
    if (e.target.matches('[data-file]')) { addImages(f, e.target.files, e.target.dataset.for || null); e.target.value = ''; }
  });
  // Pegar una captura en un campo la añade (el texto pegado sigue yendo al campo).
  root.addEventListener('paste', (e) => {
    const f = inResolve(e);
    const files = [...(e.clipboardData?.files || [])].filter((x) => x.type.startsWith('image/'));
    if (!f || !files.length) return;
    e.preventDefault();
    addImages(f, files, e.target.closest?.('.rv-ed')?.dataset.ed || null);
  });
  // Arrastrar: una ficha del texto o una miniatura del muelle, con su [imagenN] como dato
  root.addEventListener('dragstart', (e) => {
    const chip = e.target.closest?.('.rv-chip'), fig = e.target.closest?.('[data-img]');
    const src = chip || fig;
    if (!src) return;
    dragChip = chip;
    src.classList.add('dragging');
    noDragImage(e);
    e.dataTransfer.setData('text/plain', imageTag(Number(chip ? chip.dataset.n : fig.dataset.img)));
    e.dataTransfer.effectAllowed = chip ? 'move' : 'copy';
  });
  root.addEventListener('dragend', (e) => { e.target.closest?.('.rv-chip, [data-img]')?.classList.remove('dragging'); dragChip = null; hideCaret(); });
  root.addEventListener('dragover', (e) => {
    const ed = e.target.closest?.('.rv-ed');
    if (ed && !hasFiles(e)) {   // una ficha sobre el texto: la línea dice dónde caerá
      e.preventDefault();
      e.dataTransfer.dropEffect = dragChip ? 'move' : 'copy';
      return showCaret(ed, rangeAtPoint(document, e.clientX, e.clientY));
    }
    hideCaret();
    const z = hasFiles(e) && dropZone(e);   // imágenes sobre el modal: el muelle se marca como destino
    if (z) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; z.classList.add('over'); }
  });
  root.addEventListener('dragleave', (e) => {
    const ed = e.target.closest?.('.rv-ed');
    if (ed && !ed.contains(e.relatedTarget)) hideCaret();
    const z = dropZone(e);
    if (z && !z.contains(e.relatedTarget)) z.classList.remove('over');
  });
  root.addEventListener('drop', (e) => {
    hideCaret();
    const z = hasFiles(e) && dropZone(e);
    if (z) {
      e.preventDefault();
      z.classList.remove('over');
      return addImages(z, e.dataTransfer.files, stepField(z));
    }
    const ed = e.target.closest?.('.rv-ed');
    const m = !hasFiles(e) && ed && (e.dataTransfer?.getData('text/plain') || '').match(/^\[imagen(\d+)\]$/);
    if (!m) return;
    e.preventDefault();
    const range = rangeAtPoint(document, e.clientX, e.clientY);
    if (dragChip?.isConnected) { if (range && dragChip.contains(range.startContainer)) { dragChip.classList.remove('dragging'); return; } dragChip.remove(); }
    insertChip(ed, Number(m[1]), range);
    dragChip = null;
  });
  // Fuera del modal el navegador no abre ni descarga lo que se suelte (en toda la página).
  const ignoreDrop = (e) => {
    if (!hasFiles(e) || (root.contains(e.target) && dropZone(e))) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'none';
  };
  document.addEventListener('dragover', ignoreDrop);
  document.addEventListener('drop', ignoreDrop);

  // Cerrar: lo pendiente de guardar se guarda, y se para lo que estuviera en marcha.
  const close = () => { flushSave(); clearTimeout(generating); generating = null; offEscape?.(); offEscape = null; opened = null; };

  return {
    // Abrir Resolver sobre una issue: lo que hay en Remedy, lo que falta y mi borrador los da el
    // bridge (también dice si se puede). Con puntos sin cubrir, el aviso; si no, el asistente en el
    // paso en el que se quedó. Pinta el modal en root y devuelve cuando está a la vista.
    async open(issueId, link, onClose) {
      await saving;   // lo que se guardaba al cerrar, antes de leer el borrador
      const start = await api.startResolve(issueId);
      opened = issueId;
      images = (start.draft?.images || []).map((im) => ({ ...im, url: null }));
      extras = [];
      const blocked = start.check.missing.length > 0;
      root.insertAdjacentHTML('beforeend', `<div class="iss-modal">${blocked ? resolveBlocked(issueId, start.check) : resolveForm(issueId, start.check, start.draft, link)}</div>`);
      offEscape = onEscape(onClose);
      if (blocked) { root.querySelector('[data-resolve-chat]').focus(); return; }
      const f = form();
      f.querySelector('.rv-ed')?.focus();
      const resume = resumeStep(start.check, start.draft);
      if (resume > 1) goStep(f, resume);
      loadThumbs(f);
    },
    close,
    dispose: () => { close(); caret.remove(); document.removeEventListener('dragover', ignoreDrop); document.removeEventListener('drop', ignoreDrop); },
  };
};
