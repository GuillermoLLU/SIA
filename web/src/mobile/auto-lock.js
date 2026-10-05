// Candado automático del móvil (solo acceso público, por túnel).
//
// Cambiar de app o apagar la pantalla NO bloquea al momento: hay un margen
// (graceMs) para hacer una foto, mirar algo y volver sin PIN. Si se está
// fuera más que eso, al volver sale la puerta y se avisa al bridge
// (sendBeacon: sobrevive a que la página se congele). Sin tocar la pantalla
// idleMs, lo mismo — y aunque el aviso no llegara, el bridge echa el candado
// solo por inactividad.
//
// deps: lockUrl (a la que mandar el aviso) · gate() (enseña la puerta del PIN)
const LOCK_GRACE_MS = 2 * 60_000;
export const LOCK_IDLE_MS = 5 * 60_000;

export const installAutoLock = ({ lockUrl, gate, graceMs = LOCK_GRACE_MS, idleMs = LOCK_IDLE_MS, doc = document, now = Date.now }) => {
  let lockSent = false;
  const sendLock = () => {
    lockSent = true;
    try { navigator.sendBeacon(lockUrl); } catch {}
  };
  const engage = () => { if (!lockSent) sendLock(); gate(); };
  let hiddenAt = 0;
  let graceT = null;
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') {
      hiddenAt = now();
      // si el navegador sigue vivo en segundo plano, el aviso sale al agotar el
      // margen; si lo congela, se decide al volver por el tiempo que ha pasado
      clearTimeout(graceT); graceT = setTimeout(sendLock, graceMs);
    } else {
      clearTimeout(graceT);
      if (lockSent || (hiddenAt && now() - hiddenAt > graceMs)) engage(); // de vuelta tarde: la puerta, encima de todo
      hiddenAt = 0;
    }
  });
  let idleT = null;
  const rearm = () => { clearTimeout(idleT); idleT = setTimeout(engage, idleMs); };
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) doc.addEventListener(ev, rearm, { passive: true });
  rearm();
};
