// Credenciales con las que SIA habla con una base (dominio, sin E/S).
//
// La base solo se abre con la clave PUBLISHABLE del proyecto más dos cabeceras
// por petición: x-sia-tokens (tokens de grupo del usuario) y x-sia-power
// (su clave de poder). La clave secret / service_role nunca entra en SIA:
// salta las políticas de la base, así que se rechaza al pegarla y se descarta
// de las configuraciones antiguas.

// ¿Es una clave secret? La forma nueva (sb_secret_…) o la antigua: un JWT cuyo
// `role` es service_role.
export const isSecretKey = (key) => {
  const k = String(key || '').trim();
  if (/^sb_secret_/i.test(k)) return true;
  const parts = k.split('.');
  if (parts.length !== 3) return false;
  try { return JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8')).role === 'service_role'; }
  catch { return false; }
};
export const SECRET_KEY_MSG = 'Esa es la clave secret del proyecto: SIA no la usa. Pega la clave publishable (Project Settings → API Keys, sb_publishable_…).';

// Valor de cabecera HTTP a partir de uno o varios tokens/claves: solo
// caracteres visibles ASCII y sin comas (los tokens y claves son uuid/slug;
// cualquier otra cosa se descarta en vez de mandarse).
export const headerValue = (list) => (Array.isArray(list) ? list : [list])
  .map((t) => String(t || '').trim())
  .filter((t) => /^[\x21-\x7e]+$/.test(t) && !t.includes(','))
  .join(',');

// Las cabeceras que la base espera (vacías = no se mandan).
export const siaHeaders = (tokens, powerKey) => ({
  ...(headerValue(tokens) ? { 'x-sia-tokens': headerValue(tokens) } : {}),
  ...(headerValue(powerKey) ? { 'x-sia-power': headerValue(powerKey) } : {}),
});
