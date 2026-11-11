// Reglas del PIN de bloqueo (sin DOM). El bridge guarda y comprueba el PIN;
// aquí solo se da forma a lo que se teclea y se lee su respuesta.

export const LOCK_PIN_LEN = 4; // de serie; el bridge dice la real en GET /lock (len)

// Solo dígitos, como mucho `len`.
export const digits = (value, len) => String(value ?? '').replace(/\D/g, '').slice(0, len);

// Elegir un PIN: el primero bien formado y el segundo igual.
export const pinProblem = (a, b, len = LOCK_PIN_LEN) => (!new RegExp(`^\\d{${len}}$`).test(a) ? `El PIN son ${len} dígitos.` : a !== b ? 'Los dos PIN no coinciden.' : '');

// Lo que hace la puerta con la respuesta del bridge a un PIN: acierto; un 429
// trae los segundos de freno; lo demás es un fallo (sin decir nada).
export const unlockOutcome = ({ ok, status, data }) => {
  if (ok) return { do: 'ok' };
  if (status === 429 && data?.wait) return { do: 'wait', secs: data.wait };
  return { do: 'fail' };
};
