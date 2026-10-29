// El backlog del equipo: lo que nadie tiene aún (sin responsable en Remedy ni
// cogida en SIA), en el orden en que la regla elegida lo iría repartiendo;
// lo priorizado a mano cuenta como priorizado por negocio. Desde aquí se priorizan y se asignan
// issues, y se gestionan las reglas de priorización. Es una vista sobre el
// dominio de Issues (queue.js, rules.js, desk.js): la misma foto y las mismas
// cogidas de la base de la instancia. Coger es de Issues.
import { queue, withPriorities, CRITERIA } from '../issues/queue.js';
import { brief } from '../issues/desk.js';
import { loadRules, ruleById, ruleProblem } from '../issues/rules.js';

export const createBacklogService = ({ source, platform, now = () => new Date() }) => {
  const state = async (jwt) => {
    const [claims, rules, priorities] = await Promise.all([platform.rpc(jwt, 'platform_issue_claims'), loadRules(platform, jwt), platform.rpc(jwt, 'platform_issue_priorities')]);
    return { claims, rules, priorities };
  };
  // lo que la pantalla enseña de una priorización a mano: quién y cuándo
  const pinOf = (p) => ({ by: p.by_name ?? null, at: p.set_at });

  return {
    // → { taken, rule, rules, issues: [brief + pinned?] } en el orden de la regla pedida (la básica si no existe)
    async list({ accessToken: jwt }, ruleId) {
      const { taken, issues } = source.load();
      const { claims, rules, priorities } = await state(jwt);
      const claimed = new Set(claims.map((c) => c.issue_id));
      const byId = new Map(issues.map((i) => [i.id, i]));
      const rule = ruleById(rules, ruleId);
      const pins = new Map(priorities.map((p) => [p.issue_id, pinOf(p)]));
      const row = (id) => ({ ...brief(byId.get(id)), ...(pins.has(id) ? { pinned: pins.get(id) } : {}) });
      return { taken, rule: rule.id, rules: rules.map(({ id, label }) => ({ id, label })), issues: queue(withPriorities(issues, priorities), claimed, now(), rule.criteria).map(row) };
    },
    // una issue de la foto, entera → { issue, pinned, claimedBy } | null si no está en la foto
    async get({ accessToken: jwt }, id) {
      const issue = source.load().issues.find((i) => i.id === id);
      if (!issue) return null;
      const { claims, priorities } = await state(jwt);
      const holder = claims.find((c) => c.issue_id === id);
      const pin = priorities.find((p) => p.issue_id === id);
      return { issue, pinned: pin ? pinOf(pin) : null, claimedBy: holder ? { id: holder.user_id, name: holder.user_name, at: holder.claimed_at } : null };
    },
    // el equipo de Issues (a quién se puede asignar) → [{ id, name }]
    people: ({ accessToken: jwt }) => platform.rpc(jwt, 'platform_issue_teammates'),
    // priorizarla a mano: cuenta como priorizada por negocio
    prioritize: ({ accessToken: jwt }, id) => platform.rpc(jwt, 'platform_prioritize_issue', { p_issue: id }),
    unprioritize: ({ accessToken: jwt }, id) => platform.rpc(jwt, 'platform_unprioritize_issue', { p_issue: id }),
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
  };
};
