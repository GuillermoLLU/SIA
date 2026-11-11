// Pie de Configuración: «Cerrar sesión».

export const wireLogout = (box, { session }) => {
  box.querySelector('#logout-btn').addEventListener('click', async () => {
    await session.logout().catch(() => { /* sin bridge: ya se ha olvidado aquí */ });
    location.reload();
  });
};
