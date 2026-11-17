// La pestaña Seguimiento de una issue, en HTML (sin E/S; el cableado,
// notes-view.js). Una conversación de la más antigua a la más reciente: cada
// nota con su autor, su etiqueta (una ficha junto al nombre), su hora y su caja,
// plegada a una línea (la primera frase y quién la ve) que se despliega entera
// al pulsarla; los movimientos (cogida, devuelta, traspasada, asignada) y las
// llamadas al centro, como un hito en la misma línea de tiempo: su icono en el
// sitio del avatar y una frase. Abajo, la barra de escribir: quién la verá
// (menú), la etiqueta (menú) y Enviar.
import { esc } from '../ui/html.js';
import { initials } from '../ui/initials.js';
import { whenLabel } from './format.js';
import { VISIBILITY, VISIBILITIES, NOTE_TAGS, tagLabel, firstSentence, canEditNote, callOf, notesFeed, noteCount } from './notes.js';

const svg = (paths) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const ICON = {
  private: svg('<rect x="5" y="11" width="14" height="10" rx="1"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  internal: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>'),
  public: svg('<circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>'),
};
const CHEV = svg('<path d="M6 9l6 6 6-6"/>');
const TAG = svg('<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><circle cx="7" cy="7" r="1.2"/>');
const SEND = svg('<path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/>');
const CROSS = svg('<path d="M6 6l12 12M18 6L6 18"/>');

