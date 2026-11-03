// Antes de enseñar el inicio de sesión (al pulsar la S y en «Reintentar»):
// ¿este equipo tiene ya los certificados del cliente y está en su VPN?
// Cada vez de verdad: relee los certificados del sistema (refreshCerts, sin
// reiniciar SIA), prueba la base de la instancia y, si hay VPN configurada, la red.
// Se miran las dos, así el aviso dice todo lo que falta a la vez.
// Si algo falta → PlatformError 503 con code 'certs', 'vpn' o 'certs-vpn' y su ayuda.
import { PlatformError } from '../platform/client.js';

export const createPreflight = ({ platform, refreshCerts, onVpn, vpnHost = '' }) => async () => {
  await refreshCerts();
  let certs = null;
  try { await platform.health(); } catch (e) {
    if (e.code !== 'certs') throw e; // la base no responde por otro motivo: ese error tal cual
    certs = e;
  }
  const vpn = !vpnHost || await onVpn(vpnHost);
  if (certs && !vpn) throw new PlatformError(503, 'Faltan los certificados y la VPN del cliente.', { code: 'certs-vpn', help: certs.help });
  if (certs) throw certs;
  if (!vpn) throw new PlatformError(503, 'No estás conectado a la VPN del cliente.', { code: 'vpn' });
};
