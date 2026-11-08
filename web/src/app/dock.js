// El dock de paneles, flotando abajo en el centro (la .sidebar con body.brand-nav): mientras se
// hace scroll pierde opacidad para leer lo que tapa, y la recupera al rato o al pasar el ratón.

export const IDLE_MS = 900;

export const mountDock = (dock, { doc = document, timers = globalThis } = {}) => {
  let timer = null;
  const clear = () => { dock.classList.remove('dim'); timers.clearTimeout(timer); timer = null; };
  const onScroll = (e) => {
    if (dock.matches(':hover') || dock.contains(e.target)) return;
    dock.classList.add('dim');
    timers.clearTimeout(timer);
    timer = timers.setTimeout(clear, IDLE_MS);
  };
  doc.addEventListener('scroll', onScroll, true);
  dock.addEventListener('mouseenter', clear);
  return () => { doc.removeEventListener('scroll', onScroll, true); dock.removeEventListener('mouseenter', clear); clear(); };
};
