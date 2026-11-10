// Las Métricas en memoria (sin DOM): los datos que calcula el bridge
// (server/metrics/dataset.js), lo que se deriva de cada issue, los filtros
// y los indicadores de cualquier grupo de issues.
import { MONTHS, DOWS, nice, title, dur } from './format.js';
import { SHIFTS, SHIFT_HOURS, DAYS, slotOf, weekendOf, typeOf, slotsIn, carry, shiftWork } from './shifts.js';
import { IA_MARKS, IA_NAMES, iaKind } from './ia.js';

export const COMPANIES = ['Indra', 'T-Systems', 'Sin asignar / fuera'];
// ámbitos (server/metrics/remedy.js, SCOPE): los filtros de Remedy con los que el equipo de Indra ve su backlog
export const SCOPE = { OUT: 0, SGA: 1, SISU: 2, REQUEST: 3 };
// de quién son esas búsquedas: lo que cae en ellas (SGA, SISU o PRIO) y no tiene técnico es de Indra (TEAM): cuenta
// en su lado en todas las pestañas, como en Equipo soporte
export const SEARCH_OWNER = 0;
// Marcas de una issue: los bits de server/metrics/remedy.js (FLAG). Las de IA, en ia.js.
export const MAJOR = 256;
const PRIO = 2, NO_RESOLUTION = 32768;
export const REOPENED = 512;
// escalada (#48): ha estado en Pendiente con motivo Third Party Vendor Action Reqd, tenga o no ticket
export const THIRD_PARTY = 131072;
// cerrada en Remedy con su Jira aún abierto: sin Tesc (server/metrics/escalation.js, jiraOpen)
export const JIRA_OPEN = 524288;
export const isEscalated = (C, i) => (C.fl[i] & THIRD_PARTY) !== 0;
// mal escalada: algún Jira suyo se descartó o pasó de un equipo a otro (server/metrics/escalation.js, misrouted)
export const MISROUTED = 2097152, JIRA_DISCARDED = 4194304, JIRA_MOVED = 8388608;
// SISU o SGA, por el módulo (como lo reparte el equipo): estos módulos son de SISU; el resto, de SGA. Es otra cosa que
// las tarjetas (CARDS), que salen de los filtros de Remedy.
export const SISU_MODULES = new Set(['PACKING', 'ORDERS', 'DEVOLUCION PRODUCTO', 'SORTING', 'INBOUND', 'STOCK', 'WAVES', 'PERFORMANCE', 'PICKING', 'SISU']);
const SYSTEMS = ['SISU', 'SGA'];
// Tarjetas: como reconoce el equipo su trabajo. SGA y SISU, por los filtros de Remedy (ámbito); PRIO, por la
// etiqueta de priorizada por negocio, que va además de su SGA o SISU. 3: sin tarjeta.
export const CARDS = ['SGA', 'SISU', 'PRIO', 'Sin tarjeta'];

// Situación de cada issue, como la mira el equipo: abierta en curso; en Asignada sin tocar (ningún cambio de
// estado desde que se abrió ni ticket de tercero) o devuelta a Asignada (ya se trabajó antes); en espera
// (Pendiente) de un tercero, del cliente o por otro motivo; o cerrada.
// Los motivos que son esperar a un tercero o al cliente vienen con los datos (server/metrics/states.js).
export const SITUATIONS = ['En curso', 'Sin tocar', 'Devuelta a Asignada', 'Espera tercero', 'Espera cliente', 'Espera otro motivo', 'Cerrada'];

// Tramos de tiempo de resolución y de antigüedad (minutos).
const TTR_NAMES = ['< 1 h', '1–4 h', '4–8 h', '8–24 h', '24–72 h', '72–168 h', '168–720 h', '> 720 h', 'Sin resolver'];
const TTR_LIMITS = [60, 240, 480, 1440, 4320, 10080, 43200, Infinity];
// la antigüedad, en los tramos con que la mira el equipo
const AGE_NAMES = ['1–5 días', '6–10 días', '11–15 días', '16–30 días', '> 30 días'];
const AGE_LIMITS = [6, 11, 16, 31, Infinity].map((d) => d * 1440);

