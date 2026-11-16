// Lo rápido de la barra de arriba de Métricas (sin DOM; los clics, en metrics-view.js): vale para todas las pestañas.
//   Empresa       Indra | T-Systems: clic, mirar esa empresa; Ctrl+clic en la otra, compararlas (el otro lado), y otra
//                 vez, dejar de compararlas (data-qco)
//   Fechas        las fechas rápidas (period.js, PRESETS): clic, ese periodo; Ctrl+clic en otra, comparar el periodo de
//                 ahora con ella, y otra vez, dejar de compararlos (data-preset)
//   Comparar      el botón y su pop-up (ui.resPop): un periodo frente a otro (ui.resCmp = { a, b }: claves de
//                 cmpOptions) o el mismo periodo frente a T-Systems; comparando, su × lo quita (data-res-clear)
// Comparar periodos es del Resumen (sus KPIs y su backlog); comparar empresas, de todas las pestañas. Son excluyentes.
// m: el modelo (model.js); ui: el estado de la vista.
import { esc } from '../ui/html.js';
import { COMPANIES } from './model.js';
import { PRESETS, presetOf, rangeLabel, cmpOptions, cmpName } from './period.js';

const CTRL = 'Ctrl+clic: compararla con la elegida.';
const seg = (label, items) => `<div class="mt-seg mt-seg-sm" role="group" aria-label="${label}">${items.map(([attr, l, cls, on, tip]) => `<button class="mt-seg-b ${cls}" ${attr} aria-pressed="${on}"${tip ? ` data-tip="${esc(tip)}"` : ''}>${l}</button>`).join('')}</div>`;

// qué se compara: 'periods' (ui.resCmp, sin otro lado), 'tsys' (el otro lado es T-Systems), 'other' (otro lado) o 'none'
export const compareMode = (m, ui) => {
  const b = m.S.sides[1];
  if (b) return !b.people && b.company === 1 ? 'tsys' : 'other';
  return ui.resCmp?.a && ui.resCmp?.b ? 'periods' : 'none';
};
const company = (s) => (s && !s.people ? s.company : null);

// Indra | T-Systems: la del primer lado, marcada; la del otro lado (comparando), marcada con su color
export const companyPick = (m) => {
  const [a, b] = m.S.sides.map(company);
  return seg('Empresa', [0, 1].map((k) => [`data-qco="${k}"`, esc(COMPANIES[k]), a === k ? 'mt-on' : b === k ? 'mt-on mt-qb' : '', a === k || b === k,
    a === k ? (b == null ? 'La que se mira.' : '') : b === k ? 'Comparada con la elegida. Ctrl+clic: dejar de comparar.' : `Clic: mirar ${COMPANIES[k]}. ${CTRL}`]));
};

// las fechas rápidas: la de ahora, marcada; la comparada (Ctrl+clic), marcada con el color del otro lado
export const presetPick = (m, ui) => {
  const now = presetOf(m), vs = compareMode(m, ui) === 'periods' && ui.resCmp.a === 'cur' && ui.resCmp.b.startsWith('p:') ? ui.resCmp.b.slice(2) : null;
  return seg('Fechas rápidas', PRESETS.map(([k, l]) => [`data-preset="${k}"`, l, now === k ? 'mt-on' : vs === k ? 'mt-on mt-qb' : '', now === k || vs === k,
    vs === k ? 'Comparada con el periodo de arriba (en el Resumen). Ctrl+clic: dejar de comparar.' : now === k ? '' : `Clic: este periodo. ${CTRL.replace('la elegida', 'el periodo de ahora (en el Resumen)')}`]));
};

