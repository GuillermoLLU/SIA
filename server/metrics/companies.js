// A qué empresa se cuenta cada responsable de AYS SOPORTE: Indra (su equipo,
// por usuario de Remedy, también quien estuvo en él durante el año), fuera de
// la comparación (sin responsable o personal del cliente) y T-Systems todos
// los demás del grupo. Quien entre en el equipo de Indra, aquí.

import { key } from './text.js';

export const COMPANY = { INDRA: 0, OTHER: 1, OUT: 2 };

const INDRA = new Set(['EMILIANOSAB', 'CONCHIBG', 'RICARDOEB', 'JAVIERED', 'JUANMFL', 'RAMONFA', 'JAVIERGSANCH', 'RUBENMU', 'MARIOPV',
  'JOSEMSSEG', 'IVANBOR', 'ALEJANDROCSANM', 'ISRAELHC', 'AUGUSTOGNV', 'EMILIOJRS', 'ELVISMT', 'JAVIERVGON',
  'YOLANDAGLO', 'KYRIAMG', 'ANNERO', 'MAURORP', 'CARLABAZ', 'PABLOMFP']);
const CLIENT = new Set(['JOSEMFGOR']);

// `logins`: los usuarios de Remedy de esa persona (ver loginsOf).
export const companyOf = (person, logins) => {
  if (!person || logins.some((l) => CLIENT.has(l))) return COMPANY.OUT;
  return logins.some((l) => INDRA.has(l)) ? COMPANY.INDRA : COMPANY.OTHER;
};

// Remedy da el responsable por nombre y el historial por usuario. El usuario
// de cada persona es el que más resuelve sus issues: el que empieza como su
// nombre o, si ninguno, uno que resuelva al menos 5 y el 60 % de ellas.
// Las cuentas de sistema no cuentan. `resolvers`: Map nombre → Map usuario → veces.
// Devuelve Map usuario → nombre (una persona puede tener más de un usuario).
const SYSTEM = new Set(['robot.siglo', 'AR_ESCALATOR', 'Remedy Application Service', 'ITX784_LOGISTIC_SUPPORT', 'Unknown User', 'appadmin', 'hannah_admin']);

export const loginsOf = (resolvers) => {
  const byLogin = new Map();
  for (const [name, counts] of resolvers) {
    if (!name) continue;
    const first = key(name).split(' ')[0].slice(0, 5);
    const total = [...counts.values()].reduce((a, b) => a + b, 0);
    const cands = [...counts].filter(([l]) => !SYSTEM.has(l) && !l.startsWith('ITX')).sort((a, b) => b[1] - a[1]);
    const pick = cands.find(([l]) => key(l).startsWith(first)) || (cands[0]?.[1] >= 5 && cands[0][1] >= 0.6 * total ? cands[0] : null);
    if (pick && !byLogin.has(pick[0])) byLogin.set(pick[0], name);
  }
  return byLogin;
};