// SLA de inicio: de la apertura al primer paso a En curso, por prioridad.
const SLA_MINUTES = { CRITICAL: 15, HIGH: 45, MEDIUM: 120, LOW: 480 };
const slaDur = dur;
// «crítica 0,25 h, alta 0,75 h, media 2 h, baja 8 h», para los textos que explican el SLA
export const slaText = () => Object.entries(SLA_MINUTES).map(([p, m]) => `${nice(p).toLowerCase()} ${slaDur(m)}`).join(', ');
const SLA_NAMES = ['Dentro del SLA', 'Hasta el doble del SLA', 'Del doble a 5 veces el SLA', 'Más de 5 veces el SLA',
  'Sin iniciar y ya fuera de plazo', 'Sin iniciar, aún en plazo', 'Cerrada sin pasar por En curso', 'Prioridad sin SLA'];

// Cuándo pasa a En curso, en tramos que caen justo en los plazos del SLA (15 min, 45 min, 2 h y 8 h): lo dentro del
// plazo de una prioridad son los tramos hasta el suyo. Sin pasar a En curso: abierta (sin empezar) o ya cerrada.
const START_NAMES = ['≤ 0,25 h', '0,25–0,75 h', '0,75–2 h', '2–8 h', '8–24 h', '24–168 h', '> 168 h', 'Sin empezar', 'Cerrada sin En curso'];
export const START_LIMITS = [15, 45, 120, 480, 1440, 10080, Infinity];
// Calidad del trabajo y del registro: lo que se marca de cada issue (puede tener varias o ninguna).
const QUALITY_NAMES = ['Reabierta', 'Devuelta a cola', 'Cerrada sin pasar por En curso', 'Escalada sin pasar por Pendiente',
  'Sin tipología', 'Título sin descripción', 'Cerrada sin texto de resolución', 'Ninguna'];

const DAY = 1440;
export const ACTIVE_DAYS = 30;   // el equipo de una empresa, comparando con personas: quien ha tenido actividad en estos días antes del final del periodo

const quant = (arr, p) => { if (!arr.length) return null; const a = Float64Array.from(arr).sort(); return a[Math.min(a.length - 1, Math.floor(a.length * p))]; };
const mean = (arr) => { if (!arr.length) return null; let t = 0; for (const x of arr) t += x; return t / arr.length; };
export const share = (list, test) => { if (!list.length) return 0; let n = 0; for (const i of list) if (test(i)) n++; return n / list.length; };

