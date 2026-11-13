// Exportar informe (#15; sin DOM): qué informes hay, de qué periodo sale cada uno y su cabecera. Se eligen en un
// desplegable desde los tres puntos de Métricas (metrics-modals.js, report) y se imprimen a PDF (print.js).
//
//   Backlog actual       solo lo abierto ahora (a fecha de la última carga, sea cual sea el periodo de arriba): la
//                        corona del Resumen y el resto de Foto de hoy, que es lo mismo sin repetirlo, con la sábana
//                        entera.
//   Resumen básico       un rango a mano dentro de lo cargado: los KPIs del periodo y la evolución del backlog del
//                        Resumen y, de la pestaña Histórico, lo que no repite (tabs/historico.js, inReport): sus
//                        bloques por pregunta y la evolución de lo recibido. Del pasado solo se sabe cuánto había
//                        abierto cada día, no en qué estado estaba: no lleva la corona.
//   Análisis de tiempos  la pestaña Análisis tiempos: en qué se va el tiempo, por módulo, por centro, los problemas
//                        comunes y la sábana; Actual (lo abierto ahora) o Histórico (lo resuelto de unas fechas).
//   Módulos y focos      la pestaña Módulos y focos: centros, módulos, quién lleva cada uno, los mapas de calor y los
//                        problemas; Actual (lo abierto ahora) o Histórico (lo recibido en unas fechas).
//   Escalados            la pestaña Escalados (tabs/escalados.js, inReport): Actual (Activas) o Histórico (lo
//                        escalado y resuelto de unas fechas).
//   Estado de SLAs       de unas fechas, los parámetros que se marquen (PARAMS): incidencias, % de resueltas, MTTR,
//                        calidad, atendidas en SLA y uso de la IA; también frente a T-Systems.
//   Equipo soporte       el panel de Equipo soporte (work/team.js) de unas fechas, de todo el equipo o de un técnico.
// En dos pestañas (AUDIENCES): solo de Indra o de Indra frente a T-Systems (todos menos Módulos y focos: reportsOf),
// sea lo que sea lo que se mira arriba; de SGA, de SISU o de los dos (SYSTEMS, dos casillas) y, en Análisis de tiempos y Módulos y focos, de los
// módulos y centros que se marquen (PICKS, dos listas de casillas): lo que se elige ahí manda sobre esos filtros de
// arriba; con los demás filtros de arriba.
import { esc } from '../ui/html.js';
import { dmy } from './format.js';
import { DAY } from './rules.js';

// Con qué datos sale cada informe: lo abierto ahora ('now') o lo de unas fechas ('dates').
export const MODES = [['now', 'Actual', 'Lo abierto ahora, a fecha de la última carga.'], ['dates', 'Histórico', 'Lo de las fechas que elijas.']];

