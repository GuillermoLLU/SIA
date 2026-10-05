// Configuración → Conocimiento para quien no administra: solo lectura. Sus
// bases y grupos los asigna un administrador; aquí no se añaden bases ni se
// generan invitaciones. El bridge solo le manda nombres (sin tokens ni claves).
import './knowledge.css';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export const renderAssignedView = (el, bases) => {
  el.innerHTML = `<div class="kn-assigned settings-section">
    <h3>Tu conocimiento</h3>
    <p class="settings-hint">Lo asigna un administrador de SIA. Si necesitas acceso a otra base o a otro grupo, pídeselo.</p>
    ${bases.length ? `<ul class="kn-list">${bases.map((b) => `<li>
        <span class="kn-main"><strong>${esc(b.name)}</strong><span>${b.groups.length ? b.groups.map(esc).join(' · ') : 'sin grupos'}</span></span>
      </li>`).join('')}</ul>` : '<p class="kn-empty">Aún no tienes conocimiento asignado: tus chats funcionan, pero sin la base del equipo.</p>'}
  </div>`;
};
