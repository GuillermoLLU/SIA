// La tarjeta al pasar el ratón, para Métricas y Equipo soporte: el texto
// de data-tip o, en una diferencia entre lados (data-cmp), el valor del
// primero a la izquierda, la diferencia en el centro y el del segundo a la
// derecha. names() da el nombre de cada lado en ese momento.
import { esc } from '../ui/html.js';

export const attachTip = (root, names) => {
  const box = () => root.querySelector('[data-tip-box]');
  root.addEventListener('mousemove', (e) => {
    const tip = box();
    if (!tip) return;
    const t = e.target.closest('[data-cmp],[data-tip]');
    if (!t) { tip.hidden = true; return; }
    const cmp = !!t.dataset.cmp;
    if (cmp) {
      const [a, d, b, cls] = t.dataset.cmp.split('¦'), [na, nb] = names();
      tip.className = 'mt-tip mt-tip-cmp';
      tip.innerHTML = `<div><span>${esc(na)}</span><b class="mt-a">${esc(a)}</b></div><div><span>diferencia</span><b class="${cls}">${esc(d)}</b></div><div><span>${esc(nb)}</span><b class="mt-b">${esc(b)}</b></div>`;
    } else { tip.className = 'mt-tip'; tip.textContent = t.dataset.tip; }
    tip.hidden = false;
    const w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = `${Math.max(8, Math.min(e.clientX - (cmp ? w / 2 : -14), innerWidth - w - 8))}px`;
    tip.style.top = `${e.clientY + 18 + h > innerHeight ? e.clientY - h - 12 : e.clientY + 18}px`;
  });
  root.addEventListener('mouseleave', () => { const tip = box(); if (tip) tip.hidden = true; });
};
