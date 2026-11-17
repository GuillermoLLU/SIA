// Las iniciales de alguien para su avatar: las de sus dos primeras palabras
// (también separadas por puntos, como los usuarios «robot.siglo»), en
// mayúsculas; sin nombre, un interrogante. Lo usan Personas y las Notas de una issue.
export const initials = (name) => String(name ?? '').trim().split(/[\s.]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';
