// El aviso de lo que le falta al equipo para la red del cliente (dominio puro):
// qué se dice según lo que falta, en dos líneas: qué falta y qué hacer, sin más.
// {guía} marca dónde va el enlace a la guía de certificados. Lo pinta
// net-warning-view.js donde haga falta: la puerta de inicio de sesión, Métricas…
// Los code llegan del bridge (server/shared/client-network.js).
const CODES = ['certs', 'vpn', 'certs-vpn'];

// ¿Es lo que falta para la red del cliente? Entonces, el aviso; si no, el error de siempre.
export const isNetWarning = (code) => CODES.includes(code);

// r: { code: 'certs' | 'vpn' | 'certs-vpn' | otro, error }; guide: si hay guía configurada.
// → { title, line }
export const warning = ({ code, error }, guide) => {
  if (code === 'certs') return {
    title: 'Faltan los certificados del cliente',
    line: guide ? 'Instálalos con {guía} y pulsa «Reintentar».' : 'Pide a soporte la guía de certificados.',
  };
  if (code === 'vpn') return {
    title: 'Sin conexión a la VPN del cliente',
    line: 'Conéctate a la VPN y pulsa «Reintentar».',
  };
  if (code === 'certs-vpn') return {
    title: 'Faltan los certificados y la VPN',
    line: guide ? 'Instala los certificados con {guía} y conéctate a la VPN.' : 'Pide a soporte la guía de certificados y conéctate a la VPN.',
  };
  return { title: error || 'Sin conexión con SIA.', line: '' };
};
