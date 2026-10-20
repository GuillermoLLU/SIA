// Acceso desde otro dispositivo (dominio, sin E/S). El bridge escucha en
// todas las interfaces, así que por defecto DENIEGA todo lo que no venga de
// localhost. Un dispositivo solo entra si presenta una llave de sesión, que
// se obtiene emparejando con el QR (token de un solo uso) + el PIN que
// muestra el escritorio. Dos modos: «lan» (misma WiFi) y «public» (túnel de
// Cloudflare con URL temporal).

export const PAIR_TTL_MS = 5 * 60 * 1000;
// Para que 6 dígitos no sean fuerza-brutables, el emparejamiento se invalida
// a los 5 intentos fallidos; y a los 5 desbloqueos fallados la sesión del
// móvil se revoca entera (quien tenga el token robado se queda fuera).
export const MAX_ATTEMPTS = 5;

// OJO: el tráfico que entra por el túnel de Cloudflare llega al bridge DESDE
// localhost (cloudflared corre aquí), pero no es local: viene marcado con las
// cabeceras del proxy. Sin este matiz, cualquiera con la URL pública sería
// «loopback» y se saltaría el cortafuegos entero.
export const isLoopback = (req) => {
  if (req.headers['cf-connecting-ip'] || req.headers['x-forwarded-for']) return false;
  const a = req.socket?.remoteAddress || '';
  return a === '127.0.0.1' || a === '::1' || a === '::ffff:127.0.0.1';
};

export const clientIp = (req) => String(req.headers['cf-connecting-ip'] || req.socket?.remoteAddress || '').replace(/^::ffff:/, '');

// La llave del móvil: en cabecera o, cuando no puede llevarla (un sendBeacon,
// un <img>), en ?t=.
export const lanToken = (req, url) => req.headers['x-sia-lan'] || url.searchParams.get('t') || null;

// Nombre reconocible de un dispositivo a partir de su navegador, para la lista
// de conectados («iPhone · Safari»). Es orientativo: un iPad se anuncia como Mac.
export const deviceName = (ua = '') => {
  const dev = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad'
    : /Android/.test(ua) ? (/Mobile/.test(ua) ? 'Android' : 'Tablet Android')
      : /Macintosh|Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Dispositivo';
  const br = /EdgA?\//.test(ua) ? 'Edge' : /Firefox|FxiOS/.test(ua) ? 'Firefox' : /CriOS|Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return br ? `${dev} · ${br}` : dev;
};

export const newPairing = (mode, { token, pin, now }) => ({ token, pin, expiresAt: now + PAIR_TTL_MS, mode, attempts: 0 });

// La PWA instalada no tiene la URL del QR (almacenamiento aparte), así que
// también vale SOLO el PIN mientras el emparejamiento esté activo.
export const pairingMatches = (p, { token, pin }, now) => !!p && now <= p.expiresAt && p.pin === String(pin) && (!token || p.token === token);

// Sin sesión, la API solo abre el ping y emparejar, y únicamente mientras el
// acceso está activo. La web estática se sirve siempre: no expone datos y
// permite que la PWA instalada arranque y enseñe la pantalla de PIN.
export const openWithoutSession = (parts, active) => parts[0] !== 'api' || (active && (parts[1] === 'ping' || (parts[1] === 'lan' && parts[2] === 'pair')));

// Emparejado NO es local: un dispositivo remoto solo llega a lo que la vista
// del móvil usa de verdad. Nada de config personal (ahí viven los tokens de
// Jira/GitHub), skills, borradores ni administración.
export const remoteReach = (parts) => parts[1] === 'ping' || parts[1] === 'version'
  || parts[1] === 'upload' || parts[1] === 'uploads'
  || (parts[1] === 'lan' && ['pair', 'lock', 'unlock', 'pin'].includes(parts[2]));

// Con el candado echado: solo desbloquear (y el ping, que informa del estado).
export const openWhileLocked = (parts) => parts[1] === 'ping' || (parts[1] === 'lan' && ['lock', 'unlock'].includes(parts[2]));
