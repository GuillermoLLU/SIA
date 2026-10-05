// Política de contraseñas de la instancia (dominio, sin E/S): la misma que
// Authentication → Passwords en Supabase y que la Edge Function sia-users.
// Basta con 6 caracteres o más, sin exigir tipos de carácter.
// → texto del problema o null.

const PASSWORD_MIN = 6;

export const passwordProblem = (p) =>
  (typeof p !== 'string' || p.length < PASSWORD_MIN ? `La contraseña necesita ${PASSWORD_MIN} caracteres o más.` : null);
