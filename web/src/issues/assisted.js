// Resolución asistida por IA de una issue (dominio, sin E/S): con qué se abre
// el chat. Siempre Claude (Copilot cuando haya licencia), conocimiento
// autónomo y solo el proyecto del origen de la issue: SISU si viene de SISU,
// SGA si no.
export const ASSISTED_LAUNCHER = 'claude';
export const ASSISTED_KNOWLEDGE = 'auto';

export const originOf = (issue) => (issue.sisu ? 'SISU' : 'SGA');

// launchers: los del bridge [{ id, label, available }]; projects: los visibles [{ id, name }].
// → { launcher, knowledge, projects: [id], project } | { error }
export const assistedPlan = ({ launchers = [], projects = [], origin }) => {
  const launcher = launchers.find((l) => l.id === ASSISTED_LAUNCHER);
  if (!launcher) return { error: 'Claude no está configurado en este equipo.' };
  if (!launcher.available) return { error: 'Claude no está instalado en este equipo.' };
  const project = projects.find((p) => String(p.name).trim().toUpperCase() === origin);
  if (!project) return { error: `No tienes acceso al conocimiento de ${origin}.` };
  return { launcher, knowledge: ASSISTED_KNOWLEDGE, projects: [project.id], project };
};
