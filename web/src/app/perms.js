// Lo que abre en la base de conocimiento la clave de poder de quien ha
// iniciado sesión: access = { perms: { name, owner, lab, admin, links } | null }
// o null sin base. Decide los iconos de Laboratorio, Administración y Enlaces
// (además de las vistas de la persona).
//
// Los permisos pueden cambiar sin que este SIA se entere: en Personas le
// cambian a alguien sus vistas (y con ellas su clave de poder). Se vuelven a
// comprobar al recuperar el foco la ventana y cada dos minutos, para que un
// icono nuevo aparezca —o uno retirado desaparezca— sin reiniciar la app. Con
// la pantalla bloqueada no (el bridge no responde).

const RECHECK_MS = 2 * 60_000;

// onUpdate(access, { quiet, changed }): la base respondió · onLost(): sin
// base (o bridge caído), nada que abrir
export const createPermsWatch = ({ api, onUpdate, onLost }) => {
  let access = null;
  let checkedAt = 0;

  // `quiet` es la revisión automática (al volver el foco y cada poco): solo
  // repinta la vista abierta si los permisos han cambiado de verdad, y un
  // fallo pasajero (sin red, pantalla bloqueada) no toca nada.
  const refresh = async ({ quiet = false } = {}) => {
    const before = JSON.stringify(access);
    try {
      access = (await api('/admin/check')).base;
      onUpdate(access, { quiet, changed: JSON.stringify(access) !== before });
    } catch (err) {
      // en la revisión automática, solo «sin base» (503) es un cambio real; lo
      // demás es pasajero y no debe esconder iconos que estaban bien
      if (quiet && err.status !== 503) return;
      access = null;
      onLost();
    }
  };
  const recheck = () => {
    if (document.body.classList.contains('locked')) return;
    if (Date.now() - checkedAt < 10_000) return; // foco y visibilidad suelen llegar juntos
    checkedAt = Date.now();
    refresh({ quiet: true });
  };
  window.addEventListener('focus', recheck);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') recheck(); });
  setInterval(recheck, RECHECK_MS);

  return { refresh, perms: () => access?.perms || null };
};
