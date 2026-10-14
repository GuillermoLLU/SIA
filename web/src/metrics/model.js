// Las Métricas en memoria (sin DOM): los datos que calcula el bridge
// (server/metrics/dataset.js), lo que se deriva de cada issue, los filtros
// y los indicadores de cualquier grupo de issues.
import { MONTHS, DOWS, nice, title } from './format.js';

export const COMPANIES = ['Indra', 'T-Systems', 'Sin asignar / fuera'];
export const SCOPES = ['Fuera de los filtros de Indra', 'SGA de Indra (ECOM, Bloqueo DB2, RETURNS)', 'SISU (etiqueta SISUINC)', 'Petición de usuario ECOM (el filtro de SGA la excluye)'];
// Marcas de una issue: los bits de server/metrics/remedy.js (FLAG).
export const FLAGS = [[1, 'SISUINC (abierta desde SISU)'], [2, 'PRIO (priorizada por negocio)'], [4, 'PETREQ'], [8, 'AUTOTEC (aviso automático)'], [16, 'RPROC'],
  [32, 'IA_SOLVED…'], [64, 'IA_FAIL / HITL_IA_FAIL'], [128, 'DB2_LOCK'], [256, 'Major incident (en notas)'], [512, 'Reabierta'],
  [1024, 'Con llamada al centro (CALL… en notas)'], [2048, 'Con intervención de IA (en notas)'], [4096, 'Revisión humana de IA: OK'], [8192, 'IA fallida o revisión no OK'],
  [16384, 'Marcada como recurrencia'], [32768, 'Sin texto de resolución']];
export const MAJOR = 256;
const REOPENED = 512, NO_RESOLUTION = 32768;
export const IA_MARKS = 32 | 64 | 2048 | 4096 | 8192;

// Tramos de tiempo de resolución y de antigüedad (minutos).
const TTR_NAMES = ['< 1 h', '1–4 h', '4–8 h', '8–24 h', '1–3 días', '3–7 días', '7–30 días', '> 30 días', 'Sin resolver'];
const TTR_LIMITS = [60, 240, 480, 1440, 4320, 10080, 43200, Infinity];
const AGE_NAMES = ['< 2 días', '2–7 días', '7–30 días', '30–90 días', '> 90 días'];
const AGE_LIMITS = [2880, 10080, 43200, 129600, Infinity];

// SLA de inicio: de la apertura al primer paso a En curso, por prioridad.
const SLA_MINUTES = { CRITICAL: 15, HIGH: 45, MEDIUM: 120, LOW: 480 };
export const SLA_NAMES = ['Dentro del SLA', 'Hasta el doble del SLA', 'Del doble a 5 veces el SLA', 'Más de 5 veces el SLA',
  'Sin iniciar y ya fuera de plazo', 'Sin iniciar, aún en plazo', 'Cerrada sin pasar por En curso', 'Prioridad sin SLA'];

const DAY = 1440;

// Título sin centro ni criticidad, y solo la parte que describe el problema (tras « - »).
const HEAD = /^(\d{6})\s+(?:(?:cr[ií]tic[ao]|critical|alta|high|m[eé]dia|medium|baja|baixa|low)\b\s*)?/i;
const describe = (summary, autoNotice) => {
  const s = summary.replace(HEAD, '');
  let d = '';
  if (autoNotice) d = s.replace(/^.*?:\s*/, '');
  else { const p = s.indexOf(' - '); if (p >= 0) d = s.slice(p + 3); else if (!HEAD.test(summary)) d = s; }
  return d.normalize('NFD').replace(/\p{Mn}/gu, '').toLowerCase().replace(/\d+/g, '#').replace(/[.\s]+$/, '').replace(/\s+/g, ' ').trim();
};

const quant = (arr, p) => { if (!arr.length) return null; const a = Float64Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.floor(a.length * p))]; };
const mean = (arr) => { if (!arr.length) return null; let t = 0; for (const x of arr) t += x; return t / arr.length; };
export const share = (list, test) => { if (!list.length) return 0; let n = 0; for (const i of list) if (test(i)) n++; return n / list.length; };

