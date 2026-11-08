// «Priorización» (Configuración, para quien tiene Backlog): las reglas de priorización. A la
// izquierda, la lista (la básica, de serie, y las del equipo); a la derecha, la elegida: su
// nombre como título y dos columnas de criterios, el orden de la regla y los disponibles. Un
// criterio pasa de una columna a la otra al pulsarlo o arrastrarlo, y dentro de la regla se
// arrastra al puesto que se quiera (rule-editor.js). Se guarda de una vez; borrar pide
// confirmación. Guardar y borrar van a la base por el bridge.
import './rules.css';
import { esc } from '../ui/html.js';
import { NEW_RULE, addCriterion, removeCriterion, placeCriterion, available, labelOf, draftOf } from './rule-editor.js';

const sameRule = (a, b) => a.name === b.name && a.criteria.join() === b.criteria.join();

// host: el hueco de la sección · api: backlog-api.js · onChange(): las reglas han cambiado
export const mountRulesView = (host, { api, dialogs, toast, onChange }) => {
  let catalog = [], rules = [];
  let current = null;   // la regla elegida (null: una nueva)
  let draft = null;     // su copia editable
  let error = null, busy = false, loaded = false;

  const select = (rule) => { current = rule; draft = rule ? draftOf(rule) : { ...NEW_RULE }; error = null; render(); };
  const dirty = () => (current ? !sameRule(draft, draftOf(current)) : !!(draft.name.trim() || draft.criteria.length));

  const ruleItem = (r) => `<button type="button" class="pr-item${current?.id === r.id ? ' on' : ''}" data-rule="${esc(r.id)}"><b>${esc(r.label)}</b><small>${r.criteria.length} criterio${r.criteria.length === 1 ? '' : 's'}${r.builtin ? ' · de serie' : ''}</small></button>`;
  const renderList = () => `${rules.map(ruleItem).join('')}${!current ? `<button type="button" class="pr-item on" disabled><b>${esc(draft.name.trim() || 'Nueva regla')}</b><small>sin guardar</small></button>` : ''}`;

  // un criterio: en la regla va numerado; se arrastra y al pulsarlo pasa al otro lado
  const chip = (id, { n = null, editable }) => `<li class="pr-chip${editable ? ' act' : ''}" data-chip="${id}" ${editable ? 'draggable="true" role="button" tabindex="0"' : ''}>${n === null ? '' : `<span class="pr-chip-n">${n + 1}</span>`}<span class="pr-chip-l">${esc(labelOf(catalog, id))}</span></li>`;
  const chosen = (list, editable) => `<ol class="pr-chips" data-chosen>${list.map((id, n) => chip(id, { n, editable })).join('')}${editable && !list.length ? '<li class="pr-chips-empty">Arrastra aquí los criterios</li>' : ''}</ol>`;

  const renderEdit = () => {
    // la básica de código (la base aún no tiene la de serie): se enseña, no se ajusta
    if (draft.id === 'basic') {
      return `<div class="pr-head"><h3>${esc(draft.name)}</h3></div>
        <div class="pr-cols one"><section class="pr-col"><h4 class="pr-sec-h">Orden de la regla</h4>${chosen(draft.criteria, false)}</section></div>`;
    }
    const free = available(catalog, draft), changed = dirty();
    return `<div class="pr-head"><input class="pr-name" data-name value="${esc(draft.name)}" maxlength="60" placeholder="Nombre de la regla" aria-label="Nombre de la regla" spellcheck="false" autocomplete="off" /></div>
      <div class="pr-cols">
        <section class="pr-col" data-col="chosen"><h4 class="pr-sec-h">Orden de la regla</h4>${chosen(draft.criteria, true)}</section>
        <section class="pr-col" data-col="free"><h4 class="pr-sec-h">Criterios disponibles</h4><ul class="pr-chips" data-free>${free.map((c) => chip(c.id, { editable: true })).join('')}</ul></section>
      </div>
      <div class="pr-save${changed ? ' dirty' : ''}">
        ${draft.id && !current?.builtin ? '<button type="button" class="pr-del" data-delete>Borrar regla</button>' : ''}
        <span class="pr-msg">${error ? esc(error) : ''}</span>
        <button type="button" class="lab-btn" data-discard${changed ? '' : ' disabled'}>Descartar</button>
        <button type="button" class="lab-btn primary" data-save${changed && !busy ? '' : ' disabled'}>${busy ? 'Guardando…' : current ? 'Guardar cambios' : 'Crear regla'}</button>
      </div>`;
  };
  const render = () => {
    if (!loaded) return;
    host.innerHTML = `<div class="pr-layout">
        <aside class="pr-list"><div class="pr-items">${renderList()}</div><button type="button" class="pr-new" data-new>+ Nueva regla</button></aside>
        <div class="pr-edit">${renderEdit()}</div>
      </div>`;
  };
  const reload = async () => { ({ criteria: catalog, rules } = await api.rules()); loaded = true; };
  // Pedir otra regla con cambios sin guardar: se pregunta
  const leave = async () => !dirty() || dialogs.confirm('Cambios sin guardar', '<p class="dlg-lead">Si cambias de regla se pierden los cambios de esta.</p>', 'Descartar cambios');

  host.addEventListener('input', (e) => {
    if (!e.target.matches('[data-name]')) return;
    draft.name = e.target.value;
    const save = host.querySelector('.pr-save'), changed = dirty();
    save.classList.toggle('dirty', changed);
    save.querySelector('[data-save]').disabled = !changed || busy;
    save.querySelector('[data-discard]').disabled = !changed;
    if (!current) host.querySelector('.pr-items').innerHTML = renderList();
  });
  // pulsar un criterio: de la regla al catálogo o al revés (también con Enter o espacio)
  const toggleChip = (el) => {
    const id = el.dataset.chip;
    draft = el.closest('[data-chosen]') ? removeCriterion(draft, id) : addCriterion(draft, id);
    render();
  };
  host.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.pr-chip.act')) { e.preventDefault(); toggleChip(e.target); }
  });

  // arrastrar: a la regla (al puesto donde se suelte), dentro de ella, o fuera (al catálogo)
  let dragging = null;
  // en qué puesto caería (contado sin el criterio que se arrastra) y los que quedan
  const chosenIndexAt = (list, y) => {
    const chips = [...list.querySelectorAll('.pr-chip[data-chip]')].filter((c) => c.dataset.chip !== dragging);
    const after = chips.findIndex((c) => { const r = c.getBoundingClientRect(); return y < r.top + r.height / 2; });
    return { at: after < 0 ? chips.length : after, chips };
  };
  const clearMarks = () => host.querySelectorAll('.pr-drop-line, .pr-col.over').forEach((el) => (el.classList.contains('pr-col') ? el.classList.remove('over') : el.remove()));
  host.addEventListener('dragstart', (e) => {
    const el = e.target.closest('.pr-chip.act');
    if (!el) return;
    dragging = el.dataset.chip;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', dragging);
    requestAnimationFrame(() => el.classList.add('dragging'));
  });
  host.addEventListener('dragend', () => { dragging = null; clearMarks(); host.querySelectorAll('.dragging').forEach((el) => el.classList.remove('dragging')); });
  host.addEventListener('dragover', (e) => {
    const col = e.target.closest('[data-col]');
    if (!col || !dragging) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    clearMarks();
    col.classList.add('over');
    if (col.dataset.col !== 'chosen') return;
    const list = col.querySelector('[data-chosen]');
    const { at, chips } = chosenIndexAt(list, e.clientY);
    const line = document.createElement('li');
    line.className = 'pr-drop-line';
    if (at < chips.length) chips[at].before(line); else list.appendChild(line);
  });
  host.addEventListener('drop', (e) => {
    const col = e.target.closest('[data-col]');
    if (!col || !dragging) return;
    e.preventDefault();
    draft = col.dataset.col === 'chosen' ? placeCriterion(draft, dragging, chosenIndexAt(col.querySelector('[data-chosen]'), e.clientY).at) : removeCriterion(draft, dragging);
    dragging = null;
    render();
  });

  host.addEventListener('click', async (e) => {
    const chipEl = e.target.closest('.pr-chip.act');
    if (chipEl) return toggleChip(chipEl);
    const t = e.target.closest('button');
    if (!t || t.disabled) return;
    if (t.matches('[data-new]')) { if (await leave()) select(null); return; }
    if (t.dataset.rule) { if (t.dataset.rule !== current?.id && await leave()) select(rules.find((r) => r.id === t.dataset.rule)); return; }
    if (t.matches('[data-discard]')) return select(current);
    if (t.matches('[data-save]')) {
      busy = true; error = null; render();
      try {
        const { id } = await api.saveRule(draft.id, { name: draft.name, criteria: draft.criteria });
        await reload();
        onChange?.();
        toast?.(draft.id ? 'Regla guardada' : 'Regla creada');
        busy = false;
        select(rules.find((r) => r.id === id));
      } catch (err) { busy = false; error = err.message; render(); }
    }
    if (t.matches('[data-delete]')) {
      if (!await dialogs.confirm(`¿Borrar la regla «${draft.name}»?`, '<p class="dlg-lead">Quien la tenga pasará a la regla básica.</p>', 'Borrar')) return;
      try { await api.deleteRule(draft.id); await reload(); onChange?.(); toast?.('Regla borrada'); select(rules[0]); }
      catch (err) { error = err.message; render(); }
    }
  });

  return {
    // al entrar en la sección: las reglas al día (y la elegida, si sigue)
    async refresh() {
      try { await reload(); }
      catch (err) { host.innerHTML = `<p class="pr-empty">No se pudieron cargar las reglas: ${esc(err.message)}</p>`; return; }
      select(rules.find((r) => r.id === current?.id) || rules[0] || null);
    },
  };
};
