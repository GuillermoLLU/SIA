// La API HTTP del bridge: el orden de las capas y a qué slice va cada ruta.
//   1. cortafuegos (solo localhost entra sin llave; el móvil, con la suya y
//      solo a lo que la vista del móvil usa)
//   2. la web compilada (para el móvil; el escritorio la carga por file://),
//      el ping, el inicio de sesión y el candado del escritorio
//   3. sesión iniciada y la vista que exige cada ruta (auth/views.js)
//   4. las rutas de cada slice, con la base de conocimiento resuelta
import fs from 'node:fs';
import path from 'node:path';
import { json, sendFile } from './shared/http.js';
import { allowed } from './auth/views.js';
import { NO_DB_MSG, noDbClient } from './base/client.js';
import { isLoopback, lanToken, openWithoutSession, remoteReach, openWhileLocked } from './remote/remote.js';

// rutas que no tocan la base de conocimiento
const DB_FREE = new Set(['version', 'lan', 'config', 'upload', 'uploads']);
// GET de un adjunto: un <img> no lleva cabeceras; es un fichero de aquí
const sessionFree = (parts, method) => (parts[1] === 'uploads' && method === 'GET') || parts[1] === 'version';

export const createRouter = ({ webDist, ping, base, auth, lock, remote, routes }) => {
  const serveWeb = (res, pathname) => {
    let rel = path.normalize(decodeURIComponent(pathname)).replace(/^(\.\.[/\\])+/, '');
    if (rel === '/' || rel === '\\' || rel === '.') rel = 'index.html';
    const fp = path.join(webDist, rel);
    if (fp.startsWith(webDist) && fs.existsSync(fp) && fs.statSync(fp).isFile()) return sendFile(res, path.extname(fp), fs.readFileSync(fp));
    const idx = path.join(webDist, 'index.html'); // la app es una sola página
    if (fs.existsSync(idx)) return sendFile(res, '.html', fs.readFileSync(idx));
    return json(res, 404, { error: 'web no compilada' });
  };

  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-SIA-LAN, X-SIA-Auth');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

    const url = new URL(req.url, 'http://localhost');
    const parts = url.pathname.split('/').filter(Boolean);
    const local = isLoopback(req);

    if (!local) {
      const token = lanToken(req, url);
      const sess = remote.session(token);
      if (!sess && !openWithoutSession(parts, remote.active())) return json(res, 403, { error: 'acceso no autorizado' });
      if (sess && parts[0] === 'api') {
        remote.touch(token);
        if (!remoteReach(parts)) return json(res, 403, { error: 'no disponible en remoto' });
        if (sess.locked && !openWhileLocked(parts)) return json(res, 423, { error: 'sesión bloqueada', locked: true });
      }
    }

    try {
      if (parts[0] !== 'api') return serveWeb(res, url.pathname);
      if (parts[1] === 'ping') return json(res, 200, ping(remote.session(lanToken(req, url))));
      if (parts[1] === 'auth') return routes.auth(req, res, parts[2]);
      if (parts[1] === 'lock') {
        if (!local) return json(res, 403, { error: 'no disponible en remoto' });
        return routes.lock(req, res, parts[2]);
      }
      // con el candado echado, esta máquina no ve nada más (el móvil va por su
      // propio candado, en el cortafuegos)
      if (lock.locked() && local) return json(res, 423, { error: 'pantalla bloqueada', locked: true });

      // desde esta máquina, toda la API exige sesión (el móvil entra con su llave)
      let who = null;
      if (local && !sessionFree(parts, req.method)) {
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
      if (parts[1] === 'issues') return routes.issues(req, res, rest, who);
      if (parts[1] === 'metrics') return routes.metrics(req, res, rest, url.searchParams);
      if (parts[1] === 'lan') return routes.lan(req, res, url, rest);
      if (parts[1] === 'config') return routes.config(req, res);
      if (parts[1] === 'upload' || parts[1] === 'uploads') return routes.uploads(req, res, parts.slice(1));

      // lo demás necesita la base de conocimiento y lo que abre en ella la
      // clave de poder de quien ha iniciado sesión
      const kb = base.current();
      if (!kb && !DB_FREE.has(parts[1])) return json(res, 503, { error: NO_DB_MSG, noDb: true });
      const ctx = { db: kb ? base.clientFor(kb) : noDbClient, base: kb, perms: await base.permsFor(kb) };
      if (parts[1] === 'version') return routes.updates(req, res, ctx.db);
      if (parts[1] === 'admin') return routes.projects(req, res, rest, url.searchParams, ctx);
      // los proyectos que ve la persona (selector de fuentes), siempre frescos
      if (parts[1] === 'access' && parts[2] === 'projects' && req.method === 'GET') return json(res, 200, await base.accessibleProjects(kb));
      if (parts[1] === 'links') return routes.links(req, res, rest, { ...ctx, projects: await base.accessibleProjects(kb) });
      if (['skills', 'drafts', 'groups'].includes(parts[1])) return routes.skills(req, res, parts.slice(1), ctx);
      return json(res, 404, { error: 'no encontrado' });
    } catch (err) {
      return json(res, 500, { error: err.message });
    }
  };
};