export const createModel = (data) => {
  const { cols: C, dict: DI, meta } = data;
  const N = meta.rows, BASE = Date.UTC(meta.year, 0, 1), SNAP = meta.snapshot;
  const LASTM = new Date(BASE + SNAP * 6e4).getUTCMonth();
  const CRIT = DI.prio.indexOf('CRITICAL'), HIGH = DI.prio.indexOf('HIGH');
  const SLA = DI.prio.map((p) => SLA_MINUTES[p] ?? -1);
  const OPEN_ST = new Set(['ASSIGNED', 'IN_PROGRESS', 'PENDING'].map((s) => DI.status.indexOf(s)));

  // --- lo que se deriva de cada issue
  const MONTH = new Uint8Array(N), DOW = new Uint8Array(N), HOUR = new Uint8Array(N), TTR = new Int32Array(N), TB = new Uint8Array(N), OPEN = new Uint8Array(N), TEAM = new Uint8Array(N);
  const DESC = new Uint32Array(N), DESCL = [''], descIndex = new Map([['', 0]]);
  for (let i = 0; i < N; i++) {
    const d = new Date(BASE + C.rep[i] * 6e4);
    MONTH[i] = d.getUTCMonth(); DOW[i] = (d.getUTCDay() + 6) % 7; HOUR[i] = d.getUTCHours();
    TTR[i] = C.res[i] >= 0 ? Math.max(C.res[i] - C.rep[i], 0) : -1;
    TB[i] = TTR[i] < 0 ? 8 : TTR_LIMITS.findIndex((l) => TTR[i] < l);
    OPEN[i] = OPEN_ST.has(C.st[i]) ? 1 : 0;
    TEAM[i] = data.company[C.as[i]];
    const k = describe(C.su[i], C.th[i] & 1);
    if (!descIndex.has(k)) { descIndex.set(k, DESCL.length); DESCL.push(k); }
    DESC[i] = descIndex.get(k);
  }

  // --- dimensiones: por las que se agrupa y se filtra
  const dictDim = (name, col, dict, fmt = nice) => ({ name, get: (i) => C[col][i], label: (k) => fmt(DI[dict][k]) });
  const DIMS = {
    month: { name: 'Mes', get: (i) => MONTH[i], label: (k) => MONTHS[k] },
    st: dictDim('Estado', 'st', 'status'),
    sc: { name: 'Ámbito', get: (i) => C.sc[i], label: (k) => SCOPES[k] },
    pr: dictDim('Prioridad', 'pr', 'prio'),
    sv: dictDim('Tipo de servicio', 'sv', 'svc'),
    as: { name: 'Responsable', get: (i) => C.as[i], label: (k) => (k ? DI.person[k] : '(sin responsable)') },
    ce: dictDim('Centro', 'ce', 'centre', (s) => s || '(sin centro)'),
    op: dictDim('Tipo de operación', 'op', 'op'),
    mo: dictDim('Módulo / sistema', 'mo', 'module', (s) => s || '(sin módulo)'),
    k3: dictDim('Tipología (categorización 3)', 'k3', 'cat', (s) => (s ? title(s) : '(sin tipología)')),
    rs: dictDim('Motivo de estado', 'rs', 'reason', title),
    vt: dictDim('Ticket de tercero (prefijo)', 'vt', 'vtype', (s) => (s === '' ? '(sin ticket de tercero)' : s === 'JIRA' ? 'Clave Jira sin prefijo' : s === 'OTRO' ? 'Otro texto' : s)),
    vp: dictDim('Proyecto Jira', 'vp', 'vproj', (s) => s || '(sin clave Jira)'),
    vk: dictDim('Ticket Jira', 'vk', 'vkey', (s) => s || '(sin clave Jira)'),
    rz: dictDim('Resolución (texto)', 'rz', 'resol', (s) => s || '(texto único o vacío)'),
    dow: { name: 'Día de la semana', get: (i) => DOW[i], label: (k) => DOWS[k] },
    hour: { name: 'Hora', get: (i) => HOUR[i], label: (k) => `${k} h` },
    age: { name: 'Antigüedad', get: (i) => AGE_LIMITS.findIndex((l) => SNAP - C.rep[i] < l), label: (k) => AGE_NAMES[k] },
    tb: { name: 'Tiempo de resolución', get: (i) => TB[i], label: (k) => TTR_NAMES[k] },
    de: { name: 'Título', get: (i) => DESC[i], label: (k) => DESCL[k] || '(título sin descripción del problema)' },
    th: { name: 'Tema', multi: true, label: (k) => data.themes[k] || 'Sin tema detectado',
      get: (i) => { const t = C.th[i], o = []; if (!t) return [data.themes.length]; for (let j = 0; j < data.themes.length; j++) if (t >> j & 1) o.push(j); return o; } },
    fl: { name: 'Marca', multi: true, label: (k) => FLAGS[k][1], get: (i) => { const f = C.fl[i], o = []; for (let j = 0; j < FLAGS.length; j++) if (f & FLAGS[j][0]) o.push(j); return o; } },
    // cómo se inició respecto a su SLA
    sl: { name: 'SLA de inicio', label: (k) => SLA_NAMES[k], get: (i) => {
      const l = SLA[C.pr[i]], v = C.ip[i];
      if (l < 0) return 7;
      if (v >= 0) return v <= l ? 0 : v <= 2 * l ? 1 : v <= 5 * l ? 2 : 3;
      if (!OPEN[i]) return 6;
      return SNAP - C.rep[i] > l ? 4 : 5;
    } },
  };

  // --- filtros. S.co: qué empresas se miran; S.f: dimensión → valores marcados.
  // Una fila cuenta en un gráfico si pasa todos los filtros salvo el de la propia dimensión.
  // Con personas elegidas (S.f.as) mandan ellas: se miran sus empresas, marcadas o no, y
  // con una sola persona se ven sus valores, sin comparar.
  const S = { f: {}, from: 0, to: LASTM, q: '', co: [true, true, false] };
  const people = () => (S.f.as?.size ? [...S.f.as] : null);
  const CO = () => {
    const p = people();
    if (!p) return [0, 1, 2].filter((k) => S.co[k]);
    const of = new Set(p.map((k) => data.company[k]));
    return [0, 1, 2].filter((k) => of.has(k));
  };
  const CMP = () => { const c = CO(); return c.includes(0) && c.includes(1); };
  let MASK = new Uint32Array(N), ACTIVE = [], CACHE = {};
  const refilter = () => {
    ACTIVE = Object.keys(S.f).filter((k) => S.f[k].size);
    const q = S.q.trim().toLowerCase(), co = people() ? [true, true, true] : S.co;
    for (let i = 0; i < N; i++) {
      let m = 0;
      if (MONTH[i] < S.from || MONTH[i] > S.to || !co[TEAM[i]]) m |= 1 << 30;
      if (q && !C.su[i].toLowerCase().includes(q) && !`inc${String(C.id[i]).padStart(12, '0')}`.includes(q)) m |= 1 << 30;
      for (let a = 0; a < ACTIVE.length; a++) {
        const dm = DIMS[ACTIVE[a]], set = S.f[ACTIVE[a]], v = dm.get(i);
        if (dm.multi ? !v.some((x) => set.has(x)) : !set.has(v)) m |= 1 << a;
      }
      MASK[i] = m;
    }
    CACHE = {};
  };
  // filas que pasan los filtros (sin contar el de la dimensión `skip`, si se indica)
  const rows = (skip) => {
    const a = ACTIVE.indexOf(skip), key = a < 0 ? '*' : skip;
    if (CACHE[key]) return CACHE[key];
    const allow = a < 0 ? 0 : 1 << a, out = [];
    for (let i = 0; i < N; i++) if (!(MASK[i] & ~allow)) out.push(i);
    return (CACHE[key] = out);
  };
  const toggle = (dim, k) => { const s = S.f[dim] || (S.f[dim] = new Set()); if (s.has(k)) s.delete(k); else s.add(k); };
  const isSel = (dim, k) => !!S.f[dim]?.has(k);

  // --- agregación
  const group = (dim, list, keep) => {
    const dm = DIMS[dim], m = new Map();
    const add = (k, i) => { let g = m.get(k); if (!g) m.set(k, g = { k, n: 0, t: [0, 0, 0], rows: keep ? [] : null }); g.n++; g.t[TEAM[i]]++; if (keep) g.rows.push(i); };
    for (const i of list || rows(dim)) { const v = dm.get(i); if (dm.multi) for (const k of v) add(k, i); else add(v, i); }
    return [...m.values()].sort((a, b) => b.n - a.n);
  };
  const byTeam = (list) => { const t = [[], [], []]; for (const i of list) t[TEAM[i]].push(i); return t; };
  const byMonth = (list) => { const a = new Array(12).fill(0); for (const i of list) a[MONTH[i]]++; return a; };
  // últimos 90 días de la foto frente a los 90 anteriores
  const trend = (list) => { let now = 0, prev = 0; for (const i of list) { const age = SNAP - C.rep[i]; if (age < 90 * DAY) now++; else if (age < 180 * DAY) prev++; } return { now, prev }; };

  // Indicadores de un grupo de issues. Tiempos en minutos; proporciones de 0 a 1.
  const stats = (list) => {
    const ttr = [], fr = [], ip = [];
    let crit = 0, hi = 0, vend = 0, pend = 0, reop = 0, bounce = 0, open = 0, open30 = 0, d1 = 0, h4 = 0, d3 = 0, f30 = 0, f120 = 0;
    let noCat = 0, noDesc = 0, noRes = 0, done = 0, slaOk = 0, slaKo = 0, noIp = 0, waitKo = 0;
    const time = [0, 0, 0, 0, 0], t = [0, 0, 0];
    for (const i of list) {
      if (TTR[i] >= 0) { ttr.push(TTR[i]); if (TTR[i] < DAY) d1++; if (TTR[i] < 240) h4++; if (TTR[i] < 3 * DAY) d3++; }
      if (C.fr[i] >= 0) { fr.push(C.fr[i]); if (C.fr[i] < 30) f30++; if (C.fr[i] < 120) f120++; }
      if (OPEN[i]) { open++; if (SNAP - C.rep[i] > 30 * DAY) open30++; } else { done++; if (C.fl[i] & NO_RESOLUTION) noRes++; }
      if (!C.k3[i]) noCat++;
      if (!DESC[i]) noDesc++;
      if (C.pr[i] === CRIT) crit++; else if (C.pr[i] === HIGH) hi++;
      if (C.vt[i]) vend++;
      if (C.np[i]) pend++;
      if (C.fl[i] & REOPENED) reop++;
      if (C.nb[i]) bounce++;
      // SLA de inicio: iniciada a tiempo, tarde, sin iniciar y fuera de plazo, o cerrada sin pasar por En curso
      const lim = SLA[C.pr[i]];
      if (C.ip[i] >= 0) { ip.push(C.ip[i]); if (lim >= 0) { if (C.ip[i] <= lim) slaOk++; else slaKo++; } }
      else if (!OPEN[i]) noIp++;
      else if (lim >= 0 && SNAP - C.rep[i] > lim) { slaKo++; waitKo++; }
      time[0] += C.tA[i]; time[1] += C.tI[i]; time[2] += C.tPc[i]; time[3] += C.tPv[i]; time[4] += C.tPo[i];
      t[TEAM[i]]++;
    }
    const n = list.length || 1, R = ttr.length || 1, F = fr.length || 1;
    return {
      n: list.length, t, open, open30, resolved: ttr.length,
      avg: mean(ttr), p90: quant(ttr, 0.9), d1: ttr.length ? d1 / ttr.length : 0, h4: h4 / R, d3: d3 / R,
      fr: mean(fr), f30: f30 / F, f120: f120 / F,
      sla: slaOk + slaKo ? slaOk / (slaOk + slaKo) : null, slaKo, waitKo, noIp: noIp / n, ip: mean(ip), ip90: quant(ip, 0.9),
      crit: crit / n, hi: hi / n, vend: vend / n, pend: pend / n, reop: reop / n, bounce: bounce / n,
      noCat: noCat / n, noDesc: noDesc / n, noRes: noRes / (done || 1), time,
    };
  };

  return {
    data, C, DI, N, BASE, SNAP, LASTM, SLA, MONTH, DOW, HOUR, OPEN, TEAM, DESCL, DIMS, S,
    CMP, CO, people, refilter, rows, toggle, isSel, group, byTeam, byMonth, trend, stats,
  };
};
