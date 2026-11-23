// Las issues de una persona: la foto de la fuente (de momento, el CSV) más
// quién ha cogido qué, que lleva la base de la instancia (platform_*). Todo
// con el JWT de quien actúa; «coger» es un simulacro: se da por hecho que
// SIGLO la asigna en Remedy.
import { queue } from './queue.js';
import { loadRules, ruleById } from './rules.js';
import { deskOf, brief, canTake, MAX_DOING } from './desk.js';
import { today, history, dayKey } from './stats.js';
import { cleanFields, cleanFile, MAX_IMAGES, fail } from './draft.js';
import { resolveDraft, checkResolve, OPEN } from './resolve.js';
import { escalateCheck, checkEscalate, cleanEscalate, ESCALABLE } from './escalate.js';
import { timeline } from './timeline.js';
import { editProblem } from './notes.js';
import { forGroups, originArg } from './origin.js';
import { teamEscalations } from './escalations.js';
import { searchIssues } from './search.js';

const WEEKS = 12;

// jira: el vigía de Jira (jira-watch.js), con lo último que sabe de los escalados;
// jiraUrl(): la base de Jira de la persona, para enlazar cada ticket.
// now: el reloj (inyectable en pruebas). «Ahora» es ahora: la foto de Remedy
// solo dice de cuándo son los datos (taken); lo medido en SIA se mide a día de hoy.
const NO_JIRA = { states: () => new Map(), checkedAt: () => null, check: async () => {} };

