// Reglas de la vista Equipo soporte · gestión (sin DOM): cómo se describe a
// una persona y a un rol, y qué filas enseña la lista.
import { VIEWS } from './views.js';

// Las vistas de un rol en una frase («Chat, Enlaces rápidos y Laboratorio»).
export const viewsText = (views) => {
  const names = ['Chat', ...VIEWS.filter((v) => views.includes(v.id)).map((v) => v.label)];
  return names.length === 1 ? 'Solo el Chat' : `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`;
};

// Las iniciales del avatar: las dos primeras palabras del nombre.
export const initials = (n) => String(n).split(/\s+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || '?';

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

// Dar o quitar una vista (o un proyecto) a alguien: la lista resultante.
export const toggled = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
