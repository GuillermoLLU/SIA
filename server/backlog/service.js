// El backlog del equipo: lo que nadie tiene aún (sin responsable en Remedy ni
// cogida en SIA), en el orden en que la regla lo iría repartiendo. Es una
// vista sobre el dominio de Issues (queue.js, desk.js): la misma foto y las
// mismas cogidas de la base de la instancia. Aquí se mira; coger es de Issues.
import { queue, RULES } from '../issues/queue.js';
import { brief } from '../issues/desk.js';

export const createBacklogService = ({ source, platform, now = () => new Date() }) => ({
  // → { taken, rule, rules, issues: [brief…] } en el orden de la regla pedida (la básica si no existe)
  async list({ accessToken: jwt }, ruleId) {
    const { taken, issues } = source.load();
    const claimed = new Set((await platform.rpc(jwt, 'platform_issue_claims')).map((c) => c.issue_id));
    const byId = new Map(issues.map((i) => [i.id, i]));
    const rule = RULES.find((r) => r.id === ruleId) || RULES[0];
    return { taken, rule: rule.id, rules: RULES.map(({ id, label }) => ({ id, label })), issues: queue(issues, claimed, now(), rule.id).map((id) => brief(byId.get(id))) };
  },
});
