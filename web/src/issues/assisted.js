// Resolución asistida por IA de una issue (dominio, sin E/S): con qué se abre
// el chat. El mismo lanzador que el Chat (chat/start.js: Claude, conocimiento
// autónomo) y solo el proyecto del origen de la issue: SISU si viene de SISU,
// SGA si no.
import { pickLauncher, CHAT_KNOWLEDGE } from '../chat/start.js';

export const originOf = (issue) => (issue.sisu ? 'SISU' : 'SGA');
// ¿Puede llevar esta issue alguien con estos proyectos (groups)? Solo con el de su origen.
export const knowsOrigin = (groups, issue) => !Array.isArray(groups) || groups.some((g) => String(g).trim().toUpperCase() === originOf(issue));

// launchers: los del bridge [{ id, label, available }]; projects: los visibles [{ id, name }].
// → { launcher, knowledge, projects: [id], project } | { error }
export const assistedPlan = ({ launchers = [], projects = [], origin }) => {
  const picked = pickLauncher(launchers);
  if (picked.error) return picked;
  const project = projects.find((p) => String(p.name).trim().toUpperCase() === origin);
  if (!project) return { error: `No tienes acceso al conocimiento de ${origin}.` };
  return { launcher: picked.launcher, knowledge: CHAT_KNOWLEDGE, projects: [project.id], project };
};
