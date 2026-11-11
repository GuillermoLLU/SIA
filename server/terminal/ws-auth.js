// Quién entra por el socket de los chats. El token de sesión va en la URL (?a=<token>), porque un
// WebSocket del navegador no lleva cabeceras propias.
//   deps: auth.context(token) → { user, accessToken } | null, isLoopback(req)
import { canChat } from '../auth/views.js';

export const createWsAuth = ({ auth, isLoopback }) => {
  const who = (req) => auth.context(new URL(req.url, 'http://localhost').searchParams.get('a')).catch(() => null);
  return {
    // al aceptar la conexión: desde esta máquina y con sesión iniciada
    sessionOk: async (req) => isLoopback(req) && !!(await who(req)),
    // abrir o reenganchar un chat: el del Chat, con su vista; el de una issue, con la de Issues
    allowed: async (req, opts) => canChat((await who(req))?.user, opts),
  };
};
