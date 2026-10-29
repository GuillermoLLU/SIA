// El modal «Reglas de priorización» del Backlog: a la izquierda las reglas (la
// básica, de serie, y las del equipo); a la derecha, la elegida: su nombre y dos
// columnas de chips, el orden de la regla y los criterios disponibles. Un chip
// pasa de una columna a la otra al pulsarlo o arrastrarlo, y dentro de la
// regla se arrastra al puesto que se quiera (rule-editor.js). Guardar y borrar
// van a la base por el bridge; el Backlog se entera por onChange.
import { onEscape } from '../ui/dialog.js';
import { esc } from '../ui/html.js';
import { NEW_RULE, addCriterion, removeCriterion, placeCriterion, available, labelOf, draftOf } from './rule-editor.js';

export const openRulesModal = async ({ api, dialogs, toast, onChange }) => {
  let { criteria: catalog, rules } = await api.rules();
  let current = rules[0]; // la regla elegida en la lista (null: una nueva)
  let draft = draftOf(current); // su copia editable
  let error = null, busy = false;

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay bl-rules-overlay';
  overlay.innerHTML = `<div class="modal bl-rules-modal" role="dialog" aria-modal="true" aria-labelledby="bl-rules-title">
      <div class="modal-head"><span class="modal-title" id="bl-rules-title">Reglas de priorización</span><button class="modal-close" data-close aria-label="Cerrar">×</button></div>
      <div class="bl-rules-body"><aside class="bl-rules-list" data-list></aside><section class="bl-rules-edit" data-edit></section></div>
    </div>`;
  document.body.appendChild(overlay);
  const close = () => { offEscape(); overlay.remove(); };
  const offEscape = onEscape(close);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });

  const select = (rule) => { current = rule; draft = draftOf(rule); error = null; render(); };
  const startNew = () => { current = null; draft = { ...NEW_RULE }; error = null; render(); };

  const ruleItem = (r) => `<button class="bl-rule${current?.id === r.id ? ' on' : ''}" data-pick="${esc(r.id)}"><b>${esc(r.label)}</b><small>${r.criteria.length} criterio${r.criteria.length === 1 ? '' : 's'}${r.builtin ? ' · de serie' : ''}</small></button>`;
  const renderList = () => `${rules.map(ruleItem).join('')}${!current ? `<button class="bl-rule on" disabled><b>${esc(draft.name.trim() || 'Nueva regla')}</b><small>sin guardar</small></button>` : ''}<button class="bl-rule-new" data-new>+ Nueva regla</button>`;

  // un chip: en la regla va numerado; editable, se arrastra y al pulsarlo pasa al otro lado
  const chip = (id, { n = null, editable }) => `<li class="bl-chip${editable ? ' act' : ''}" data-chip="${id}" ${editable ? 'draggable="true" role="button" tabindex="0"' : ''} title="${editable ? (n === null ? 'Pulsa para añadirlo a la regla' : 'Pulsa para quitarlo; arrastra para recolocarlo') : ''}">${n === null ? '' : `<span class="bl-chip-n">${n + 1}</span>`}<span class="bl-chip-l">${esc(labelOf(catalog, id))}</span></li>`;
  const chosen = (list, editable) => `<ol class="bl-chips" data-chosen>${list.map((id, n) => chip(id, { n, editable })).join('')}${editable && !list.length ? '<li class="bl-chips-empty">Pulsa o arrastra aquí los criterios, el que más manda arriba.</li>' : ''}</ol>`;

  const renderEdit = () => {
    const free = available(catalog, draft);
    return `<label class="bl-rule-name">Nombre<input data-name value="${esc(draft.name)}" maxlength="60" placeholder="Por ejemplo: Urgencias SISU" spellcheck="false"></label>
      <div class="bl-cols">
        <div class="bl-col" data-col="chosen"><h5>Orden de la regla</h5><p class="bl-rules-lead">Arriba, lo que más manda; lo de abajo desempata. A igualdad, la más antigua primero.</p>${chosen(draft.criteria, true)}</div>
        <div class="bl-col" data-col="free"><h5>Criterios disponibles</h5><p class="bl-rules-lead">Pulsa uno o arrástralo a la regla.</p><ul class="bl-chips" data-free>${free.map((c) => chip(c.id, { editable: true })).join('')}${free.length ? '' : '<li class="bl-chips-empty">Están todos en la regla.</li>'}</ul></div>
      </div>
      ${error ? `<p class="bl-rules-err">${esc(error)}</p>` : ''}
      <div class="bl-rules-foot">${draft.id && !current?.builtin ? '<button class="lab-btn" data-delete>Borrar</button>' : ''}${current?.builtin ? '<span class="bl-rules-lead">La regla del equipo, de serie: se ajusta, no se borra.</span>' : ''}<span class="modal-foot-spacer"></span><button class="lab-btn primary" data-save ${busy ? 'disabled' : ''}>${busy ? 'Guardando…' : 'Guardar'}</button></div>`;
  };
  const render = () => {
    overlay.querySelector('[data-list]').innerHTML = renderList();
    overlay.querySelector('[data-edit]').innerHTML = renderEdit();
  };
  const reload = async () => { ({ criteria: catalog, rules } = await api.rules()); };

  overlay.addEventListener('input', (e) => { if (e.target.matches('[data-name]')) { draft.name = e.target.value; if (!current) overlay.querySelector('[data-list]').innerHTML = renderList(); } });
  // pulsar un chip: de la regla al catálogo o al revés (también con Enter o espacio)
  const toggleChip = (el) => {
    const id = el.dataset.chip;
    draft = el.closest('[data-chosen]') ? removeCriterion(draft, id) : addCriterion(draft, id);
    render();
  };
  overlay.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.bl-chip.act')) { e.preventDefault(); toggleChip(e.target); }
  });

  // arrastrar: a la regla (al puesto donde se suelte), dentro de ella, o fuera (al catálogo)
  let dragging = null;
  const chosenIndexAt = (list, y) => {
    const chips = [...list.querySelectorAll('.bl-chip[data-chip]')].filter((c) => c.dataset.chip !== dragging);
    const after = chips.findIndex((c) => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; });
    return after < 0 ? chips.length : after;
  };
  const clearMarks = () => overlay.querySelectorAll('.bl-drop-line, .bl-col.over').forEach((el) => (el.classList.contains('bl-col') ? el.classList.remove('over') : el.remove()));
  overlay.addEventListener('dragstart', (e) => {
    const el = e.target.closest('.bl-chip.act');
    if (!el || !draft) return;
    dragging = el.dataset.chip;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragging);
    requestAnimationFrame(() => el.classList.add('dragging'));
  });
  overlay.addEventListener('dragend', () => { dragging = null; clearMarks(); overlay.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging')); });
  overlay.addEventListener('dragover', (e) => {
    const col = e.target.closest('[data-col]');
    if (!col || !dragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearMarks();
    col.classList.add('over');
    if (col.dataset.col !== 'chosen') return;
    const list = col.querySelector('[data-chosen]');
    const chips = [...list.querySelectorAll('.bl-chip[data-chip]')].filter((c) => c.dataset.chip !== dragging);
    const at = chosenIndexAt(list, e.clientY);
    const line = document.createElement('li');
    line.className = 'bl-drop-line';
    if (at < chips.length) chips[at].before(line); else list.querySelector('.bl-chips-empty')?.remove(), list.appendChild(line);
  });
  overlay.addEventListener('drop', (e) => {
    const col = e.target.closest('[data-col]');
    if (!col || !dragging) return;
    e.preventDefault();
    draft = col.dataset.col === 'chosen' ? placeCriterion(draft, dragging, chosenIndexAt(col.querySelector('[data-chosen]'), e.clientY)) : removeCriterion(draft, dragging);
    dragging = null;
    render();
  });

  overlay.addEventListener('click', async (e) => {
    const chipEl = e.target.closest('.bl-chip.act');
    if (chipEl && draft) return toggleChip(chipEl);
    const t = e.target.closest('button');
    if (!t) return;
    if (t.matches('[data-close]')) return close();
    if (t.matches('[data-new]')) return startNew();
    if (t.dataset.pick) return select(rules.find((r) => r.id === t.dataset.pick));
    if (t.matches('[data-save]')) {
      busy = true; error = null; render();
      try {
        const { id } = await api.saveRule(draft.id, { name: draft.name, criteria: draft.criteria });
        await reload();
        onChange?.();
        toast?.(draft.id ? 'Regla guardada.' : 'Regla creada.');
        busy = false;
        select(rules.find((r) => r.id === id));
      } catch (err) { busy = false; error = err.message; render(); }
    }
    if (t.matches('[data-delete]')) {
      const ok = await dialogs.confirm(`¿Borrar la regla «${draft.name}»?`, 'Quien la tuviera elegida pasará a la regla básica.', 'Borrar');
      if (!ok) return;
      try { await api.deleteRule(draft.id); await reload(); onChange?.(); toast?.('Regla borrada.'); select(rules[0]); }
      catch (err) { error = err.message; render(); }
    }
  });

  render();
  overlay.querySelector('[data-new]')?.focus();
};
