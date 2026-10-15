// Las Métricas en memoria (sin DOM): los datos que calcula el bridge
// (server/metrics/dataset.js), lo que se deriva de cada issue, los filtros
// y los indicadores de cualquier grupo de issues.
import { MONTHS, DOWS, nice, title } from './format.js';
import { SHIFTS, SHIFT_HOURS, DAYS, slotOf, weekendOf, typeOf, slotsIn, carry, shiftWork } from './shifts.js';

export const COMPANIES = ['Indra', 'T-Systems', 'Sin asignar / fuera'];
// ámbitos (server/metrics/remedy.js, SCOPE): los filtros de Remedy con los que el equipo de Indra ve su backlog
export const SCOPE = { OUT: 0, SGA: 1, SISU: 2, REQUEST: 3 };
export const SCOPES = ['Fuera de los filtros de Indra', 'SGA de Indra (ECOM, Bloqueo DB2, RETURNS)', 'SISU (etiqueta SISUINC)', 'Petición de usuario ECOM (el filtro de SGA la excluye)'];
// Marcas de una issue: los bits de server/metrics/remedy.js (FLAG).
export const FLAGS = [[1, 'SISUINC (abierta desde SISU)'], [2, 'PRIO (priorizada por negocio)'], [4, 'PETREQ'], [8, 'AUTOTEC (aviso automático)'], [16, 'RPROC'],
  [32, 'IA_SOLVED…'], [64, 'IA_FAIL / HITL_IA_FAIL'], [128, 'DB2_LOCK'], [256, 'Major incident (en notas)'], [512, 'Reabierta'],
  [1024, 'Con llamada al centro (CALL… en notas)'], [2048, 'Con intervención de IA (en notas)'], [4096, 'Revisión humana de IA: OK'], [8192, 'IA fallida o revisión no OK'],
  [16384, 'Marcada como recurrencia'], [32768, 'Sin texto de resolución']];
export const MAJOR = 256;
const REOPENED = 512, NO_RESOLUTION = 32768;
export const IA_MARKS = 32 | 64 | 2048 | 4096 | 8192;
const PRIO = 2;
// Tarjetas: como reconoce el equipo su trabajo. SGA y SISU, por los filtros de Remedy (ámbito); PRIO, por la
// etiqueta de priorizada por negocio, que va además de su SGA o SISU. 3: sin tarjeta.
export const CARDS = ['SGA', 'SISU', 'PRIO', 'Sin tarjeta'];

// Situación de cada issue, como la mira el equipo: abierta en curso; en Asignada sin tocar (ningún cambio de
// estado desde que se abrió ni ticket de tercero) o devuelta a Asignada (ya se trabajó antes); en espera
// (Pendiente) de un tercero, del cliente o por otro motivo; o cerrada.
export const SITUATIONS = ['En curso', 'Sin tocar', 'Devuelta a Asignada', 'Espera tercero', 'Espera cliente', 'Espera otro motivo', 'Cerrada'];
const VENDOR_REASON = 'THIRD_PARTY_VENDOR_ACTION_REQD', CLIENT_REASONS = ['CLIENT_ACTION_REQUIRED', 'CUSTOMER_FOLLOW_UP_REQUIRED'];

// Tramos de tiempo de resolución y de antigüedad (minutos).
const TTR_NAMES = ['< 1 h', '1–4 h', '4–8 h', '8–24 h', '1–3 días', '3–7 días', '7–30 días', '> 30 días', 'Sin resolver'];
const TTR_LIMITS = [60, 240, 480, 1440, 4320, 10080, 43200, Infinity];
// la antigüedad, en los tramos con que la mira el equipo
const AGE_NAMES = ['1–5 días', '6–10 días', '11–15 días', '16–30 días', '> 30 días'];
const AGE_LIMITS = [6, 11, 16, 31, Infinity].map((d) => d * 1440);

// SLA de inicio: de la apertura al primer paso a En curso, por prioridad.
const SLA_MINUTES = { CRITICAL: 15, HIGH: 45, MEDIUM: 120, LOW: 480 };
export const SLA_NAMES = ['Dentro del SLA', 'Hasta el doble del SLA', 'Del doble a 5 veces el SLA', 'Más de 5 veces el SLA',
  'Sin iniciar y ya fuera de plazo', 'Sin iniciar, aún en plazo', 'Cerrada sin pasar por En curso', 'Prioridad sin SLA'];

const DAY = 1440;
export const ACTIVE_DAYS = 60;   // para la media por persona: quien ha tenido actividad en estos días

