// ⚙️ → base → Conocimiento: qué grupos usa este equipo en sus chats y, para
// quien puede, invitar a otros. Markup + cableado de la vista; el dominio de
// la invitación está en invite.js.
//
// Filas = grupos. Con permiso «admin» (el dueño lo tiene), todos los de la
// base con un interruptor: encendido = su token está puesto en esta base
// (activos arriba, el resto en gris). Sin él, los tokens que uno tiene
// (siempre activos, con × para quitarlos y una casilla para pegar otro).
// «Generar invitación» (dueño o permiso «invite») pasa la misma lista a
// casillas; al generar, la invitación ocupa el hueco del botón hasta cerrarla.
import { inviteEncode, inviteMask } from './invite.js';

const canInviteWith = (p) => !!(p?.owner || p?.invite);

export const accessMarkup = (p) => `
  <div class="field base-tokens">
    <div class="settings-row access-head">
      <label class="field-label">${p?.admin ? 'Grupos de conocimiento' : 'Acceso al conocimiento'}</label>
    </div>
    ${p?.admin ? '' : `<div class="settings-row token-paste">
      <input class="settings-input" type="text" placeholder="token de grupo…" autocomplete="off" spellcheck="false" />
      <button class="lab-btn primary" data-act="add-token">Añadir</button>
    </div>`}
    <div class="invite-bar" hidden>
      <label class="pick-all"><input type="checkbox" data-act="all" /> Todos los grupos</label>
      <span class="spacer"></span>
      <span class="pick-count"></span>
    </div>
    <ul class="token-list access-list"></ul>
    <div class="invite-actions" hidden>
      <button class="lab-btn" data-act="invite-cancel">Cancelar</button>
      <button class="lab-btn primary" data-act="invite-go" disabled>Generar invitación</button>
    </div>
    ${canInviteWith(p) ? `<div class="invite-open">
      <button class="lab-btn" data-act="invite">Generar invitación</button>
      <div class="invite-result" hidden>
        <span class="inv-title">Invitación</span>
        <code class="inv-text"></code>
        <button type="button" class="icon-btn" data-act="invite-copy" title="Copiar invitación" aria-label="Copiar invitación"></button>
        <button type="button" class="rm" data-act="invite-close" title="Cerrar">×</button>
      </div>
    </div>` : ''}
    <div class="settings-status"></div>
  </div>`;

const byActiveThenName = (x, y) => (y.on - x.on) || (x.name || '').localeCompare(y.name || '', 'es', { sensitivity: 'base' });

/* deps: api(path, opts) · esc(text) · toast(text, ms) · setStatus(el, text, cls)
   · copyWithFeedback(btn, text) · COPY_ICON · onTokensChanged(tokens): guarda
   los tokens de la base en el bridge y devuelve los que quedan. */
