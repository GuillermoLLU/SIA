// Los dispositivos emparejados (móviles): el emparejamiento pendiente (el
// último QR), sus sesiones y el candado de cada una. Bloquear marca la
// sesión aquí, en el bridge, y tira sus WebSockets: la API y la terminal
// quedan cerradas de verdad hasta la clave correcta (el PIN de bloqueo del
// escritorio). Una sesión pública inactiva se bloquea sola pasado el plazo,
// aunque el móvil muera sin avisar.
//   lock: el candado del escritorio (hasPin/matches) · tunnel: el acceso
//   público · wsClients(): los sockets abiertos (para cortarlos) · lanIp()
import os from 'node:os';
import { randomBytes } from 'node:crypto';
import { newPairing, pairingMatches, deviceName, clientIp, MAX_ATTEMPTS } from './remote.js';

export const lanIP = () => {
  for (const ifaces of Object.values(os.networkInterfaces()))
    for (const i of ifaces || []) if (i.family === 'IPv4' && !i.internal) return i.address;
  return null;
};

const newToken = () => randomBytes(24).toString('base64url');
const newPin = () => String(Math.floor(100000 + Math.random() * 900000)); // 6 dígitos

export const createRemote = ({ lock, tunnel, apiPort, wsClients, lanIp = lanIP, now = Date.now, idleMs = 5 * 60_000 }) => {
  let pairing = null;
  // sessionToken → { id, name, since, ip, mode, locked, lastSeen, unlockAttempts }
  // (id: identificador corto para la lista de dispositivos; el token no sale nunca)
  const sessions = new Map();

  const closeWs = (token, code, reason) => {
    for (const c of wsClients()) if (c._siaToken === token) { try { c.close(code, reason); } catch { /* ya cerrado */ } }
  };
  const lockSession = (token, s) => {
    if (!s || s.locked) return;
    s.locked = true;
    closeWs(token, 4423, 'bloqueado');
  };
  const revoke = (token) => { sessions.delete(token); closeWs(token, 4403, 'revocado'); };
  // Un QR caducado ya no empareja a nadie: se retira para que el estado no lo dé
  // por pendiente (la pantalla seguía enseñándolo sin fin).
  const dropExpired = () => { if (pairing && now() > pairing.expiresAt) pairing = null; };
  const active = () => tunnel.state.phase !== 'off' || !!pairing || sessions.size > 0;
  const openPairing = (mode) => { pairing = newPairing(mode, { token: newToken(), pin: newPin(), now: now() }); };

  return {
    active,
    session: (token) => (token ? sessions.get(token) : null) || null,
    touch(token) { const s = sessions.get(token); if (s) s.lastSeen = now(); },
    status() {
      dropExpired();
      const pub = tunnel.state;
      return {
        active: active(), ip: lanIp(), port: apiPort, devices: sessions.size,
        pendingPairing: !!pairing, pairExpiresAt: pairing?.expiresAt || null,
        mode: pub.phase !== 'off' ? 'public' : 'lan',
        publicPhase: ['preparing', 'download', 'starting'].includes(pub.phase) ? pub.phase : null,
        publicError: pub.error,
        cloudflared: tunnel.installed(),
        qrUrl: pairing ? (pairing.mode === 'public' ? `${pub.url}/?p=${pairing.token}` : `http://${lanIp()}:${apiPort}/?p=${pairing.token}`) : null,
        pin: pairing?.pin || null,
        // dispositivos emparejados, para verlos y cerrarlos uno a uno desde el ordenador
        list: [...sessions].map(([t, s]) => ({
          id: s.id, name: s.name || 'Dispositivo', ip: s.ip, mode: s.mode, locked: !!s.locked, since: s.since, lastSeen: s.lastSeen,
          online: wsClients().some((c) => c._siaToken === t && c.readyState === 1),
        })),
      };
    },
    // El móvil, con el token del QR y el PIN (o solo el PIN). De un solo uso.
    // → { sessionToken, mode } | null
    pair(req, { token, pin }) {
      if (!pairingMatches(pairing, { token, pin }, now())) {
        if (pairing && ++pairing.attempts >= MAX_ATTEMPTS) { pairing = null; console.warn('[sia] emparejamiento invalidado: demasiados intentos fallidos'); }
        return null;
      }
      const mode = pairing.mode;
      pairing = null;
      const sessionToken = newToken();
      sessions.set(sessionToken, { id: randomBytes(5).toString('hex'), name: deviceName(req.headers['user-agent']), since: now(), ip: clientIp(req), mode, locked: false, lastSeen: now(), unlockAttempts: 0 });
      return { sessionToken, mode };
    },
    // Solo si hay PIN de bloqueo, que es con lo que se desbloquea: sin PIN no se
    // bloquea, porque no habría forma de volver a entrar. → si quedó bloqueada
    lock(token) { const s = sessions.get(token); if (s && lock.hasPin()) lockSession(token, s); return !!s?.locked; },
    // → { ok } | { gone: motivo } (sesión revocada) | { left: intentos que quedan }
    unlock(token, key) {
      const s = sessions.get(token);
      if (!s) return { gone: 'sesión revocada — vuelve a emparejar desde el ordenador' };
      if (!lock.matches(String(key || ''))) {
        if (++s.unlockAttempts >= MAX_ATTEMPTS) {
          revoke(token);
          console.warn('[sia] sesión del móvil revocada: demasiados intentos de desbloqueo');
          return { gone: 'demasiados intentos — sesión revocada, vuelve a emparejar' };
        }
        return { left: MAX_ATTEMPTS - s.unlockAttempts };
      }
      s.locked = false; s.unlockAttempts = 0; s.lastSeen = now();
      return { ok: true };
    },
    // cerrar UN dispositivo: se le revoca la llave y se le cortan los sockets
    revokeDevice(id) {
      const hit = [...sessions].find(([, s]) => s.id === id);
      if (hit) revoke(hit[0]);
      return !!hit;
    },
    // Abrir el acceso: un QR nuevo. En público, el túnel se arranca si no está
    // (la UI sigue las fases por el estado y pinta el QR cuando pasa a ready).
    // → { error } si no se puede
    enable(mode) {
      if (mode === 'public') {
        if (!lock.hasPin()) return { error: 'Antes de abrir el acceso público elige tu PIN de bloqueo.', needsPin: true };
        if (tunnel.live()) { openPairing('public'); tunnel.state.phase = 'ready'; return {}; }
        tunnel.start(() => openPairing('public'));
        return {};
      }
      if (!lanIp()) return { error: 'no se detecta una red local (¿WiFi?)' };
      openPairing('lan');
      return {};
    },
    disable() {
      pairing = null; sessions.clear();
      tunnel.stop();
      for (const c of wsClients()) if (c._siaLan) { try { c.close(4403, 'acceso revocado'); } catch { /* ya cerrado */ } }
    },
    // cinturón del servidor: una sesión pública inactiva se bloquea sola
    lockIdle() {
      for (const [t, s] of sessions) {
        if (s.mode === 'public' && !s.locked && now() - s.lastSeen > idleMs) { lockSession(t, s); console.log('[sia] sesión pública bloqueada por inactividad'); }
      }
    },
  };
};
