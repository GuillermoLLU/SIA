// El modelo y el esfuerzo de un chat (los que ofrece su cuenta de Copilot:
// model-names.js): el pie de la caja de escribir (conversation/view.js) enseña
// con cuál va y, al pulsar uno de sus chips, aquí se abre el panel para
// cambiarlo, encima del chip. Cada elección se le dice al chat como un comando
// («/model gpt-6-sol», «/effort high»), que el bridge aplica en caliente sin
// gastar un turno (server/chats/copilot-session.js).
//
// deps: host (el panel del chat, position: relative) · getMeta() → { model,
//   effort, models, modelVia } · onCommand(text) (mandarlo al chat)
import { modelLabelIn, effortsIn, modelGroups } from './model-names.js';

const GAP_PX = 6; // entre el chip y el panel

export const createModelMenu = ({ host, getMeta, onCommand }) => {
  const panel = document.createElement('div');
  panel.className = 'cv-menu';
  panel.hidden = true;
  host.appendChild(panel);
  let open = null; // 'model' | 'effort' | null
  let anchor = null; // el chip desde el que se abrió
  const close = () => {
    open = null;
    panel.hidden = true;
    anchor?.classList.remove('active');
    anchor = null;
  };

  const choice = (into, { label, hint, on, onClick }) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `cv-menu-choice${on ? ' on' : ''}`;
    b.setAttribute('aria-pressed', String(!!on));
    b.innerHTML = `<i></i><span class="cv-menu-name"></span>${hint ? '<small></small>' : ''}`;
    b.querySelector('.cv-menu-name').textContent = label;
    if (hint) b.querySelector('small').textContent = hint;
    b.addEventListener('click', onClick);
    into.appendChild(b);
  };

  const paintPanel = () => {
    const { model, effort, models } = getMeta();
    panel.innerHTML = '';
    const head = document.createElement('div');
    head.className = 'cv-menu-head';
    head.innerHTML = '<b></b><small></small>';
    head.querySelector('b').textContent = open === 'model' ? 'Modelo del chat' : 'Esfuerzo al pensar';
    head.querySelector('small').textContent = open === 'model' ? modelLabelIn(models, model) : (effort || 'de serie');
    panel.appendChild(head);
    const section = (label) => {
      const sec = document.createElement('div');
      sec.className = 'cv-menu-section';
      if (label) { const h = document.createElement('div'); h.className = 'cv-menu-group'; h.textContent = label; sec.appendChild(h); }
      panel.appendChild(sec);
      return sec;
    };
    if (open === 'model') {
      // por proveedor (GitHub Copilot, el de una empresa…) cuando hay más de uno
      for (const g of modelGroups(models)) {
        const sec = section(g.label);
        for (const m of g.models) choice(sec, { label: m.label, hint: m.hint, on: m.id === model, onClick: () => { onCommand(`/model ${m.id}`); close(); } });
      }
    } else {
      const sec = section('');
      for (const e of effortsIn(models, model)) choice(sec, { label: e.label, hint: e.hint, on: effort === e.id, onClick: () => { onCommand(`/effort ${e.id}`); close(); } });
    }
  };

  // encima del chip, pegado a su derecha (el panel es absoluto dentro de host)
  const place = () => {
    const box = host.getBoundingClientRect();
    const at = anchor.getBoundingClientRect();
    panel.style.bottom = `${Math.round(box.bottom - at.top + GAP_PX)}px`;
    panel.style.right = `${Math.max(8, Math.round(box.right - at.right))}px`;
  };

  // abrir (o cerrar, si ya estaba) el panel de un chip: kind 'model' | 'effort'
  const toggle = (kind, button) => {
    if (open === kind && anchor === button) return close();
    close();
    open = kind;
    anchor = button;
    paintPanel();
    button.classList.add('active');
    panel.hidden = false;
    place();
  };
  // si cambia el modelo con el panel abierto, se repinta
  const paint = () => { if (open) paintPanel(); };

  const onClickAway = (e) => { if (open && !panel.contains(e.target) && !anchor?.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === 'Escape' && open) close(); };
  document.addEventListener('click', onClickAway);
  document.addEventListener('keydown', onKey);

  return { toggle, paint, destroy: () => { close(); document.removeEventListener('click', onClickAway); document.removeEventListener('keydown', onKey); panel.remove(); } };
};
