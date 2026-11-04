// Arrastrar la inicial para bloquear: la pantalla se va difuminando y, al llegar al final, se
// bloquea sin esperar a soltar; pasada la mitad, al soltar. Las reglas son puras; wireSlideLock
// las cablea a la inicial (ini) dentro de su recorrido (track).
const START_PX = 4;     // menos que esto es un clic con el pulso movido
const REST_MS = 1000;   // todo vuelve a su sitio cuando la puerta ya tapa la pantalla

export const slidBy = (dx, travel) => Math.min(Math.max(dx, 0), travel);
export const isSliding = (dx) => dx > START_PX;
export const veilOf = (dx, travel) => Math.min(dx / travel * 2, 1); // del todo justo donde soltar ya bloquea
export const locksAtOnce = (dx, travel) => dx >= travel;
export const locksOnRelease = (dx, travel) => dx >= travel / 2;

// onLock(): bloquear. → { justSlid() }: si lo último fue arrastrar (el clic de después no cuenta)
export const wireSlideLock = (ini, track, onLock) => {
  const travel = () => track.clientWidth - ini.offsetWidth;
  let startX = null;
  let dx = 0;
  let slid = false;
  const rest = () => {
    track.classList.remove('sliding');
    ini.style.transform = '';
    track.style.removeProperty('--slide');
    document.body.style.removeProperty('--veil');
    document.body.classList.remove('slide-lock');
  };
  const activate = () => {
    startX = null;
    document.body.classList.add('slide-lock');
    onLock();
    setTimeout(rest, REST_MS);
  };
  ini.addEventListener('pointerdown', (e) => {
    if (e.button) return;
    startX = e.clientX; dx = 0; slid = false;
    ini.setPointerCapture(e.pointerId);
  });
  ini.addEventListener('pointermove', (e) => {
    if (startX === null) return;
    dx = slidBy(e.clientX - startX, travel());
    if (!slid && isSliding(dx)) { slid = true; track.classList.add('sliding'); }
    if (!slid) return;
    ini.style.transform = `translateX(${dx}px)`;
    track.style.setProperty('--slide', dx / travel());
    document.body.style.setProperty('--veil', veilOf(dx, travel()));
    if (locksAtOnce(dx, travel())) activate();
  });
  const release = (e) => {
    if (startX === null) return;
    if (slid && e.type === 'pointerup' && locksOnRelease(dx, travel())) return activate();
    startX = null;
    rest();
  };
  ini.addEventListener('pointerup', release);
  ini.addEventListener('pointercancel', release);
  return { justSlid: () => { const was = slid; slid = false; return was; } };
};
