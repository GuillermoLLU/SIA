// Sesión de usuario en el navegador: dónde se guarda el token y cómo se habla
// con /api/auth. Se entra con email y contraseña de la instancia; el bridge
// devuelve un token propio, opaco (el JWT de Supabase no sale de él). Con
// «Mantener la sesión» el token va a localStorage (la próxima vez se entra
// solo); sin marcar, a sessionStorage (dura lo que la ventana).

const TOKEN_KEY = 'sia-auth';
const EMAIL_KEY = 'sia-auth-email';

const storedToken = () => localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '';
const forget = () => { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); };

export const createAuthSession = (apiBase) => ({
  // Cabecera con la sesión, para las llamadas que la exigen (p. ej. /api/users).
  headers: () => ({ 'X-SIA-Auth': storedToken() }),

  // El último email que entró, para dejarlo escrito en el formulario.
  lastEmail: () => localStorage.getItem(EMAIL_KEY) || '',

  // El usuario de la sesión guardada, o null si no hay o ya no vale (solo
  // entonces se olvida). Sin bridge o sin base, lanza: quien llama decide.
  async current() {
    const token = storedToken();
    if (!token) return null;
    const r = await fetch(`${apiBase}/auth/me`, { headers: { 'X-SIA-Auth': token }, signal: AbortSignal.timeout(8000) });
    if (r.ok) return (await r.json()).user;
    if (r.status === 401) { forget(); return null; }
    throw new Error((await r.json().catch(() => ({}))).error || `HTTP ${r.status}`);
  },

  // → { user } | { error }
  async login(email, password, remember) {
    const r = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, remember }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { error: data.error || 'No se pudo iniciar sesión.' };
    forget();
    (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, data.token);
    localStorage.setItem(EMAIL_KEY, data.user.email);
    return { user: data.user };
  },

  // Cambiar la propia contraseña (obligatorio si la puso un admin). → { ok } | { error }
  async changePassword(password) {
    const r = await fetch(`${apiBase}/auth/password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-SIA-Auth': storedToken() },
      body: JSON.stringify({ password }),
    });
    const data = await r.json().catch(() => ({}));
    return r.ok ? { ok: true } : { error: data.error || 'No se pudo cambiar la contraseña.' };
  },

  async logout() {
    try { await fetch(`${apiBase}/auth/logout`, { method: 'POST', headers: { 'X-SIA-Auth': storedToken() } }); }
    finally { forget(); }
  },
});
