// El panel del periodo de Métricas y Equipo soporte (period.js lo pinta): sus clics. Cada lado («Desde», «Hasta») es
// un selector independiente: el año solo cambia lo que enseña; un mes o un día fija ese extremo (doble clic en un mes:
// el periodo es ese mes entero) y se aplica al momento (onPick(false): el panel sigue abierto). Se cierra con un clic
// fuera o Escape (la vista). model: da el modelo (model.js) de ese momento.
import { periodPanel, pickMonth, wholeMonth, pickDay, shiftYear, sideDay } from './period.js';

export const mountPeriodPanel = (el, { model, onPick }) => {
  let shown = { from: 0, to: 0 };   // el mes que enseña cada lado
  const paint = () => { el.innerHTML = periodPanel(model(), shown); };
  // cada lado enseña el mes de su extremo
  const follow = () => { const m = model(); shown = { from: m.monthAt(sideDay(m, 'from')), to: m.monthAt(sideDay(m, 'to')) }; };
  const open = () => { follow(); paint(); };

  // los clics del panel se quedan en él: al repintarlo, el botón pulsado ya no está dentro y la vista lo tomaría por
  // un clic fuera, que lo cierra
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    const m = model(), hit = e.target.closest('[data-pick-month],[data-pick-day],[data-year]');
    if (!hit) return;
    const [side, n] = (hit.dataset.pickMonth || hit.dataset.pickDay || hit.dataset.year).split(':');
    if (hit.matches('[data-year]')) { shown[side] = shiftYear(m, shown[side], Number(n)); return paint(); }
    // doble clic en un mes (el segundo clic, detail 2; no dblclick, porque el primero ya ha repintado el botón): el mes entero
    if (hit.matches('[data-pick-month]')) m.setPeriod(...(e.detail >= 2 ? wholeMonth(m, Number(n)) : pickMonth(m, side, Number(n))));
    else m.setPeriod(...pickDay(m, side, Number(n)));
    follow(); paint();
    onPick(false);
  });

  return { open };
};
