// Invitaciones a conocimiento (dominio, sin DOM).
//
// Una invitación es «sia-invite:» + base64url de {v, name, url, key, tokens}:
// el proyecto de Supabase, su clave publishable y los tokens de los grupos
// que se comparten. No lleva nada que abra más de lo que abren esos tokens.
// Quien la recibe la pega en ⚙️ → Conocimiento → Añadir base.
export const INVITE_PREFIX = 'sia-invite:';

const b64url = {
  enc: (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''),
  dec: (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))),
};

export const inviteEncode = ({ name, url, key, tokens }) =>
  INVITE_PREFIX + b64url.enc(JSON.stringify({ v: 1, name: String(name || '').slice(0, 40), url, key, tokens: [...new Set((tokens || []).map((t) => String(t).trim()).filter(Boolean))] }));

// { name, url, key, tokens[] } o null si el texto no es una invitación válida.
// Admite también la forma antigua con un solo `token`.
export const inviteDecode = (text) => {
  const t = String(text || '').trim();
  if (!t.startsWith(INVITE_PREFIX)) return null;
  try {
    const inv = JSON.parse(b64url.dec(t.slice(INVITE_PREFIX.length)));
    if (inv?.v !== 1 || typeof inv.url !== 'string' || typeof inv.key !== 'string' || !inv.url || !inv.key) return null;
    const tokens = (Array.isArray(inv.tokens) ? inv.tokens : [inv.token]).map((x) => String(x || '').trim()).filter(Boolean);
    return { name: String(inv.name || '').slice(0, 40), url: inv.url, key: inv.key, tokens: [...new Set(tokens)] };
  } catch { return null; }
};

// Texto tapado como una contraseña: principio y final, para reconocerla sin
// enseñarla entera.
export const inviteMask = (text) => `${text.slice(0, INVITE_PREFIX.length + 5)}…${text.slice(-6)}`;
