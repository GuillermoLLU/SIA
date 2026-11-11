// El editor de un campo de Resolver: texto plano en el que cada imagen va como una
// ficha [imagenN] (con fondo, no editable, arrastrable para moverla). Lo que se
// guarda y se envía es texto: la ficha vuelve a ser «[imagenN]». Las reglas puras
// (texto ↔ HTML) van aparte del cableado del DOM, para probarlas.
import { esc } from '../ui/html.js';

export const TAG = /\[imagen(\d+)\]/g;
export const imageTag = (n) => `[imagen${n}]`;

// La ficha de una imagen en el editor.
export const chipHtml = (n) => `<span class="rv-chip" contenteditable="false" draggable="true" data-n="${n}">${imageTag(n)}</span>`;

// Texto → HTML del editor: lo escrito escapado y cada [imagenN] como ficha.
export const toHtml = (text) => esc(String(text ?? '')).replace(TAG, (_, n) => chipHtml(Number(n)));

// Nodo del editor → texto: los nodos de texto tal cual, las fichas como [imagenN] y
// los bloques (div, p) o saltos (br) que mete el navegador, como saltos de línea.
// El espacio de ancho cero que deja la ficha para apoyar el cursor (insertChip) no es texto: fuera.
export const toText = (node) => {
  let out = '';
  for (const c of node.childNodes) {
    if (c.nodeType === 3) out += c.nodeValue.replace(/\u200B/g, '');
    else if (c.nodeType !== 1) continue;
    else if (c.classList.contains('rv-chip')) out += imageTag(Number(c.dataset.n));
    else if (c.tagName === 'BR') out += '\n';
    else out += `${out && !out.endsWith('\n') ? '\n' : ''}${toText(c)}`;
  }
  return out;
};

// Quitar del texto la imagen n (con el espacio que la seguía).
export const withoutImage = (text, n) => String(text).split(imageTag(n)).join('').replace(/ {2,}/g, ' ').replace(/ +\n/g, '\n').replace(/ +$/, '');

/* ── Cableado del DOM ── */

// El campo oculto que lleva el texto del editor al formulario (y al borrador).
const fieldOf = (ed) => ed.parentElement.querySelector(`input[name="${ed.dataset.ed}"]`);
export const syncEditor = (ed) => { fieldOf(ed).value = toText(ed); };
export const setEditorText = (ed, text) => { ed.innerHTML = toHtml(text); syncEditor(ed); };

// Insertar la ficha n donde está el cursor del editor (si el cursor está en otro
// sitio, al final), con un espacio a cada lado si hace falta.
export const insertChip = (ed, n, range = null) => {
  const doc = ed.ownerDocument, sel = doc.getSelection();
  let r = range;
  if (!r && sel?.rangeCount && ed.contains(sel.getRangeAt(0).startContainer)) r = sel.getRangeAt(0);
  if (!r) { r = doc.createRange(); r.selectNodeContents(ed); r.collapse(false); }
  r.deleteContents();
  const frag = doc.createDocumentFragment();
  const before = r.startContainer.nodeType === 3 ? r.startContainer.nodeValue.slice(0, r.startOffset) : '';
  const after = r.startContainer.nodeType === 3 ? r.startContainer.nodeValue.slice(r.startOffset) : '';
  if (before && !/\s$/.test(before)) frag.append(' ');
  const tpl = doc.createElement('template'); tpl.innerHTML = chipHtml(n);   // la misma plantilla que al pintar
  frag.append(tpl.content.firstChild);
  const tail = doc.createTextNode(after && !/^\s/.test(after) ? ' ' : '\u200B');   // sin texto detrás, un apoyo invisible para el cursor
  frag.append(tail);
  r.insertNode(frag);
  // el cursor, justo después de la ficha
  const nr = doc.createRange(); nr.setStart(tail, 1); nr.collapse(true);   // justo después de la ficha
  sel?.removeAllRanges(); sel?.addRange(nr);
  syncEditor(ed);
  ed.dispatchEvent(new Event('input', { bubbles: true }));
};

// Quitar las fichas de la imagen n de un editor.
export const removeChips = (ed, n) => {
  for (const c of ed.querySelectorAll(`.rv-chip[data-n="${n}"]`)) c.remove();
  setEditorText(ed, withoutImage(toText(ed), n));
};

// Dónde cae un arrastre dentro del editor → Range, o null.
export const rangeAtPoint = (doc, x, y) => {
  if (doc.caretPositionFromPoint) { const p = doc.caretPositionFromPoint(x, y); if (!p) return null; const r = doc.createRange(); r.setStart(p.offsetNode, p.offset); r.collapse(true); return r; }
  return doc.caretRangeFromPoint?.(x, y) || null;
};
