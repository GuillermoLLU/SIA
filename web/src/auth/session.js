// Sesión de usuario en el navegador: dónde se guarda el token y cómo se habla
// con /api/auth. Con «Recordar» el token va a localStorage (la próxima vez se
// entra solo); sin marcar, a sessionStorage (dura lo que la ventana).

const TOKEN_KEY = 'sia-auth';
const NAME_KEY = 'sia-auth-name';

const storedToken = () => localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || '';
const forget = () => { localStorage.removeItem(TOKEN_KEY); sessionStorage.removeItem(TOKEN_KEY); };

export const createAuthSession = (apiBase) => ({
  // Cabecera con la sesión, para las llamadas que la exigen (p. ej. /api/users).
  headers: () => ({ 'X-SIA-Auth': storedToken() }),

  // El último usuario que entró, para dejarlo escrito en el formulario.
  lastName: () => localStorage.getItem(NAME_KEY) || '',

  // El usuario de la sesión guardada, o null si no hay o ya no vale.
  // Sin bridge lanza: quien llama decide qué hacer.
  async current() {
    const token = storedToken();
    if (!token) return null;
    const r = await fetch(`${apiBase}/auth/me`, { headers: { 'X-SIA-Auth': token }, signal: AbortSignal.timeout(2500) });
    if (r.ok) return (await r.json()).user;
    forget();
    return null;
  },

  // → { user } | { error }
  async login(name, password, remember) {
    const r = await fetch(`${apiBase}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, password, remember }),
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) return { error: data.error || 'No se pudo iniciar sesión.' };
    forget();
    (remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, data.token);
    localStorage.setItem(NAME_KEY, data.user.name);
    return { user: data.user };
  },

  async logout() {
    try { await fetch(`${apiBase}/auth/logout`, { method: 'POST', headers: { 'X-SIA-Auth': storedToken() } }); }
    finally { forget(); }
  },
});
