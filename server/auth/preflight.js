// Antes de enseñar el inicio de sesión (al pulsar la S y en «Reintentar»):
// ¿este equipo tiene ya los certificados del cliente y está en su VPN?
// Cada vez de verdad: prueba la base de la instancia y, si falla por los
// certificados, los relee del sistema (refreshCerts, sin reiniciar SIA) y vuelve
// a probar; con el equipo listo no se relee nada. Si hay VPN configurada, la red.
// Se miran las dos, así el aviso dice todo lo que falta a la vez.
// Si algo falta → el error de shared/client-network.js: code 'certs', 'vpn' o 'certs-vpn' y su ayuda.
import { clientNetworkError } from '../shared/client-network.js';

export const createPreflight = ({ platform, refreshCerts, onVpn, vpnHost = '' }) => {
  // null si se llega a la base; el error si faltan los certificados; otro fallo, tal cual
  const certsProblem = async () => {
    try { await platform.health(); return null; } catch (e) {
      if (e.code !== 'certs') throw e;
      return e;
    }
  };

  return async () => {
    let certs = await certsProblem();
    if (certs) { await refreshCerts(); certs = await certsProblem(); } // quizá los acaba de instalar
    const vpn = !vpnHost || await onVpn(vpnHost);
    if (certs && !vpn) throw clientNetworkError('certs-vpn', 'Faltan los certificados y la VPN del cliente.', certs.help?.url);
    if (certs) throw certs;
    if (!vpn) throw clientNetworkError('vpn', 'No estás conectado a la VPN del cliente.');
  };
};
