// Casillas de PIN. El campo real es un input invisible encima, que es el que
// recibe el teclado; las casillas solo pintan cuántos dígitos hay. Al llenar la
// última se apaga y llama a onFull(valor); quien lo use responde con ok(),
// fail() (sacudida y a empezar) u hold()/release() (apagado mientras dure un freno).
// En el móvil no se usa el teclado del sistema, que al abrirse empuja la
// pantalla y descoloca el logo: el PIN se marca en un teclado numérico propio
// (`keys`, que quien lo use coloca bajo las casillas), con el tema de la app. El
// campo se queda de solo lectura y nunca recibe el foco.
import { svg } from '../ui/html.js';
import { digits } from './pin.js';

const BACKSPACE_ICON = svg('<path d="M9 5h10.5a1.5 1.5 0 0 1 1.5 1.5v11a1.5 1.5 0 0 1-1.5 1.5H9l-6-7z"/><path d="m12 9.5 5 5"/><path d="m17 9.5-5 5"/>', { width: 1.7 });

export const pinPad = (len, onFull, label = 'PIN') => {
  const touch = document.body.classList.contains('phone');
  const el = document.createElement('div');
  el.className = `lock-pin${len > 4 ? ' long' : ''}${touch ? ' touch' : ''}`;
  el.innerHTML = `<input type="password" inputmode="${touch ? 'none' : 'numeric'}" autocomplete="off" maxlength="${len}" aria-label="${label}"${touch ? ' readonly tabindex="-1"' : ''} />${'<span class="cell"></span>'.repeat(len)}`;
  const key = el.firstElementChild;
  let busy = false;
  let keys = null;
  // las casillas pintan cuántos dígitos hay; la activa es la siguiente por escribir
  const paint = () => {
    const n = key.value.length;
    el.querySelectorAll('.cell').forEach((c, i) => {
      c.classList.toggle('filled', i < n);
      c.classList.toggle('active', i === n && !busy);
    });
    el.classList.toggle('off', key.disabled && !el.classList.contains('ok'));
    keys?.classList.toggle('off', key.disabled);
  };
  const changed = () => {
    key.value = digits(key.value, len);
    el.classList.remove('bad'); // el rojo del fallo se va al volver a escribir
    paint();
    if (key.value.length === len && !busy) { busy = true; key.disabled = true; paint(); onFull(key.value); }
  };
  key.addEventListener('input', changed);
  const focus = () => { if (!touch) key.focus(); };
  if (touch) {
    // una tecla del teclado propio: un dígito o «del» (borrar el último)
    const press = (k) => {
      if (busy || key.disabled) return;
      key.value = k === 'del' ? key.value.slice(0, -1) : key.value + k;
      changed();
    };
    keys = document.createElement('div');
    keys.className = 'lock-keys';
    keys.innerHTML = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'del']
      .map((k) => (k === '' ? '<span></span>'
        : `<button type="button" data-k="${k}"${k === 'del' ? ` class="del" aria-label="Borrar">${BACKSPACE_ICON}` : `>${k}`}</button>`)).join('');
    keys.addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) press(b.dataset.k); });
    // la tecla pulsada se marca a mano: `:active` en táctil no es de fiar (Safari
    // no lo aplica y en otros se queda pegado tras soltar)
    const lift = () => keys.querySelector('.pressed')?.classList.remove('pressed');
    keys.addEventListener('pointerdown', (e) => { lift(); e.target.closest('button')?.classList.add('pressed'); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) keys.addEventListener(ev, lift);
    // con un teclado físico (tableta, portátil entrando en remoto) también se puede teclear
    const typed = (e) => {
      if (!el.isConnected) return window.removeEventListener('keydown', typed, true);
      if (/^\d$/.test(e.key)) { e.preventDefault(); press(e.key); }
      else if (e.key === 'Backspace') { e.preventDefault(); press('del'); }
    };
    window.addEventListener('keydown', typed, true);
  }
  paint();
  return {
    el, key, keys, focus,
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