// [clave, nombre, modos que admite (el primero, el de partida), lo que contiene (el texto de debajo del desplegable)]
export const REPORTS = [
  ['backlog', 'Backlog actual', ['now'], 'Lo abierto ahora, a fecha de la última carga: en qué estado está, en qué punto y qué conviene vigilar, el detalle por situación, prioridad, módulo, escalado y centro, quién tiene qué y la sábana con todas las incidencias abiertas.'],
  ['history', 'Resumen básico', ['dates'], 'Lo de las fechas que elijas, dentro de lo cargado: los KPIs del periodo (entrantes, MTTR, % dentro de SLA, %IQA y uso de la IA), la evolución del backlog, las cifras clave por pregunta (qué tenemos, módulos, resolución, SLA, IA y turnos) y la evolución de lo recibido, el SLA y la resolución.'],
  ['tiempos', 'Análisis de tiempos', ['now', 'dates'], 'En qué se va el tiempo, fase a fase (sin escalar y escalado), el tiempo por módulo y por centro, los problemas comunes que más nos ocupan y la sábana de las incidencias, de la que más tiempo lleva a la que menos. Actual: lo que llevan las abiertas hasta hoy. Histórico: lo resuelto de lo recibido en las fechas.'],
  ['modulos', 'Módulos y focos', ['now', 'dates'], 'Los centros y los módulos que concentran el trabajo, con su ficha (volumen, cómo se atiende, qué trae y lo abierto hoy), quién lleva cada módulo, los mapas de calor de centro, tema y prioridad por módulo y los problemas más repetidos. Actual: lo abierto ahora. Histórico: lo recibido en las fechas.'],
  ['escalados', 'Escalados', ['now', 'dates'], 'Qué escalamos y a quién: cuántas, sus tiempos (THesc, Tesc, total e IDMTTR), lo escalado por proyecto Jira, por módulo y por centro, los malos escalados (descartados en Jira o que cambiaron de equipo) y la sábana. Actual: lo escalado que sigue abierto. Histórico: lo escalado y resuelto de las fechas.'],
  ['slas', 'Estado de SLAs', ['dates'], 'Lo recibido en las fechas que elijas, en los parámetros que marques: arriba, las atendidas en SLA por SLA, módulo, centro y mes; las cifras del periodo; las incidencias por módulo, centro y mes; con el MTTR, en qué se va el tiempo y por módulo (como en Análisis tiempos); y la calidad y el uso de la IA por técnico. Comparando con T-Systems, con los dos.'],
  ['equipo', 'Equipo soporte', ['dates'], 'El equipo de soporte de Indra en las fechas que elijas: su actividad, volumen, pendientes, SLA de inicio, tiempos, calidad y uso de la IA, el equipo persona a persona y la sábana de sus incidencias. De todo el equipo o de un técnico.'],
];
const reportOf = (key) => REPORTS.find(([k]) => k === key) || REPORTS[0];
export const reportLabel = (key) => reportOf(key)[1];
// los modos de un informe; si tiene más de uno, la ventana deja elegir
export const modesOf = (key) => reportOf(key)[2];
// el modo con que sale: el elegido si el informe lo admite; si no, el suyo
export const modeOf = (key, mode) => (modesOf(key).includes(mode) ? mode : modesOf(key)[0]);
// si se hace con las fechas que se eligen o con lo de ahora
export const withDates = (key, mode) => modeOf(key, mode) === 'dates';

// Las pestañas de la ventana: [clave, nombre, los lados que se miran (model.js, S.sides: empresa 0, Indra; 1, T-Systems)].
export const AUDIENCES = [
  ['indra', 'Indra', [{ company: 0 }, null]],
  ['ts', 'Indra frente a T-Systems', [{ company: 0 }, { company: 1 }]],
];
const audienceOf = (key) => AUDIENCES.find(([k]) => k === key) || AUDIENCES[0];
// los lados de una pestaña, nuevos cada vez: la vista los cambia en su sitio
export const sidesOf = (audience) => audienceOf(audience)[2].map((s) => (s ? { ...s } : null));
// Los informes de cada pestaña: Módulos y focos, Escalados y Equipo soporte, solo de Indra.
const ONLY_INDRA = new Set(['modulos', 'escalados', 'equipo']);
export const reportsOf = (audience) => REPORTS.filter(([k]) => audience === 'indra' || !ONLY_INDRA.has(k));

// Las casillas de sistema: [clave, nombre, valor de la dimensión «SISU o SGA» (model.js, DIMS.ss: 0 SISU, 1 SGA)].
export const SYSTEMS = [['sga', 'SGA', 1], ['sisu', 'SISU', 0]];
const ALL_SYSTEMS = SYSTEMS.map(([k]) => k);
// Equipo soporte no lleva esas casillas: es el panel del equipo (work/team.js), que mira su trabajo entero (sus
// pendientes y lo que resuelven no pasan por los filtros); se filtra por técnico (withPerson).
const NO_SYSTEMS = new Set(['equipo']);
export const withSystems = (key) => !NO_SYSTEMS.has(key);
export const withPerson = (key) => key === 'equipo';
// El filtro de sistema del informe (S.f.ss) según las casillas marcadas (['sga', 'sisu']…): null con las dos (todo, sin
// ese filtro); un Set con el valor de la marcada; sin ninguna, no hay informe (reportRange da el error).
export const systemsFilter = (systems) => (systems.length >= SYSTEMS.length ? null
  : new Set(SYSTEMS.filter(([k]) => systems.includes(k)).map(([, , v]) => v)));
// «SGA y SISU», «Solo SGA»…: lo que lleva el informe, para la cabecera
export const systemsText = (systems) => {
  const on = SYSTEMS.filter(([k]) => systems.includes(k)).map(([, l]) => l);
  return on.length === SYSTEMS.length ? on.join(' y ') : `Solo ${on.join(' y ')}`;
};

