// Buscar una issue por su número de Remedy (dominio, sin E/S): para atender la
// llamada de un centro, sea de quien sea la issue. Vale el número entero
// («INC000027680016») o un trozo («27680»); solo cuentan las cifras. Primero la
// que coincide entera, luego las que terminan así (lo que se dicta por teléfono
// suele ser el final) y luego las que lo contienen; a igualdad, la que se movió
// más tarde.
import { brief } from './desk.js';

const MIN_DIGITS = 4;
const LIMIT = 8;

// issues: las de la foto · claims: quién tiene cada una en SIA (platform_issue_claims)
// → [{ ...brief, holder }] (holder: quién la tiene en SIA, o null)
export const searchIssues = (issues, claims, q, limit = LIMIT) => {
  const digits = String(q ?? '').replace(/\D/g, '');
  if (digits.length < MIN_DIGITS) return [];
  const rank = (id) => { const n = id.replace(/\D/g, ''); return n.replace(/^0+/, '') === digits.replace(/^0+/, '') ? 0 : n.endsWith(digits) ? 1 : n.includes(digits) ? 2 : -1; };
  const holderOf = new Map(claims.map((c) => [c.issue_id, c.user_name || null]));
  return issues
    .map((i) => ({ i, r: rank(i.id) }))
    .filter(({ r }) => r >= 0)
    .sort((a, b) => a.r - b.r || String(b.i.modified).localeCompare(String(a.i.modified)))
    .slice(0, limit)
    .map(({ i }) => ({ ...brief(i), holder: holderOf.get(i.id) ?? null }));
};
