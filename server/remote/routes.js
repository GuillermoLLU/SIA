// /api/lan/*: el acceso desde el móvil. Lo que llama el MÓVIL (emparejar y
// su candado) y lo que solo se hace desde el equipo (estado, dispositivos,
// abrir y cerrar el acceso; index.js garantiza que es local).
//   POST pair { token?, pin } → { sessionToken, mode } | 403
//   POST lock → { ok, locked }          PUT pin { key } → { ok }   (solo si aún no hay PIN)
//   POST unlock { key } → { ok } | 401 { quedan } | 410 (revocada)
//   GET status → estado   DELETE devices/:id → estado
//   POST enable { mode: lan|public } → estado   POST disable → estado
import { isPin } from '../lock/lock.js';
import { lanToken, isLoopback } from './remote.js';

export const lanRoutes = (remote, lock, { json, readBody }) => async (req, res, url, [action, id]) => {
  const token = lanToken(req, url);
  if (action === 'pair' && req.method === 'POST') {
    const got = remote.pair(req, await readBody(req));
    return got ? json(res, 200, got) : json(res, 403, { error: 'QR o PIN incorrecto o caducado' });
  }
  // candado: lo echa el móvil, a mano (su botón) o solo al perder el foco en
  // el acceso público (sendBeacon → token en ?t=)
  if (action === 'lock' && req.method === 'POST') return json(res, 200, { ok: true, locked: remote.lock(token) });
  // elegir el PIN de bloqueo desde el móvil emparejado: SOLO si aún no hay
  // ninguno (cambiarlo exige el actual y se hace en el ordenador)
  if (action === 'pin' && req.method === 'PUT') {
    if (!remote.session(token)) return json(res, 403, { error: 'acceso no autorizado' });
    if (lock.hasPin()) return json(res, 409, { error: 'Ya hay un PIN de bloqueo: se cambia en el ordenador.' });
    const { key } = await readBody(req);
    if (!isPin(key)) return json(res, 400, { error: 'El PIN son 4 dígitos.' });
    lock.setPin(key);
    return json(res, 200, { ok: true });
  }
  if (action === 'unlock' && req.method === 'POST') {
    const r = remote.unlock(token, (await readBody(req)).key);
    if (r.gone) return json(res, 410, { error: r.gone });
    if (r.left) return json(res, 401, { error: `clave incorrecta (quedan ${r.left} intentos)` });
    return json(res, 200, { ok: true });
  }
  // gestión: SOLO desde el equipo
  if (!isLoopback(req)) return json(res, 403, { error: 'solo desde el equipo' });
  if (action === 'status' && req.method === 'GET') return json(res, 200, remote.status());
  if (action === 'devices' && id && req.method === 'DELETE') {
    if (!remote.revokeDevice(decodeURIComponent(id))) return json(res, 404, { error: 'Ese dispositivo ya no está conectado.' });
    return json(res, 200, remote.status());
  }
  if (action === 'enable' && req.method === 'POST') {
    const { mode = 'lan' } = await readBody(req);
    const r = remote.enable(mode);
    if (r.error) return json(res, mode === 'public' ? 409 : 503, r);
    return json(res, 200, remote.status());
  }
  if (action === 'disable' && req.method === 'POST') { remote.disable(); return json(res, 200, remote.status()); }
  return json(res, 404, { error: 'no encontrado' });
};
