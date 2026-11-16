// Cómo lo resolvemos (sin DOM): cuánto tarda lo resuelto por tramos, mes a mes, lo que unas veces se escala y
// otras no, los tickets con muchas incidencias y, comparando personas, lo resuelto de cada lado.
// m: el modelo (model.js).
import { MIN_ISSUES, MIXED_ESC, TICKET_MIN, clearlyWorse } from './rules.js';

export const solved = (m) => (i) => m.DIMS.tb.get(i) < 8;
export const escalated = (m) => (i) => m.C.vt[i] > 0;
// cuántas de cada lado (por persona, comparando con personas): H, el divisor de cada lado
export const perHead = (m) => [0, 1].map((k) => (m.perHead() ? m.heads(k).size || 1 : 1));

// Cuánto tardan: lo resuelto sin escalar, escalado y todo, de cada lado (P), repartido entre los tramos de tiempo
// (c: cuántas en cada uno; cada fila suma el 100 %). → blocks: por clase, una fila por lado; max: la parte mayor.
export const ttrBlocks = (m, list, P) => {
  const esc = escalated(m), KINDS = [['Sin escalar', (i) => !esc(i), 'es:0'], ['Escaladas', esc, 'es:1'], ['Todas las resueltas', null, null]];
  const blocks = KINDS.map(([label, t, f]) => P.map((L, k) => {
    const l = t ? L.filter(t) : L, c = new Array(8).fill(0);
    for (const i of l) c[m.DIMS.tb.get(i)]++;
    return { label, f, k, n: l.length, c, s: m.stats(l) };
  }));
  const max = Math.max(0.01, ...blocks.flat().flatMap((x) => x.c.map((v) => v / (x.n || 1))));
  return { blocks, max };
};
// la parte de una fila en unos tramos (ks), como se ve (en %, redondeada)
const shownShare = (x, ks) => Math.round(ks.reduce((t, k) => t + x.c[k], 0) / (x.n || 1) * 100);
// comparando, si la fila x va mejor que la otra (o) en esos tramos
export const bestOf = (x, o, ks, better) => !!better && !!x.n && !!o.n && shownShare(x, ks) !== shownShare(o, ks) && (better === 'high') === (shownShare(x, ks) > shownShare(o, ks));

// Mes a mes: de lo recibido en una lista, lo resuelto (a: todo, con su % escalado), sin escalar (n) y escalado (e).
export const resolutionParts = (m) => {
  const isSolved = solved(m), esc = escalated(m);
  return (l) => {
    const r = l.filter(isSolved), e = r.filter(esc), a = m.stats(l);
    a.escShare = r.length ? e.length / r.length : null;
    return { a, n: m.stats(r.filter((i) => !esc(i))), e: m.stats(e) };
  };
};
// el valor de un dato ([nombre, parte, valor…]) en unas partes, solo si hay resueltas
export const partValue = (x, d) => { const s = x[d[1]]; return s.resolved ? d[2](s) : null; };
export const partWorse = (x, d, v, tot) => x[d[1]].resolved >= MIN_ISSUES && clearlyWorse(v, partValue(tot, d), d[4]);

// Unas veces se escala y otras no: problemas con al menos MIXED_ESC.min resueltas, escalados entre MIXED_ESC.from y
// MIXED_ESC.to de las veces; los `top` primeros, agrupados por su módulo principal (el módulo, de más a menos
// resueltas entre sus problemas). → { all: cuántos hay, groups: [[módulo, problemas]] }
export const mixedEscalation = (m, top) => {
  const esc = escalated(m);
  const g = m.group('de', m.rows('de').filter(solved(m)), true).filter((x) => x.k && x.n >= MIXED_ESC.min)
    .map((x) => ({ ...x, e: x.rows.filter(esc) })).filter((x) => x.e.length >= MIXED_ESC.from * x.n && x.e.length <= MIXED_ESC.to * x.n);
  const shown = top ? g.slice(0, top) : g, byMo = new Map();
  for (const x of shown) { const mo = m.group('mo', x.rows).find((y) => y.k)?.k ?? 0; if (!byMo.has(mo)) byMo.set(mo, []); byMo.get(mo).push(x); }
  const groups = [...byMo].sort((a, b) => b[1].reduce((t, x) => t + x.n, 0) - a[1].reduce((t, x) => t + x.n, 0));
  return { all: g.length, shown, groups };
};

// Un mismo ticket, muchas incidencias: tickets de tercero con TICKET_MIN o más incidencias ligadas, los que aún
// tienen alguna abierta primero y de más a menos incidencias. Por ticket: centros distintos, la primera y la última
// incidencia (minutos) y los días entre una y otra, y el problema más habitual (clave de dict.problem).
export const tickets = (m, A) => {
  const { C, OPEN } = m;
  return m.group('vk', A, true).filter((x) => x.k && x.n >= TICKET_MIN).map((x) => {
    const first = Math.min(...x.rows.map((i) => C.rep[i])), last = Math.max(...x.rows.map((i) => C.rep[i]));
    return { k: x.k, n: x.n, rows: x.rows, open: x.rows.filter((i) => OPEN[i]).length, centres: new Set(x.rows.map((i) => C.ce[i])).size,
      first, last, span: Math.floor(last / 1440) - Math.floor(first / 1440), problem: m.group('de', x.rows).find((y) => y.k)?.k ?? 0 };
  }).sort((a, b) => (b.open > 0) - (a.open > 0) || b.n - a.n);
};

// comparando personas: lo resuelto de cada lado en una lista, con el volumen por persona (vol, H)
export const resolvedPair = (m, lists) => {
  const H = perHead(m);
  return [0, 1].map((k) => { const s = m.stats(lists[k]); s.vol = s.resolved / H[k]; s.H = H[k]; return s; });
};
// los módulos con más resueltas del lado que lleva (lead), para compararlos uno a uno; el resto, aparte
export const modulesBySide = (m, R, T, lead, top = 15) => {
  const mine = new Set(T[lead]);
  const g = m.group('mo', R, true).filter((x) => x.k).map((x) => ({ ...x, own: x.rows.filter((i) => mine.has(i)).length }))
    .filter((x) => x.own).sort((a, b) => b.own - a.own || b.n - a.n);
  return { top: g.slice(0, top), rest: g.slice(top).flatMap((x) => x.rows), all: g.length };
};
