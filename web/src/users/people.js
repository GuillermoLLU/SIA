// Reglas de «Equipo» (sin DOM): cómo se describe a una persona y a un rol, qué regla de
// priorización usa cada cual y qué filas enseña la lista.
import { VIEWS } from './views.js';

// Las vistas de un rol en una frase («Chat, Enlaces rápidos y Laboratorio»).
export const viewsText = (views) => {
  const names = VIEWS.filter((v) => views.includes(v.id)).map((v) => v.label);
  if (!names.length) return 'Ninguna vista';
  return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`;
};

// Los proyectos (ids de su token) que ve una persona.
export const knOf = (p) => (p.knowledge || []).flatMap((k) => k.groups.map((g) => g.id));

// Filtros de la lista: todas, uno por rol, personalizadas, sin conocimiento y desactivadas.
const FIXED_FILTERS = ['all', 'custom', 'none', 'off'];
export const filterChips = (roles) => [['all', 'Todas'], ...roles.map((r) => [r.id, r.name]), ['custom', 'Personalizado'], ['none', 'Sin conocimiento'], ['off', 'Desactivadas']];
export const matchesFilter = (p, filter) => filter === 'all'
  || (filter === 'off' ? !p.active : filter === 'none' ? !knOf(p).length : filter === 'custom' ? !p.role_id : p.role_id === filter);
// un filtro que ya no existe (se borró el rol) vuelve a «Todas»
export const validFilter = (filter, roles) => (FIXED_FILTERS.includes(filter) || roles.some((r) => r.id === filter) ? filter : 'all');

// Buscar por nombre o email (la consulta ya en minúsculas).
const matchesQuery = (p, query) => `${p.name} ${p.email}`.toLowerCase().includes(query);
export const listRows = (people, filter, query) => people.filter((p) => matchesFilter(p, filter) && matchesQuery(p, query));

export const roleName = (roles, p) => roles.find((r) => r.id === p.role_id)?.name || 'Personalizado';

// La regla de priorización de alguien (o de un rol): la suya o, sin ella, la básica.
export const basicRule = (rules) => rules.find((r) => r.builtin) || rules[0] || null;
export const ruleOf = (rules, { rule_id }) => rules.find((r) => r.id === rule_id) || basicRule(rules);

// Dar o quitar una vista (o un proyecto) a alguien: la lista resultante.
export const toggled = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

// La ficha se edita en borrador y se guarda de una vez («Guardar cambios»). El borrador de una
// persona: su rol, vistas, regla, acceso y proyectos.
export const personDraft = (p) => ({ role_id: p.role_id || null, views: [...(p.views || [])], rule_id: p.rule_id || null, active: !!p.active, kn: knOf(p) });
// Elegir un rol trae sus vistas y su regla; tocar una vista o la regla lo deja personalizado.
export const draftWithRole = (d, role) => ({ ...d, role_id: role.id, views: [...(role.views || [])], rule_id: role.rule_id || null });
export const draftWithView = (d, view) => ({ ...d, role_id: null, views: toggled(d.views, view) });
export const draftWithRule = (d, ruleId) => ({ ...d, role_id: null, rule_id: ruleId });

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
// Qué hay que mandar para pasar de la persona guardada al borrador → { user: patch | null, projects: [ids] | null }.
// Con rol, basta el rol (pone sus vistas y su regla); personalizado, las vistas y la regla que cambien.
export const personPatch = (p, d, rules) => {
  const user = {}, was = personDraft(p);
  if (d.role_id && d.role_id !== was.role_id) user.role = d.role_id;
  if (!d.role_id) {
    if (was.role_id || !sameSet(d.views, was.views)) user.views = d.views;
    const rule = ruleOf(rules, d)?.id ?? null, before = ruleOf(rules, was)?.id ?? null;
    if (rule && (was.role_id || rule !== before)) user.rule = rule;
  }
  if (d.active !== was.active) user.active = d.active;
  return { user: Object.keys(user).length ? user : null, projects: sameSet(d.kn, was.kn) ? null : d.kn };
};
export const hasChanges = (patch) => !!(patch.user || patch.projects);
