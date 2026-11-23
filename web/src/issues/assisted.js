// Resolución asistida por IA de una issue (dominio, sin E/S): con qué se abre
// el chat. Como el Chat (chat/start.js: Copilot, conocimiento autónomo) y solo
// el proyecto del origen de la issue: SISU si viene de SISU, SGA si no.
import { checkCopilot, CHAT_KNOWLEDGE } from '../chat/start.js';

// copilot: lo que dice el bridge ({ available }); projects: los visibles [{ id, name }].
// → { knowledge, projects: [id], project } | { error }
export const assistedPlan = ({ copilot, projects = [], origin }) => {
  const check = checkCopilot(copilot);
  if (check.error) return check;
  const project = projects.find((p) => String(p.name).trim().toUpperCase() === origin);
  if (!project) return { error: `No tienes acceso al conocimiento de ${origin}.` };
  return { knowledge: CHAT_KNOWLEDGE, projects: [project.id], project };
};
