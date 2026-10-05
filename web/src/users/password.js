// Contraseña inicial segura (en el navegador, con crypto): 3 tramos de
// letras y números separados por guiones, con mayúsculas, minúsculas y
// números siempre (el guion es el símbolo). Cumple la política de la
// instancia: 12 o más con los cuatro tipos de carácter.

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; // sin 0/O ni 1/l/I

export const strongPassword = () => {
  for (;;) {
    const bytes = crypto.getRandomValues(new Uint32Array(15));
    const chars = [...bytes].map((n) => ALPHABET[n % ALPHABET.length]).join('');
    const pw = `${chars.slice(0, 5)}-${chars.slice(5, 10)}-${chars.slice(10)}`;
    if (/[a-z]/.test(pw) && /[A-Z]/.test(pw) && /[0-9]/.test(pw)) return pw;
  }
};
