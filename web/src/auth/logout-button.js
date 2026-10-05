// Botón «Cerrar sesión» de la barra lateral. Sin usuario (móvil emparejado,
// que entra por su emparejamiento) no se enseña.

export const wireLogout = (btn, { user, session, confirm }) => {
  if (!user) { btn.hidden = true; return; }
  btn.title = `Cerrar sesión (${user.name})`;
  btn.addEventListener('click', async () => {
    const lead = document.createElement('p');
    lead.className = 'dlg-lead';
    lead.textContent = `Saldrás de SIA como ${user.name}. Los chats abiertos siguen trabajando en el ordenador.`;
    if (!await confirm('Cerrar sesión', lead.outerHTML, 'Cerrar sesión')) return;
    await session.logout().catch(() => { /* sin bridge: ya se ha olvidado aquí */ });
    location.reload();
  });
};
