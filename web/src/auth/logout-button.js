// Pie de Configuración: quién ha iniciado sesión y «Cerrar sesión».

export const wireLogout = (box, { user, session, confirm }) => {
  box.hidden = false;
  const who = box.querySelector('#session-who');
  who.textContent = 'Sesión de ';
  who.append(Object.assign(document.createElement('b'), { textContent: user.name }));
  box.querySelector('#logout-btn').addEventListener('click', async () => {
    const lead = document.createElement('p');
    lead.className = 'dlg-lead';
    lead.textContent = `Saldrás de SIA como ${user.name}. Los chats abiertos siguen trabajando en el ordenador.`;
    if (!await confirm('Cerrar sesión', lead.outerHTML, 'Cerrar sesión')) return;
    await session.logout().catch(() => { /* sin bridge: ya se ha olvidado aquí */ });
    location.reload();
  });
};
