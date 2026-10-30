// La consulta de las Métricas en Snowflake (dominio puro): las issues de Remedy
// con sus notas, sus hijas y su historial, una fila por incidencia. Solo trae las nuevas o cambiadas desde
// la última actualización: Remedy toca LASTMODIFIEDDATE al crearlas y con cada
// nota o cambio de auditoría (comprobado en 2026: nunca hay una nota ni un
// cambio posterior a ella), así que basta con filtrar por esa fecha.

// La primera carga, con la base local vacía: desde aquí.
import { GROUP } from './dataset.js';

export const FIRST_LOAD = '2026-01-01 00:00:00.000';
// Margen hacia atrás sobre lo último guardado: Snowflake carga Remedy cada hora en punto, y una modificación puede
// tardar en llegar una carga entera más el retraso. Pedir de más no cambia nada (decide: same), así que va holgado.
const MARGIN_HOURS = 6;

const FMT = 'YYYY-MM-DD HH24:MI:SS.FF3';
// Las fechas salen con milisegundos (las de dentro de LISTAGG también): las leen
// minutesSince y entries (remedy.js) y decide (incidents.js).
// Las notas y los cambios de un mismo segundo van en un orden fijo (WORKLOGID; campo y
// valores): si no, Snowflake los da cada vez en uno y decide vería un cambio que no hay.
// Una sola sentencia (un viaje a Snowflake) que fija el formato de los cuatro tipos de fecha.
export const SESSION = [`ALTER SESSION SET ${['', '_NTZ', '_LTZ', '_TZ'].map((v) => `TIMESTAMP${v}_OUTPUT_FORMAT = '${FMT}'`).join(', ')}`];

const STAMP = /^(\d{4})-(\d\d)-(\d\d) (\d\d):(\d\d):(\d\d)(?:\.(\d{3}))?/;
const pad = (n, w = 2) => String(n).padStart(w, '0');
const format = (d) => `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)}`;
// Una fecha de Remedy como instante (sin zona: se opera en UTC y se escribe igual).
const parse = (s) => {
  const m = STAMP.exec(s || '');
  return m ? new Date(Date.UTC(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6], +(m[7] || 0))) : null;
};

// Qué pedir según lo guardado (repository.js: extremes): first, la apertura más
// antigua; last, la última modificación. Sin nada guardado, la primera carga.
// floor: no entran incidencias más antiguas que las que ya se tienen; since: lo cambiado desde ahí.
export const rangeOf = ({ first, last }) => {
  const from = parse(first), to = parse(last);
  if (!from || !to) return { floor: FIRST_LOAD, since: null };
  return { floor: format(from), since: format(new Date(to.getTime() - MARGIN_HOURS * 36e5)) };
};

