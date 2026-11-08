// El origen de una issue (SGA o SISU) y quién puede llevarla: solo quien tiene el conocimiento de
// ese origen, es decir, un proyecto de la base con su nombre (sin mayúsculas ni espacios que
// importen). Sin la lista de proyectos (una base sin actualizar), no se filtra.

export const originOf = (issue) => (issue.sisu ? 'SISU' : 'SGA');

const norm = (s) => String(s || '').trim().toUpperCase();
// groups: los nombres de los proyectos de alguien (whoami / el equipo) → ¿puede llevar esta issue?
export const knowsOrigin = (groups, issue) => !Array.isArray(groups) || groups.some((g) => norm(g) === originOf(issue));
// la parte de la foto que puede llevar alguien
export const forGroups = (issues, groups) => issues.filter((i) => knowsOrigin(groups, i));
// el origen de una issue de la foto para la base, que solo deja asignarla o traspasarla a quien lo
// conoce; si ya no está en la foto, sin origen (la base no puede comprobarlo)
export const originArg = (issues, id) => { const i = issues.find((x) => x.id === id); return i ? { p_origin: originOf(i) } : {}; };
