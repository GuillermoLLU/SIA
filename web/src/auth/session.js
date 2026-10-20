// Sesión de usuario en el navegador: dónde se guarda el token y cómo se habla
// con /api/auth. Se entra con email y contraseña de la instancia; el bridge
// devuelve un token propio, opaco (el JWT de Supabase no sale de él). Con
// «Mantener la sesión» el token va a localStorage (la próxima vez se entra
// solo); sin marcar, a sessionStorage (dura lo que la ventana).
import { createApi } from '../ui/api.js';

const TOKEN_KEY = 'sia-auth';
const EMAIL_KEY = 'sia-auth-email';

export const createAuthSession = (apiBase, { fetch = globalThis.fetch, local = globalThis.localStorage, session = globalThis.sessionStorage } = {}) => {
  const token = () => local.getItem(TOKEN_KEY) || session.getItem(TOKEN_KEY) || '';
  const forget = () => { local.removeItem(TOKEN_KEY); session.removeItem(TOKEN_KEY); };
  const headers = () => ({ 'X-SIA-Auth': token() });
  const api = createApi(apiBase, headers, { fetch });
  // un fallo del bridge (sin red) sube; uno con respuesta, su texto o el de serie
  const failure = (e, fallback) => { if (!e.status) throw e; return { error: e.data?.error || fallback }; };

  return {
    // Cabecera con la sesión, para las llamadas que la exigen (p. ej. /api/users).
    headers,

    // El último email que entró, para dejarlo escrito en el formulario.
    lastEmail: () => local.getItem(EMAIL_KEY) || '',

    // El usuario de la sesión guardada, o null si no hay o ya no vale (solo
    // entonces se olvida). Sin bridge o sin base, lanza: quien llama decide.
    async current() {
      if (!token()) return null;
      try { return (await api('/auth/me', { timeoutMs: 8000 })).user; }
      catch (e) { if (e.status === 401) { forget(); return null; } throw e; }
    },

    // → { user } | { error }
    async login(email, password, remember) {
      try {
        const data = await api('/auth/login', { method: 'POST', body: { email, password, remember } });
        forget();
        (remember ? local : session).setItem(TOKEN_KEY, data.token);
        local.setItem(EMAIL_KEY, data.user.email);
        return { user: data.user };
      } catch (e) { return failure(e, 'No se pudo iniciar sesión.'); }
    },

    // Cambiar la propia contraseña (obligatorio si la puso un admin). → { ok } | { error }
    async changePassword(password) {
      try { await api('/auth/password', { method: 'POST', body: { password } }); return { ok: true }; }
      catch (e) { return failure(e, 'No se pudo cambiar la contraseña.'); }
    },

    async logout() {
      try { await api('/auth/logout', { method: 'POST' }); }
      finally { forget(); }
    },
  };
};
