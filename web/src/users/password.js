// Contraseña inicial: dos tramos de cinco letras y números separados por un
// guion, fácil de leer y de dictar. La política de la instancia solo pide 6
// caracteres o más. `random(n)` da n enteros al azar (en el navegador, crypto).

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; // sin 0/O ni 1/l/I

export const strongPassword = (random = (n) => crypto.getRandomValues(new Uint32Array(n))) => {
  const chars = [...random(10)].map((n) => ALPHABET[n % ALPHABET.length]).join('');
  return `${chars.slice(0, 5)}-${chars.slice(5)}`;
};
