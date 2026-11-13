// Escalar una issue: el asistente de cuatro pasos encima de la pantalla de trabajo (escalate-form.js
// pinta; aquí el cableado), con el comportamiento de Resolver: las piezas comunes (ui/wizard.js),
// el borrador solo en la BBDD local y el cierre por fases. De momento no sale nada hacia Remedy:
// al acabar, la vista avisa (onEscalated).
import { onEscape } from '../ui/dialog.js';
import { esc } from '../ui/html.js';
import { BACK_ARROW, NEXT_ARROW, slideStep, flashEmpty, fadeOut as fade, runPhases } from '../ui/wizard.js';
import { escalateForm, sendHtml, linkedText, summaryHtml, closePhases } from './escalate-form.js';
import { resolveBlocked, noteMeter, localShort } from './resolve-form.js';
import { stepMissing, stepWarning, resumeStep, channelOf, destOf, targetOf, STEPS, LAST } from './escalate.js';

const AUTOSAVE_MS = 800;   // el mismo que Resolver

// root: la vista de Issues; api: issues-api.js; dialogs: ui/dialog.js (los avisos); dests y tickets: el catálogo y los tickets abiertos
// (de prueba); onEscalated(target, mode): ya escalada o unida, y la ventana se ha ido.
export const createEscalator = (root, { api, dialogs, toast, dests, tickets, onEscalated }) => {
  let opened = null, issue = null, check = null, offEscape = null, closeIt = null, timer = null;
  const form = () => root.querySelector('[data-act-form="escalate"]');
  const values = (f) => Object.fromEntries(new FormData(f));
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
  // El pie y la barra según el paso y lo que se hace: al unir, todo acaba en el 1.
  const syncFoot = (f) => {
    const n = Number(f.dataset.step), link = isLink(f), done = link || n === LAST;
    f.querySelectorAll('[data-step-mark]').forEach((m) => m.classList.toggle('off', link && m.dataset.stepMark !== '1'));
    const next = f.querySelector('[data-step-next]'), send = f.querySelector('[data-confirm-send]');
    next.hidden = done;
    if (!done) next.innerHTML = `${STEPS[n].title}${NEXT_ARROW}`;   // el nombre del paso al que se va
    send.hidden = !done;
    send.textContent = link ? 'Unir al ticket' : 'Escalar';
  };
  const goStep = (f, n) => {
    const prev = Number(f.dataset.step);
    f.dataset.step = String(n);
    f.elements.step.value = String(n);   // va en el borrador: al volver se retoma aquí
    showErr(f, null);
    f.querySelectorAll('[data-rstep]').forEach((p) => { p.hidden = p.dataset.rstep !== String(n); });
    slideStep(f, prev, n);
    f.querySelectorAll('[data-step-mark]').forEach((m) => {
      const k = Number(m.dataset.stepMark);
      m.classList.toggle('done', k < n);
      if (k === n) m.setAttribute('aria-current', 'step'); else m.removeAttribute('aria-current');
    });
    const back = f.querySelector('[data-step-back]');
    back.hidden = n === 1;
    if (n > 1) back.innerHTML = `${BACK_ARROW}${STEPS[n - 2].title}`;
    syncFoot(f);
    if (n === LAST) f.querySelector('[data-summary]').innerHTML = summaryHtml(values(f), dests);
    f.querySelector('.rv-body').scrollTop = 0;
    // sin desplazar: enfocar mientras entra deslizándose se vería como un salto
    (n === LAST ? f.querySelector('[data-confirm-send]') : f.querySelector(`[data-rstep="${n}"] :is(textarea, [data-pick-btn])`))?.focus({ preventScroll: true });
    f.querySelector('.rv-body').scrollLeft = 0;
  };
  const moveTo = (f, n) => { goStep(f, n); saveNow(f); };
  // El campo que falta (stepMissing) parpadea con el aviso en su caja: el selector de equipo,
  // la lista de tickets o el campo de texto.
  const flashMissing = (f, { field, text }) => {
    const el = field === 'dest' ? f.querySelector('#iss-f-dest') : field === 'linked' ? f.querySelector('.iss-esc-open') : f.elements[field];
    flashEmpty(el, el.closest('.iss-field, .iss-esc-open'), text);
  };
  // → true si el paso n está completo; si no, lo señala
  const complete = (f, n) => {
    const missing = stepMissing(n, values(f), dests);
    if (missing) flashMissing(f, missing);
    return !missing;
  };
  // Lo que se le puede pasar al técnico (escalate.js): se puede seguir, pero avisando. → true si sigue
  const confirmed = async (f, n) => {
    const w = stepWarning(n, values(f), { dests, issue, background: check.background });
    if (!w) return true;
    const ok = await dialogs.open({ title: w.title, centered: true, okLabel: w.ok, bodyHTML: `<p class="iss-dlg-p">${esc(w.text)}</p>` });
    return ok && f.isConnected;
  };
  const stepNext = async (f) => {
    const n = Number(f.dataset.step);
    if (complete(f, n) && await confirmed(f, n)) moveTo(f, n + 1);
  };
  // Pulsar un paso de arriba (o una fila del resumen): hacia atrás, siempre; hacia delante, hasta
  // donde esté todo completo (si falta algo por el camino, se para ahí y lo señala).
  const jumpTo = (f, target) => {
    const current = Number(f.dataset.step);
    if (target === current || isLink(f)) return;
    if (target < current) return moveTo(f, target);
    for (let k = current; k < target; k++) {
      const missing = stepMissing(k, values(f), dests);
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
  // El paso 1 decide el resto: lo que se ve en él, lo que pide el 3 y por dónde va.
  const syncChoice = (f) => {
    const v = values(f), link = v.mode === 'link';
    f.querySelector('[data-esc-mode="escalate"]').hidden = link;
    f.querySelector('[data-esc-mode="link"]').hidden = !link;
    f.querySelector('[data-esc-other]').hidden = v.dest !== 'other';
    f.querySelector('[data-esc-linked]').innerHTML = linkedText(v.linkedOther);
    f.querySelector('[data-esc-channel]').textContent = channelOf(destOf(v, dests));
    f.querySelector('[data-esc-send]').innerHTML = sendHtml(v, { issue, dests });
    syncFoot(f);
  };

  /* ── Escalar: lo de antes se va, las fases en el centro y la ventana se funde ── */
  // las fases y los difuminados (ui/wizard.js), con su temporizador en `timer` para pararlos al cerrar
  const track = (id) => { timer = id; };
  const fadeOut = (el) => fade(el, track);
  const submit = async (f) => {
    const n = Number(f.dataset.step), link = isLink(f);
    if (!link && n < LAST) return stepNext(f);   // Intro en un paso: siguiente
    const send = f.querySelector('[data-confirm-send]');
    if (send.disabled) return;   // un segundo clic mientras se envía
    send.disabled = true;
    if (link && !(complete(f, 1) && await confirmed(f, 1))) { send.disabled = false; return; }
    const id = opened, fields = values(f);
    if (autosave) { clearTimeout(autosave); autosave = null; saveNow(f); }
    const work = (async () => { await saving; await api.escalate(id, fields); })();
    work.catch(() => {});
    const review = [f.querySelector('[data-esc-review]'), f.querySelector('[data-esc-cap]')];
    send.hidden = true; f.querySelector('[data-step-back]').hidden = true;
    f.querySelector('.rv-steps').hidden = true;
    // al unir no se ha pasado por Revisar: se va el paso 1 y las fases salen en el sitio del último
    await Promise.all((link ? [f.querySelector('[data-rstep="1"]')] : review).map(fadeOut));
    if (!f.isConnected) return;
    if (link) { review.forEach((p) => { p.hidden = true; }); f.querySelector(`[data-rstep="${LAST}"]`).hidden = false; }
    const loader = f.querySelector('[data-loader]');
    loader.hidden = false;
    try {
      await Promise.all([work, runPhases(loader, link ? 'Uniendo la incidencia' : 'Escalando la incidencia', closePhases(fields, issue.status === 'RESOLVED'), { alive: () => f.isConnected, track })]);
    } catch (err) {
      if (!f.isConnected) return;
      clearTimeout(timer);
      loader.hidden = true;
      f.querySelector('.rv-steps').hidden = false;
      review.forEach((p) => { p.hidden = false; });
      send.disabled = false;
      goStep(f, link ? 1 : LAST);
      return showErr(f, err.message);
    }
    if (!f.isConnected) return;
    root.querySelector('.iss-modal')?.classList.add('closing');
    await new Promise((done) => setTimeout(done, 400));
    onEscalated(targetOf(fields, dests), fields.mode);
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
    if (t.closest('[data-step-next]')) return stepNext(f);
    const mark = t.closest('[data-step-mark], [data-go]');
    if (mark) return jumpTo(f, Number(mark.dataset.stepMark ?? mark.dataset.go));
    if (t.closest('[data-step-back]')) return moveTo(f, Number(f.dataset.step) - 1);
    if (t.closest('[data-restore-note]')) {
      const ta = f.elements.reason;
      ta.value = f.querySelector('[data-restore-note]').dataset.original;
      ta.dispatchEvent(new Event('input', { bubbles: true }));   // la barra, el botón y el borrador, al día
      ta.focus();
    }
  });
  root.addEventListener('submit', (e) => { const f = inForm(e); if (f) { e.preventDefault(); submit(f); } });
  root.addEventListener('input', (e) => {
    const f = inForm(e);
    if (!f) return;
    if (e.target.closest('[data-rstep="1"]')) syncChoice(f);
    if (e.target.name === 'reason') {
      syncRestore(f);
      f.querySelector('[data-meter]').outerHTML = noteMeter(e.target.value, 'reason');
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

  // Cerrar: lo pendiente de guardar se guarda, y se para lo que estuviera en marcha.
  const close = () => { flushSave(); clearTimeout(timer); timer = null; offEscape?.(); offEscape = null; opened = null; closeIt = null; };

  return {
    // Abrir Escalar sobre la issue abierta: el bridge dice si se puede (las notas del método) y da
    // mi borrador. Sin las notas, el aviso; si no, el asistente en el paso en el que se quedó.
    // onClose: lo que cierra la ventana (Escape, el aviso).
    async open(theIssue, link, onClose) {
      await saving;   // lo que se guardaba al cerrar, antes de leer el borrador
      const start = await api.startEscalate(theIssue.id);
      opened = theIssue.id; issue = theIssue; check = start.check; closeIt = onClose;
      const blocked = start.check.missing.length > 0;
      root.insertAdjacentHTML('beforeend', `<div class="iss-modal">${blocked
        ? resolveBlocked(issue.id, start.check, { title: 'Aún no se puede escalar', chat: 'data-escalate-chat' })
        : escalateForm({ issue, dests, open: tickets, check: start.check, saved: start.draft, link })}</div>`);
      offEscape = onEscape(onClose);
      if (blocked) { root.querySelector('[data-escalate-chat]').focus(); return; }
      const f = form();
      syncFoot(f);
      const resume = resumeStep(start.draft, dests);
      if (resume > 1) goStep(f, resume); else f.querySelector('#iss-f-dest, [name="mode"]:checked')?.focus();
    },
    close,
  };
};
