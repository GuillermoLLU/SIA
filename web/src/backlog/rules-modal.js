// El modal «Reglas de priorización» del Backlog: a la izquierda las reglas (la
// básica, fija, y las del equipo); a la derecha, la elegida: su nombre y sus
// criterios en orden, como chips que se suben, bajan y quitan, y un
// desplegable para añadir del catálogo (rule-editor.js). Guardar y borrar van
// a la base por el bridge; el Backlog se entera por onChange.
import { onEscape } from '../ui/dialog.js';
import { esc } from '../ui/html.js';
import { NEW_RULE, addCriterion, removeCriterion, moveCriterion, available, labelOf, draftOf } from './rule-editor.js';

export const openRulesModal = async ({ api, dialogs, toast, onChange }) => {
  let { criteria: catalog, rules } = await api.rules();
  let current = rules[0]; // la regla elegida en la lista (null: una nueva)
  let draft = null;       // su copia editable (null: la básica, que no se edita)
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

  const select = (rule) => { current = rule; draft = rule.builtin ? null : draftOf(rule); error = null; render(); };
  const startNew = () => { current = null; draft = { ...NEW_RULE }; error = null; render(); };

  const ruleItem = (r) => `<button class="bl-rule${current?.id === r.id ? ' on' : ''}" data-pick="${esc(r.id)}"><b>${esc(r.label)}</b><small>${r.criteria.length} criterio${r.criteria.length === 1 ? '' : 's'}${r.builtin ? ' · de serie' : ''}</small></button>`;
  const renderList = () => `${rules.map(ruleItem).join('')}${!current ? `<button class="bl-rule on" disabled><b>${esc(draft.name.trim() || 'Nueva regla')}</b><small>sin guardar</small></button>` : ''}<button class="bl-rule-new" data-new>+ Nueva regla</button>`;

  const chip = (id, n, total, editable) => `<li class="bl-chip"><span class="bl-chip-n">${n + 1}</span><span class="bl-chip-l">${esc(labelOf(catalog, id))}</span>${editable ? `<span class="bl-chip-acts"><button data-up="${id}" ${n === 0 ? 'disabled' : ''} aria-label="Subir" title="Subir">↑</button><button data-down="${id}" ${n === total - 1 ? 'disabled' : ''} aria-label="Bajar" title="Bajar">↓</button><button data-del="${id}" aria-label="Quitar" title="Quitar">×</button></span>` : ''}</li>`;
  const chips = (list, editable) => `<ol class="bl-chips">${list.map((id, n) => chip(id, n, list.length, editable)).join('')}</ol>`;

  const renderEdit = () => {
    if (!draft) {
      return `<h4>${esc(current.label)}</h4><p class="bl-rules-lead">La regla del equipo. Viene de serie y no se cambia; sirve de modelo para crear otras.</p>${chips(current.criteria, false)}`;
    }
    const free = available(catalog, draft);
    return `<label class="bl-rule-name">Nombre<input data-name value="${esc(draft.name)}" maxlength="60" placeholder="Por ejemplo: Urgencias SISU" spellcheck="false"></label>
      <p class="bl-rules-lead">Arriba, lo que más manda; lo de abajo desempata. A igualdad en todo, la más antigua primero.</p>
      ${draft.criteria.length ? chips(draft.criteria, true) : '<p class="bl-chips-empty">Sin criterios todavía: añade el primero.</p>'}
      ${free.length ? `<select class="bl-add" data-add><option value="">Añadir criterio…</option>${free.map((c) => `<option value="${c.id}">${esc(c.label)}</option>`).join('')}</select>` : ''}
      ${error ? `<p class="bl-rules-err">${esc(error)}</p>` : ''}
      <div class="bl-rules-foot">${draft.id ? '<button class="lab-btn" data-delete>Borrar</button>' : ''}<span class="modal-foot-spacer"></span><button class="lab-btn primary" data-save ${busy ? 'disabled' : ''}>${busy ? 'Guardando…' : 'Guardar'}</button></div>`;
  };
  const render = () => {
    overlay.querySelector('[data-list]').innerHTML = renderList();
    overlay.querySelector('[data-edit]').innerHTML = renderEdit();
  };
  const reload = async () => { ({ criteria: catalog, rules } = await api.rules()); };

  overlay.addEventListener('input', (e) => { if (e.target.matches('[data-name]')) { draft.name = e.target.value; if (!current) overlay.querySelector('[data-list]').innerHTML = renderList(); } });
  overlay.addEventListener('change', (e) => { if (e.target.matches('[data-add]') && e.target.value) { draft = addCriterion(draft, e.target.value); render(); } });
  overlay.addEventListener('click', async (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.matches('[data-close]')) return close();
    if (t.matches('[data-new]')) return startNew();
    if (t.dataset.pick) return select(rules.find((r) => r.id === t.dataset.pick));
    if (t.dataset.up) { draft = moveCriterion(draft, t.dataset.up, -1); return render(); }
    if (t.dataset.down) { draft = moveCriterion(draft, t.dataset.down, 1); return render(); }
    if (t.dataset.del) { draft = removeCriterion(draft, t.dataset.del); return render(); }
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
