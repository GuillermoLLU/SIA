// Confiar también en los certificados del sistema (Windows, macOS), no solo en los
// que trae Node. Detrás de la VPN de Inditex el proxy firma la conexión con la base
// de la instancia con un certificado corporativo que solo conoce el sistema: sin
// esto, el inicio de sesión falla con SELF_SIGNED_CERT_IN_CHAIN, también en la app
// instalada. Fuera de la VPN no cambia nada.
// tls: el módulo node:tls (se inyecta). Devuelve si se aplicó (hace falta Node 22.19+).
// system: los del sistema ya leídos (readSystemCerts, al reintentar); si no, los de este proceso.
export const trustSystemCerts = (tls, system) => {
  if (typeof tls.setDefaultCACertificates !== 'function') return false;
  try {
    tls.setDefaultCACertificates([...new Set([...tls.getCACertificates('default'), ...(system || tls.getCACertificates('system'))])]);
    return true;
  } catch {
    return false;   // sin acceso al almacén del sistema: se sigue con los de Node
  }
};

// Node lee el almacén del sistema una sola vez por proceso: para ver los que se
// acaban de instalar sin reiniciar SIA, los lee un proceso nuevo (el mismo Node o,
// en la app, Electron como Node). execFile: el de node:child_process (se inyecta).
// → los PEM del sistema; rechaza si no se pueden leer.
export const readSystemCerts = (execFile, execPath) => new Promise((resolve, reject) => {
  const script = "process.stdout.write(JSON.stringify(require('node:tls').getCACertificates('system')))";
  execFile(execPath, ['-e', script], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, maxBuffer: 64 << 20, timeout: 15000, windowsHide: true }, (e, out) => {
    if (e) return reject(e);
    try { resolve(JSON.parse(out)); } catch (err) { reject(err); }
  });
});

// ¿Es un fallo de verificación del certificado (proxy de la empresa sin su CA)?
// Se mira todo: fetch lo trae en cause y Snowflake, en el mensaje junto a su código.
export const isCertError = (e) => /certificate|CERT_|SELF_SIGNED/i.test([e?.cause?.code, e?.cause?.message, e?.code, e?.message].join(' '));