// La SQL y sus binds (las fechas nunca van dentro del texto).
// La consulta: las incidencias que cumplen `where` y, por cada una, sus notas, hijas, historial y enlace. Una sola
// plantilla para la actualización (con binds) y para el constructor de SQL (con las fechas escritas en el texto).
const statement = (where) => `
WITH incidents AS (
    SELECT * FROM SGA.SIGLO.REMEDY
    WHERE ${where}
),
-- Solo las del grupo: de ellas se piden las notas, las hijas y el historial. Las demás llegan sin esos datos.
group_incidents AS (
    SELECT * FROM incidents WHERE TRIM(ASSIGNEDGROUP) = '${GROUP}'
),
worklog_agg AS (
    SELECT w.INCIDENTNUMBER,
        LISTAGG(
            COALESCE(TO_VARCHAR(w.WORKLOGSUBMITDATE), '') || ' - ' ||
            COALESCE(TO_VARCHAR(w.SUBMITTER), '') || ' - ' ||
            COALESCE(TO_VARCHAR(w.DETAILEDDESCRIPTION), ''),
            ' | '
        ) WITHIN GROUP (ORDER BY w.WORKLOGSUBMITDATE, w.WORKLOGID) AS WORKLOG_DETAIL
    FROM SGA.SIGLO.REMEDY_WORKLOG w
    WHERE w.INCIDENTNUMBER IN (SELECT INCIDENTNUMBER FROM group_incidents)
    GROUP BY w.INCIDENTNUMBER
),
association_agg AS (
    SELECT a.PARENTREQUEST,
        LISTAGG(a.CHILDREQUEST, ' | ') WITHIN GROUP (ORDER BY a.CHILDREQUEST) AS CHILDREQUEST
    FROM SGA.SIGLO.REMEDY_ASSOCIATION a
    WHERE a.PARENTREQUEST IN (SELECT INCIDENTNUMBER FROM group_incidents)
    GROUP BY a.PARENTREQUEST
),
audit_agg AS (
    SELECT f.ORIGINAL_REQUEST_ID,
        LISTAGG(
            COALESCE(TO_VARCHAR(f.CREATE_DATE_C), '') || ' - ' ||
            COALESCE(TO_VARCHAR(f.SUBMITTER_C), '') || ' - ' ||
            COALESCE(TO_VARCHAR(f.FIELD), '') || ': ' ||
            COALESCE(TO_VARCHAR(f.FIELD_VALUE_ORIG), '') || ' → ' ||
            COALESCE(TO_VARCHAR(f.FIELD_VALUE), ''),
            ' | '
        ) WITHIN GROUP (ORDER BY f.CREATE_DATE_C, f.FIELD, f.FIELD_VALUE_ORIG, f.FIELD_VALUE, f.SUBMITTER_C) AS AUDIT_DETAIL
    FROM SGA.SIGLO.REMEDY_AUDIT_FIELD f
    WHERE f.ORIGINAL_REQUEST_ID IN (SELECT INCIDENTNUMBER FROM group_incidents)
    GROUP BY f.ORIGINAL_REQUEST_ID
)
SELECT t1.*, t2.WORKLOG_DETAIL, t3.CHILDREQUEST, t4.AUDIT_DETAIL,
    'https://itx.onbmc.com/arsys/servlet/ViewFormServlet?server=onbmc-s&form=HPD:Help+Desk&qual=%271000000161%27%3D%22' || t1.INCIDENTNUMBER || '%22' AS LINKREMEDY
FROM incidents t1
LEFT JOIN worklog_agg t2 ON t1.INCIDENTNUMBER = t2.INCIDENTNUMBER
LEFT JOIN association_agg t3 ON t1.INCIDENTNUMBER = t3.PARENTREQUEST
LEFT JOIN audit_agg t4 ON t1.INCIDENTNUMBER = t4.ORIGINAL_REQUEST_ID`;

// until (solo la primera carga con un periodo elegido): hasta ese instante, sin incluirlo.
export const buildQuery = ({ floor, since, until }) => {
  const changed = since ? `\n      AND COALESCE(LASTMODIFIEDDATE, REPORTEDDATE) >= TO_TIMESTAMP_NTZ(?, '${FMT}')` : '';
  const upto = until ? `\n      AND REPORTEDDATE < TO_TIMESTAMP_NTZ(?, '${FMT}')` : '';
  return {
    sql: statement(`REPORTEDDATE >= TO_TIMESTAMP_NTZ(?, '${FMT}')${changed}${upto}`),
    binds: [floor, ...(since ? [since] : []), ...(until ? [until] : [])],
  };
};

// Fecha AAAA-MM-DD real (no 2026-02-30).
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const validDay = (d) => DAY.test(d) && new Date(`${d}T00:00:00Z`).toISOString().slice(0, 10) === d;
const nextDay = (d) => { const t = new Date(`${d}T00:00:00Z`); t.setUTCDate(t.getUTCDate() + 1); return t.toISOString().slice(0, 10); };

// El SQL para copiar a Snowflake de un periodo: las incidencias abiertas entre `from` y `to` (los dos días incluidos).
// Solo es texto: SIA no lo ejecuta. Las fechas van escritas en el texto, así que se validan antes.
// Un periodo de días (desde y hasta incluidos) válido; si no, RangeError.
const checkPeriod = (from, to) => {
  if (!validDay(from) || !validDay(to) || from > to) throw new RangeError('Periodo no válido: desde y hasta, con fecha AAAA-MM-DD, y desde no posterior a hasta.');
};

// La primera carga con un periodo elegido (solo con la base vacía): desde `from` y hasta `to`, incluidos.
export const firstLoadRange = ({ from, to }) => {
  checkPeriod(from, to);
  return { floor: `${from} 00:00:00.000`, since: null, until: `${nextDay(to)} 00:00:00.000` };
};

export const periodSql = ({ from, to }) => {
  checkPeriod(from, to);
  return statement(`REPORTEDDATE >= TO_TIMESTAMP_NTZ('${from} 00:00:00.000', '${FMT}') AND REPORTEDDATE < TO_TIMESTAMP_NTZ('${nextDay(to)} 00:00:00.000', '${FMT}') AND TRIM(ASSIGNEDGROUP) = '${GROUP}'`);
};
