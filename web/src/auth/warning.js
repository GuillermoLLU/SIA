// El aviso de la puerta cuando falta algo en el equipo (dominio puro): qué se
// dice según lo que falta. Lo que falta, en dos líneas; el porqué, en la ayuda (ⓘ).
// {guía} marca dónde va el enlace a la guía de certificados.
const CERTS_TIP = 'La red del cliente verifica las conexiones con sus propios certificados y este equipo aún no los tiene. Instálalos y pulsa «Reintentar»: no hace falta reiniciar SIA.';
const VPN_TIP = 'SIA trabaja dentro de la red del cliente: sin la VPN, algunas funciones no responderán.';

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
