// El tooltip de la marca «Traspasada»: la caja vive dentro de una columna con scroll, que la
// recortaría (y, por su ancho, daría scroll horizontal). Al pasar por el icono se saca al body y se
// coloca sobre la ventana: encima del icono si cabe, debajo si la fila está arriba del todo.

const GAP = 8;
const EDGE = 8;

// Dónde va la caja (coordenadas de ventana) dada la posición del icono, el tamaño de la caja y la ventana.
export const tipPlace = (anchor, box, view) => {
  const above = anchor.top - GAP - box.height >= EDGE;
  const top = above ? anchor.top - GAP - box.height : anchor.bottom + GAP;
  const centred = anchor.left + anchor.width / 2 - box.width / 2;
  const left = Math.min(Math.max(centred, EDGE), Math.max(view.width - box.width - EDGE, EDGE));
  return { top, left };
};

export const mountTips = (root, { doc = document } = {}) => {
  let open = null;   // { tip, box } mientras se enseña
  const hide = () => {
    if (!open) return;
    open.box.classList.remove('show');
    open.tip.append(open.box);
    open = null;
  };
  const show = (tip) => {
    if (open?.tip === tip) return;
    hide();
    const box = tip.querySelector('.iss-tip-box');
    if (!box) return;
    doc.body.append(box);
    box.classList.add('show');   // visible antes de medirla
    const { top, left } = tipPlace(tip.getBoundingClientRect(), box.getBoundingClientRect(), { width: doc.documentElement.clientWidth });
    box.style.top = `${top}px`;
    box.style.left = `${left}px`;
    open = { tip, box };
  };
  root.addEventListener('mouseover', (e) => { const tip = e.target.closest?.('.iss-tip'); if (tip) show(tip); });
  root.addEventListener('mouseout', (e) => { if (open && e.target.closest?.('.iss-tip') === open.tip && !open.tip.contains(e.relatedTarget)) hide(); });
  root.addEventListener('focusin', (e) => { const tip = e.target.closest?.('.iss-tip'); if (tip) show(tip); });
  root.addEventListener('focusout', (e) => { if (open && e.target === open.tip) hide(); });
  root.addEventListener('scroll', hide, true);
  return hide;
};
