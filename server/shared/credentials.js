// Credenciales con las que SIA habla con una base (dominio, sin E/S).
//
// La base solo se abre con la clave PUBLISHABLE del proyecto más dos cabeceras
// por petición: x-sia-tokens (los tokens de los proyectos de la persona) y
// x-sia-power (su clave de poder). Las dos llegan de la instancia al iniciar
// sesión; la clave secret nunca entra en SIA.

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
