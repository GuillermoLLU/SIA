// El backlog del equipo: lo que nadie tiene aún (sin responsable en Remedy ni
// cogida en SIA), en el orden en que la regla elegida lo iría repartiendo.
// Desde aquí se asignan issues y se gestionan las reglas de priorización. La
// prioridad de una issue es la etiqueta PRIO de Remedy: SIA no lleva una lista
// propia (pendiente: ponerla en Remedy desde aquí cuando haya acceso). Es una
// vista sobre el dominio de Issues (queue.js, rules.js, desk.js): la misma
// foto y las mismas cogidas de la base de la instancia. Coger es de Issues.
import { queue, CRITERIA } from '../issues/queue.js';
import { brief } from '../issues/desk.js';
import { loadRules, ruleById, ruleProblem } from '../issues/rules.js';

export const createBacklogService = ({ source, platform, now = () => new Date() }) => ({
  // → { taken, rule, rules, issues: [brief…] } en el orden de la regla pedida (la básica si no existe)
  async list({ accessToken: jwt }, ruleId) {
    const { taken, issues } = source.load();
    const [claims, rules] = await Promise.all([platform.rpc(jwt, 'platform_issue_claims'), loadRules(platform, jwt)]);
    const claimed = new Set(claims.map((c) => c.issue_id));
    const byId = new Map(issues.map((i) => [i.id, i]));
    const rule = ruleById(rules, ruleId);
    return { taken, rule: rule.id, rules: rules.map(({ id, label }) => ({ id, label })), issues: queue(issues, claimed, now(), rule.criteria).map((id) => brief(byId.get(id))) };
  },
  // una issue de la foto, entera → { issue, claimedBy } | null si no está en la foto
  async get({ accessToken: jwt }, id) {
    const issue = source.load().issues.find((i) => i.id === id);
    if (!issue) return null;
    const holder = (await platform.rpc(jwt, 'platform_issue_claims')).find((c) => c.issue_id === id);
    return { issue, claimedBy: holder ? { id: holder.user_id, name: holder.user_name, at: holder.claimed_at } : null };
  },
  // el equipo de Issues (a quién se puede asignar) → [{ id, name }]
  people: ({ accessToken: jwt }) => platform.rpc(jwt, 'platform_issue_teammates'),
  // asignarla a alguien del equipo: pasa a su mesa
  assign: ({ accessToken: jwt }, id, to) => platform.rpc(jwt, 'platform_assign_issue', { p_issue: id, p_to: to }),
  // el catálogo de criterios y las reglas con los suyos → { criteria: [{ id, label }], rules: [{ id, label, criteria, builtin }] }
  rules: async ({ accessToken: jwt }) => ({ criteria: CRITERIA.map(({ id, label }) => ({ id, label })), rules: await loadRules(platform, jwt) }),
  // crear (id null) o cambiar una regla → { id } | { error } (rules.js dice qué falla)
  async saveRule({ accessToken: jwt }, id, { name, criteria }) {
    const problem = ruleProblem({ name, criteria });
    if (problem) return { error: problem };
    return { id: await platform.rpc(jwt, 'platform_save_rule', { p_rule: id, p_name: name.trim(), p_criteria: criteria }) };
  },
  deleteRule: ({ accessToken: jwt }, id) => platform.rpc(jwt, 'platform_delete_rule', { p_rule: id }),
});
