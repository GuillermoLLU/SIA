// La paleta de skills (sin DOM): qué skills casan con lo que se escribe, en
// qué fila queda la selección y la orden que se teclea en el CLI.
import { fold } from '../ui/html.js';

// Sin acentos ni mayúsculas, sobre etiqueta, descripción, id y categoría.
export const filterSkills = (skills, query) => {
  const q = fold(query.trim());
  return q ? skills.filter((sk) => fold(`${sk.label} ${sk.description} ${sk.id} ${sk.category}`).includes(q)) : skills;
};

// La fila seleccionada se queda dentro de la lista al cambiar el filtro.
export const clampIndex = (i, n) => Math.min(Math.max(0, i), Math.max(0, n - 1));

// Una línea corta: Copilot lee la skill él mismo (por las instrucciones
// de AGENTS.md).
export const skillOrder = (id) => `Ejecuta la skill ${id}: lee skills/${id}/SKILL.md y sigue sus instrucciones estrictamente.`;

// «No sé cuál»: skill-finder con la descripción del usuario (las comillas
// dobles irían dentro de otras: se cambian por simples).
export const finderOrder = (desc) => `Ejecuta la skill skill-finder: lee skills/skill-finder/SKILL.md y sigue sus instrucciones. El usuario busca esta funcionalidad: "${desc.trim().replace(/"/g, "'")}".`;
