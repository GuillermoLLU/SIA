// Cliente HTTP de la base de la instancia: Supabase Auth (sesión), las
// funciones platform_* (RPC) y la Edge Function sia-users. Siempre con la
// clave publishable y, para actuar como alguien, su JWT: la autorización la
// decide la base. Sin estado; `fetch` llega inyectado (TLS verificado).
//
// Los errores salen como PlatformError(status, message) con el texto ya
// listo para enseñar.

export class PlatformError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

const AUTH_MESSAGES = {
  invalid_credentials: 'Email o contraseña incorrectos.',
  email_not_confirmed: 'Ese email aún no está confirmado.',
  user_banned: 'Esa cuenta está bloqueada.',
  refresh_token_not_found: 'La sesión ha caducado.',
  refresh_token_already_used: 'La sesión ha caducado.',
  session_not_found: 'La sesión ha caducado.',
  same_password: 'La contraseña nueva tiene que ser distinta de la actual.',
  weak_password: 'La contraseña necesita 6 caracteres o más.',
};
// PostgREST manda 42501 (sin permiso) como 401/403: aquí siempre 403.
const statusOf = (r, data) => (data?.code === '42501' ? 403 : r.status >= 500 ? 502 : r.status);

export const createPlatformClient = ({ url, key, fetch }) => {
  const request = async (path, { method = 'GET', body, jwt } = {}) => {
    if (!url || !key) throw new PlatformError(503, 'Falta configurar la base de la instancia (sia-instance.json).');
    let r;
    try {
      r = await fetch(`${url}${path}`, {
        method,
        headers: { apikey: key, 'Content-Type': 'application/json', ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}) },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (e) {
      const tls = /certificate|CERT_|SELF_SIGNED/i.test(String(e.cause?.code || e.cause?.message || e.message));
      throw new PlatformError(503, tls
        ? 'No se pudo verificar el certificado de la base de la instancia (¿proxy corporativo? Añade su certificado con NODE_EXTRA_CA_CERTS).'
        : 'Sin conexión con la base de la instancia.');
    }
    const text = await r.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { message: text }; }
    if (!r.ok) {
      const msg = AUTH_MESSAGES[data?.error_code] || data?.error || data?.msg || data?.message || `HTTP ${r.status}`;
      throw new PlatformError(statusOf(r, data), String(msg));
    }
    return data;
  };
  const tokens = (d) => ({ accessToken: d.access_token, refreshToken: d.refresh_token, expiresAt: Date.now() + d.expires_in * 1000 });

  return {
    signIn: async (email, password) => tokens(await request('/auth/v1/token?grant_type=password', { method: 'POST', body: { email, password } })),
    refresh: async (refreshToken) => tokens(await request('/auth/v1/token?grant_type=refresh_token', { method: 'POST', body: { refresh_token: refreshToken } })),
    signOut: (jwt) => request('/auth/v1/logout?scope=local', { method: 'POST', jwt }),
    updateOwnPassword: (jwt, password) => request('/auth/v1/user', { method: 'PUT', body: { password }, jwt }),
    rpc: (jwt, fn, args = {}) => request(`/rest/v1/rpc/${fn}`, { method: 'POST', body: args, jwt }),
    users: (jwt, body) => request('/functions/v1/sia-users', { method: 'POST', body, jwt }),
  };
};
