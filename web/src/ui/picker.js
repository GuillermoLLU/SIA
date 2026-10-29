// Un selector propio (el desplegable nativo no se puede pintar): un campo
// oculto con el valor, un botón con lo elegido y la lista debajo, con grupos
// si hace falta. El HTML y el manejo de los clics (abrir, elegir, cerrar),
// compartidos por Issues (traspasar, escalar) y el Backlog (asignar). Los
// estilos, .pick* (style.css).
import { esc } from './html.js';

// groups: [{ label?, options: [{ value, label }] }] · name, el del campo oculto
export const pickerHtml = ({ id, name, value = '', placeholder = '', groups, disabled = false }) => {
  const chosen = groups.flatMap((g) => g.options).find((o) => o.value === value);
  return `<div class="pick" data-pick>
      <input type="hidden" name="${esc(name)}" value="${esc(value)}">
      <button type="button" id="${esc(id)}" class="pick-btn" data-pick-btn aria-haspopup="listbox" aria-expanded="false"${disabled ? ' disabled' : ''}><span data-pick-label${chosen ? '' : ' class="pick-ph"'}>${esc(chosen ? chosen.label : placeholder)}</span></button>
      <ul class="pick-list" role="listbox" hidden>${groups.map((g) => `${g.label ? `<li role="presentation" class="pick-group">${esc(g.label)}</li>` : ''}${g.options.map((o) => `<li role="option" data-pick-opt="${esc(o.value)}" aria-selected="${o.value === value}">${esc(o.label)}</li>`).join('')}`).join('')}</ul>
    </div>`;
};

// El de elegir a una persona: people [{ id, name }]; sin nadie, deshabilitado con `empty`
export const peoplePicker = ({ id, name, people, empty }) => pickerHtml({ id, name, disabled: !people.length,
  placeholder: people.length ? 'Elige a quién' : empty, groups: [{ options: people.map((p) => ({ value: p.id, label: p.name })) }] });

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
  label.classList.remove('pick-ph');
  closePickers(root);
  onPick?.(pick, opt.dataset.pickOpt);
  return true;
};
