// Casillas de PIN. El campo real es un input invisible encima, que es el que
// recibe el teclado; las casillas solo pintan cuántos dígitos hay. Al llenar la
// última se apaga y llama a onFull(valor); quien lo use responde con ok(),
// fail() (sacudida y a empezar) u hold()/release() (apagado mientras dure un freno).
import { digits } from './pin.js';

export const pinPad = (len, onFull) => {
  const el = document.createElement('div');
  el.className = 'lock-pin';
  el.innerHTML = `<input type="password" inputmode="numeric" autocomplete="off" maxlength="${len}" aria-label="PIN" />${'<span class="cell"></span>'.repeat(len)}`;
  const key = el.firstElementChild;
  let busy = false;
  // las casillas pintan cuántos dígitos hay; la activa es la siguiente por escribir
  const paint = () => {
    const n = key.value.length;
    el.querySelectorAll('.cell').forEach((c, i) => {
      c.classList.toggle('filled', i < n);
      c.classList.toggle('active', i === n && !busy);
    });
    el.classList.toggle('off', key.disabled && !el.classList.contains('ok'));
  };
  const changed = () => {
    key.value = digits(key.value, len);
    el.classList.remove('bad'); // el rojo del fallo se va al volver a escribir
    paint();
    if (key.value.length === len && !busy) { busy = true; key.disabled = true; paint(); onFull(key.value); }
  };
  key.addEventListener('input', changed);
  const focus = () => key.focus();
  paint();
  return {
    el, key, focus,
    ok: () => { el.classList.add('ok'); paint(); },
    fail: () => {
      el.classList.remove('bad'); void el.offsetWidth; el.classList.add('bad'); // reinicia la sacudida
      key.value = ''; busy = false; key.disabled = false; paint(); focus();
    },
    hold: () => { key.value = ''; busy = true; key.disabled = true; paint(); },
    release: () => { busy = false; key.disabled = false; paint(); focus(); },
  };
};

// Un campo de texto que solo admite dígitos (los del PIN en Configuración y en el diálogo de elegirlo).
export const digitsOnly = (input, len) => input.addEventListener('input', () => { input.value = digits(input.value, len); });
