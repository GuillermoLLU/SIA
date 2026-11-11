// El origen de una issue (SGA o SISU) y quién puede llevarla: solo quien tiene el conocimiento de ese
// origen, un proyecto de la base con su nombre. Es la regla del bridge (server/issues/origin.js), que
// la base vuelve a comprobar: aquí sirve para no ofrecer a quien no podría recibirla.
export const originOf = (issue) => (issue.sisu ? 'SISU' : 'SGA');
// groups: los proyectos de alguien (el equipo de Issues los trae) → ¿puede llevar esta issue?
export const knowsOrigin = (groups, issue) => !Array.isArray(groups) || groups.some((g) => String(g).trim().toUpperCase() === originOf(issue));
