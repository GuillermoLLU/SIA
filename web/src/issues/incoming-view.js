// El cableado de «Llamada de un centro» en el panel (el HTML y las reglas,
// incoming.js): buscar la incidencia mientras se escribe, elegirla con el ratón
// o con las flechas e Intro, y la ventana con su detalle, donde se guarda lo
// que se habló como una llamada atendida en su Seguimiento.
//
// deps: root (la vista de Issues) · api (search, get, addNote) · toast
import { onEscape } from '../ui/dialog.js';
import { pressStartedIn } from '../ui/dom.js';
import { MIN_DIGITS, digitsOf, hitsHtml, recentOf, recentHtml, incomingModalHtml } from './incoming.js';
import { callReady, callNote } from './call.js';
import { fitNotes } from './notes-fit.js';

// ¿Se puede guardar? El teléfono desde el que llaman y lo que se habló (como una llamada atendida)
const ready = (values) => callReady(values).answered;

const SEARCH_MS = 180; // lo que se espera a que deje de escribir antes de buscar

export const createIncoming = ({ root, api, toast }) => {
  let results = [], active = 0, timer = 0, asked = 0;
  let modal = null, offEscape = null;
  let recent = [], open = new Set();
  const input = () => root.querySelector('[data-incoming-q]');
  const hits = () => root.querySelector('[data-incoming-hits]');

  // ── Buscar ──
  const hide = () => { const h = hits(); if (h) h.hidden = true; };
  const paintHits = () => {
    const h = hits(), q = input();
    if (!h || !q) return;
    h.innerHTML = hitsHtml(results, q.value, active);
    h.hidden = false;
  };
  const search = () => {
    clearTimeout(timer);
    const q = input()?.value || '';
    if (digitsOf(q).length < MIN_DIGITS) { results = []; return hide(); }
    timer = setTimeout(async () => {
      const mine = ++asked; // si llega tarde una búsqueda anterior, no pisa a la última
      let found = [];
      try { found = await api.search(q); } catch (err) { toast?.(err.message); }
      if (mine !== asked) return;
      results = found; active = 0;
      paintHits();
    }, SEARCH_MS);
  };
  const move = (step) => { if (!results.length) return; active = (active + step + results.length) % results.length; paintHits(); };

  // ── La ventana ──
  const close = () => {
    offEscape?.(); offEscape = null;
    modal?.remove(); modal = null;
  };
  const paintRecent = () => { const ol = modal?.querySelector('[data-incoming-recent]'); if (ol) ol.innerHTML = recentHtml(recent, { open }); fitNotes(ol); };
  const openIssue = async (id) => {
    hide();
    let got;
    try { got = await api.get(id); } catch (err) { return toast?.(err.message); }
    if (!got?.issue) return toast?.('Esa incidencia ya no está en la foto.');
    close();
    let total;
    ({ recent, total } = recentOf(got.issue, got.timeline));
    open = new Set();
    document.body.insertAdjacentHTML('beforeend', incomingModalHtml({ issue: got.issue, recent, total }));
    modal = document.body.lastElementChild;
    modal.dataset.issue = got.issue.id;
    wireModal(modal);
    fitNotes(modal.querySelector('[data-incoming-recent]')); // las de una frase que caben, sin desplegar
    modal.querySelector('#inc-f-phone').focus();
    offEscape = onEscape(close);
  };
  const save = async (form) => {
    const values = Object.fromEntries(new FormData(form));
    const err = form.querySelector('.iss-act-err');
    const btn = form.querySelector('[type=submit]');
    if (!ready(values)) { err.textContent = !String(values.phone || '').trim() ? 'Falta: el teléfono.' : !values.comment?.trim() ? 'Falta: lo que se habló.' : 'Ese teléfono no parece un número.'; err.hidden = false; return; }
    btn.disabled = true;
    const id = modal.dataset.issue;
    try {
      const note = callNote({ ...values, answered: true });
      await api.addNote(id, note.body, { visibility: note.visibility, tag: note.tag });
      close();
      const q = input(); if (q) q.value = '';
      results = [];
      toast?.(`Llamada registrada en el Seguimiento de ${id}. Aún no llega a Remedy: irá por SIGLO cuando lo conectemos.`);
    } catch (e) { err.textContent = e.message; err.hidden = false; btn.disabled = false; }
  };
  const wireModal = (m) => {
    const form = m.querySelector('[data-incoming-form]');
    const pressedInside = pressStartedIn(m, (t) => !!t.closest('.inc-form'));
    m.addEventListener('click', (e) => {
      if (e.target === m && !pressedInside()) return close(); // el fondo cierra (no si se soltó fuera tras seleccionar dentro)
      if (e.target.closest('[data-incoming-cancel]')) return close();
      const fold = e.target.closest('[data-note-fold]');
      if (fold) { const key = fold.closest('[data-note-key]').dataset.noteKey; if (open.has(key)) open.delete(key); else open.add(key); paintRecent(); }
    });
    m.addEventListener('keydown', (e) => {
      if (e.target.matches('[data-note-fold]') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.target.click(); }
    });
    form.addEventListener('input', () => {
      form.querySelector('[type=submit]').disabled = !ready(Object.fromEntries(new FormData(form)));
      form.querySelector('.iss-act-err').hidden = true;
    });
    form.addEventListener('submit', (e) => { e.preventDefault(); save(form); });
  };

  // ── En el panel ──
  const onInput = (e) => { if (e.target.matches('[data-incoming-q]')) search(); };
  const onKey = (e) => {
    if (!e.target.matches('[data-incoming-q]')) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') { e.preventDefault(); if (results[active]) openIssue(results[active].id); }
    else if (e.key === 'Escape' && (e.target.value || !hits()?.hidden)) { e.preventDefault(); e.stopPropagation(); e.target.value = ''; results = []; hide(); }
  };
  const onClick = (e) => {
    const hit = e.target.closest?.('[data-incoming-open]');
    if (hit) return openIssue(hit.dataset.incomingOpen);
    if (!e.target.closest?.('.inc-search')) hide();
    else if (e.target.matches?.('[data-incoming-q]') && results.length) paintHits(); // volver a enseñar lo encontrado
  };
  root.addEventListener('input', onInput);
  root.addEventListener('keydown', onKey);
  root.addEventListener('click', onClick);

  return {
    // escribiendo en el buscador o con la ventana abierta: el panel no se repinta solo
    busy: () => !!modal || !!input()?.value || document.activeElement === input(),
    dispose: () => {
      clearTimeout(timer);
      close();
      root.removeEventListener('input', onInput);
      root.removeEventListener('keydown', onKey);
      root.removeEventListener('click', onClick);
    },
  };
};
