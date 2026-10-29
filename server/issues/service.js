// Las issues de una persona: la foto de la fuente (de momento, el CSV) más
// quién ha cogido qué, que lleva la base de la instancia (platform_*). Todo
// con el JWT de quien actúa; «coger» es un simulacro: se da por hecho que
// SIGLO la asigna en Remedy.
import { queue, RULES } from './queue.js';
import { deskOf, brief } from './desk.js';
import { today, history, dayKey } from './stats.js';
import { timeline } from './timeline.js';

const WEEKS = 12;

export const createIssuesService = ({ source, platform }) => {
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
    // a un compañero de Issues; el motivo queda como nota del traspaso
    transfer: ({ accessToken: jwt }, id, { to, comment }) => platform.rpc(jwt, 'platform_transfer_issue', { p_issue: id, p_to: to, p_comment: comment }),
    // una nota interna del equipo → su id
    addNote: ({ accessToken: jwt }, id, body) => platform.rpc(jwt, 'platform_add_issue_note', { p_issue: id, p_body: body }),
    // su recorrido en SIA: movimientos y notas, por orden (timeline.js)
    async timeline({ accessToken: jwt }, id) {
      const [events, notes] = await Promise.all([platform.rpc(jwt, 'platform_issue_events', { p_issue: id }), platform.rpc(jwt, 'platform_issue_notes', { p_issue: id })]);
      return timeline(events, notes);
    },
    // → { issue (con claimedBy), sameCenter, timeline } | null si ya no está en la foto
    async get(who, id) {
      const { issues, claims } = await snapshot(who.accessToken);
      const issue = issues.find((i) => i.id === id);
      if (!issue) return null;
      const holder = claims.find((c) => c.issue_id === id);
      return {
        issue: { ...issue, claimedBy: holder ? { id: holder.user_id, name: holder.user_name, at: holder.claimed_at } : null },
        sameCenter: issue.center ? issues.filter((i) => i.center === issue.center && i.id !== id).map(brief) : [],
        timeline: await this.timeline(who, id),
      };
    },
    // una issue de la foto, por id (el chat de una issue)
    find: (id) => source.load().issues.find((i) => i.id === id) || null,
    // el CSV de la consulta, tal cual, por trozos → { file, taken, issues }
    importCsv: (chunks, name) => source.importCsv(chunks, name),
  };
};
