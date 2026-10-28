// Confiar también en los certificados del sistema (Windows, macOS), no solo en los
// que trae Node. Detrás de la VPN de Inditex el proxy firma la conexión con la base
// de la instancia con un certificado corporativo que solo conoce el sistema: sin
// esto, el inicio de sesión falla con SELF_SIGNED_CERT_IN_CHAIN, también en la app
// instalada (que no arranca con NODE_USE_SYSTEM_CA). Fuera de la VPN no cambia nada.
// tls: el módulo node:tls (se inyecta). Devuelve si se aplicó (hace falta Node 22.19+).
export const trustSystemCerts = (tls) => {
  if (typeof tls.setDefaultCACertificates !== 'function') return false;
  try {
    tls.setDefaultCACertificates([...new Set([...tls.getCACertificates('default'), ...tls.getCACertificates('system')])]);
    return true;
  } catch {
    return false;   // sin acceso al almacén del sistema: se sigue con los de Node
  }
};
