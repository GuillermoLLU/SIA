// El aviso de lo que le falta al equipo para la red del cliente (dominio puro):
// qué se dice según lo que falta. Lo que falta, en dos líneas; el porqué, en la
// ayuda (ⓘ). {guía} marca dónde va el enlace a la guía de certificados. Lo pinta
// net-warning-view.js donde haga falta: la puerta de inicio de sesión, Métricas…
// Los code llegan del bridge (server/shared/client-network.js).
const CODES = ['certs', 'vpn', 'certs-vpn'];
const CERTS_TIP = 'La red del cliente verifica las conexiones con sus propios certificados y este equipo aún no los tiene. Instálalos y pulsa «Reintentar»: no hace falta reiniciar SIA.';
const VPN_TIP = 'SIA trabaja dentro de la red del cliente: sin la VPN, algunas funciones no responderán.';

// ¿Es lo que falta para la red del cliente? Entonces, el aviso; si no, el error de siempre.
export const isNetWarning = (code) => CODES.includes(code);

// r: { code: 'certs' | 'vpn' | 'certs-vpn' | otro, error }; guide: si hay guía configurada.
// → { title, line, tips }
export const warning = ({ code, error }, guide) => {
  if (code === 'certs') return {
    title: 'Faltan los certificados del cliente',
    line: guide ? 'Instálalos con {guía}' : 'Pide a soporte la guía de certificados.',
    tips: [CERTS_TIP],
  };
  if (code === 'vpn') return {
    title: 'Sin conexión a la VPN del cliente',
    line: 'Conéctate a la VPN y pulsa «Reintentar».',
    tips: [VPN_TIP],
  };
  if (code === 'certs-vpn') return {
    title: 'Faltan los certificados y la VPN',
    line: guide ? 'Instala los certificados con {guía} y conéctate a la VPN.' : 'Pide a soporte la guía de certificados y conéctate a la VPN.',
    tips: [CERTS_TIP, VPN_TIP],
  };
  return { title: error || 'Sin conexión con SIA.', line: '', tips: [] };
};