// Las listas de casillas de los informes: [dimensión (model.js, DIMS), nombre, en singular]. Módulos y centros, en
// Análisis de tiempos y en Módulos y focos; los equipos de Jira (el proyecto Jira de lo escalado), en Escalados; el
// Backlog actual, el Resumen básico y Equipo soporte salen sin listas (con todo, o con los filtros de arriba).
export const PICKS = [['mo', 'Módulos', 'módulo'], ['ce', 'Centros', 'centro'], ['vp', 'Equipos de Jira', 'equipo de Jira']];
const PICKS_OF = { tiempos: ['mo', 'ce'], modulos: ['mo', 'ce'], escalados: ['vp'] };
export const picksOf = (key) => PICKS.filter(([dim]) => PICKS_OF[key]?.includes(dim));
// El filtro de una lista (S.f[dim]) según lo marcado: null con todo marcado (sin ese filtro); si no, un Set con lo marcado.
// all y picked: las claves (números).
export const pickedFilter = (all, picked) => (picked.length >= all.length ? null : new Set(picked));
// Lo que lleva una lista, para la cabecera: '' con todo (no hace falta decirlo); hasta 6, por su nombre; más, cuántos
// de cuántos y los primeros. names: clave → nombre.
export const pickedText = (all, picked, names) => {
  if (picked.length >= all.length) return '';
  const list = picked.map((k) => names(k));
  return list.length <= 6 ? list.join(', ') : `${list.length} de ${all.length}: ${list.slice(0, 6).join(', ')}…`;
};

// Los parámetros del Estado de SLAs, una casilla cada uno (todas marcadas de partida): [clave (tabs/resumen.js,
// slaState), nombre].
export const PARAMS = [['sla', 'Atendidas en SLA'], ['inc', 'Número de incidencias'], ['res', '% de resueltas'], ['mttr', 'MTTR'], ['iqa', 'Calidad (%IQA)'], ['ia', 'Uso de la IA']];
const ALL_PARAMS = PARAMS.map(([k]) => k);
export const withParams = (key) => key === 'slas';
// los marcados, para la cabecera: sus nombres, en su orden ('' con todos: no hace falta decirlo)
export const paramsText = (params) => (params.length >= PARAMS.length ? '' : PARAMS.filter(([k]) => params.includes(k)).map(([, l]) => l).join(', '));

const DAY_MS = 864e5;
const isoOf = (ms) => new Date(ms).toISOString().slice(0, 10);
// «2026-10-16» → ms de sus 00:00 UTC; null si no es una fecha real (2026-02-30)
const parseDay = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || '')) return null;
  const ms = Date.parse(`${s}T00:00:00Z`);
  return Number.isNaN(ms) || isoOf(ms) !== s ? null : ms;
};

// Los días que se pueden elegir con fechas: de lo cargado ({ min, max }, «AAAA-MM-DD», los dos incluidos).
// m: el modelo (model.js): del primer día cargado (MIN_D) al de la foto (END_D, excluido).
export const reportBounds = (m) => ({ min: isoOf(m.BASE + m.MIN_D * 6e4), max: isoOf(m.BASE + (m.END_D - DAY) * 6e4) });

// De qué periodo sale el informe: { range: [d0, d1) en minutos desde BASE } o { error }. Sin fechas, current (el de
// arriba, que no se usa para lo abierto ahora); con ellas, from y to («AAAA-MM-DD», los dos incluidos), dentro de bounds.
// picked: { dim → cuántas casillas marcadas } de sus listas (PICKS).
export const reportRange = ({ key, mode, current, from, to, bounds, base, systems = ALL_SYSTEMS, picked = {}, params = ALL_PARAMS }) => {
  if (withSystems(key) && !systems.length) return { error: 'Marca SGA, SISU o los dos.' };
  if (withParams(key) && !params.length) return { error: 'Marca al menos un parámetro.' };
  const empty = picksOf(key).find(([dim]) => picked[dim] === 0);
  if (empty) return { error: `Marca al menos un ${empty[2]}.` };
  if (!withDates(key, mode)) return { range: current };
  const a = parseDay(from), b = parseDay(to);
  if (a == null || b == null) return { error: 'Elige la fecha de inicio y la de fin.' };
  if (a > b) return { error: 'La fecha de fin no puede ser anterior a la de inicio.' };
  if (from < bounds.min || to > bounds.max) return { error: `Solo hay datos del ${dmy(parseDay(bounds.min))} al ${dmy(parseDay(bounds.max))}.` };
  return { range: [(a - base) / 6e4, (b + DAY_MS - base) / 6e4] };
};

