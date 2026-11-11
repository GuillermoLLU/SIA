// Un selector propio (el desplegable nativo no se puede pintar): un campo
// oculto con el valor, un botón con lo elegido y la lista debajo, con grupos
// si hace falta. El HTML y el manejo de los clics (abrir, elegir, cerrar),
// el de todos los selectores de la web. Los estilos, .pick* (style.css); la
// altura se ajusta con --pick-h donde vaya en una barra. No va dentro de un
// <label>: el clic en una opción volvería a activar el botón y lo reabriría.
import { esc } from './html.js';

// groups: [{ label?, options: [{ value, label, disabled? }] }] · name, el del
// campo oculto · inline: del ancho de lo elegido, para una barra
export const pickerHtml = ({ id, name, value = '', placeholder = '', groups, disabled = false, inline = false }) => {
  const chosen = groups.flatMap((g) => g.options).find((o) => o.value === value);
  return `<div class="pick${inline ? ' inline' : ''}" data-pick>
      <input type="hidden" name="${esc(name)}" value="${esc(value)}">
      <button type="button" id="${esc(id)}" class="pick-btn" data-pick-btn aria-haspopup="listbox" aria-expanded="false"${disabled ? ' disabled' : ''}><span data-pick-label${chosen ? '' : ' class="pick-ph"'}>${esc(chosen ? chosen.label : placeholder)}</span></button>
      <ul class="pick-list" role="listbox" hidden>${groups.map((g) => `${g.label ? `<li role="presentation" class="pick-group">${esc(g.label)}</li>` : ''}${g.options.map((o) => `<li role="option" data-pick-opt="${esc(o.value)}" aria-selected="${o.value === value}"${o.disabled ? ' aria-disabled="true"' : ''}>${esc(o.label)}</li>`).join('')}`).join('')}</ul>
    </div>`;
};

// El de elegir a una persona: people [{ id, name }]; sin nadie, deshabilitado con `empty`
export const peoplePicker = ({ id, name, people, empty }) => pickerHtml({ id, name, disabled: !people.length,
  placeholder: people.length ? 'Elige a quién' : empty, groups: [{ options: people.map((p) => ({ value: p.id, label: p.name })) }] });

export const openPicker = (root) => root.querySelector('[data-pick] [aria-expanded="true"]');
export const closePickers = (root) => root.querySelectorAll('[data-pick] [aria-expanded="true"]').forEach((b) => { b.setAttribute('aria-expanded', 'false'); b.nextElementSibling.hidden = true; });

// Un clic en la página: → true si era del selector y ya está atendido. Al
// elegir, el campo oculto toma el valor y lanza «input», como si se tecleara:
// cada vista y cada formulario reaccionan en su «input».
export const pickClick = (root, t) => {
  const btn = t.closest('[data-pick-btn]');
  if (btn) {
    const open = btn.getAttribute('aria-expanded') === 'true';
    closePickers(root);
    if (!open) { btn.setAttribute('aria-expanded', 'true'); btn.nextElementSibling.hidden = false; }
    return true;
  }
  const opt = t.closest('[data-pick-opt]');
  if (!opt) { closePickers(root); return false; }
  if (opt.getAttribute('aria-disabled') === 'true') return true;
  const pick = opt.closest('[data-pick]');
  const field = pick.querySelector('input[type=hidden]');
  field.value = opt.dataset.pickOpt;
  pick.querySelectorAll('[data-pick-opt]').forEach((o) => o.setAttribute('aria-selected', String(o === opt)));
  const label = pick.querySelector('[data-pick-label]');
  label.textContent = opt.textContent;
  label.classList.remove('pick-ph');
  closePickers(root);
  field.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
};
