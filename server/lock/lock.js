// El candado de SIA (dominio, sin E/S): un PIN de 4 dígitos para dejar el
// escritorio abierto y trabajando sin que nadie curiosee, y con el que se
// desbloquea también el móvil emparejado. El PIN se guarda derivado (scrypt +
// sal) en la config personal, nunca en claro, y se comprueba aquí: la web no
// lo tiene. No es una barrera frente a quien tenga tu sesión del sistema
// (puede leer ~/.sia o matar la app): es una cortina.
import { scryptSync, timingSafeEqual } from 'node:crypto';

// Siempre 4 dígitos: la puerta pinta cuatro casillas y comprueba sola al
// llenar la última.
export const PIN_LEN = 4;
export const isPin = (key) => typeof key === 'string' && /^\d{4}$/.test(key);

const derive = (key, salt) => scryptSync(String(key), Buffer.from(salt, 'hex'), 32);

// Lo que se guarda de un PIN: { salt, hash, len }.
export const hashPin = (key, salt) => ({ salt, hash: derive(key, salt).toString('hex'), len: key.length });

// Hay PIN si están la derivada, la sal y el largo es el de la puerta. Cualquier
// otra cosa (una clave de texto o un PIN de otro largo, de versiones de
// desarrollo anteriores) se trata como si no hubiera, y el candado pide elegir uno.
export const hasPin = (lock) => !!(lock?.hash && lock.salt && lock.len === PIN_LEN);

export const pinMatches = (lock, key) => {
  if (!lock?.hash || !lock.salt || typeof key !== 'string' || !key) return false;
  const a = derive(key, lock.salt), b = Buffer.from(lock.hash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
};

// Freno anti fuerza bruta: `max` fallos seguidos imponen `waitMs` de espera.
// try(ok) → { ok: true } | { ok: false } | { ok: false, wait: segundos }
export const createBrake = ({ now = Date.now, max = 5, waitMs = 30_000 } = {}) => {
  let fails = 0, until = 0;
  return {
    try(ok) {
      const t = now();
      if (t < until) return { ok: false, wait: Math.ceil((until - t) / 1000) };
      if (ok) { fails = 0; return { ok: true }; }
      if (++fails >= max) { fails = 0; until = t + waitMs; return { ok: false, wait: waitMs / 1000 }; }
      return { ok: false };
    },
  };
};