export const createIssuesService = ({ source, platform, drafts, jira = NO_JIRA, jiraUrl = () => '', now = () => new Date() }) => {
  // la foto, lo cogido en SIA y las reglas de priorización
  const snapshot = async (jwt) => {
    const { taken, issues } = source.load();
    const [claims, rules] = await Promise.all([platform.rpc(jwt, 'platform_issue_claims'), loadRules(platform, jwt)]);
    return { taken, issues, claims, claimed: new Set(claims.map((c) => c.issue_id)), rules, now: now() };
  };
  // la cola de una regla; con groups (los proyectos de alguien), solo la de sus orígenes
  const queueOf = ({ issues, claimed, rules, now }, ruleId, groups) => queue(forGroups(issues, groups), claimed, now, ruleById(rules, ruleId).criteria);
  // el histórico de una issue: sus movimientos y notas, unidos por orden
  const timelineOf = async (jwt, id) => {
    const [events, notes] = await Promise.all([platform.rpc(jwt, 'platform_issue_events', { p_issue: id }), platform.rpc(jwt, 'platform_issue_notes', { p_issue: id })]);
    return timeline(events, notes);
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
  const mine = async ({ user, accessToken: jwt }, id, verb) => {
    const { issues, claims } = await snapshot(jwt);
    const issue = issues.find((i) => i.id === id);
    if (!issue) throw fail('Esa incidencia ya no está en la foto.', 404);
    if (!deskOf(issues, user, claims).some((i) => i.id === id)) throw fail(`Solo puedes ${verb} tus incidencias.`, 403);
    return issue;
  };
  const resolvable = async (who, id) => {
    const issue = await mine(who, id, 'resolver');
    if (!OPEN.has(issue.status)) throw fail('Esta incidencia ya está resuelta o cerrada.', 409);
    return issue;
  };
  // Escalar, igual, en una que se trabaja o ya Resuelta (por la causa raíz)
  const escalable = async (who, id) => {
    const issue = await mine(who, id, 'escalar');
    if (!ESCALABLE.has(issue.status)) throw fail('Esta issue ya espera a un tercero o está cerrada.', 409);
    return issue;
  };

  return {
    // → { taken, free, next, maxDoing, canTake, desk, today, history, escalations }
    // (escalations: los del equipo con su Jira y cuándo se miró Jira, escalations.js)
    async desk({ user, accessToken: jwt }) {
      const snap = await snapshot(jwt);
      const { taken, issues, claims, now } = snap;
      const since = new Date(now.getTime() - WEEKS * 7 * 86400000).toISOString();
      const [transfers, events] = await Promise.all([platform.rpc(jwt, 'platform_my_transfers'), platform.rpc(jwt, 'platform_my_issue_events', { p_since: since })]);
      const mine = queueOf(snap, user.rule, user.groups);   // la que le toca: sin coger, de sus orígenes y en el orden de su regla
      const desk = deskOf(issues, user, claims, transfers);
      const nextIssue = mine.length ? issues.find((i) => i.id === mine[0]) : null;
      return {
        taken,
        free: mine.length,   // lo que puede coger: solo de sus orígenes
        next: nextIssue ? brief(nextIssue) : null,
        maxDoing: MAX_DOING,
        canTake: canTake(desk),
        desk: desk.map(brief),
        today: today(desk, dayKey(now)),
        history: history(events, new Map(issues.map((i) => [i.id, i])), now, WEEKS),
        escalations: { checkedAt: jira.checkedAt(), items: teamEscalations(issues, claims, jira.states(), user, jiraUrl()) },
      };
    },
    // mirar Jira ahora (Refrescar), sin esperar a la media hora → { checkedAt }
    async checkJira() {
      await jira.check();
      return { checkedAt: jira.checkedAt() };
    },
    // el equipo de Issues, sin mí, con sus proyectos (a quién se puede traspasar según el origen)
    async teammates({ user, accessToken: jwt }) {
      return (await platform.rpc(jwt, 'platform_issue_teammates')).filter((t) => t.id !== user.id);
    },
    // la base se queda con la primera libre que nadie tenga → id | null. La cola, en el orden
    // de la regla de la persona (user.rule, de su rol o personalizada).
    async next({ user, accessToken: jwt }) {
      const snap = await snapshot(jwt);
      if (!canTake(deskOf(snap.issues, user, snap.claims))) throw fail(`Ya tienes ${MAX_DOING} en curso: resuelve alguna antes de coger otra.`, 409);
      const candidates = queueOf(snap, user.rule, user.groups);   // solo lo de sus orígenes
      return (await platform.rpc(jwt, 'platform_claim_next_issue', { p_candidates: candidates.slice(0, 500) })) || null;
    },
    release: ({ accessToken: jwt }, id) => platform.rpc(jwt, 'platform_release_issue', { p_issue: id }),
    // quedarse con una que tiene otra persona (o nadie) en SIA: pasa a mi mesa; la base mira el origen
    take: ({ accessToken: jwt }, id) => platform.rpc(jwt, 'platform_take_issue', { p_issue: id, ...originArg(source.load().issues, id) }),
    // a un compañero de Issues; el motivo queda como nota del traspaso
    // con el origen de la issue: la base solo la deja pasar a quien tiene ese conocimiento
    transfer: ({ accessToken: jwt }, id, { to, comment }) =>
      platform.rpc(jwt, 'platform_transfer_issue', { p_issue: id, p_to: to, p_comment: comment, ...originArg(source.load().issues, id) }),
    // una nota (privada, interna o pública, con su etiqueta o sin ella: notes.js) → su id
    addNote: ({ accessToken: jwt }, id, { body, visibility, tag }) => platform.rpc(jwt, 'platform_add_issue_note', { p_issue: id, p_body: body, p_visibility: visibility, p_tag: tag }),
    // editar una nota propia, dentro de su plazo (notes.js) → { ok } | { error }
    async editNote({ user, accessToken: jwt }, id, noteId, body) {
      const notes = await platform.rpc(jwt, 'platform_issue_notes', { p_issue: id });
      const problem = editProblem(notes.find((n) => n.id === noteId), user.id, now());
      if (problem) return { error: problem };
      await platform.rpc(jwt, 'platform_edit_issue_note', { p_note: noteId, p_body: body });
      return { ok: true };
    },
    // su histórico en SIA: movimientos y notas, por orden (timeline.js)
    timeline: ({ accessToken: jwt }, id) => timelineOf(jwt, id),
    // → { issue (con claimedBy), sameCenter, timeline } | null si ya no está en la foto
    async get({ accessToken: jwt }, id) {
      const { issues, claims } = await snapshot(jwt);
      const issue = issues.find((i) => i.id === id);
      if (!issue) return null;
      const holder = claims.find((c) => c.issue_id === id);
      return {
        issue: { ...issue, claimedBy: holder ? { id: holder.user_id, name: holder.user_name, at: holder.claimed_at } : null },
        sameCenter: issue.center ? issues.filter((i) => i.center === issue.center && i.id !== id).map(brief) : [],
        timeline: await timelineOf(jwt, id),
      };
    },
    // buscar issues por su número, sea de quien sea (atender la llamada de un centro, search.js)
    async search({ accessToken: jwt }, q) {
      const { issues, claims } = await snapshot(jwt);
      return searchIssues(issues, claims, q);
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
    // una imagen más del borrador → { at, image: { n, name, type, size } }
    async saveDraftFile(who, id, body) {
      const file = cleanFile(body);
      await resolvable(who, id);
      const { at, n } = write((d) => {
        if ((d.get(who.user.id, id)?.images?.length ?? 0) >= MAX_IMAGES) throw fail(`Como mucho ${MAX_IMAGES} imágenes por resolución.`);
        return d.addImage(who.user.id, id, file);
      });
      return { at, image: { n, name: file.name, type: file.type, size: file.data.length } };
    },
    async dropDraftFile(who, id, n) {
      await resolvable(who, id);
      return { at: write((d) => d.dropImage(who.user.id, id, n)) };
    },
    // la imagen n, para verla al retomar el borrador → { name, type, data (base64) }
    async draftFile(who, id, n) {
      await resolvable(who, id);
      const f = quiet((d) => d.getImage(who.user.id, id, n), null);
      if (!f) throw fail('No existe.', 404);
      return { name: f.name, type: f.type, data: Buffer.from(f.data).toString('base64') };
    },
    // Abrir Escalar → { check: las notas que pide y las que faltan (escalate.js), draft: mi borrador | null }
    async startEscalate(who, id) {
      return { check: escalateCheck(await escalable(who, id)), draft: quiet((d) => d.getEscalate(who.user.id, id), null) };
    },
    // Confirmar Escalar o Unir: se comprueba otra vez y se borra el borrador. Aún no
    // sale nada hacia Remedy (falta SIGLO) → { ok, sent: false }
    async escalate(who, id, body) {
      checkEscalate(await escalable(who, id), cleanEscalate(body));
      quiet((d) => d.dropEscalate(who.user.id, id));
      return { ok: true, sent: false };
    },
    async saveEscalateDraft(who, id, body) {
      const fields = cleanEscalate(body);
      await escalable(who, id);
      return { at: write((d) => d.setEscalate(who.user.id, id, fields)) };
    },
    // el CSV de la consulta, tal cual, por trozos → { file, taken, issues }
    importCsv: (chunks, name) => source.importCsv(chunks, name),
  };
};
