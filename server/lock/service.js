// El candado del escritorio: el PIN (en la config personal) y el estado
// «bloqueado», que también se guarda para que recargar la ventana o cerrar y
// reabrir la app no lo salte. Mientras está echado, la API local solo responde
// al ping y a lo del propio candado (index.js) y no se aceptan sockets nuevos
// desde esta máquina; los que ya estaban abiertos siguen, que son los chats.
// `config`: el store de la config personal; `random`: bytes para la sal.
import { randomBytes } from 'node:crypto';
import { hashPin, hasPin, pinMatches, createBrake } from './lock.js';

export const createLock = ({ config, now = Date.now, random = randomBytes }) => {
  const cfg = () => config.read().lock || {};
  const save = (patch) => config.patch({ lock: { ...cfg(), ...patch } });
  const brake = createBrake({ now });
  let locked = hasPin(cfg()) && cfg().locked === true; // en memoria: se consulta en cada petición
  const matches = (key) => pinMatches(cfg(), key);
  return {
    hasPin: () => hasPin(cfg()),
    locked: () => locked,
    matches,
    // → { ok } | { ok: false, wait: segundos } (freno anti fuerza bruta)
    tryPin: (key) => brake.try(matches(key)),
    setPin: (key, { locked: on } = {}) => save({ ...hashPin(key, random(16).toString('hex')), ...(on === undefined ? {} : { locked: on }) }),
    set(on) { locked = on; save({ locked: on }); },
  };
};
