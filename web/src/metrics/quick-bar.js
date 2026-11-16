// Lo rápido de la barra de arriba de Métricas (sin DOM; los clics, en metrics-view.js): vale para todas las pestañas.
//   Empresa       Indra | T-Systems: clic, mirar esa empresa; Ctrl+clic en la otra, compararlas (el otro lado), y otra
//                 vez, dejar de compararlas (data-qco)
//   Fechas        las fechas rápidas (period.js, PRESETS): clic, ese periodo; Ctrl+clic en otra, comparar el periodo de
//                 ahora con ella, y otra vez, dejar de compararlos (data-preset)
//   Comparar      el modo comparar (ui.cmpPick): lo marcado, frente a lo siguiente que se elija; un periodo frente a
//                 otro (ui.resCmp = { a, b }: claves de cmpOptions) o una empresa frente a la otra; su × lo quita
// Comparar periodos es del Resumen (sus KPIs y su backlog); comparar empresas, de todas las pestañas. Son excluyentes.
// m: el modelo (model.js); ui: el estado de la vista.
import { esc } from '../ui/html.js';
import { COMPANIES } from './model.js';
import { PRESETS, presetOf, cmpName } from './period.js';

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

// «Comparar»: el modo comparar (ui.cmpPick). Al pulsarlo, lo que está marcado (el periodo y la empresa) es el primer
// lado y lo siguiente que se elija se compara con él: otra fecha rápida o un mes del calendario (un periodo frente a
// otro) o, si la vista lo deja (tsys), la otra empresa. Es lo mismo que Ctrl+clic, sin Ctrl. El botón dice qué se
// compara o que se está eligiendo; su × lo quita o lo cancela (data-res-clear).
export const comparePop = (m, ui, tsys = true) => {
  const now = compareMode(m, ui), names = m.NAMES();
  const label = now === 'periods' ? `${cmpName(m, ui.resCmp.a)} vs ${cmpName(m, ui.resCmp.b)}` : now === 'none' ? '' : `${names[0]} vs ${names[1]}`;
  const what = `otra fecha rápida o un mes del calendario${tsys && company(m.S.sides[0]) !== 1 ? ', o la otra empresa' : ''}`;
  const tip = ui.cmpPick ? `Elige con qué comparar lo marcado: ${what}. × o Escape: cancelar.`
    : `Compara lo que tienes marcado con lo siguiente que elijas: ${what}.${now === 'none' ? '' : ' Clic: elegir otra cosa con la que comparar.'} Un periodo frente a otro se ve en el Resumen.`;
  const text = ui.cmpPick ? 'Comparar con… <small>elige</small>' : `Comparar${label ? `: <b>${esc(label)}</b>` : ''}`;
  const on = ui.cmpPick || now !== 'none';
  const clear = on ? `<button class="mt-btn mt-x" data-res-clear title="${ui.cmpPick ? 'Cancelar' : 'Quitar la comparación'}" aria-label="${ui.cmpPick ? 'Cancelar' : 'Quitar la comparación'}">×</button>` : '';
  return `<div class="mt-res-cmp"><button class="mt-btn ${on ? 'mt-on' : ''}${ui.cmpPick ? ' mt-picking' : ''}" data-res-pop aria-pressed="${!!ui.cmpPick}" data-tip="${esc(tip)}">${text}</button>${clear}</div>`;
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
