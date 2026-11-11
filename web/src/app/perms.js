// Lo que abre en la base de conocimiento la clave de poder de quien ha
// iniciado sesión: access = { perms: { name, owner, lab, admin, links } | null }
// o null sin base. Decide el icono del Laboratorio y, en Configuración, la caja
// Administración y la columna de enlaces (además de las vistas de la persona).
//
// Los permisos pueden cambiar sin que este SIA se entere: en Personas le
// cambian a alguien sus vistas (y con ellas su clave de poder). Se vuelven a
// comprobar al recuperar el foco la ventana y cada dos minutos, para que un
// icono nuevo aparezca —o uno retirado desaparezca— sin reiniciar la app. Con
// la pantalla bloqueada no (el bridge no responde).

const RECHECK_MS = 2 * 60_000;
const RETRY_MS = 15_000;   // un fallo pasajero (el bridge arrancando, la red): volver a mirar en breve…
const RETRIES = 4;         // …unas pocas veces; después, la revisión de cada dos minutos

// onUpdate(access, { quiet, changed }): la base respondió · onLost(): sin
// base (o bridge caído), nada que abrir. win, doc y timers, inyectables para las pruebas.
export const createPermsWatch = ({ api, onUpdate, onLost, win = window, doc = document, timers = globalThis, now = Date.now }) => {
  let access = null;
  let checkedAt = 0;
  let retry = null, retries = 0;

  // `quiet` es la revisión automática (al volver el foco y cada poco): solo
  // repinta la vista abierta si los permisos han cambiado de verdad, y un
  // fallo pasajero (sin red, pantalla bloqueada) no toca nada.
  const refresh = async ({ quiet = false } = {}) => {
    const before = JSON.stringify(access);
    timers.clearTimeout(retry);
    try {
      access = (await api('/admin/check')).base;
      retries = 0;
      onUpdate(access, { quiet, changed: JSON.stringify(access) !== before });
    } catch (err) {
      // «la instancia no tiene base» (noDb) es un cambio real y no pasa solo: sin base, y que lo
      // vuelva a mirar la revisión de cada dos minutos. Lo demás es pasajero: en la revisión
      // automática no esconde nada, y se reintenta en breve unas pocas veces.
      const noDb = !!err.data?.noDb;
      if (!quiet || noDb) { access = null; onLost(); }
      if (!noDb && retries < RETRIES) { retries += 1; retry = timers.setTimeout(() => refresh({ quiet: true }), RETRY_MS); }
    }
  };
  const recheck = () => {
    if (doc.body.classList.contains('locked')) return;
    if (now() - checkedAt < 10_000) return; // foco y visibilidad suelen llegar juntos
    checkedAt = now();
    refresh({ quiet: true });
  };
  win.addEventListener('focus', recheck);
  doc.addEventListener('visibilitychange', () => { if (doc.visibilityState === 'visible') recheck(); });
  timers.setInterval(recheck, RECHECK_MS);

  return { refresh, perms: () => access?.perms || null };
};
