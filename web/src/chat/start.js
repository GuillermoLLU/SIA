// Con qué se abre el chat (dominio, sin E/S). Hay un solo chat y no se elige:
// siempre Claude (Copilot cuando haya licencia de empresa), conocimiento
// autónomo y todos los proyectos de conocimiento a los que la persona tiene
// acceso. El chat de una issue reparte el mismo lanzador (issues/assisted.js).
export const CHAT_LAUNCHER = 'claude';
export const CHAT_KNOWLEDGE = 'auto';

// El lanzador del chat entre los del bridge [{ id, label, available }], o por qué no.
export const pickLauncher = (launchers = []) => {
  const launcher = launchers.find((l) => l.id === CHAT_LAUNCHER);
  if (!launcher) return { error: 'Claude no está configurado en este equipo.' };
  if (!launcher.available) return { error: 'Claude no está instalado en este equipo.' };
  return { launcher };
};

// projects: los visibles [{ id, name }] → { launcher, knowledge, projects: [id] } | { error }
export const chatPlan = ({ launchers, projects = [] }) => {
  const picked = pickLauncher(launchers);
  if (picked.error) return picked;
  return { launcher: picked.launcher, knowledge: CHAT_KNOWLEDGE, projects: projects.map((p) => p.id) };
};

// Qué conocimiento tendrá el chat, para decirlo bajo el botón: «SISU y SGA».
export const knowledgeLabel = (projects = []) => {
  const names = projects.map((p) => String(p.name ?? '').trim()).filter(Boolean);
  if (!names.length) return 'Sin conocimiento del equipo asignado';
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`;
  return `Con el conocimiento de ${list}`;
};
