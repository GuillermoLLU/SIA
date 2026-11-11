// /api/lock: el candado del escritorio (solo desde esta máquina, como toda la API).
//   GET      → { hasKey, locked, len }
//   PUT key  { key, current? } → { ok, hasKey, len }   poner o cambiar el PIN (con el actual si ya hay)
//   POST on  → { locked: true }                        exige PIN elegido
//   POST off { key } → { locked: false }               429 con `wait` tras cinco fallos
import { PIN_LEN, isPin } from './lock.js';

const tooMany = (json, res, wait) => json(res, 429, { error: `Demasiados intentos. Espera ${wait} s.`, wait });

export const lockRoutes = (lock, { json, readBody }) => async (req, res, action) => {
  if (!action && req.method === 'GET') return json(res, 200, { hasKey: lock.hasPin(), locked: lock.locked(), len: PIN_LEN });
  if (action === 'key' && req.method === 'PUT') {
    if (lock.locked()) return json(res, 423, { error: 'pantalla bloqueada', locked: true });
    const { key, current } = await readBody(req);
    if (lock.hasPin()) {
      const t = lock.tryPin(current);
      if (t.wait) return tooMany(json, res, t.wait);
      if (!t.ok) return json(res, 403, { error: 'El PIN actual no es correcto.' });
    }
    if (!isPin(key)) return json(res, 400, { error: 'El PIN son 4 dígitos.' });
    lock.setPin(key, { locked: false });
    return json(res, 200, { ok: true, hasKey: true, len: PIN_LEN });
  }
  if (action === 'on' && req.method === 'POST') {
    if (!lock.hasPin()) return json(res, 409, { error: 'Aún no hay PIN de bloqueo.', hasKey: false });
    lock.set(true);
    return json(res, 200, { locked: true });
  }
  if (action === 'off' && req.method === 'POST') {
    if (!lock.locked()) return json(res, 200, { locked: false });
    const { key } = await readBody(req);
    const t = lock.tryPin(key);
    if (t.wait) return tooMany(json, res, t.wait);
    if (!t.ok) return json(res, 403, { error: 'PIN incorrecto.' });
    lock.set(false);
    return json(res, 200, { locked: false });
  }
  return json(res, 404, { error: 'no encontrado' });
};
