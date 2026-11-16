// Cómo lo resolvemos (sin DOM): cuánto tarda lo resuelto por tramos, mes a mes, los tiempos de lo escalado y, comparando
// personas, lo resuelto de cada lado.
// m: el modelo (model.js).
import { MIN_ISSUES, clearlyWorse } from './rules.js';
import { isEscalated, JIRA_OPEN } from './model.js';

export const solved = (m) => (i) => m.DIMS.tb.get(i) < 8;
export const escalated = (m) => (i) => isEscalated(m.C, i);

// El MTTR (#48): (TTR de las resueltas + lo que llevan abiertas las que siguen abiertas) / cuántas son; una cancelada sin
// resolver no cuenta. hoursOf: lo de una (null si no cuenta). → { mttr, n } (sin ninguna, mttr null).
export const hoursOf = (m, i) => (m.C.res[i] >= 0 ? Math.max(m.C.res[i] - m.C.rep[i], 0) : m.OPEN?.[i] ? Math.max(m.SNAP - m.C.rep[i], 0) : null);
export const mttrOf = (m, list) => {
  let sum = 0, n = 0;
  for (const i of list) { const h = hoursOf(m, i); if (h != null) { sum += h; n++; } }
  return { mttr: n ? sum / n : null, n };
};
// IDMTTR (#48): cuánto mueve una incidencia el MTTR de todas (base, mttrOf): (sus horas − MTTR) / cuántas son. Positivo,
// lo sube; negativo, lo baja. Sin dato, null.
export const idmttr = (h, base) => (h == null || base.mttr == null ? null : (h - base.mttr) / base.n);
// El IDMTTR de un grupo: el MTTR de all menos el de all sin las de list (lo que está en list y no en all no lo mueve).
// Sin MTTR con o sin ellas, null.
export const idmttrOf = (m, all, list) => {
  const out = new Set(list), base = mttrOf(m, all), rest = mttrOf(m, all.filter((i) => !out.has(i)));
  return base.mttr == null || rest.mttr == null ? null : base.mttr - rest.mttr;
};

// Con su Jira aún sin resolver: sigue abierta en Remedy, o se cerró con el Jira abierto (JIRA_OPEN). Sin Jira, no.
export const jiraPending = (m, i) => (m.C.tes?.[i] ?? -1) < 0 && (m.C.the?.[i] ?? -1) >= 0 && !!(m.C.fl?.[i] & JIRA_OPEN || m.OPEN?.[i]);
// El Tesc de una escalada en Escalados: hasta que se resuelve su Jira de solución (tes) o, con el Jira aún sin resolver
// (jiraPending), desde que se creó (la apertura más THesc) hasta la última carga. Sin Jira, -1.
export const tescOf = (m, i) => {
  const { C } = m, tes = C.tes?.[i] ?? -1;
  if (tes >= 0) return tes;
  return jiraPending(m, i) ? Math.max(m.SNAP - C.rep[i] - C.the[i], 0) : -1;
};

// Los tiempos medios de unas escaladas: n, THesc y Tesc (cada uno, de las que lo tienen con sus tickets Jira, y cuántas
// son; un ticket previo a la apertura no cuenta), el tiempo total (hoursOf: de la apertura a la resolución o, abierta,
// hasta la última carga) y jiraOpen: cuántas tienen su Jira aún sin resolver (su Tesc, hasta la última carga: tescOf).
export const JIRA_MAX = 8;   // los proyectos que se comparan, como mucho, a la vez

// La comparativa de proyectos Jira. rows: lo escalado y resuelto a Jira; picked: los elegidos (de partida, ninguno: solo
// la media). options: todos los proyectos, de más a menos; picked: los elegidos que siguen en rows; shown: sus tiempos;
// global: los de todo rows.
export const jiraComparison = (m, rows, picked = null) => {
  const options = m.group('vp', rows, true).filter((x) => x.k).map((x) => ({ k: x.k, label: m.DIMS.vp.label(x.k), n: x.n, rows: x.rows }));
  const on = (picked || []).filter((k) => options.some((o) => o.k === k));
  const shown = on.map((k) => options.find((o) => o.k === k)).map((o) => ({ k: o.k, label: o.label, times: escalationTimes(m, o.rows) }));
  return { options: options.map(({ k, label, n }) => ({ k, label, n })), picked: on, shown, global: escalationTimes(m, rows) };
};

// Cuánto se aparta un tiempo de la media, en % entero: { text, cls } (más tiempo, peor: mt-up; menos, mejor: mt-down; lo
// que redondea a 0, sin color). Sin alguno de los dos, null.
export const variation = (v, base) => {
  if (v == null || !base) return null;
  const p = Math.round((v - base) / base * 100);
  return p === 0 ? { text: '0 %', cls: '' } : p > 0 ? { text: `+${p} %`, cls: 'mt-up' } : { text: `−${-p} %`, cls: 'mt-down' };
};

// Pinchar un proyecto: lo añade o lo quita, sin pasar de JIRA_MAX.
export const toggleProject = (picked, k) => {
  if (picked.includes(k)) return picked.filter((x) => x !== k);
  return picked.length < JIRA_MAX ? [...picked, k] : picked;
};

export const escalationTimes = (m, list) => {
  const { C } = m;
  const meanOf = (value) => {
    const v = list.map(value).filter((x) => x >= 0);
    return { n: v.length, avg: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null };
  };
  return { n: list.length, the: meanOf((i) => C.the?.[i] ?? -1), tes: meanOf((i) => tescOf(m, i)), tsr: meanOf((i) => C.tsr?.[i] ?? -1), total: meanOf((i) => hoursOf(m, i) ?? -1), jiraOpen: list.filter((i) => jiraPending(m, i)).length };
};
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
