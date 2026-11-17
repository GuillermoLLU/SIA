// Con qué se abre el chat (dominio, sin E/S). Hay un solo chat y no se elige:
// Copilot, conocimiento autónomo y todos los proyectos de conocimiento a los
// que la persona tiene acceso. El chat de una issue reparte la misma regla
// (issues/assisted.js).
export const CHAT_KNOWLEDGE = 'auto';

// Copilot, tal como lo dice el bridge ({ available }): {} si se puede abrir, o por qué no.
export const checkCopilot = (copilot) => (copilot?.available ? {} : { error: 'Copilot no está instalado en este equipo.' });

// projects: los visibles [{ id, name }] → { knowledge, projects: [id] } | { error }
export const chatPlan = ({ copilot, projects = [] }) => {
  const check = checkCopilot(copilot);
  if (check.error) return check;
  return { knowledge: CHAT_KNOWLEDGE, projects: projects.map((p) => p.id) };
};
