// La API HTTP del bridge: el orden de las capas y a qué slice va cada ruta.
//   1. cortafuegos: solo atiende a esta máquina
//   2. el ping, el inicio de sesión y el candado
//   3. sesión iniciada y la vista que exige cada ruta (auth/views.js)
//   4. las rutas de cada slice, con la base de conocimiento resuelta
import { json, isLoopback } from './shared/http.js';
import { allowed } from './auth/views.js';
import { NO_DB_MSG, noDbClient } from './base/client.js';

// rutas que no tocan la base de conocimiento
const DB_FREE = new Set(['version', 'config', 'providers', 'upload', 'uploads']);
// GET de un adjunto: un <img> no lleva cabeceras; es un fichero de aquí
const sessionFree = (parts, method) => (parts[1] === 'uploads' && method === 'GET') || parts[1] === 'version';

// ensureBase(token): sin la base de conocimiento cargada (p. ej. tras reiniciar el bridge con la web
// abierta), cargar la de quien llama antes de seguir; si no, la web la daría por perdida.
export const createRouter = ({ ping, base, auth, lock, routes, ensureBase = async () => {} }) => {
  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-SIA-Auth');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    const url = new URL(req.url, 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);
    if (!isLoopback(req)) return json(res, 403, { error: 'acceso no autorizado' });

    try {
      if (parts[0] !== 'api') return json(res, 404, { error: 'no encontrado' });
      if (parts[1] === 'ping') return json(res, 200, ping());
      if (parts[1] === 'auth') return routes.auth(req, res, parts[2]);
      if (parts[1] === 'lock') return routes.lock(req, res, parts[2]);
      // con el candado echado, no se ve nada más
      if (lock.locked()) return json(res, 423, { error: 'pantalla bloqueada', locked: true });

      // toda la API exige sesión
      let who = null;
      if (!sessionFree(parts, req.method)) {
        const token = req.headers['x-sia-auth'];
        try { who = await auth.context(token); }
        catch (e) { return json(res, 503, { error: e.message }); }
        if (!who) return json(res, 401, { error: 'Inicia sesión.', auth: true });
        who = { ...who, token }; // el token local, para quien tenga que refrescar su propio perfil
        // contraseña puesta por un admin: nada más hasta que elija la suya
        if (who.user.must_change_password) return json(res, 401, { error: 'Elige tu contraseña para seguir.', auth: true });
      }
      // cada vista solo para quien la tiene, aunque una clave de poder lo abriera
      if (!allowed(who?.user, parts, req.method)) return json(res, 403, { error: 'No tienes acceso a esto.' });

      const rest = parts.slice(2);
      if (parts[1] === 'users') return routes.users(req, res, rest, who);
      if (parts[1] === 'knowledge') return routes.knowledge(req, res, rest, who);
      if (parts[1] === 'issues') return routes.issues(req, res, rest, who, url.searchParams);
      if (parts[1] === 'backlog') return routes.backlog(req, res, rest, who, url.searchParams);
      if (parts[1] === 'metrics') return routes.metrics(req, res, rest, who, url.searchParams);
      if (parts[1] === 'config') return routes.config(req, res);
      if (parts[1] === 'providers') return routes.providers(req, res, rest); // la cuenta de Copilot (providers/)
      if (parts[1] === 'upload' || parts[1] === 'uploads') return routes.uploads(req, res, parts.slice(1));

      // lo demás necesita la base de conocimiento y lo que abre en ella la
      // clave de poder de quien ha iniciado sesión
      if (!base.current() && who) await ensureBase(who.token);
      const kb = base.current();
      if (!kb && !DB_FREE.has(parts[1])) return json(res, 503, { error: NO_DB_MSG, noDb: true });
      const ctx = { db: kb ? base.clientFor(kb) : noDbClient, base: kb, perms: await base.permsFor(kb) };
      if (parts[1] === 'version') return routes.updates(req, res, ctx.db);
      if (parts[1] === 'admin') return routes.projects(req, res, rest, ctx);
      // los proyectos que ve la persona (el conocimiento con que abre un chat), siempre frescos
      if (parts[1] === 'access' && parts[2] === 'projects' && req.method === 'GET') return json(res, 200, await base.accessibleProjects(kb));
      if (parts[1] === 'links') return routes.links(req, res, rest, { ...ctx, projects: await base.accessibleProjects(kb) });
      if (['skills', 'drafts', 'groups'].includes(parts[1])) return routes.skills(req, res, parts.slice(1), ctx);
      return json(res, 404, { error: 'no encontrado' });
    } catch (err) {
      return json(res, 500, { error: err.message });
    }
  };
};
