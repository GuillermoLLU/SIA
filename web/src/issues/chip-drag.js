// Mover una ficha de imagen [imagenN] (tag-editor.js) en los editores de la vista de Issues (Resolver
// y Escalar): arrastrarla desde el texto o desde su miniatura del muelle y soltarla en un punto del
// texto. Mientras se arrastra, el origen se atenúa y una línea del color de la ficha marca en vivo
// dónde caerá, sin la copia de la ficha pegada al ratón. Los archivos que se sueltan (no las fichas)
// los atiende cada asistente en su muelle. Lo monta la vista una vez → { dispose }.
import { insertChip, rangeAtPoint, imageTag } from './tag-editor.js';

// ¿Se arrastran archivos (del sistema) y no una ficha?
export const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
const CHIP_DATA = /^\[imagen(\d+)\]$/;

export const mountChipDrag = (root, doc = document) => {
  let dragChip = null;   // la ficha que se mueve desde el texto (desde el muelle se copia)
  const ghost = new Image(); ghost.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const caret = doc.createElement('i');
  caret.className = 'rv-caret';
  caret.hidden = true;
  doc.body.append(caret);
  const showCaret = (ed, range) => {
    let r = range?.getBoundingClientRect();
    if (!r || (!r.height && !r.width)) { const b = ed.getBoundingClientRect(); r = { left: b.left + 10, top: b.top + 8, height: 20 }; }   // editor vacío: al principio
    Object.assign(caret.style, { left: `${r.left}px`, top: `${r.top}px`, height: `${r.height || 20}px` });
    caret.hidden = false;
  };
  const hideCaret = () => { caret.hidden = true; };

  const on = {
    // una ficha del texto o una miniatura del muelle, con su [imagenN] como dato
    dragstart: (e) => {
      const chip = e.target.closest?.('.rv-chip'), fig = e.target.closest?.('[data-img]');
      const src = chip || fig;
      if (!src) return;
      dragChip = chip;
      src.classList.add('dragging');
      e.dataTransfer.setDragImage(ghost, 0, 0);
      e.dataTransfer.setData('text/plain', imageTag(Number(chip ? chip.dataset.n : fig.dataset.img)));
      e.dataTransfer.effectAllowed = chip ? 'move' : 'copy';
    },
    dragend: (e) => { e.target.closest?.('.rv-chip, [data-img]')?.classList.remove('dragging'); dragChip = null; hideCaret(); },
    // una ficha sobre el texto: la línea dice dónde caerá
    dragover: (e) => {
      const ed = e.target.closest?.('.rv-ed');
      if (!ed || hasFiles(e)) return hideCaret();
      e.preventDefault();
      e.dataTransfer.dropEffect = dragChip ? 'move' : 'copy';
      showCaret(ed, rangeAtPoint(doc, e.clientX, e.clientY));
    },
    dragleave: (e) => { const ed = e.target.closest?.('.rv-ed'); if (ed && !ed.contains(e.relatedTarget)) hideCaret(); },
    // soltada en el texto: va ahí (si venía del texto, sale de donde estaba)
    drop: (e) => {
      hideCaret();
      const ed = e.target.closest?.('.rv-ed');
      const m = !hasFiles(e) && ed && (e.dataTransfer?.getData('text/plain') || '').match(CHIP_DATA);
      if (!m) return;
      e.preventDefault();
      const range = rangeAtPoint(doc, e.clientX, e.clientY);
      if (dragChip?.isConnected) { if (range && dragChip.contains(range.startContainer)) { dragChip.classList.remove('dragging'); return; } dragChip.remove(); }
      insertChip(ed, Number(m[1]), range);
      dragChip = null;
    },
  };
  for (const [type, fn] of Object.entries(on)) root.addEventListener(type, fn);
  return {
    dispose: () => { for (const [type, fn] of Object.entries(on)) root.removeEventListener(type, fn); caret.remove(); },
  };
};
