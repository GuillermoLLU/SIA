// Diálogos de la app (nada de alert/prompt/confirm nativos). Dos piezas:
// la pila de Escape, un solo listener para todo lo que se abre encima (el
// diálogo de aquí y los modales apilables de Personas): Escape cierra lo de
// arriba y nada más; y el diálogo genérico del #dialog-overlay, que devuelve
// una promesa con lo que se contestó.

const stack = [];
let listening = false;
const onKey = (e) => {
  if (e.key !== 'Escape' || !stack.length) return;
  e.preventDefault();
  e.stopPropagation();
  stack.at(-1)();
};
// Lo que acaba de abrirse registra su cierre. Devuelve cómo darse de baja (al
// cerrarse por otro camino). El listener se pone la primera vez que hace falta.
export const onEscape = (close) => {
  if (!listening) { document.addEventListener('keydown', onKey, true); listening = true; }
  stack.push(close);
  return () => { const i = stack.lastIndexOf(close); if (i >= 0) stack.splice(i, 1); };
};

// El diálogo genérico: título, cuerpo (HTML ya escapado por quien llama), un
// campo opcional y los botones. Enter acepta, Escape cancela.
export const createDialogs = (overlay) => {
  const title = overlay.querySelector('#dialog-title');
  const body = overlay.querySelector('#dialog-body');
  const actions = overlay.querySelector('#dialog-actions');

  const open = ({ title: text, bodyHTML = '', input = null, okLabel = 'Aceptar', cancelLabel = 'Cancelar', alertOnly = false, centered = false }) =>
    new Promise((resolve) => {
      title.textContent = text;
      body.innerHTML = bodyHTML;
      overlay.classList.toggle('centered', centered); // centrado en vertical (por defecto cuelga de arriba)
      let inputEl = null;
      if (input) {
        inputEl = document.createElement('input');
        inputEl.className = 'settings-input';
        inputEl.placeholder = input.placeholder || '';
        inputEl.value = input.value || '';
        inputEl.spellcheck = false;
        body.appendChild(inputEl);
      }
      const cancelValue = input ? null : false;
      const okValue = () => (input ? inputEl.value.trim() : true);
      const close = (val) => {
        overlay.hidden = true;
        offEscape();
        overlay.removeEventListener('keydown', onEnter);
        resolve(val);
      };
      const offEscape = onEscape(() => close(cancelValue));
      const onEnter = (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); close(okValue()); } };
      overlay.addEventListener('keydown', onEnter);
      actions.innerHTML = '';
      if (!alertOnly) {
        const cancel = document.createElement('button');
        cancel.className = 'lab-btn';
        cancel.textContent = cancelLabel;
        cancel.addEventListener('click', () => close(cancelValue));
        actions.appendChild(cancel);
      }
      const ok = document.createElement('button');
      ok.className = 'lab-btn primary';
      ok.textContent = okLabel;
      ok.addEventListener('click', () => close(okValue()));
      actions.appendChild(ok);
      overlay.hidden = false;
      (inputEl || ok).focus();
    });

  return {
    open,
    prompt: (text, placeholder, bodyHTML = '') => open({ title: text, bodyHTML, input: { placeholder } }),
    confirm: (text, bodyHTML = '', okLabel = 'Confirmar') => open({ title: text, bodyHTML, okLabel }),
    alert: (text, bodyHTML = '') => open({ title: text, bodyHTML, alertOnly: true, okLabel: 'Entendido' }),
  };
};