export const wireAccess = (card, base, p, deps) => {
  const { api, esc, toast, setStatus, copyWithFeedback, COPY_ICON, onTokensChanged } = deps;
  const $ = (sel) => card.querySelector(sel);
  const list = $('.access-list');
  const status = $('.settings-status');
  const bar = $('.invite-bar');
  const allBox = $('[data-act="all"]');
  const count = $('.pick-count');
  const actions = $('.invite-actions');
  const goBtn = $('[data-act="invite-go"]');
  const inviteBtn = $('[data-act="invite"]');
  const result = $('.invite-result');
  const copyBtn = $('[data-act="invite-copy"]');
  const pasteRow = $('.token-paste');
  const canSwitch = !!p?.admin;

  let rows = []; // [{ token, name (null = token no válido), on }]
  let inviting = false;
  const picked = new Set();
  const pickable = () => rows.filter((r) => r.name !== null);

  const saveTokens = async (tokens) => { base.tokens = await onTokensChanged(tokens); };

  // ── datos ──
  const load = async () => {
    try {
      if (canSwitch) {
        const groups = await api('/access/groups', { headers: { 'X-SIA-Base': base.id } });
        rows = groups.map((g) => ({ token: g.token, name: g.name, on: base.tokens.includes(g.token) }));
      } else {
        const info = base.tokens.length ? await api('/access/info', { method: 'POST', body: JSON.stringify({ tokens: base.tokens, base: base.id }) }) : [];
        const byToken = new Map(info.map((i) => [i.token, i]));
        rows = base.tokens.map((t) => ({ token: t, name: byToken.get(t)?.valid ? byToken.get(t).name : null, on: true }));
      }
    } catch (e) { setStatus(status, e.message, 'bad'); rows = []; }
    render();
  };

  // ── lista ──
  const render = () => {
    list.innerHTML = '';
    if (!rows.length) {
      list.innerHTML = `<li class="token-empty">${canSwitch ? 'Esta base aún no tiene grupos: créalos en Administración.' : 'Sin acceso aún: pega un token de grupo o una invitación.'}</li>`;
      return;
    }
    for (const g of [...rows].sort(byActiveThenName)) list.appendChild(row(g));
  };
  const row = (g) => {
    const li = document.createElement('li');
    const invalid = g.name === null;
    li.className = `access-row${g.on ? ' on' : ' off'}${inviting ? ' picking' : ''}${inviting && picked.has(g.token) ? ' picked' : ''}`;
    li.innerHTML = `
      ${inviting ? `<input type="checkbox" class="pick-box" ${picked.has(g.token) ? 'checked' : ''} ${invalid ? 'disabled' : ''} />` : ''}
      ${canSwitch && !inviting ? `<button type="button" class="sw" role="switch" aria-checked="${g.on}" title="${g.on ? 'Quitar de mis chats' : 'Usar en mis chats'}"><span class="knob"></span></button>` : ''}
      <span class="name">${invalid ? '<span class="bad">token no válido</span>' : esc(g.name)}</span>
      ${g.on && canSwitch && !inviting ? '<span class="state">en tus chats</span>' : ''}
      ${!canSwitch && !inviting ? '<button type="button" class="rm" title="Quitar">×</button>' : ''}`;
    li.querySelector('.sw')?.addEventListener('click', async () => {
      try {
        await saveTokens(g.on ? base.tokens.filter((t) => t !== g.token) : [...base.tokens, g.token]);
        g.on = base.tokens.includes(g.token);
        setStatus(status, '');
        render();
      } catch (e) { setStatus(status, e.message, 'bad'); }
    });
    li.querySelector('.rm')?.addEventListener('click', async () => {
      try { await saveTokens(base.tokens.filter((t) => t !== g.token)); rows = rows.filter((r) => r.token !== g.token); render(); }
      catch (e) { setStatus(status, e.message, 'bad'); }
    });
    const box = li.querySelector('.pick-box');
    box?.addEventListener('change', () => {
      box.checked ? picked.add(g.token) : picked.delete(g.token);
      li.classList.toggle('picked', box.checked);
      paintCount();
    });
    // en modo selección, la fila entera marca la casilla
    if (box) li.addEventListener('click', (e) => { if (!e.target.closest('.pick-box') && !box.disabled) { box.checked = !box.checked; box.dispatchEvent(new Event('change')); } });
    return li;
  };

  // ── invitar ──
  const paintCount = () => {
    const total = pickable().length;
    allBox.checked = total > 0 && picked.size === total;
    count.textContent = picked.size ? `${picked.size} de ${total}` : '';
    goBtn.disabled = picked.size === 0;
  };
  // el botón de arriba y la invitación generada ocupan el mismo hueco
  const showResult = (on) => { if (result) result.hidden = !on; if (inviteBtn) inviteBtn.hidden = on; };
  const setInviting = (on) => {
    inviting = on;
    picked.clear();
    bar.hidden = !on;
    actions.hidden = !on;
    pasteRow?.toggleAttribute('hidden', on);
    if (on) showResult(false);
    if (inviteBtn) inviteBtn.hidden = on; // mientras se elige, solo el de abajo
    setStatus(status, '');
    paintCount();
    render();
  };
  let inviteText = '';
  inviteBtn?.addEventListener('click', () => { if (!inviting) setInviting(true); });
  $('[data-act="invite-cancel"]').addEventListener('click', () => setInviting(false));
  allBox.addEventListener('change', () => {
    picked.clear();
    if (allBox.checked) for (const r of pickable()) picked.add(r.token);
    paintCount();
    render();
  });
  if (copyBtn) copyBtn.innerHTML = COPY_ICON;
  copyBtn?.addEventListener('click', async () => { if (await copyWithFeedback(copyBtn, inviteText)) toast('Invitación copiada', 1600); });
  $('[data-act="invite-close"]')?.addEventListener('click', () => showResult(false));
  goBtn.addEventListener('click', async () => {
    if (!picked.size || !result) return;
    const names = pickable().filter((r) => picked.has(r.token)).map((r) => r.name).sort((x, y) => x.localeCompare(y, 'es', { sensitivity: 'base' }));
    inviteText = inviteEncode({ name: base.name, url: base.url, key: base.key, tokens: [...picked] });
    setInviting(false);
    const code = result.querySelector('.inv-text');
    code.textContent = inviteMask(inviteText);
    code.title = `Abre: ${names.join(', ')}`; // los grupos que lleva, al pasar el ratón
    showResult(true);
    if (await copyWithFeedback(copyBtn, inviteText)) toast('Invitación copiada', 1600);
  });

  // ── pegar un token (sin permiso admin) ──
  const tokInput = pasteRow?.querySelector('input');
  $('[data-act="add-token"]')?.addEventListener('click', async () => {
    const t = tokInput.value.trim();
    if (!t || base.tokens.includes(t)) { tokInput.value = ''; return; }
    const [info] = await api('/access/info', { method: 'POST', body: JSON.stringify({ tokens: [t], base: base.id }) }).catch(() => [{}]);
    if (!info?.valid) return setStatus(status, 'token no reconocido en esta base', 'bad');
    try {
      await saveTokens([...base.tokens, t]);
      tokInput.value = '';
      setStatus(status, `añadido: ${info.name} — aplica a los chats que abras a partir de ahora`, 'ok');
      load();
    } catch (e) { setStatus(status, e.message, 'bad'); }
  });
  tokInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') $('[data-act="add-token"]').click(); });

  load();
};
