// Política de contraseñas de la instancia (dominio, sin E/S): la misma que
// Authentication → Passwords en Supabase y que la Edge Function sia-users.
// 12 o más caracteres, con minúsculas, mayúsculas, números y algún símbolo.
// → texto del problema o null.

export const passwordProblem = (p) => {
  if (typeof p !== 'string' || p.length < 12) return 'La contraseña necesita 12 caracteres o más.';
  if (!/[a-z]/.test(p) || !/[A-Z]/.test(p) || !/[0-9]/.test(p) || !/[^A-Za-z0-9]/.test(p)) {
    return 'La contraseña necesita minúsculas, mayúsculas, números y algún símbolo.';
  }
  return null;
};
