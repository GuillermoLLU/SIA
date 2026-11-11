// Piezas de HTML de Equipo que comparten la ficha, el alta y el editor de roles (sin estado).
import { VIEWS } from './views.js';

// Las cajas de vistas (la ficha, el alta y el editor de roles): las que se tienen, encendidas; attr, el data-* de cada caja
export const viewBoxes = (views, attr, disabled = false) => VIEWS.map((v) => { const on = views.includes(v.id); return `<button type="button" class="pp-box ${on ? 'on' : 'off'}" ${attr}="${v.id}" aria-pressed="${on}"${disabled ? ' disabled' : ''}><span class="b-ico">${v.icon}</span><span class="b-name">${v.label}</span></button>`; }).join('');
// Las reglas de priorización, como opciones del selector (ui/picker.js)
export const ruleOptions = (rules) => [{ options: rules.map((r) => ({ value: r.id, label: r.label })) }];