// Quién: un avatar con sus iniciales (sin nombre, un interrogante).
const avatar = (name) => `<span class="iss-avatar${name ? '' : ' unknown'}" aria-hidden="true">${esc(initials(name))}</span>`;
const who = (name) => `<b>${esc(name || 'Alguien')}</b>`;
// Los movimientos: su icono y su frase. Asignar y traspasar (cambia quién la
// lleva por decisión de otro) van marcados; coger y devolver, más suaves.
const MOVE = {
  claimed: { icon: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>'), say: (e) => `${who(e.by)} cogió la issue` },
  released: { icon: svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'), say: (e) => `${who(e.by)} la devolvió a la cola` },
  transferred: { strong: true, icon: svg('<path d="m16 3 4 4-4 4"/><path d="M20 7H4"/><path d="m8 21-4-4 4-4"/><path d="M4 17h16"/>'), say: (e) => `${who(e.by)} la traspasó a ${who(e.to)}` },
  assigned: { strong: true, icon: svg('<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/>'), say: (e) => `${who(e.by)} se la asignó a ${who(e.to)} desde el Backlog` },
};

// Quién la ve (las de Remedy no lo dicen); la etiqueta, junto al nombre (con su
// código de Remedy al pasar por encima); el motivo de un traspaso, dentro de su caja
const visHtml = (v) => (v ? `<span class="nt-vis">${ICON[v]}${VISIBILITY[v].label}</span>` : '');
const tagHtml = (tag) => (tag ? `<span class="nt-tag" title="${esc(tag)}">${esc(tagLabel(tag))}</span>` : '');
const labelHtml = (label) => (label ? `<span class="iss-feed-label">${esc(label)}</span>` : '');

// La caja de una nota. Desplegada: el texto entero, con quién la ve a la
// derecha de su primera línea (y, en la del motivo de un traspaso, su título
// encima); plegada: todo en una línea, con la primera frase. (Sin espacios entre etiquetas: la caja respeta los saltos de
// línea del texto.)
const boxHtml = ({ label = null, visibility, text }, open) => (open
  ? `<div class="iss-feed-text nt-box" data-note-fold role="button" tabindex="0" aria-expanded="true">${label ? `<div class="nt-top">${labelHtml(label)}${visHtml(visibility)}</div>` : visHtml(visibility)}<div class="nt-text">${esc(text)}</div><i class="nt-chev">${CHEV}</i></div>`
  : `<div class="iss-feed-text nt-box nt-folded" data-note-fold role="button" tabindex="0" aria-expanded="false">${labelHtml(label)}<span class="nt-first">${esc(firstSentence(text))}</span>${visHtml(visibility)}<i class="nt-chev">${CHEV}</i></div>`);

// Las llamadas: el teléfono (atendida) o el teléfono tachado (sin respuesta)
const PHONE = svg('<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>');
const PHONE_OFF = svg('<path d="M10.68 13.31a16 16 0 0 0 3.41 2.6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7 2 2 0 0 1 1.72 2v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.42 19.42 0 0 1-3.33-2.67m-2.67-3.34a19.79 19.79 0 0 1-3.07-8.63A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91"/><line x1="23" y1="1" x2="1" y2="23"/>');

// Un movimiento: un hito en la línea de tiempo (su icono en el sitio del
// avatar) con su frase y su hora; el motivo de un traspaso, debajo, en su caja
// plegable, como una nota.
const moveHtml = (e, { open, now }) => {
  const m = MOVE[e.type] || { icon: '', say: (x) => esc(x.type) };
  return `<li class="iss-feed-item nt-ev${m.strong ? ' strong' : ''}${open ? ' open' : ''}" data-note-key="${esc(e.key)}"><span class="nt-ev-ic" aria-hidden="true">${m.icon}</span><div class="iss-feed-body">
      <header><span class="iss-feed-did">${m.say(e)}</span><time>${whenLabel(e.at, now)}</time></header>
      ${e.text ? boxHtml({ label: 'Motivo', visibility: null, text: e.text }, open) : ''}
    </div></li>`;
};

// Una llamada al centro: un hito con el teléfono (en negro si se habló, en
// naranja si no hubo respuesta), quién llamó y a qué número; lo hablado, debajo,
// en su caja plegable. Sin nada que contar, solo la línea.
const editHtml = (e, meId, now) => `${canEditNote(e, meId, now) ? `<button type="button" class="iss-feed-edit" data-edit-note="${esc(e.key)}">Editar</button>` : ''}${e.edited ? `<small>editada ${whenLabel(e.edited, now)}</small>` : ''}`;
const callHtml = (e, c, { open, meId, now }) => `<li class="iss-feed-item nt-ev nt-call ${c.answered ? 'ok' : 'ko'}${open ? ' open' : ''}" data-note-key="${esc(e.key)}"><span class="nt-ev-ic" aria-hidden="true">${c.answered ? PHONE : PHONE_OFF}</span><div class="iss-feed-body">
      <header><span class="iss-feed-did">${who(e.by)} ${c.answered ? 'habló con el centro' : 'llamó al centro, sin respuesta'}${c.phone ? `<span class="nt-phone">${esc(c.phone)}</span>` : ''}</span>${editHtml(e, meId, now)}<time>${whenLabel(e.at, now)}</time></header>
      ${c.said ? boxHtml({ label: c.answered ? 'Lo hablado' : 'Nota', visibility: e.visibility, text: c.said }, open) : ''}
    </div></li>`;

// Una entrada de la conversación: una nota (de Remedy o de SIA), una llamada o un
// movimiento. Una nota sin texto (de Remedy, solo su etiqueta: «[INCIDENT
// REOPENED BY A PUBLIC WORK INFO]») se queda en su línea, sin caja.
export const noteItemHtml = (e, { open = false, meId = null, now = new Date() } = {}) => {
  if (e.kind === 'move') return moveHtml(e, { open, now });
  const call = callOf(e);
  if (call) return callHtml(e, call, { open, meId, now });
  const edit = editHtml(e, meId, now);
  return `<li class="iss-feed-item nt-item v-${e.visibility || 'none'}${open ? ' open' : ''}" data-note-key="${esc(e.key)}">${avatar(e.by)}<div class="iss-feed-body">
      <header><span class="iss-feed-did">${who(e.by)}${tagHtml(e.tag)}</span>${edit}<time>${whenLabel(e.at, now)}</time></header>
      ${String(e.text || '').trim() ? boxHtml({ visibility: e.visibility, text: e.text }, open) : ''}
    </div></li>`;
};

// La conversación entera. remedyMissing: la foto no trae las notas de Remedy (se avisa arriba).
export const notesListHtml = (feed, { open = new Set(), meId = null, now = new Date(), remedyMissing = false } = {}) => [
  remedyMissing ? '<li class="nt-warn"><span>La foto cargada no trae las notas de Remedy: carga un CSV nuevo de la consulta.</span></li>' : '',
  ...feed.map((e) => noteItemHtml(e, { open: open.has(e.key), meId, now })),
  feed.length ? '' : '<li class="nt-empty">Todavía no hay notas.</li>',
].join('');

// El botón de quién la verá, con la elegida
export const visPickHtml = (v) => `${ICON[v]}<span>${VISIBILITY[v].label}</span><i class="nt-pick-chev">${CHEV}</i>`;
// La barra de escribir: quién la verá (interna de serie), la etiqueta elegida
// (si hay), el texto, el botón de etiquetas y Enviar; encima, sus dos menús y,
// con Pública, el aviso de que aún no llega al centro.
export const noteFormHtml = () => `<form class="nt-form" data-note-form data-visibility="internal" data-tag="" novalidate>
    <p class="nt-public" data-public-hint hidden>${ICON.public}La verá el centro cuando SIA envíe por SIGLO; de momento se guarda en SIA como pública.</p>
    <div class="nt-menu" data-vis-menu role="menu" hidden>${VISIBILITIES.map((v) => `<button type="button" role="menuitemradio" data-set-vis="${v}" aria-checked="${v === 'internal'}">${ICON[v]}<b>${VISIBILITY[v].label}</b><small>${VISIBILITY[v].hint}</small></button>`).join('')}</div>
    <div class="nt-menu nt-tags" data-tag-menu role="menu" hidden>${NOTE_TAGS.map((t) => `<button type="button" role="menuitemradio" data-set-tag="${t.code}" aria-checked="false"><span>${esc(t.label)}</span><code>${t.code}</code></button>`).join('')}</div>
    <div class="nt-bar">
      <button type="button" class="nt-pick" data-vis-pick aria-haspopup="menu" aria-expanded="false" title="Quién la verá">${visPickHtml('internal')}</button>
      <span class="nt-chip" data-tag-chip hidden><span data-tag-name></span><button type="button" data-tag-clear aria-label="Quitar la etiqueta" title="Quitar la etiqueta">${CROSS}</button></span>
      <textarea name="note" rows="1" placeholder="Escribe una nota…" aria-label="Nota"></textarea>
      <button type="button" class="nt-tagbtn" data-tag-pick aria-haspopup="menu" aria-expanded="false" aria-label="Etiqueta" title="Etiqueta">${TAG}</button>
      <button type="submit" class="iss-send" aria-label="Enviar" title="Enviar (Intro)" disabled>${SEND}</button>
    </div>
  </form>`;

// Editar una nota propia, en el sitio de su caja: Intro guarda, Escape cancela.
export const noteEditorHtml = (text) => `<form class="iss-note-edit" data-note-edit novalidate>
    <textarea name="note" rows="3" aria-label="Editar la nota">${esc(text)}</textarea>
    <footer><button type="button" class="lab-btn" data-edit-cancel>Cancelar</button><button type="submit" class="lab-btn primary">Guardar</button></footer>
  </form>`;

// La pestaña («Seguimiento» y cuántas notas hay) y su panel, con todo plegado.
export const notesTab = (n) => `Seguimiento${n ? `<span>${n}</span>` : ''}`;
export const notesPanelHtml = ({ worklog, timeline = [], meId = null, now = new Date() }) => {
  const feed = notesFeed({ worklog, timeline });
  return `<div class="nt-scroll" data-notes-scroll><ol class="nt-list" data-notes-list>${notesListHtml(feed, { meId, now, remedyMissing: !worklog })}</ol></div>
      ${noteFormHtml()}`;
};
export const notesCountOf = ({ worklog, timeline = [] }) => noteCount(notesFeed({ worklog, timeline }));
