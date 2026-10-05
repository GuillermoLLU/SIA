// Pestaña «Bases de conocimiento» de la vista Personas: las bases de la
// instancia, sus grupos y cuántas personas ven cada una. Añadir una base (con
// su clave de poder de Administración, que la base de la instancia guarda
// cifrada y con la que SIA lee sus grupos), cambiar esa clave y quitarla.
import { openModal, closeModal } from './modal.js';
import { BASE_ICON, esc } from './ui.js';

// El ID del proyecto, su URL o la del panel → https://<ref>.supabase.co
const projectUrl = (raw) => {
  const v = String(raw || '').trim().replace(/\/+$/, '');
  const dash = v.match(/supabase\.com\/dashboard\/project\/([a-z]+)/i);
  if (dash) return `https://${dash[1].toLowerCase()}.supabase.co`;
  return /^[a-z]{20}$/i.test(v) ? `https://${v.toLowerCase()}.supabase.co` : v.toLowerCase();
};
const POWER_HINT = 'Una clave de poder de esa base con permiso de Administración. Con ella SIA lee sus grupos para que elijas qué ve cada persona; se guarda cifrada.';

export const mountBasesTab = (el, { knowledgeApi, getBases, reload, toast }) => {
  el.innerHTML = `<div class="pp-tools"><span class="pp-note">Las bases de conocimiento de esta instancia. Sus grupos se leen solos de cada base.</span><button class="lab-btn primary" data-add>+ Añadir base</button></div>
    <div class="pp-body"><div class="pp-bgrid" data-grid></div></div>`;
  const grid = el.querySelector('[data-grid]');

  const render = () => {
    const bases = getBases();
    grid.innerHTML = bases.map((b) => `<button class="pp-bcard" data-id="${esc(b.id)}">
        <h4>${esc(b.name)}</h4><code>${esc(b.url)}</code>
        <div class="meta"><span><b>${b.groups ? b.groups.length : '–'}</b> grupo${b.groups?.length === 1 ? '' : 's'}</span><span><b>${b.people}</b> persona${b.people === 1 ? '' : 's'} la ven</span></div>
        ${b.groups ? `<div class="pp-kn">${b.groups.map((g) => `<span class="pp-tag">${esc(g.name)}</span>`).join('')}</div>`
          : `<span class="pp-tag none">${esc(b.groupsError || 'Sin clave de poder: no se leen sus grupos')}</span>`}
      </button>`).join('') + '<button class="pp-bcard add" data-add>+ Añadir base de conocimiento</button>';
  };

  const field = (label, attr, { type = 'text', placeholder = '', hint = '' } = {}) =>
    `<label class="pp-field"><span>${label}</span><input class="settings-input" ${attr} type="${type}" placeholder="${esc(placeholder)}" autocomplete="off" spellcheck="false" />${hint ? `<small>${hint}</small>` : ''}</label>`;
  const foot = (ok, cls = 'primary') => `<span class="pp-msg" data-msg></span><button class="lab-btn" data-cancel>Cancelar</button><button class="lab-btn ${cls}" data-ok>${ok}</button>`;
  const wire = (m, onOk) => {
    m.querySelector('[data-cancel]').addEventListener('click', closeModal);
    const ok = m.querySelector('[data-ok]');
    ok.addEventListener('click', async () => {
      ok.disabled = true;
      try { await onOk(); closeModal(); await reload(); }
      catch (e) { m.querySelector('[data-msg]').textContent = e.message; }
      finally { ok.disabled = false; }
    });
  };

  const addModal = () => {
    const m = openModal({ title: 'Añadir base de conocimiento', icon: BASE_ICON, lead: 'Un proyecto de Supabase con el esquema de SIA.', wide: true,
      body: field('Nombre', 'data-name', { placeholder: 'Soporte Tiendas' })
        + field('Proyecto de Supabase', 'data-url', { placeholder: 'ID del proyecto o su URL' })
        + field('Clave publishable', 'data-key', { placeholder: 'sb_publishable_…', hint: 'Project Settings → API Keys. La secret no: SIA la rechaza.' })
        + field('Clave de poder (Administración)', 'data-power', { type: 'password', hint: POWER_HINT }),
      foot: foot('Añadir base') });
    const v = (s) => m.querySelector(s).value.trim();
    wire(m, async () => {
      await knowledgeApi.addBase({ name: v('[data-name]'), url: projectUrl(v('[data-url]')), key: v('[data-key]'), powerKey: v('[data-power]') || undefined });
      toast('Base añadida');
    });
  };

  const baseModal = (b) => {
    const m = openModal({ title: b.name, icon: BASE_ICON, lead: b.url,
      body: field(b.hasPowerKey ? 'Cambiar la clave de poder' : 'Clave de poder (Administración)', 'data-power', { type: 'password', hint: POWER_HINT })
        + `<div class="pp-callout" style="margin-top:6px">Quitar la base le quita a todas las personas el acceso a ella (${b.people} la ven). El contenido de la base no se toca.
           <div style="margin-top:10px"><button class="lab-btn pp-danger" data-remove>Quitar base…</button></div></div>`,
      foot: foot('Guardar clave') });
    wire(m, async () => { await knowledgeApi.setPowerKey(b.id, m.querySelector('[data-power]').value.trim()); toast('Clave de poder guardada'); });
    m.querySelector('[data-remove]').addEventListener('click', () => {
      const c = openModal({ title: `Quitar «${b.name}»`, lead: `Dejará de estar en esta instancia y ${b.people === 1 ? 'la persona que la ve dejará' : `las ${b.people} personas que la ven dejarán`} de verla.`,
        body: `<label class="pp-field" style="margin:0"><span>Escribe su nombre para confirmar</span><input class="settings-input" data-confirm placeholder="${esc(b.name)}" autocomplete="off" /></label>`,
        foot: foot('Quitar base', 'pp-danger-solid') });
      c.querySelector('[data-cancel]').addEventListener('click', closeModal);
      const ok = c.querySelector('[data-ok]');
      ok.addEventListener('click', async () => {
        if (c.querySelector('[data-confirm]').value.trim() !== b.name) { c.querySelector('[data-msg]').textContent = 'El nombre no coincide.'; return; }
        ok.disabled = true;
        try { await knowledgeApi.removeBase(b.id); closeModal(); closeModal(); toast('Base quitada'); await reload(); }
        catch (e) { c.querySelector('[data-msg]').textContent = e.message; ok.disabled = false; }
      });
    });
  };

  el.addEventListener('click', (e) => {
    if (e.target.closest('[data-add]')) return addModal();
    const card = e.target.closest('.pp-bcard[data-id]');
    if (card) baseModal(getBases().find((b) => b.id === card.dataset.id));
  });

  return { render };
};
