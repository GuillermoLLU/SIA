// La IA de las Métricas (sin DOM): las marcas de IA de cada issue y las cifras de una lista.
// Las marcas vienen de Remedy (server/metrics/remedy.js, FLAG): en TAGS (IA_SOLVED…, IA_FAIL) y en las notas ([ACT IA], [INFORME IA],
// [HITL_REVIEW_OK], [HITL_REVIEW_NOT_OK], [IA_FAIL]…).
export const IA_MARKS = 32 | 64 | 2048 | 4096 | 8192;
const IA_SOLVED = 32, IA_FAILS = 64 | 8192, HITL_OK = 4096;
export const IA_NAMES = ['Revisada OK', 'Con fallo', 'Sin revisar', 'Sin IA'];
export const IA_OK = 0, IA_FAIL = 1, IA_UNREVIEWED = 2, IA_NONE = 3;

// cómo sale una issue según sus marcas: con alguna marca de fallo (aunque también tenga revisión OK), con revisión
// humana OK, con IA pero sin revisión ni fallo, o sin IA
export const iaKind = (flags) => (!(flags & IA_MARKS) ? IA_NONE : flags & IA_FAILS ? IA_FAIL : flags & HITL_OK ? IA_OK : IA_UNREVIEWED);

// las cifras de IA de una lista (C: las columnas de las Métricas, fl y as): con IA, resueltas por la IA (IA_SOLVED),
// revisadas OK, con fallo y sin revisar (sobre las de IA), y cuántas personas tienen issues y cuántas alguna con IA
export const iaStats = (list, C) => {
  let ia = 0, solved = 0, ok = 0, fail = 0;
  const users = new Set(), people = new Set();
  for (const i of list) {
    if (C.as[i]) people.add(C.as[i]);
    const k = iaKind(C.fl[i]);
    if (k === IA_NONE) continue;
    ia++;
    if (C.as[i]) users.add(C.as[i]);
    if (C.fl[i] & IA_SOLVED) solved++;
    if (k === IA_OK) ok++; else if (k === IA_FAIL) fail++;
  }
  const of = (v) => (ia ? v / ia : null);
  return { n: list.length, ia, solved, ok, fail, unrev: ia - ok - fail, users: users.size, people: people.size,
    share: list.length ? ia / list.length : null, okShare: of(ok), failShare: of(fail), unrevShare: of(ia - ok - fail) };
};

// las personas según qué parte de sus issues lleva IA
const IA_USE = [['Sin IA', (s) => !s.ia], ['Menos del 5 %', (s) => s.ia > 0 && s.share < 0.05],
  ['Del 5 al 15 %', (s) => s.share >= 0.05 && s.share < 0.15], ['El 15 % o más', (s) => s.share >= 0.15]];

// de unas personas (sus iaStats), las de cada tramo de IA_USE: cuántas son (c) de todas (n), y cuántas issues con IA
// llevan (ia) de todas las de IA (all)
export const iaUse = (people) => {
  const all = people.reduce((a, s) => a + s.ia, 0);
  return IA_USE.map(([label, t]) => {
    const ps = people.filter(t);
    return { label, n: people.length, c: ps.length, ia: ps.reduce((a, s) => a + s.ia, 0), all };
  });
};
