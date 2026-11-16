// El muelle de la conversación: la caja de escribir y el pie, pegados abajo
// por encima del hilo. Al subir por el hilo se esconde (tucked) y el hilo gana
// ese sitio; vuelve al acercar el puntero, al escribir con la caja ya con el
// foco y al llegar abajo del todo. La regla es pura (nextTuck); createDock la
// cablea al DOM.
export const TUCK_PX = 36; // cuánto hay que subir seguido para que se esconda
export const HOT_PX = 28;  // el aire por encima del muelle donde el puntero lo despierta

// de un desplazamiento `d` (positivo hacia abajo), el estado siguiente:
//   climbed: lo subido seguido (se reinicia al bajar o al llegar abajo)
export const nextTuck = ({ d, atBottom, climbed, tucked }) => {
  if (atBottom) return { tucked: false, climbed: 0 };
  if (d < 0) { const c = climbed - d; return { tucked: tucked || c > TUCK_PX, climbed: c }; }
  if (d > 0) return { tucked, climbed: 0 };
  return { tucked, climbed };
};

// wrap: el panel (position: relative; lleva --dock-h y .tucked) · dock: el
// muelle · scroller: el hilo con scroll · atBottom()
export const createDock = ({ wrap, dock, scroller, atBottom }) => {
  const fit = () => wrap.style.setProperty('--dock-h', `${dock.offsetHeight}px`);
  new ResizeObserver(fit).observe(dock);
  fit();
  let state = { tucked: false, climbed: 0 };
  const apply = (next) => {
    state = next;
    if (wrap.classList.contains('tucked') !== state.tucked) wrap.classList.toggle('tucked', state.tucked);
  };
  const show = () => apply({ ...state, tucked: false });
  let lastTop = scroller.scrollTop;
  scroller.addEventListener('scroll', () => {
    const d = scroller.scrollTop - lastTop;
    lastTop = scroller.scrollTop;
    apply(nextTuck({ d, atBottom: atBottom(), climbed: state.climbed, tucked: state.tucked }));
  }, { passive: true });
  const inHotZone = (y) => y >= wrap.getBoundingClientRect().bottom - dock.offsetHeight - HOT_PX;
  wrap.addEventListener('pointermove', (e) => { if (inHotZone(e.clientY)) show(); });
  wrap.addEventListener('keydown', show, true); // escribir (con la caja ya con el foco) lo enseña
  wrap.addEventListener('focusin', (e) => { if (dock.contains(e.target)) show(); });
  return { show };
};
