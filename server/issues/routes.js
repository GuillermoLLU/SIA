// /api/issues (vista Issues; la exige el bridge, que ya ha resuelto la sesión:
// `who` = { user, accessToken }).
//   GET  /              → { taken, rules, free, next, desk, today, history }
//                         (next: la que tocaría ahora; desk: mis issues, en breve;
//                          history: lo medido en SIA, 12 semanas)
//   GET  /:id           → { issue, sameCenter }
//   GET  /teammates     → { teammates: [{ id, name }] }  (el equipo de Issues, sin mí)
//   POST /next          { rule } → { id }  (null: no queda ninguna libre)
//   POST /:id/release   → { ok }  (devolverla a la cola)
//   GET  /:id/resolve   → { check, draft }  (abrir Resolver: lo que hay en Remedy y lo
//                         que falta, resolve.js, y mi borrador, drafts.js, o null)
//   POST /:id/resolve   { note, what, how, prevent, lang } → { ok, sent: false }
//                         (lo comprueba todo otra vez y borra el borrador)
//   PUT  /:id/draft     { note, what, how, prevent, lang } → { at }
//   DELETE /:id/draft   → { ok }  (con su adjunto)
//   PUT  /:id/draft/file { name, type, data (base64) } → { at, file: { name, type, size } }
//   DELETE /:id/draft/file → { at }
//   POST /csv?name=<fichero>  cuerpo: el CSV de la consulta, tal cual → { meta }
//                         (la foto de Issues; se queda en este ordenador, source.js)
import { failed } from '../shared/http.js';
import { isCsvName } from '../shared/csv.js';

const ISSUE_ID = /^INC\d+$/;

export const issuesRoutes = (issues, { json, readBody }) => async (req, res, [id, action, part], who, query) => {
  try {
    if (id === 'csv' && !action && req.method === 'POST') {
      const name = query.get('name') || '';
      if (!isCsvName(name)) { req.resume(); return json(res, 400, { error: 'Elige un fichero .csv.' }); }
      req.setEncoding('utf8');
      return json(res, 200, { meta: await issues.importCsv(req, name) });
    }
    if (!id && req.method === 'GET') return json(res, 200, await issues.desk(who));
    if (id === 'teammates' && !action && req.method === 'GET') return json(res, 200, { teammates: await issues.teammates(who) });
    if (id === 'next' && !action && req.method === 'POST') return json(res, 200, { id: await issues.next(who, (await readBody(req)).rule) });
    if (!ISSUE_ID.test(id || '')) return json(res, 404, { error: 'No existe.' });
    if (action === 'release' && req.method === 'POST') { await issues.release(who, id); return json(res, 200, { ok: true }); }
    if (action === 'resolve' && !part) {
      if (req.method === 'GET') return json(res, 200, await issues.startResolve(who, id));
      if (req.method === 'POST') return json(res, 200, await issues.resolve(who, id, await readBody(req)));
    }
    if (action === 'draft' && !part) {
      if (req.method === 'PUT') return json(res, 200, await issues.saveDraft(who, id, await readBody(req)));
      if (req.method === 'DELETE') return json(res, 200, issues.dropDraft(who, id));
    }
    if (action === 'draft' && part === 'file') {
      if (req.method === 'PUT') return json(res, 200, await issues.saveDraftFile(who, id, await readBody(req)));
      if (req.method === 'DELETE') return json(res, 200, await issues.dropDraftFile(who, id));
    }
    if (!action && req.method === 'GET') {
      const got = await issues.get(who, id);
      return got ? json(res, 200, got) : json(res, 404, { error: 'Esa issue ya no está en la foto.' });
    }
    return json(res, 404, { error: 'no encontrado' });
  } catch (e) {
    return failed(json, res, e);
  }
};
