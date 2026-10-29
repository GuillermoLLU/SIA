// El backlog del equipo: lo que nadie tiene aún (sin responsable en Remedy ni
// cogida en SIA), en el orden en que la regla lo iría repartiendo. Es una
// vista sobre el dominio de Issues (queue.js, desk.js): la misma foto y las
// mismas cogidas de la base de la instancia. Aquí se mira; coger es de Issues.
import { queue } from '../issues/queue.js';
import { brief } from '../issues/desk.js';

export const createBacklogService = ({ source, platform, now = () => new Date() }) => ({
  // → { taken, issues: [brief…] } en el orden de la regla básica
  async list({ accessToken: jwt }) {
    const { taken, issues } = source.load();
    const claimed = new Set((await platform.rpc(jwt, 'platform_issue_claims')).map((c) => c.issue_id));
    const byId = new Map(issues.map((i) => [i.id, i]));
    return { taken, issues: queue(issues, claimed, now()).map((id) => brief(byId.get(id))) };
  },
});
