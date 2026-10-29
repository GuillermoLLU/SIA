// Las issues de una persona: la foto de la fuente (de momento, el CSV) más
// quién ha cogido qué, que lleva la base de la instancia (platform_*). Todo
// con el JWT de quien actúa; «coger» es un simulacro: se da por hecho que
// SIGLO la asigna en Remedy.
import { queue, RULES } from './queue.js';
import { deskOf, brief } from './desk.js';
import { today, history, dayKey } from './stats.js';
import { cleanFields, cleanFile, fail } from './draft.js';
import { resolveDraft, checkResolve, OPEN } from './resolve.js';

const WEEKS = 12;

export const createIssuesService = ({ source, platform, drafts }) => {
  // la foto y lo cogido en SIA; `now` es la hora de la foto, no la de ahora
  const snapshot = async (jwt) => {
    const { taken, issues } = source.load();
    const claims = await platform.rpc(jwt, 'platform_issue_claims');
    return { taken, issues, claims, claimed: new Set(claims.map((c) => c.issue_id)), now: taken ? new Date(taken) : new Date() };
  };

  // El borrador es una ayuda: si la BBDD local no se pudo abrir (drafts null) o
  // falla, Resolver sigue; leer da «sin borrador» y guardar, un 503 que la web
  // enseña en el pie.
  const store = () => {
    if (!drafts) throw fail('La BBDD local de borradores no está disponible.', 503);
    return drafts;
  };
  const write = (fn) => {
    try { return fn(store()); } catch (e) { throw e.status ? e : fail('No se ha podido guardar en la BBDD local de borradores.', 503); }
  };
  const quiet = (fn, fallback) => { try { return fn(store()); } catch { return fallback; } };

  // Resolver (y su borrador) solo sobre una issue de la foto, mía y aún abierta:
  // la web lo enseña así, pero el bridge no se fía de lo que le llegue.
  const resolvable = async ({ user, accessToken: jwt }, id) => {
    const { issues, claims } = await snapshot(jwt);
    const issue = issues.find((i) => i.id === id);
    if (!issue) throw fail('Esa issue ya no está en la foto.', 404);
    if (!deskOf(issues, user, claims).some((i) => i.id === id)) throw fail('Solo puedes resolver tus issues.', 403);
    if (!OPEN.has(issue.status)) throw fail('Esta issue ya está resuelta o cerrada.', 409);
    return issue;
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
    // Abrir Resolver → { check: lo que hay en Remedy y lo que falta (resolve.js), draft: mi borrador | null }
    async startResolve(who, id) {
      return { check: resolveDraft(await resolvable(who, id)), draft: quiet((d) => d.get(who.user.id, id), null) };
    },
    // Confirmar: se comprueba todo otra vez y, si cumple, el borrador deja de
    // hacer falta (si no se puede borrar, se queda: no impide resolver). Aún no
    // sale nada hacia Remedy (falta SIGLO) → { ok, sent: false }
    async resolve(who, id, body) {
      checkResolve(await resolvable(who, id), cleanFields(body));
      quiet((d) => d.drop(who.user.id, id));
      return { ok: true, sent: false };
    },
    // el borrador de Resolver de quien lo escribe (drafts.js), en la BBDD local
    async saveDraft(who, id, body) {
      const fields = cleanFields(body);
      await resolvable(who, id);
      return { at: write((d) => d.setText(who.user.id, id, fields)) };
    },
    async saveDraftFile(who, id, body) {
      const file = cleanFile(body);
      await resolvable(who, id);
      return { at: write((d) => d.setFile(who.user.id, id, file)), file: { name: file.name, type: file.type, size: file.data.length } };
    },
    async dropDraftFile(who, id) {
      await resolvable(who, id);
      return { at: write((d) => d.setFile(who.user.id, id, null)) };
    },
    // descartar lo mío vale siempre, aunque la issue ya no esté abierta
    dropDraft: ({ user }, id) => { write((d) => d.drop(user.id, id)); return { ok: true }; },
    // el CSV de la consulta, tal cual, por trozos → { file, taken, issues }
    importCsv: (chunks, name) => source.importCsv(chunks, name),
  };
};
