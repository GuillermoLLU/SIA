// Proveedores IA (dominio, sin DOM): qué dice la tarjeta de Copilot según el
// estado de su cuenta (server/providers/copilot-auth.js: status) y lo gastado.

// { text, cls, badge, badgeCls, button, loggedIn }: la línea de estado, su
// color, la etiqueta y el texto del botón
export const copilotCard = (st) => {
  if (st?.loggedIn) return { text: [st.login || 'Sesión iniciada', st.via ? `por ${st.via}` : ''].filter(Boolean).join(' · '), cls: '', badge: 'Conectado', badgeCls: 'ok', button: 'Cambiar de cuenta', loggedIn: true };
  if (st?.ok) return { text: 'Copilot no tiene sesión: inicia sesión para abrir chats.', cls: '', badge: 'Sin sesión', badgeCls: 'bad', button: 'Iniciar sesión', loggedIn: false };
  return { text: st?.error || 'No se pudo comprobar.', cls: 'bad', badge: 'Sin comprobar', badgeCls: '', button: 'Iniciar sesión', loggedIn: false };
};

// lo gastado del cupo: «30 de 200 peticiones (15 %) · se renueva el 1 de diciembre»
export const usageText = (u, now = Date.now()) => {
  if (!u) return '';
  const when = u.resetsAt && u.resetsAt > now ? ` · se renueva el ${new Date(u.resetsAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}` : '';
  return `${u.used} de ${u.total} peticiones (${u.usedPercent} %)${when}`;
};