export const createModel = (data) => {
  const { cols: C, dict: DI, meta } = data;
  const N = meta.rows, BASE = Date.UTC(meta.start, 0, 1), SNAP = meta.snapshot;
  // Los meses se numeran desde el enero del año en que empiezan los datos: 0 es ese enero, 12 el siguiente…
  const monthOf = (d) => (d.getUTCFullYear() - meta.start) * 12 + d.getUTCMonth();
  const monthAt = (minutes) => monthOf(new Date(BASE + minutes * 6e4));   // el mes de un instante (minutos desde BASE)
  const LASTM = monthAt(SNAP);
  // con datos de más de un año, los meses llevan su año («ene 2027»)
  const monthName = (k) => (LASTM >= 12 ? `${MONTHS[k % 12]} ${meta.start + Math.floor(k / 12)}` : MONTHS[k]);
  // minutos del día `d` del mes `k` (desde BASE), y el nombre de un día («3 ene», con año si hay más de uno)
  const minuteOf = (k, d = 1) => (Date.UTC(meta.start, k, d) - BASE) / 6e4;
  const dayName = (min) => { const d = new Date(BASE + min * 6e4); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}${LASTM >= 12 ? ` ${d.getUTCFullYear()}` : ''}`; };
  // Lo cargado, por días completos: del primer día con issues (MIN_D) al día de la foto, incluido (END_D, excluido).
  const MIN_D = Math.floor(meta.first / DAY) * DAY, END_D = (Math.floor(SNAP / DAY) + 1) * DAY;
  // El periodo con el que abren las vistas (resetPeriod): el año fiscal en curso, del 1 de febrero (el último que no pase
  // del mes de la foto), o del primer día con issues, hasta la foto. Los meses k cuentan desde enero de meta.start.
  const FISCAL_M = LASTM - (((LASTM - 1) % 12) + 12) % 12;
  const START_D = Math.max(MIN_D, minuteOf(FISCAL_M));
  const CRIT = DI.prio.indexOf('CRITICAL');
  const SLA = DI.prio.map((p) => SLA_MINUTES[p] ?? -1);
  // las prioridades de más a menos urgente y su SLA de inicio («Crítica · 0,25 h»)
  const PRIOS = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((p) => DI.prio.indexOf(p)).filter((k) => k > 0);
  const slaLabel = (p) => `${nice(DI.prio[p])} · ${slaDur(SLA[p])}`;
  const OPEN_ST = new Set(['ASSIGNED', 'IN_PROGRESS', 'PENDING'].map((s) => DI.status.indexOf(s)));
  const [ASSIGNED, IN_PROGRESS] = ['ASSIGNED', 'IN_PROGRESS'].map((x) => DI.status.indexOf(x));
  const reasonKeys = (codes) => codes.map((r) => DI.reason.indexOf(r)).filter((k) => k > 0);
  const VENDOR = reasonKeys(data.reasons.vendor), CLIENT = reasonKeys(data.reasons.client);
  const situation = (i) => {
    if (!OPEN[i]) return 6;
    if (C.st[i] === IN_PROGRESS) return 0;
    if (C.st[i] === ASSIGNED) return C.fr[i] < 0 && !C.vt[i] ? 1 : 2;
    return VENDOR.includes(C.rs[i]) ? 3 : CLIENT.includes(C.rs[i]) ? 4 : 5;
  };
  const shiftType = typeOf(weekendOf(BASE));   // tipo del turno de un instante (shifts.js): 0–2 laborables, 3–5 fin de semana

  // --- lo que se deriva de cada issue
  const MONTH = new Uint16Array(N), DOW = new Uint8Array(N), HOUR = new Uint8Array(N), TTR = new Int32Array(N), TB = new Uint8Array(N), OPEN = new Uint8Array(N), TEAM = new Uint8Array(N);
  const SLOT = new Int32Array(N), STYPE = new Uint8Array(N);   // el turno en que entra y su tipo
  for (let i = 0; i < N; i++) {
    const d = new Date(BASE + C.rep[i] * 6e4);
    MONTH[i] = monthOf(d); DOW[i] = (d.getUTCDay() + 6) % 7; HOUR[i] = d.getUTCHours();
    SLOT[i] = slotOf(C.rep[i]); STYPE[i] = shiftType(SLOT[i]);
    TTR[i] = C.res[i] >= 0 ? Math.max(C.res[i] - C.rep[i], 0) : -1;
    TB[i] = TTR[i] < 0 ? 8 : TTR_LIMITS.findIndex((l) => TTR[i] < l);
    OPEN[i] = OPEN_ST.has(C.st[i]) ? 1 : 0;
    // la empresa de su técnico; sin técnico, la de las búsquedas si cae en ellas (SEARCH_OWNER) y, si no, ninguna
    TEAM[i] = C.as[i] || !(C.sc[i] === SCOPE.SGA || C.sc[i] === SCOPE.SISU || C.fl[i] & PRIO) ? data.company[C.as[i]] : SEARCH_OWNER;
  }

  // --- dimensiones: por las que se agrupa y se filtra
  const dictDim = (name, col, dict, fmt = nice) => ({ name, get: (i) => C[col][i], label: (k) => fmt(DI[dict][k]) });
  const DIMS = {
    month: { name: 'Mes', get: (i) => MONTH[i], label: monthName },
    pr: dictDim('Prioridad', 'pr', 'prio'),
    sv: dictDim('Tipo de servicio', 'sv', 'svc'),
    as: { name: 'Responsable', get: (i) => C.as[i], label: (k) => (k ? DI.person[k] : '(sin responsable)') },
    ce: dictDim('Centro', 'ce', 'centre', (s) => s || '(sin centro)'),
    op: dictDim('Tipo de operación', 'op', 'op'),
    mo: dictDim('Módulo / sistema', 'mo', 'module', (s) => s || '(sin módulo)'),
    k3: dictDim('Tipología (categorización 3)', 'k3', 'cat', (s) => (s ? title(s) : '(sin tipología)')),
    vt: dictDim('Ticket de tercero (prefijo)', 'vt', 'vtype', (s) => (s === '' ? '(sin ticket de tercero)' : s === 'JIRA' ? 'Clave Jira sin prefijo' : s === 'OTRO' ? 'Otro texto' : s)),
    vp: dictDim('Proyecto Jira', 'vp', 'vproj', (s) => s || '(sin clave Jira)'),
    vk: dictDim('Ticket Jira', 'vk', 'vkey', (s) => s || '(sin clave Jira)'),
    rz: dictDim('Resolución (texto)', 'rz', 'resol', (s) => s || '(texto único o vacío)'),
    dow: { name: 'Día de la semana', get: (i) => DOW[i], label: (k) => DOWS[k] },
    hour: { name: 'Hora', get: (i) => HOUR[i], label: (k) => `${k} h` },
    tj: { name: 'Tarjeta', multi: true, label: (k) => CARDS[k],
      get: (i) => { const o = []; if (C.sc[i] === SCOPE.SGA) o.push(0); if (C.sc[i] === SCOPE.SISU) o.push(1); if (C.fl[i] & PRIO) o.push(2); return o.length ? o : [3]; } },
    sit: { name: 'Situación', get: situation, label: (k) => SITUATIONS[k] },
    es: { name: 'Escalada', get: (i) => (isEscalated(C, i) ? 1 : 0), label: (k) => (k ? 'Escalada a un tercero' : 'Sin escalar') },
    ss: { name: 'SISU o SGA', get: (i) => (SISU_MODULES.has(DI.module[C.mo[i]]) ? 0 : 1), label: (k) => SYSTEMS[k] },
    mx: { name: 'Mal escalada', get: (i) => (C.fl[i] & MISROUTED ? 1 : 0), label: (k) => (k ? 'Mal escalada (Jira descartado o de un equipo a otro)' : 'No mal escalada') },
    tu: { name: 'Turno', get: (i) => STYPE[i] % 3, label: (k) => `${SHIFTS[k]} (${SHIFT_HOURS[k]})` },
    we: { name: 'Días', get: (i) => (STYPE[i] < 3 ? 0 : 1), label: (k) => DAYS[k] },
    age: { name: 'Antigüedad', get: (i) => AGE_LIMITS.findIndex((l) => SNAP - C.rep[i] < l), label: (k) => AGE_NAMES[k] },
    tb: { name: 'Tiempo de resolución', get: (i) => TB[i], label: (k) => TTR_NAMES[k] },
    de: { name: 'Problema', get: (i) => C.de[i], label: (k) => DI.problem[k] || '(título sin descripción del problema)' },
    // el problema común (server/metrics/problems.js: por el título y la descripción del centro; 0, sin clasificar)
    pc: { name: 'Problema común', get: (i) => C.pc?.[i] ?? 0, label: (k) => data.problems?.[k] || 'Sin clasificar' },
    th: { name: 'Tema', multi: true, label: (k) => data.themes[k] || 'Sin tema detectado',
      get: (i) => { const t = C.th[i], o = []; if (!t) return [data.themes.length]; for (let j = 0; j < data.themes.length; j++) if (t >> j & 1) o.push(j); return o; } },
    // el primero de sus temas (van de más concreto a más general: «cancelar pedido» es Cancelar, no Pedidos), para
    // que cada issue cuente en uno solo y los temas sumen el total
    tp: { name: 'Tema', label: (k) => data.themes[k] || 'Sin tema detectado',
      get: (i) => { const t = C.th[i]; return t ? 31 - Math.clz32(t & -t) : data.themes.length; } },
    ini: { name: 'Paso a En curso', label: (k) => START_NAMES[k], get: (i) => (C.ip[i] >= 0 ? START_LIMITS.findIndex((l) => C.ip[i] <= l) : OPEN[i] ? 7 : 8) },
    q: { name: 'Calidad y registro', multi: true, label: (k) => QUALITY_NAMES[k], get: (i) => {
      const o = [], done = !OPEN[i];
      if (C.fl[i] & REOPENED) o.push(0);
      if (C.nb[i]) o.push(1);
      if (done && C.ip[i] < 0) o.push(2);
      if (done && C.vt[i] && !C.np[i]) o.push(3);
      if (!C.k3[i]) o.push(4);
      if (!C.de[i]) o.push(5);
      if (done && C.fl[i] & NO_RESOLUTION) o.push(6);
      return o.length ? o : [7];
    } },
    ia: { name: 'Uso de IA', label: (k) => IA_NAMES[k], get: (i) => iaKind(C.fl[i]) },
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
  // es una empresa ({ company }) o un grupo de personas ({ people: Set }). SIDE[i]: el lado de cada issue (0 A, 1 B,
  // 2 ninguno; las de ninguno no se ven); las personas mandan sobre las empresas. Para las cifras, comparando con
  // personas, una empresa es todo su equipo, también quien está en el otro lado (bySide, heads).
  // --- filtros. S.f: dimensión → valores marcados. Una fila cuenta en un gráfico si pasa todos
  // los filtros salvo el de la propia dimensión.
  // El periodo, S.d0–S.d1 (minutos desde BASE, d1 excluido; sin elegir, todo lo cargado); S.from y S.to, los meses que toca.
  const S = { f: {}, d0: MIN_D, d1: END_D, from: monthAt(MIN_D), to: LASTM, q: '', sides: [{ company: 0 }, null] };
  const setPeriod = (d0, d1) => {
    S.d0 = Math.max(MIN_D, Math.min(d0, END_D - DAY));
    S.d1 = Math.min(END_D, Math.max(d1, S.d0 + DAY));
    S.from = monthAt(S.d0); S.to = monthAt(S.d1 - 1);
  };
  // un mes entero dentro del periodo y ya cerrado (el de la foto aún puede cambiar)
  const fullMonth = (k) => k < LASTM && minuteOf(k) >= S.d0 && minuteOf(k + 1) <= S.d1;
  const resetPeriod = () => setPeriod(START_D, END_D);
  const daily = () => S.d1 - S.d0 <= 31 * DAY;   // hasta un mes se ve día a día; más, mes a mes
  const inPeriod = (i) => C.rep[i] >= S.d0 && C.rep[i] < S.d1;
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
    return COMPANIES[s.company];
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
      if (!inPeriod(i)) m |= OUT_PERIOD;
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
  // ningún lado (para lo que aún no tiene responsable); sin contar el filtro de la dimensión `skip`, si se indica
  const today = (anySide = false, skip) => {
    const a = ACTIVE.indexOf(skip), key = `${anySide ? 'today*' : 'today'}${a < 0 ? '' : `:${skip}`}`;
    if (CACHE[key]) return CACHE[key];
    const allow = OUT_PERIOD | (anySide ? OUT_SIDE : 0) | (a < 0 ? 0 : 1 << a), out = [];
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
  // Comparando con alguna persona (perHead), una empresa es todo su equipo: sus personas con actividad (una de sus
  // issues se abre, empieza o resuelve) en los ACTIVE_DAYS días antes del final del periodo que se mira; también
  // quien está en el otro lado. Así una persona se compara con todo su equipo; no cuenta quien ya no
  // está, y sí quien trabaja poco. heads(k): las personas de cada lado (las elegidas, o ese equipo).
  const heads = (k) => {
    const s = S.sides[k], key = `heads${k}`;
    if (s.people) return s.people;
    if (CACHE[key]) return CACHE[key];
    const end = Math.min(S.d1, SNAP), from = end - ACTIVE_DAYS * DAY, out = new Set(), near = (t) => t >= from && t <= end;
    for (let i = 0; i < N; i++) {
      if (!C.as[i] || out.has(C.as[i]) || TEAM[i] !== s.company) continue;
      if (near(C.rep[i]) || (C.ip[i] >= 0 && near(C.rep[i] + C.ip[i])) || (C.res[i] >= 0 && near(C.res[i]))) out.add(C.as[i]);
    }
    return (CACHE[key] = out);
  };
  const perHead = () => CMP() && S.sides.some((s) => s?.people);
  // lo que da fn mirando solo el primer lado, como si no se comparara (para las pestañas que no comparan empresas)
  const alone = (fn) => {
    const b = S.sides[1];
    S.sides[1] = null; refilter();
    try { return fn(rows()); } finally { S.sides[1] = b; refilter(); }
  };
  const toggle = (dim, k) => { const s = S.f[dim] || (S.f[dim] = new Set()); if (s.has(k)) s.delete(k); else s.add(k); };
  const isSel = (dim, k) => !!S.f[dim]?.has(k);
  const anySel = (dim) => !!S.f[dim]?.size;   // si hay algún valor marcado en una dimensión

  // --- agregación
  const group = (dim, list, keep) => {
    const dm = DIMS[dim], m = new Map();
    const add = (k, i) => { let g = m.get(k); if (!g) m.set(k, g = { k, n: 0, t: [0, 0, 0], rows: keep ? [] : null }); g.n++; g.t[SIDE[i]]++; if (keep) g.rows.push(i); };
    for (const i of list || rows(dim)) { const v = dm.get(i); if (dm.multi) for (const k of v) add(k, i); else add(v, i); }
    return [...m.values()].sort((a, b) => b.n - a.n);
  };
  // las de cada lado; comparando con personas, el lado de una empresa es lo de su equipo (heads)
  const bySide = (list) => {
    const t = [[], [], []];
    for (const i of list) t[SIDE[i]].push(i);
    if (perHead()) for (const k of [0, 1]) if (!S.sides[k].people) { const H = heads(k); t[k] = list.filter((i) => TEAM[i] === S.sides[k].company && H.has(C.as[i])); }
    return t;
  };
  // día de la semana (0 = lunes) y hora de un instante
  const clock = (min) => { const d = new Date(BASE + min * 6e4); return [(d.getUTCDay() + 6) % 7, d.getUTCHours()]; };
  // los turnos de cada tipo que caben en el periodo (hasta la foto), para las medias por turno
  const periodSlots = () => slotsIn(S.d0, Math.min(S.d1, SNAP), shiftType);
  // últimos 90 días del periodo frente a los 90 anteriores
  const trend = (list) => { const end = Math.min(S.d1, SNAP); let now = 0, prev = 0; for (const i of list) { const age = end - C.rep[i]; if (age < 90 * DAY) now++; else if (age < 180 * DAY) prev++; } return { now, prev }; };

  // Indicadores de un grupo de issues. Tiempos en minutos; proporciones de 0 a 1.
  const stats = (list) => {
    const ttr = [], fr = [], ip = [];
    let w7 = 0, d7 = 0, d15 = 0, mx = null, crit = 0, vend = 0, reop = 0, bounce = 0, open = 0, d1 = 0;
    let noCat = 0, noDesc = 0, noRes = 0, done = 0, slaOk = 0, slaKo = 0, noIp = 0, waitKo = 0, escDone = 0, escNoPend = 0;
    let doneSla = 0, doneSlaOk = 0, doneIa = 0, started = 0, sameShift = 0, resSameShift = 0;
    const rt = [0, 0, 0, 0, 0], t = [0, 0, 0], prio = new Array(DI.prio.length).fill(0), days = new Set(), inDays = new Set();
    for (const i of list) {
      if (TTR[i] >= 0) {
        ttr.push(TTR[i]); if (TTR[i] < DAY) d1++; if (TTR[i] > 7 * DAY) w7++;
        if (TTR[i] >= DAY && TTR[i] <= 7 * DAY) d7++; else if (TTR[i] > 7 * DAY && TTR[i] <= 15 * DAY) d15++; if (mx == null || TTR[i] > mx) mx = TTR[i];
        rt[0] += C.tA[i]; rt[1] += C.tI[i]; rt[2] += C.tPc[i]; rt[3] += C.tPv[i]; rt[4] += C.tPo[i];
        // de las resueltas: si empezaron dentro del SLA, si llevan marca de IA y qué días se resolvieron
        if (SLA[C.pr[i]] >= 0) { doneSla++; if (C.ip[i] >= 0 && C.ip[i] <= SLA[C.pr[i]]) doneSlaOk++; }
        if (C.fl[i] & IA_MARKS) doneIa++;
        if (slotOf(C.res[i]) === SLOT[i]) resSameShift++;
        days.add(Math.floor(C.res[i] / DAY));
      }
      prio[C.pr[i]]++;
      inDays.add(Math.floor(C.rep[i] / DAY));
      if (C.fr[i] >= 0) fr.push(C.fr[i]);
      if (OPEN[i]) open++; else { done++; if (C.fl[i] & NO_RESOLUTION) noRes++; if (C.vt[i]) { escDone++; if (!C.np[i]) escNoPend++; } }
      if (!C.k3[i]) noCat++;
      if (!C.de[i]) noDesc++;
      if (C.pr[i] === CRIT) crit++;
      if (isEscalated(C, i)) vend++;
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
      t[SIDE[i]]++;
    }
    const n = list.length || 1, R = ttr.length || 1;
    return {
      n: list.length, t, open, resolved: ttr.length,
      avg: mean(ttr), p90: quant(ttr, 0.9), d1: ttr.length ? d1 / ttr.length : 0, w7: w7 / R, d7: d7 / R, d15: d15 / R, mx,
      fr: mean(fr),
      sla: slaOk + slaKo ? slaOk / (slaOk + slaKo) : null, slaKo, waitKo, ip: mean(ip),
      crit: crit / n, vend: vend / n, reop: reop / n, bounce: bounce / n,
      noCat: noCat / n, noDesc: noDesc / n, noRes: noRes / (done || 1), done,
      noIpDone: done ? noIp / done : null,                  // de las cerradas, las que no pasaron por En curso
      escNoPend: escDone ? escNoPend / escDone : null,       // de las cerradas escaladas, las que no pasaron por Pendiente
      rt,                                                    // el tiempo en cada estado, como time, solo de las resueltas
      prio,                                                  // cuántas de cada prioridad (por índice de DI.prio)
      slaDone: doneSla ? doneSlaOk / doneSla : null,         // de las resueltas, las que empezaron en plazo
      perDay: days.size ? ttr.length / days.size : null,     // resueltas por día, en los días en que se resolvió alguna
      inPerDay: inDays.size ? list.length / inDays.size : null,   // entradas por día, en los días en que entró alguna
      ia: doneIa,                                            // resueltas con alguna marca de IA
      inShift: started ? sameShift / started : null,         // de las que se empezaron, las empezadas en el turno en que entraron
      resInShift: ttr.length ? resSameShift / ttr.length : null,   // de las resueltas, las resueltas en el turno en que entraron
    };
  };

  return {
    data, C, DI, N, BASE, SNAP, LASTM, SLA, PRIOS, CRIT, slaLabel, monthAt, monthName, minuteOf, dayName, fullMonth, MIN_D, END_D, START_D, setPeriod, resetPeriod, daily, inPeriod, MONTH, DOW, OPEN, TEAM, SIDE, DIMS, S, STYPE,
    CMP, CO, NAMES, refilter, rows, pool, today, toggle, isSel, anySel, group, bySide, trend, stats, periodSlots, clock,
    heads, perHead, alone, carry: (list) => carry(list, C, shiftType), shiftWork: (list) => shiftWork(list, C, (i) => OPEN[i], shiftType),
  };
};
