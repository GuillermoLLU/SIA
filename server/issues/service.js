// Las issues de una persona: la foto de la fuente (de momento, el CSV) más
// quién ha cogido qué, que lleva la base de la instancia (platform_*). Todo
// con el JWT de quien actúa; «coger» es un simulacro: se da por hecho que
// SIGLO la asigna en Remedy.
import { queue, RULES } from './queue.js';
import { deskOf, brief } from './desk.js';
import { today, history, dayKey } from './stats.js';
import { cleanFields, cleanFile } from './draft.js';

const WEEKS = 12;

export const createIssuesService = ({ source, platform, drafts }) => {
  // la foto y lo cogido en SIA; `now` es la hora de la foto, no la de ahora
  const snapshot = async (jwt) => {
    const { taken, issues } = source.load();
    const claims = await platform.rpc(jwt, 'platform_issue_claims');
    return { taken, issues, claims, claimed: new Set(claims.map((c) => c.issue_id)), now: taken ? new Date(taken) : new Date() };
  };

  return {
    // → { taken, rules, free, next, desk, today, history }
    async desk({ user, accessToken: jwt }) {
      const { taken, issues, claims, claimed, now } = await snapshot(jwt);
      const free = queue(issues, claimed, now);
      const desk = deskOf(issues, user, claims);
      const nextIssue = free.length ? issues.find((i) => i.id === free[0]) : null;
      const since = new Date(now.getTime() - WEEKS * 7 * 86400000).toISOString();
      return {
        taken,
        rules: RULES.map(({ id, label }) => ({ id, label })),
        free: free.length,
        next: nextIssue ? brief(nextIssue) : null,
        desk: desk.map(brief),
        today: today(desk, dayKey(now)),
        history: history(await platform.rpc(jwt, 'platform_my_issue_events', { p_since: since }), new Map(issues.map((i) => [i.id, i])), now, WEEKS),
      };
    },
    // el equipo de Issues, sin mí
    async teammates({ user, accessToken: jwt }) {
      return (await platform.rpc(jwt, 'platform_issue_teammates')).filter((t) => t.id !== user.id);
    },
    // la base se queda con la primera libre que nadie tenga → id | null
    async next({ accessToken: jwt }, rule) {
      const { issues, claimed, now } = await snapshot(jwt);
      return (await platform.rpc(jwt, 'platform_claim_next_issue', { p_candidates: queue(issues, claimed, now, rule).slice(0, 500) })) || null;
    },
    release: ({ accessToken: jwt }, id) => platform.rpc(jwt, 'platform_release_issue', { p_issue: id }),
    // → { issue (con claimedBy), sameCenter } | null si ya no está en la foto
    async get({ accessToken: jwt }, id) {
      const { issues, claims } = await snapshot(jwt);
      const issue = issues.find((i) => i.id === id);
      if (!issue) return null;
      const holder = claims.find((c) => c.issue_id === id);
      return {
        issue: { ...issue, claimedBy: holder ? { id: holder.user_id, name: holder.user_name, at: holder.claimed_at } : null },
        sameCenter: issue.center ? issues.filter((i) => i.center === issue.center && i.id !== id).map(brief) : [],
      };
    },
    // una issue de la foto, por id (el chat de una issue)
    find: (id) => source.load().issues.find((i) => i.id === id) || null,
    // el borrador de Resolver de quien lo escribe (drafts.js), en la BBDD local
    draft: ({ user }, id) => drafts.get(user.id, id),
    saveDraft: ({ user }, id, body) => ({ at: drafts.setText(user.id, id, cleanFields(body)) }),
    saveDraftFile: ({ user }, id, body) => {
      const file = cleanFile(body);
      return { at: drafts.setFile(user.id, id, file), file: { name: file.name, type: file.type, size: file.data.length } };
    },
    dropDraftFile: ({ user }, id) => ({ at: drafts.setFile(user.id, id, null) }),
    dropDraft: ({ user }, id) => { drafts.drop(user.id, id); return { ok: true }; },
    // el CSV de la consulta, tal cual, por trozos → { file, taken, issues }
    importCsv: (chunks, name) => source.importCsv(chunks, name),
  };
};
