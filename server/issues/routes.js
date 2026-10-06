// /api/issues (vista Issues; la exige el bridge). La base de la instancia
// lleva quién ha cogido qué; las issues, de la fuente (de momento, el CSV).
//   GET  /              → { taken, rules, free, next, desk, today, history }
//                         (next: la que tocaría ahora; desk: mis issues, en breve;
//                          history: lo medido en SIA, 12 semanas)
//   GET  /:id           → { issue, sameCenter }
//   POST /next          { rule } → { id }  (null: no queda ninguna libre)
//   POST /:id/release   → { ok }  (devolverla a la cola)
// «Coger» es un simulacro: se da por hecho que SIGLO la asigna en Remedy.
import { queue, RULES } from './queue.js';
import { deskOf, brief } from './desk.js';
import { today, history, dayKey } from './stats.js';

const WEEKS = 12;

const ISSUE_ID = /^INC\d+$/;

export const issuesRoutes = (source, auth, platform, { json, readBody }) => async (req, res, path) => {
  try {
    const ctx = await auth.context(req.headers['x-sia-auth']);
    if (!ctx) return json(res, 401, { error: 'Inicia sesión.' });
    const jwt = ctx.accessToken;
    const [id, action] = path;
    const { taken, issues } = source.load();
    const claims = await platform.rpc(jwt, 'platform_issue_claims');
    const claimed = new Set(claims.map((c) => c.issue_id));
    const now = taken ? new Date(taken) : new Date();

    if (!id && req.method === 'GET') {
      const free = queue(issues, claimed, now);
      const desk = deskOf(issues, ctx.user, claims);
      const nextIssue = free.length ? issues.find((i) => i.id === free[0]) : null;
      return json(res, 200, {
        taken,
        rules: RULES.map(({ id: rid, label }) => ({ id: rid, label })),
        free: free.length,
        next: nextIssue ? brief(nextIssue) : null,
        desk: desk.map(brief),
        today: today(desk, dayKey(now)),
        history: history(await platform.rpc(jwt, 'platform_my_issue_events', { p_since: new Date(Date.now() - WEEKS * 7 * 86400000).toISOString() }),
          new Map(issues.map((i) => [i.id, i])), new Date(), WEEKS),
      });
    }
    if (id === 'next' && !action && req.method === 'POST') {
      const { rule } = await readBody(req);
      const got = await platform.rpc(jwt, 'platform_claim_next_issue', { p_candidates: queue(issues, claimed, now, rule).slice(0, 500) });
      return json(res, 200, { id: got || null });
    }
    if (!ISSUE_ID.test(id || '')) return json(res, 404, { error: 'No existe.' });
    if (action === 'release' && req.method === 'POST') {
      await platform.rpc(jwt, 'platform_release_issue', { p_issue: id });
      return json(res, 200, { ok: true });
    }
    if (!action && req.method === 'GET') {
      const issue = issues.find((i) => i.id === id);
      if (!issue) return json(res, 404, { error: 'Esa issue ya no está en la foto.' });
      const holder = claims.find((c) => c.issue_id === id);
      return json(res, 200, {
        issue: { ...issue, claimedBy: holder ? { id: holder.user_id, name: holder.user_name, at: holder.claimed_at } : null },
        sameCenter: issue.center ? issues.filter((i) => i.center === issue.center && i.id !== id).map(brief) : [],
      });
    }
    return json(res, 404, { error: 'no encontrado' });
  } catch (e) {
    if (!e.status) return json(res, 500, { error: 'Error interno.' });
    return json(res, e.status >= 500 ? 503 : e.status, { error: e.message });
  }
};