// «01/10/2026 – 31/10/2026 · 31 días», de un rango [d0, d1) en minutos desde base
export const rangeText = ([d0, d1], base) => {
  const n = Math.round((d1 - d0) / DAY);
  return `${dmy(base + d0 * 6e4)} – ${dmy(base + (d1 - DAY) * 6e4)} · ${n} ${n === 1 ? 'día' : 'días'}`;
};

// El nombre del PDF: el título del documento, que es lo que propone «Guardar como PDF». Sin fechas, el día de la
// última carga (asOf, ms); con ellas, el rango. De un solo sistema o comparando con T-Systems, lo dice.
// De un técnico (person: su nombre), también. o: { mode, asOf, audience, systems, person }.
export const reportName = (key, [d0, d1], base, { mode, asOf = null, audience = 'indra', systems = ALL_SYSTEMS, person = '' } = {}) => {
  const only = withSystems(key) && systems.length < SYSTEMS.length ? ` ${SYSTEMS.filter(([k]) => systems.includes(k)).map(([, l]) => l).join(' ')}` : '';
  const who = `${only}${person ? ` ${person}` : ''}${audience === 'ts' ? ' frente a T-Systems' : ''}`;
  return withDates(key, mode)
    ? `${reportLabel(key)}${who} ${isoOf(base + d0 * 6e4)} a ${isoOf(base + (d1 - DAY) * 6e4)}`
    : `${reportLabel(key)}${who} ${isoOf(asOf)}`;
};

// La cabecera del informe: qué es, de cuándo (sin fechas, asOf: el texto de la última carga; con ellas, el periodo),
// qué se mira (sides: los nombres de los lados), de qué sistemas (systems: claves de SYSTEMS), con qué filtros
// (filters: textos) y cuándo se generó (generatedAt: Date, en el reloj de quien lo genera). coverage: hasta dónde llegan
// los datos del periodo (con fechas). Con más de un modo, también cuál: «Actual» o «Histórico».
// picks: [[nombre, texto]] de las listas que filtran (pickedText), una fila cada una. person: el técnico (Equipo
// soporte; sin él, todo el equipo).
// params: los parámetros del Estado de SLAs (con todos, sin fila).
export const reportHead = ({ key, mode, range, base, asOf = '', sides = [], systems = ALL_SYSTEMS, picks = [], person = '', params = ALL_PARAMS, filters = [], coverage = '', generatedAt = new Date() }) => {
  const two = (n) => String(n).padStart(2, '0'), g = generatedAt;
  const stamp = `${two(g.getDate())}/${two(g.getMonth() + 1)}/${g.getFullYear()} ${two(g.getHours())}:${two(g.getMinutes())}`;
  const dated = withDates(key, mode), which = modesOf(key).length > 1 ? ` · ${MODES.find(([k]) => k === modeOf(key, mode))[1]}` : '';
  const rows = [
    dated ? ['Periodo', rangeText(range, base)] : ['A fecha de', asOf],
    ['Datos', dated ? coverage : 'Lo abierto ahora, se abriera cuando se abriera'],
    [sides.length > 1 ? 'Comparando' : 'Qué se mira', sides.join(' frente a ')],
    ...(withSystems(key) ? [['Sistemas', systemsText(systems)]] : []),
    ...(withPerson(key) ? [['Técnico', person || 'Todo el equipo']] : []),
    ...(withParams(key) ? [['Parámetros', paramsText(params)]] : []),
    ...picks,
    ...(filters.length ? [['Filtros', filters.join(' · ')]] : []),
    ['Generado', stamp],
  ].filter(([, v]) => v);
  // solo el Resumen básico echa de menos la corona del estado de ahora
  const note = key === 'history' ? '<p class="mt-rep-note">Del pasado no hay estado del backlog por situación (solo se conoce el de ahora): su evolución día a día está en la tarjeta «Evolución del backlog».</p>' : '';
  return `<header class="mt-rep-head"><h1>${esc(reportLabel(key))}${esc(which)} · Métricas</h1>
    <dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>${note}</header>`;
};
