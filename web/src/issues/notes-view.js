// El cableado de la pestaña Seguimiento de una issue (el HTML, notes-html.js; el
// dominio, notes.js): plegar y desplegar cada nota, elegir quién la verá y su
// etiqueta, enviar, y editar la propia. Escucha en la vista de Issues (root),
// que le dice qué issue se enseña (attach) y le pide repintar tras anotar algo
// desde otro sitio (refresh, como Reclamar respuesta).
//
// deps: root · api (addNote, editNote, timeline) · toast · me ({ id })
import { notesFeed, noteCount, sendsNote, tagLabel, isCallTag } from './notes.js';
import { notesListHtml, noteItemHtml, noteEditorHtml, notesTab, visPickHtml } from './notes-html.js';

const GROW_MAX_PX = 160; // lo que crece la caja de escribir antes de hacer scroll

export const createNotes = ({ root, api, toast, me }) => {
  let issue = null, feed = [], open = new Set();
  const $ = (sel) => root.querySelector(sel);
  const ctx = () => ({ open, meId: me?.id ?? null, now: new Date(), remedyMissing: !issue?.worklog });
  const entryOf = (key) => feed.find((e) => e.key === key) || null;
  const toEnd = () => { const s = $('[data-notes-scroll]'); if (s) s.scrollTop = s.scrollHeight; };
  const paint = () => {
    const list = $('[data-notes-list]');
    if (list) list.innerHTML = notesListHtml(feed, ctx());
    const tab = $('[data-wtab="notes"]');
    if (tab) tab.innerHTML = notesTab(noteCount(feed));
  };
  const paintOne = (key) => {
    const li = root.querySelector(`[data-notes-list] [data-note-key="${CSS.escape(key)}"]`);
    const e = entryOf(key);
    if (li && e) li.outerHTML = noteItemHtml(e, { ...ctx(), open: open.has(key) });
  };

  // La issue que se enseña (work-screen.js ya la ha pintado con las mismas reglas)
  const attach = (i, timeline) => {
    issue = i;
    feed = notesFeed({ worklog: i.worklog, timeline });
    open = new Set(); // todo plegado
  };
  // Releer el histórico y repintar (lo nuevo, plegado como todo) y abajo del todo
  const refresh = async () => {
    if (!issue) return;
    feed = notesFeed({ worklog: issue.worklog, timeline: await api.timeline(issue.id) });
    paint();
    toEnd();
  };

  // Plegar o desplegar una nota (no si se está seleccionando su texto)
  const toggle = (key) => {
    if (String(window.getSelection?.() || '').trim()) return;
    if (open.has(key)) open.delete(key); else open.add(key);
    paintOne(key);
  };

  // ── La barra de escribir ──
  const formEl = () => $('[data-note-form]');
  const closeMenus = () => {
    const f = formEl();
    if (!f) return false;
    const was = [...f.querySelectorAll('[data-vis-menu], [data-tag-menu]')].some((m) => !m.hidden);
    f.querySelectorAll('[data-vis-menu], [data-tag-menu]').forEach((m) => { m.hidden = true; });
    f.querySelectorAll('[data-vis-pick], [data-tag-pick]').forEach((b) => b.setAttribute('aria-expanded', 'false'));
    return was;
  };
  const toggleMenu = (which) => {
    const f = formEl();
    const menu = f.querySelector(which === 'vis' ? '[data-vis-menu]' : '[data-tag-menu]');
    const opening = menu.hidden;
    closeMenus();
    menu.hidden = !opening;
    f.querySelector(which === 'vis' ? '[data-vis-pick]' : '[data-tag-pick]').setAttribute('aria-expanded', String(opening));
  };
  const setVisibility = (f, v) => {
    f.dataset.visibility = v;
    f.classList.toggle('is-public', v === 'public');
    f.querySelector('[data-vis-pick]').innerHTML = visPickHtml(v);
    f.querySelectorAll('[data-set-vis]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.setVis === v)));
    f.querySelector('[data-public-hint]').hidden = v !== 'public';
  };
  const setTag = (f, tag) => {
    f.dataset.tag = tag || '';
    const chip = f.querySelector('[data-tag-chip]');
    chip.hidden = !tag;
    chip.querySelector('[data-tag-name]').textContent = tag ? tagLabel(tag) : '';
    f.querySelectorAll('[data-set-tag]').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.setTag === tag)));
    f.note.placeholder = isCallTag(tag) ? 'El teléfono y lo que se habló…' : 'Escribe una nota…'; // una llamada: así se lee bien
  };
  const grow = (ta) => { ta.style.height = 'auto'; ta.style.height = `${Math.min(ta.scrollHeight, GROW_MAX_PX)}px`; };
  const sync = (f) => { f.querySelector('[type=submit]').disabled = !f.note.value.trim(); };

  // Enviar: se guarda, se repinta (con la nueva desplegada, abajo) y la barra
  // vuelve a interna y sin etiqueta, para no mandar la siguiente pública sin querer.
  const send = async (f) => {
    const body = f.note.value.trim();
    if (!body || !issue) return;
    const btn = f.querySelector('[type=submit]');
    btn.disabled = true;
    try {
      await api.addNote(issue.id, body, { visibility: f.dataset.visibility, tag: f.dataset.tag || null });
      f.note.value = '';
      grow(f.note);
      setVisibility(f, 'internal');
      setTag(f, null);
      await refresh();
      toast?.('Nota añadida.');
    } catch (err) { toast?.(err.message); sync(f); }
  };

  // ── Editar la propia: el editor en el sitio de su caja ──
  const openEditor = (key) => {
    const e = entryOf(key);
    if (!e) return;
    if (!open.has(key)) { open.add(key); paintOne(key); }
    const li = root.querySelector(`[data-notes-list] [data-note-key="${CSS.escape(key)}"]`);
    const box = li?.querySelector('[data-note-fold]');
    if (box) box.outerHTML = noteEditorHtml(e.text);
    else if (li) li.querySelector('.iss-feed-body').insertAdjacentHTML('beforeend', noteEditorHtml(e.text)); // una llamada sin nada que contar no tiene caja
    const ta = root.querySelector(`[data-note-key="${CSS.escape(key)}"] [data-note-edit] textarea`);
    ta.closest('[data-note-edit]').scrollIntoView({ block: 'nearest' }); // con Guardar y Cancelar a la vista
    ta.focus({ preventScroll: true });
    ta.setSelectionRange(ta.value.length, ta.value.length);
  };
  const save = async (form) => {
    const body = form.note.value.trim();
    const e = entryOf(form.closest('[data-note-key]')?.dataset.noteKey);
    if (!body || !e) return;
    form.querySelector('[type=submit]').disabled = true;
    try { await api.editNote(issue.id, e.id, body); await refresh(); toast?.('Nota editada.'); }
    catch (err) { toast?.(err.message); form.querySelector('[type=submit]').disabled = false; }
  };

  const onClick = (ev) => {
    const t = ev.target;
    const f = formEl();
    if (f && !t.closest?.('[data-vis-menu], [data-tag-menu], [data-vis-pick], [data-tag-pick]')) closeMenus(); // un clic fuera cierra los menús
    if (!t.closest?.('[data-wpanel="notes"]')) return;
    if (t.closest('[data-vis-pick]')) return toggleMenu('vis');
    if (t.closest('[data-tag-pick]')) return toggleMenu('tag');
    const sv = t.closest('[data-set-vis]');
    if (sv) { setVisibility(f, sv.dataset.setVis); closeMenus(); return f.note.focus(); }
    const st = t.closest('[data-set-tag]');
    if (st) { setTag(f, st.dataset.setTag); closeMenus(); return f.note.focus(); }
    if (t.closest('[data-tag-clear]')) { setTag(f, null); return f.note.focus(); }
    const ed = t.closest('[data-edit-note]');
    if (ed) return openEditor(ed.dataset.editNote);
    if (t.closest('[data-edit-cancel]')) return paint();
    const fold = t.closest('[data-note-fold]');
    if (fold) toggle(fold.closest('[data-note-key]').dataset.noteKey);
  };
  const onKey = (ev) => {
    const t = ev.target;
    if (t.matches?.('[data-note-edit] textarea')) {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); return paint(); }
      if (sendsNote(ev)) { ev.preventDefault(); return save(t.closest('[data-note-edit]')); }
      return;
    }
    if (t.matches?.('[data-note-form] textarea')) {
      if (ev.key === 'Escape' && closeMenus()) { ev.preventDefault(); ev.stopPropagation(); return; }
      if (sendsNote(ev)) { ev.preventDefault(); return send(t.closest('[data-note-form]')); }
      return;
    }
    if (t.matches?.('[data-note-fold]') && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); return toggle(t.closest('[data-note-key]').dataset.noteKey); }
    if (ev.key === 'Escape' && t.closest?.('[data-note-form]') && closeMenus()) { ev.preventDefault(); ev.stopPropagation(); } // con el foco en un menú
  };
  const onInput = (ev) => {
    if (!ev.target.matches?.('[data-note-form] textarea')) return;
    grow(ev.target);
    sync(ev.target.closest('[data-note-form]'));
  };
  const onSubmit = (ev) => {
    const ne = ev.target.closest('[data-note-edit]');
    if (ne) { ev.preventDefault(); return save(ne); }
    const nf = ev.target.closest('[data-note-form]');
    if (nf) { ev.preventDefault(); send(nf); }
  };
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKey);
  root.addEventListener('input', onInput);
  root.addEventListener('submit', onSubmit);

  return {
    attach, refresh,
    // al enseñar la pestaña: abajo del todo, en lo último
    shown: toEnd,
    dispose: () => {
      root.removeEventListener('click', onClick);
      root.removeEventListener('keydown', onKey);
      root.removeEventListener('input', onInput);
      root.removeEventListener('submit', onSubmit);
    },
  };
};
