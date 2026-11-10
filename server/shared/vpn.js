// ¿Está este equipo en la red del cliente (su VPN)? Un nombre interno del cliente
// (sia-instance.json → vpn.probeHost) solo resuelve a una dirección privada con
// su DNS, es decir, dentro de su red: fuera, no resuelve o da una pública.
// lookup: el de node:dns/promises (se inyecta). → true | false
const PRIVATE = [/^10\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^f[cd][0-9a-f]{2}:/i];

export const isPrivateAddress = (address) => PRIVATE.some((r) => r.test(String(address)));

export const onVpn = async (lookup, host, { timeoutMs = 3000 } = {}) => {
  let timer;
  const late = new Promise((resolve) => { timer = setTimeout(() => resolve([]), timeoutMs); });
  try {
    const found = await Promise.race([lookup(host, { all: true }), late]);
    return found.some((a) => isPrivateAddress(a.address));
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
};
