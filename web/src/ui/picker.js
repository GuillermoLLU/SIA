// Un selector propio (el desplegable nativo no se puede pintar): un campo
// oculto con el valor, un botón con lo elegido y la lista debajo. El HTML y el
// manejo de los clics (abrir, elegir, cerrar), compartidos por Issues
// (traspasar) y el Backlog (asignar). Los estilos, .iss-pick* (issues.css).
import { esc } from './html.js';

// options: [{ id, name }] · sin opciones, el botón sale deshabilitado con `empty`
export const pickerHtml = ({ name, id = `pick-${name}`, options, placeholder = 'Elige a quién', empty = 'No hay a quién elegir' }) => `<div class="iss-pick" data-pick>
      <input type="hidden" name="${esc(name)}" value="">
      <button type="button" id="${esc(id)}" class="iss-pick-btn" data-pick-btn aria-haspopup="listbox" aria-expanded="false" ${options.length ? '' : 'disabled'}><span data-pick-label class="iss-pick-ph">${esc(options.length ? placeholder : empty)}</span></button>
      <ul class="iss-pick-list" role="listbox" hidden>${options.map((o) => `<li role="option" data-pick-opt="${esc(o.id)}" aria-selected="false">${esc(o.name)}</li>`).join('')}</ul>
    </div>`;

export const openPicker = (root) => root.querySelector('[data-pick] [aria-expanded="true"]');
export const closePickers = (root) => root.querySelectorAll('[data-pick] [aria-expanded="true"]').forEach((b) => { b.setAttribute('aria-expanded', 'false'); b.nextElementSibling.hidden = true; });

// Un clic en la página: → true si era del selector y ya está atendido. Al
// elegir, el campo oculto toma el valor y se llama a onPick(pickEl, value).
export const pickClick = (root, t, onPick) => {
  const btn = t.closest('[data-pick-btn]');
  if (btn) {
    const open = btn.getAttribute('aria-expanded') === 'true';
    closePickers(root);
    if (!open) { btn.setAttribute('aria-expanded', 'true'); btn.nextElementSibling.hidden = false; }
    return true;
  }
  const opt = t.closest('[data-pick-opt]');
  if (!opt) { closePickers(root); return false; }
  const pick = opt.closest('[data-pick]');
  pick.querySelector('input[type=hidden]').value = opt.dataset.pickOpt;
  pick.querySelectorAll('[data-pick-opt]').forEach((o) => o.setAttribute('aria-selected', String(o === opt)));
  const label = pick.querySelector('[data-pick-label]');
  label.textContent = opt.textContent;
  label.classList.remove('iss-pick-ph');
  closePickers(root);
  onPick?.(pick, opt.dataset.pickOpt);
  return true;
};