const quant = (arr, p) => { if (!arr.length) return null; const a = Float64Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.floor(a.length * p))]; };
const mean = (arr) => { if (!arr.length) return null; let t = 0; for (const x of arr) t += x; return t / arr.length; };
export const share = (list, test) => { if (!list.length) return 0; let n = 0; for (const i of list) if (test(i)) n++; return n / list.length; };

export const createModel = (data) => {
  const { cols: C, dict: DI, meta } = data;
  const N = meta.rows, BASE = Date.UTC(meta.year, 0, 1), SNAP = meta.snapshot;
  const LASTM = new Date(BASE + SNAP * 6e4).getUTCMonth();
  const CRIT = DI.prio.indexOf('CRITICAL'), HIGH = DI.prio.indexOf('HIGH');
  const SLA = DI.prio.map((p) => SLA_MINUTES[p] ?? -1);
  // las prioridades de más a menos urgente y su SLA de inicio («Crítica · 15 min»)
  const PRIOS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((p) => DI.prio.indexOf(p)).filter((k) => k > 0);
  const slaLabel = (p) => `${nice(DI.prio[p])} · ${SLA[p] < 60 ? `${SLA[p]} min` : `${SLA[p] / 60} h`}`;
  const OPEN_ST = new Set(['ASSIGNED', 'IN_PROGRESS', 'PENDING'].map((s) => DI.status.indexOf(s)));
  const [ASSIGNED, IN_PROGRESS] = ['ASSIGNED', 'IN_PROGRESS'].map((x) => DI.status.indexOf(x));
  const VENDOR = DI.reason.indexOf(VENDOR_REASON), CLIENT = CLIENT_REASONS.map((r) => DI.reason.indexOf(r)).filter((k) => k > 0);
  const situation = (i) => {
    if (!OPEN[i]) return 6;
    if (C.st[i] === IN_PROGRESS) return 0;
    if (C.st[i] === ASSIGNED) return C.fr[i] < 0 && !C.vt[i] ? 1 : 2;
    return C.rs[i] === VENDOR ? 3 : CLIENT.includes(C.rs[i]) ? 4 : 5;
  };
  const shiftType = typeOf(weekendOf(BASE));   // tipo del turno de un instante (shifts.js): 0–2 laborables, 3–5 fin de semana

  // --- lo que se deriva de cada issue
  const MONTH = new Uint8Array(N), DOW = new Uint8Array(N), HOUR = new Uint8Array(N), TTR = new Int32Array(N), TB = new Uint8Array(N), OPEN = new Uint8Array(N), TEAM = new Uint8Array(N);
  const SLOT = new Int32Array(N), STYPE = new Uint8Array(N);   // el turno en que entra y su tipo
  for (let i = 0; i < N; i++) {
    const d = new Date(BASE + C.rep[i] * 6e4);
    MONTH[i] = d.getUTCMonth(); DOW[i] = (d.getUTCDay() + 6) % 7; HOUR[i] = d.getUTCHours();
    SLOT[i] = slotOf(C.rep[i]); STYPE[i] = shiftType(SLOT[i]);
    TTR[i] = C.res[i] >= 0 ? Math.max(C.res[i] - C.rep[i], 0) : -1;
    TB[i] = TTR[i] < 0 ? 8 : TTR_LIMITS.findIndex((l) => TTR[i] < l);
    OPEN[i] = OPEN_ST.has(C.st[i]) ? 1 : 0;
    TEAM[i] = data.company[C.as[i]];
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
    tj: { name: 'Tarjeta', multi: true, label: (k) => CARDS[k],
      get: (i) => { const o = []; if (C.sc[i] === SCOPE.SGA) o.push(0); if (C.sc[i] === SCOPE.SISU) o.push(1); if (C.fl[i] & PRIO) o.push(2); return o.length ? o : [3]; } },
    sit: { name: 'Situación', get: situation, label: (k) => SITUATIONS[k] },
    es: { name: 'Escalada', get: (i) => (C.vt[i] ? 1 : 0), label: (k) => (k ? 'Con ticket de tercero' : 'Sin ticket de tercero') },
    tu: { name: 'Turno', get: (i) => STYPE[i] % 3, label: (k) => `${SHIFTS[k]} (${SHIFT_HOURS[k]})` },
    we: { name: 'Días', get: (i) => (STYPE[i] < 3 ? 0 : 1), label: (k) => DAYS[k] },
    age: { name: 'Antigüedad', get: (i) => AGE_LIMITS.findIndex((l) => SNAP - C.rep[i] < l), label: (k) => AGE_NAMES[k] },
    tb: { name: 'Tiempo de resolución', get: (i) => TB[i], label: (k) => TTR_NAMES[k] },
    de: { name: 'Problema', get: (i) => C.de[i], label: (k) => DI.problem[k] || '(título sin descripción del problema)' },
    th: { name: 'Tema', multi: true, label: (k) => data.themes[k] || 'Sin tema detectado',
      get: (i) => { const t = C.th[i], o = []; if (!t) return [data.themes.length]; for (let j = 0; j < data.themes.length; j++) if (t >> j & 1) o.push(j); return o; } },
    // el primero de sus temas (van de más concreto a más general: «cancelar pedido» es Cancelar, no Pedidos), para
    // que cada issue cuente en uno solo y los temas sumen el total
    tp: { name: 'Tema', label: (k) => data.themes[k] || 'Sin tema detectado',
      get: (i) => { const t = C.th[i]; return t ? 31 - Math.clz32(t & -t) : data.themes.length; } },
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

  // --- qué se mira: un lado, A, y si se quiere comparar, otro, B (de partida, solo nuestro equipo). Cada lado
  // es una empresa ({ company }) o un grupo de personas ({ people: Set }). Las personas mandan
  // sobre las empresas: quien está en un grupo no cuenta en la empresa del otro lado, que pasa a
  // ser «Resto de …». SIDE[i]: el lado de cada issue (0 A, 1 B, 2 ninguno; las de ninguno no se ven).
  // --- filtros. S.f: dimensión → valores marcados. Una fila cuenta en un gráfico si pasa todos
  // los filtros salvo el de la propia dimensión.
  const S = { f: {}, from: 0, to: LASTM, q: '', sides: [{ company: 0 }, null] };
  const SIDE = new Uint8Array(N);
  const CO = () => (S.sides[1] ? [0, 1] : [0]);
  const CMP = () => !!S.sides[1];
  const sideName = (k) => {
    const s = S.sides[k], o = S.sides[1 - k];
    if (!s) return '';
    if (s.people) {
      const n = s.people.size;
      if (n === 1) return DIMS.as.label([...s.people][0]);
      return `${n} personas`;
    }
    return o?.people && [...o.people].some((p) => data.company[p] === s.company) ? `Resto de ${COMPANIES[s.company]}` : COMPANIES[s.company];
  };
  const NAMES = () => [sideName(0), sideName(1)];
  const sideOf = (i) => {
    const [a, b] = S.sides, p = C.as[i];
    if (a.people?.has(p)) return 0;
    if (b?.people?.has(p)) return 1;
    if (a.company === TEAM[i]) return 0;
    if (b?.company === TEAM[i]) return 1;
    return 2;
  };
  // bit 28: fuera del periodo; bit 29: fuera de los dos lados; bit 30: fuera de la búsqueda; el resto, un bit por filtro
  const OUT_PERIOD = 1 << 28, OUT_SIDE = 1 << 29, OUT = 1 << 30;
  let MASK = new Uint32Array(N), ACTIVE = [], CACHE = {};
  const refilter = () => {
    ACTIVE = Object.keys(S.f).filter((k) => S.f[k].size);
    const q = S.q.trim().toLowerCase();
    for (let i = 0; i < N; i++) {
      let m = 0;
      SIDE[i] = sideOf(i);
      if (SIDE[i] === 2) m |= OUT_SIDE;
      if (MONTH[i] < S.from || MONTH[i] > S.to) m |= OUT_PERIOD;
      if (q && !C.su[i].toLowerCase().includes(q) && !`inc${String(C.id[i]).padStart(12, '0')}`.includes(q)) m |= OUT;
      for (let a = 0; a < ACTIVE.length; a++) {
        const dm = DIMS[ACTIVE[a]], set = S.f[ACTIVE[a]], v = dm.get(i);
        if (dm.multi ? !v.some((x) => set.has(x)) : !set.has(v)) m |= 1 << a;
      }
      MASK[i] = m;
    }
    CACHE = {};
  };
  // las que pasan los filtros, sean del lado que sean (para elegir personas)
  const pool = () => {
    if (CACHE.pool) return CACHE.pool;
    const out = [];
    for (let i = 0; i < N; i++) if (!(MASK[i] & ~OUT_SIDE)) out.push(i);
    return (CACHE.pool = out);
  };
  // la foto de hoy: las que pasan los filtros sea cual sea su mes de apertura; con anySide, también las de
  // ningún lado (para lo que aún no tiene responsable)
  const today = (anySide = false) => {
    const key = anySide ? 'today*' : 'today';
    if (CACHE[key]) return CACHE[key];
    const allow = OUT_PERIOD | (anySide ? OUT_SIDE : 0), out = [];
    for (let i = 0; i < N; i++) if (!(MASK[i] & ~allow)) out.push(i);
    return (CACHE[key] = out);
  };
  // filas que pasan los filtros (sin contar el de la dimensión `skip`, si se indica)
  const rows = (skip) => {
    const a = ACTIVE.indexOf(skip), key = a < 0 ? '*' : skip;
    if (CACHE[key]) return CACHE[key];
    const allow = a < 0 ? 0 : 1 << a, out = [];
    for (let i = 0; i < N; i++) if (!(MASK[i] & ~allow)) out.push(i);
    return (CACHE[key] = out);
  };
  // Al comparar con alguna persona, el volumen de cada lado es la media por persona (perHead). Cuentan las personas
  // del lado con actividad (una de sus issues se abre, empieza o resuelve) en los ACTIVE_DAYS días antes del final
  // del periodo, o de la foto si es antes: así no cuenta quien ya no está, aunque haya trabajado poco sí.
  const heads = (k) => {
    const key = `heads${k}`;
    if (CACHE[key]) return CACHE[key];
    const end = Math.min(SNAP, Date.UTC(meta.year, S.to + 1, 1) / 6e4 - BASE / 6e4), from = end - ACTIVE_DAYS * DAY, out = new Set();
    const near = (t) => t >= from && t <= end;
    for (let i = 0; i < N; i++) {
      if (SIDE[i] !== k || !C.as[i] || out.has(C.as[i])) continue;
      if (near(C.rep[i]) || (C.ip[i] >= 0 && near(C.rep[i] + C.ip[i])) || (C.res[i] >= 0 && near(C.res[i]))) out.add(C.as[i]);
    }
    return (CACHE[key] = out);
  };
  const perHead = () => CMP() && S.sides.some((s) => s?.people);
  const toggle = (dim, k) => { const s = S.f[dim] || (S.f[dim] = new Set()); if (s.has(k)) s.delete(k); else s.add(k); };
  const isSel = (dim, k) => !!S.f[dim]?.has(k);

  // --- agregación
  const group = (dim, list, keep) => {
    const dm = DIMS[dim], m = new Map();
    const add = (k, i) => { let g = m.get(k); if (!g) m.set(k, g = { k, n: 0, t: [0, 0, 0], rows: keep ? [] : null }); g.n++; g.t[SIDE[i]]++; if (keep) g.rows.push(i); };
    for (const i of list || rows(dim)) { const v = dm.get(i); if (dm.multi) for (const k of v) add(k, i); else add(v, i); }
    return [...m.values()].sort((a, b) => b.n - a.n);
  };
  const bySide = (list) => { const t = [[], [], []]; for (const i of list) t[SIDE[i]].push(i); return t; };
  const byMonth = (list) => { const a = new Array(12).fill(0); for (const i of list) a[MONTH[i]]++; return a; };
  // últimos 90 días de la foto frente a los 90 anteriores
  // día de la semana (0 = lunes) y hora de un instante
  const clock = (min) => { const d = new Date(BASE + min * 6e4); return [(d.getUTCDay() + 6) % 7, d.getUTCHours()]; };
  // los turnos de cada tipo que caben en el periodo (hasta la foto), para las medias por turno
  const periodSlots = () => slotsIn(Date.UTC(meta.year, S.from, 1) / 6e4 - BASE / 6e4, Math.min(Date.UTC(meta.year, S.to + 1, 1) / 6e4 - BASE / 6e4, SNAP), shiftType);
  const trend = (list) => { let now = 0, prev = 0; for (const i of list) { const age = SNAP - C.rep[i]; if (age < 90 * DAY) now++; else if (age < 180 * DAY) prev++; } return { now, prev }; };

  // Indicadores de un grupo de issues. Tiempos en minutos; proporciones de 0 a 1.
  const stats = (list) => {
    const ttr = [], fr = [], ip = [];
    let crit = 0, hi = 0, vend = 0, pend = 0, reop = 0, bounce = 0, open = 0, open30 = 0, d1 = 0, h4 = 0, d3 = 0, f30 = 0, f120 = 0;
    let noCat = 0, noDesc = 0, noRes = 0, done = 0, slaOk = 0, slaKo = 0, noIp = 0, waitKo = 0;
    let doneSla = 0, doneSlaOk = 0, doneIa = 0, started = 0, sameShift = 0, resSameShift = 0;
    const time = [0, 0, 0, 0, 0], t = [0, 0, 0], prio = new Array(DI.prio.length).fill(0), days = new Set(), inDays = new Set();
    for (const i of list) {
      if (TTR[i] >= 0) {
        ttr.push(TTR[i]); if (TTR[i] < DAY) d1++; if (TTR[i] < 240) h4++; if (TTR[i] < 3 * DAY) d3++;
        // de las resueltas: si empezaron dentro del SLA, si llevan marca de IA y qué días se resolvieron
        if (SLA[C.pr[i]] >= 0) { doneSla++; if (C.ip[i] >= 0 && C.ip[i] <= SLA[C.pr[i]]) doneSlaOk++; }
        if (C.fl[i] & IA_MARKS) doneIa++;
        if (slotOf(C.res[i]) === SLOT[i]) resSameShift++;
        days.add(Math.floor(C.res[i] / DAY));
      }
      prio[C.pr[i]]++;
      inDays.add(Math.floor(C.rep[i] / DAY));
      if (C.fr[i] >= 0) { fr.push(C.fr[i]); if (C.fr[i] < 30) f30++; if (C.fr[i] < 120) f120++; }
      if (OPEN[i]) { open++; if (SNAP - C.rep[i] > 30 * DAY) open30++; } else { done++; if (C.fl[i] & NO_RESOLUTION) noRes++; }
      if (!C.k3[i]) noCat++;
      if (!C.de[i]) noDesc++;
      if (C.pr[i] === CRIT) crit++; else if (C.pr[i] === HIGH) hi++;
      if (C.vt[i]) vend++;
      if (C.np[i]) pend++;
      if (C.fl[i] & REOPENED) reop++;
      if (C.nb[i]) bounce++;
      // SLA de inicio: iniciada a tiempo, tarde, sin iniciar y fuera de plazo, o cerrada sin pasar por En curso
      const lim = SLA[C.pr[i]];
      if (C.ip[i] >= 0) {
        ip.push(C.ip[i]); started++; if (slotOf(C.rep[i] + C.ip[i]) === SLOT[i]) sameShift++;
        if (lim >= 0) { if (C.ip[i] <= lim) slaOk++; else slaKo++; }
      }
      else if (!OPEN[i]) noIp++;
      else if (lim >= 0 && SNAP - C.rep[i] > lim) { slaKo++; waitKo++; }
      time[0] += C.tA[i]; time[1] += C.tI[i]; time[2] += C.tPc[i]; time[3] += C.tPv[i]; time[4] += C.tPo[i];
      t[SIDE[i]]++;
    }
    const n = list.length || 1, R = ttr.length || 1, F = fr.length || 1;
    return {
      n: list.length, t, open, open30, resolved: ttr.length,
      avg: mean(ttr), p90: quant(ttr, 0.9), d1: ttr.length ? d1 / ttr.length : 0, h4: h4 / R, d3: d3 / R,
      fr: mean(fr), f30: f30 / F, f120: f120 / F,
      sla: slaOk + slaKo ? slaOk / (slaOk + slaKo) : null, slaKo, waitKo, noIp: noIp / n, ip: mean(ip), ip90: quant(ip, 0.9),
      crit: crit / n, hi: hi / n, vend: vend / n, pend: pend / n, reop: reop / n, bounce: bounce / n,
      noCat: noCat / n, noDesc: noDesc / n, noRes: noRes / (done || 1), time,
      prio,                                                  // cuántas de cada prioridad (por índice de DI.prio)
      slaDone: doneSla ? doneSlaOk / doneSla : null, slaDoneOk: doneSlaOk,   // de las resueltas, las que empezaron en plazo
      perDay: days.size ? ttr.length / days.size : null,     // resueltas por día, en los días en que se resolvió alguna
      inPerDay: inDays.size ? list.length / inDays.size : null,   // entradas por día, en los días en que entró alguna
      ia: doneIa,                                            // resueltas con alguna marca de IA
      inShift: started ? sameShift / started : null,         // de las que se empezaron, las empezadas en el turno en que entraron
      resInShift: ttr.length ? resSameShift / ttr.length : null,   // de las resueltas, las resueltas en el turno en que entraron
    };
  };

  return {
    data, C, DI, N, BASE, SNAP, LASTM, SLA, PRIOS, slaLabel, MONTH, DOW, HOUR, OPEN, TEAM, SIDE, DIMS, S, STYPE,
    CMP, CO, NAMES, refilter, rows, pool, today, toggle, isSel, group, bySide, byMonth, trend, stats, periodSlots, clock,
    heads, perHead, carry: (list) => carry(list, C, shiftType), shiftWork: (list) => shiftWork(list, C, (i) => OPEN[i], shiftType),
  };
};