// «Comparar»: el botón dice qué se compara y, comparando, lleva una × que lo quita; su pop-up, las dos opciones (la
// marcada, la de ahora; sin comparar, la de periodos) y, para la de periodos, dos selectores (cmpOptions: el primero
// sin «Periodo anterior», el segundo sin «Periodo actual»). Se aplica con su botón (data-res-apply); «Cancelar» o un
// clic fuera lo cierran sin tocar nada.
// tsys: si la vista deja comparar con T-Systems (faces.js); sin él, solo un periodo frente a otro.
export const comparePop = (m, ui, tsys = true) => {
  const now = compareMode(m, ui), checked = now === 'tsys' ? 'tsys' : 'periods', names = m.NAMES();
  const canTsys = tsys && company(m.S.sides[0]) !== 1;
  const { a = 'cur', b = 'prev' } = ui.resCmp || {}, opts = cmpOptions(m);
  const select = (attr, pick, skip) => `<select ${attr} aria-label="Periodo">${opts.filter(([k]) => k !== skip).map(([k, l, r]) => `<option value="${k}" ${k === pick ? 'selected' : ''} ${r ? '' : 'disabled'}>${esc(l)}${r && !k.startsWith('m:') ? ` · ${esc(rangeLabel(m, r))}` : ''}</option>`).join('')}</select>`;
  const radio = (v, label, body = '') => `<label class="mt-res-opt"><input type="radio" name="res-mode" value="${v}" ${checked === v ? 'checked' : ''}><span>${label}</span></label>${body}`;
  const label = now === 'periods' ? `${cmpName(m, a)} vs ${cmpName(m, b)}` : now === 'none' ? '' : `${names[0]} vs ${names[1]}`;
  const pop = `<div class="mt-pop mt-res-pop" data-res-popup ${ui.resPop ? '' : 'hidden'}>
      <p class="mt-pp-title">Qué comparar</p>
      ${radio('periods', 'Un periodo frente a otro', `<div class="mt-res-sel">${select('data-res-a', a, 'prev')}<span class="mt-mut">vs</span>${select('data-res-b', b, 'cur')}</div><p class="mt-mut mt-small mt-res-hint">En el Resumen: sus KPIs y la evolución del backlog.</p>`)}
      ${canTsys ? radio('tsys', 'El mismo periodo frente a T-Systems', '<p class="mt-mut mt-small mt-res-hint">En todas las pestañas.</p>') : ''}
      <p class="mt-mut mt-small">También con Ctrl+clic en una segunda empresa o fecha rápida.</p>
      <div class="mt-res-actions"><button class="mt-btn" data-res-pop>Cancelar</button><button class="mt-btn mt-res-go" data-res-apply>Comparar</button></div>
    </div>`;
  const clear = now === 'none' ? '' : '<button class="mt-btn mt-x" data-res-clear title="Quitar la comparación" aria-label="Quitar la comparación">×</button>';
  return `<div class="mt-res-cmp"><button class="mt-btn ${now === 'none' ? '' : 'mt-on'}" data-res-pop aria-haspopup="true" aria-expanded="${!!ui.resPop}">Comparar${label ? `: <b>${esc(label)}</b>` : ''}</button>${clear}${pop}</div>`;
};

// Los clics (metrics-view.js los aplica y repinta). sides/colors: los de la vista; off(): quitar el otro lado; add(c):
// poner la empresa c en el otro lado. Devuelve true si cambia algo.
export const pickCompany = (m, ui, k, ctrl, { off, add }) => {
  const [a, b] = m.S.sides.map(company);
  if (!ctrl) { if (a === k && !m.S.sides[1]) return false; off(); m.S.sides[0] = { company: k }; return true; }
  if (b === k) { off(); return true; }                        // otra vez en la comparada: dejar de comparar
  if (a === k) return false;                                  // la que se mira: nada
  ui.resCmp = null; add(k); return true;                      // comparar con la otra (y no con otro periodo)
};
export const pickPreset = (m, ui, key, ctrl, range, { off }) => {
  if (!ctrl) { ui.resCmp = null; m.setPeriod(...range); return true; }
  const b = `p:${key}`;
  if (ui.resCmp?.a === 'cur' && ui.resCmp?.b === b) { ui.resCmp = null; return true; }   // otra vez: dejar de comparar
  if (presetOf(m) === key) return false;                      // la de ahora: nada
  off(); ui.resCmp = { a: 'cur', b }; return true;            // comparar periodos (y no empresas)
};
