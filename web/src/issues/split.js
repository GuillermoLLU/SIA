// Dividir una issue que trae dos problemas (#152), desde «Otras acciones»: dominio y HTML, sin E/S
// (lo cablea issues-view.js). La ventana va a pantalla completa, como el detalle de un ticket de
// Escalar: a la izquierda la issue tal cual y a la derecha la nueva, con sus mismos datos. Solo se
// reparte lo que dice el centro: lo del segundo problema se corta de la original y se pega en la
// nueva, y las dos se pueden reescribir (y retocar su título).
// «Actualizar y generar», de momento, solo lo avisa: cuando conectemos SIGLO, actualizará la
// original en Remedy y creará la nueva.
import { esc } from '../ui/html.js';
import { STATUS_ES, SEVERITY_ES } from './format.js';
import { originOf } from './origin.js';

// Lo que la nueva hereda tal cual de la original (en las dos columnas, igual)
const fact = (label, value, cls = '') => `<div${cls ? ` class="${cls}"` : ''}><dt>${label}</dt><dd>${value}</dd></div>`;
const factsHtml = (i) => `<dl class="sp-facts">
        ${fact('Centro', `<span class="iss-code">${esc(i.center || '—')}</span>`)}
        ${fact('Criticidad', esc(SEVERITY_ES[i.priority] || i.priority || '—'), `k-sev ${esc(i.priority || '')}`)}
        ${fact('Origen', originOf(i), `k-origin${i.sisu ? ' sisu' : ''}`)}
        ${fact('Estado', esc(STATUS_ES[i.status] || i.status || '—'))}
        ${fact('Grupo', esc(i.group || '—'))}
        ${fact('Categoría', esc(i.category || '—'), 'wide')}
      </dl>`;

// Una columna: la original (keep) o la nueva (new), con su título, sus datos y lo que dice el centro.
// La nueva empieza sin descripción: un aviso en su sitio mientras está vacía (issues.css).
const column = (i, side) => {
  const keep = side === 'keep';
  return `<section class="sp-col${keep ? '' : ' new'}" aria-label="${keep ? 'La issue original' : 'La issue nueva'}">
      <h4>${keep ? 'Original' : 'Nueva'} <small>${keep ? esc(i.id) : 'INC por generar'}</small></h4>
      <input class="sp-ttl" name="${side}Title" value="${esc(i.text || '')}" aria-label="Título de la ${keep ? 'original' : 'nueva'}" autocomplete="off" />
      ${factsHtml(i)}
      <label class="sp-lbl" for="sp-${side}-desc">Lo que dice el centro</label>
      <div class="sp-desc-box">
        <textarea class="sp-desc" id="sp-${side}-desc" name="${side}Desc" placeholder=" " spellcheck="false">${keep ? esc(i.notes || '') : ''}</textarea>
        ${keep ? '' : '<p class="sp-empty" aria-hidden="true"><b>Pega aquí el segundo problema</b>Córtalo de la original y reescríbelo como haga falta</p>'}
      </div>
    </section>`;
};

export const splitForm = (i) => `<form class="iss-act-form sp" data-act-form="split" novalidate>
    <header><button type="button" class="lab-btn" data-act-cancel>Cancelar</button><h3>Dividir ${esc(i.id)} en dos</h3><span>Mismos datos · descripción repartida</span></header>
    <div class="sp-cols">
      ${column(i, 'keep')}
      ${column(i, 'new')}
    </div>
    <footer><span class="sp-hint">Selecciona en la original lo del segundo problema, córtalo y pégalo en la nueva</span><p class="iss-act-err" hidden></p><button type="submit" class="lab-btn primary" disabled>Actualizar y generar</button></footer>
  </form>`;

// ¿Se puede generar? Las dos con título y con algo de lo que dice el centro → { values } o { missing }
// (lo primero que falta, para «Falta: …»; mientras falte algo, el botón sigue apagado).
const NEEDS = [
  ['newDesc', 'lo que dice el centro en la nueva'],
  ['keepDesc', 'lo que dice el centro en la original'],
  ['keepTitle', 'el título de la original'],
  ['newTitle', 'el título de la nueva'],
];
export const readSplit = (raw) => {
  const values = {};
  for (const [name, label] of NEEDS) {
    const v = String(raw?.[name] ?? '').trim();
    if (!v) return { missing: label };
    values[name] = v;
  }
  return { values };
};

// El aviso al generar (abajo, como el resto): lo que hará cuando SIGLO esté conectado
export const splitNotice = (id) => `División de ${id} preparada. De momento no sale hacia Remedy: cuando conectemos SIGLO, actualizará la original y creará la nueva.`;
