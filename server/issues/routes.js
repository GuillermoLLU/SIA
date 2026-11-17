// /api/issues (vista Issues; la exige el bridge, que ya ha resuelto la sesión:
// `who` = { user, accessToken }).
//   GET  /              → { taken, free, next, maxDoing, canTake, desk, today, history, escalations }
//                         (free: lo que queda sin coger que puede llevar, de sus orígenes)
//                         (next: la que tocaría ahora; desk: mis issues, en breve;
//                          history: lo medido en SIA, 12 semanas)
//                         (escalations: { checkedAt, items }, los escalados del equipo con su Jira)
//   POST /escalations/check → { checkedAt }  (mirar los Jira ahora, sin esperar a la media hora)
//   GET  /:id           → { issue, sameCenter, timeline }
//                         (timeline: su histórico en SIA, movimientos y notas por orden)
//   GET  /:id/timeline  → { timeline }
//   GET  /teammates     → { teammates: [{ id, name, groups }] }  (el equipo de Issues, sin mí; groups: sus proyectos)
//   POST /next          → { id }  (en el orden de la regla de la persona; null: no queda ninguna libre;
//                                409 con el tope de en curso)
//   POST /:id/release   → { ok }  (devolverla a la cola)
//   GET  /:id/resolve   → { check, draft }  (abrir Resolver: lo que hay en Remedy y lo
//                         que falta, resolve.js, y mi borrador, drafts.js, o null)
//   POST /:id/resolve   { note, what, how, prevent, lang } → { ok, sent: false }
//                         (lo comprueba todo otra vez y borra el borrador)
//   PUT  /:id/draft     { note, what, how, prevent, lang } → { at }
//   PUT  /:id/draft/file { name, type, data (base64) } → { at, image: { n, name, type, size } }
//                         (una imagen más; en el texto va como [imagenN])
//   GET  /:id/draft/file/:n → { name, type, data (base64) }
//   DELETE /:id/draft/file/:n → { at }
//   POST /:id/transfer  { to, comment } → { ok }  (a un compañero; el motivo, obligatorio, queda como nota)
//   POST /:id/notes     { body } → { id }  (una nota interna del equipo)
//   PUT  /:id/notes/:nota { body } → { ok }  (editar la propia, hasta 24 h después; si no, 403)
//   POST /csv?name=<fichero>  cuerpo: el CSV de la consulta, tal cual → { meta }
//                         (la foto de Issues; se queda en este ordenador, source.js)
import { failed } from '../shared/http.js';
import { isCsvName } from '../shared/csv.js';
import { isUuid } from '../shared/ids.js';

const ISSUE_ID = /^INC\d+$/;

export const issuesRoutes = (issues, { json, readBody }) => async (req, res, [id, action, part, sub], who, query) => {
  try {
    if (id === 'csv' && !action && req.method === 'POST') {
      const name = query.get('name') || '';
      if (!isCsvName(name)) { req.resume(); return json(res, 400, { error: 'Elige un fichero .csv.' }); }
      req.setEncoding('utf8');
      return json(res, 200, { meta: await issues.importCsv(req, name) });
    }
    if (!id && req.method === 'GET') return json(res, 200, await issues.desk(who));
    if (id === 'teammates' && !action && req.method === 'GET') return json(res, 200, { teammates: await issues.teammates(who) });
    if (id === 'escalations' && action === 'check' && req.method === 'POST') return json(res, 200, await issues.checkJira());
    if (id === 'next' && !action && req.method === 'POST') return json(res, 200, { id: await issues.next(who) });
    if (!ISSUE_ID.test(id || '')) return json(res, 404, { error: 'No existe.' });
    if (action === 'release' && req.method === 'POST') { await issues.release(who, id); return json(res, 200, { ok: true }); }
    if (action === 'resolve' && !part) {
      if (req.method === 'GET') return json(res, 200, await issues.startResolve(who, id));
      if (req.method === 'POST') return json(res, 200, await issues.resolve(who, id, await readBody(req)));
    }
    if (action === 'draft' && !part) {
      if (req.method === 'PUT') return json(res, 200, await issues.saveDraft(who, id, await readBody(req)));
    }
    if (action === 'draft' && part === 'file') {
      if (!sub && req.method === 'PUT') return json(res, 200, await issues.saveDraftFile(who, id, await readBody(req)));
      const n = Number(sub);
      if (Number.isInteger(n) && n > 0) {
        if (req.method === 'GET') return json(res, 200, await issues.draftFile(who, id, n));
        if (req.method === 'DELETE') return json(res, 200, await issues.dropDraftFile(who, id, n));
      }
    }
    if (action === 'transfer' && req.method === 'POST') {
      const { to, comment } = await readBody(req);
      if (!isUuid(to)) return json(res, 400, { error: 'Elige a qué compañero traspasarla.' });
      if (typeof comment !== 'string' || !comment.trim()) return json(res, 400, { error: 'Escribe el motivo del traspaso.' });
      await issues.transfer(who, id, { to, comment: comment.trim() });
      return json(res, 200, { ok: true });
    }
    if (action === 'notes' && req.method === 'POST') {
      const { body } = await readBody(req);
      if (typeof body !== 'string' || !body.trim()) return json(res, 400, { error: 'Escribe la nota.' });
      return json(res, 200, { id: await issues.addNote(who, id, body.trim()) });
    }
    if (action === 'notes' && part && req.method === 'PUT') {
      const noteId = Number(part);
      if (!Number.isInteger(noteId) || noteId <= 0) return json(res, 404, { error: 'Esa nota no existe.' });
      const { body } = await readBody(req);
      if (typeof body !== 'string' || !body.trim()) return json(res, 400, { error: 'Escribe la nota.' });
      const r = await issues.editNote(who, id, noteId, body.trim());
      return r.error ? json(res, 403, { error: r.error }) : json(res, 200, { ok: true });
    }
    if (action === 'timeline' && req.method === 'GET') return json(res, 200, { timeline: await issues.timeline(who, id) });
    if (!action && req.method === 'GET') {
      const got = await issues.get(who, id);
      return got ? json(res, 200, got) : json(res, 404, { error: 'Esa issue ya no está en la foto.' });
    }
    return json(res, 404, { error: 'no encontrado' });
  } catch (e) {
    return failed(json, res, e);
  }
};
