// La consulta de las Métricas en Snowflake (dominio puro): las issues de Remedy
// con sus notas, sus hijas y su historial, una fila por incidencia y con las
// mismas columnas que el CSV de antes. Solo trae las nuevas o cambiadas desde
// la última actualización: Remedy toca LASTMODIFIEDDATE al crearlas y con cada
// nota o cambio de auditoría (comprobado en 2026: nunca hay una nota ni un
// cambio posterior a ella), así que basta con filtrar por esa fecha.

// La primera carga, con la base local vacía: desde aquí.
export const FIRST_LOAD = '2026-01-01 00:00:00.000';
// Margen hacia atrás sobre lo último guardado: Snowflake recibe Remedy con
// retraso (una hora, más o menos) y pedir de más no cambia nada (decide: same).
export const MARGIN_DAYS = 2;

const FMT = 'YYYY-MM-DD HH24:MI:SS.FF3';
// Las fechas salen como en el CSV (las de dentro de LISTAGG también): las leen
// minutesSince y entries (remedy.js) y decide (incidents.js).
// Las notas y los cambios de un mismo segundo van en un orden fijo (WORKLOGID; campo y
// valores): si no, Snowflake los da cada vez en uno y decide vería un cambio que no hay.
export const SESSION = ['', '_NTZ', '_LTZ', '_TZ'].map((v) => `ALTER SESSION SET TIMESTAMP${v}_OUTPUT_FORMAT = '${FMT}'`);

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
// floor: no entran incidencias más antiguas que las que ya se tienen (las de
// 2025 cargadas por CSV se siguen actualizando); since: lo cambiado desde ahí.
export const rangeOf = ({ first, last }) => {
  const from = parse(first), to = parse(last);
  if (!from || !to) return { floor: FIRST_LOAD, since: null };
  return { floor: format(from), since: format(new Date(to.getTime() - MARGIN_DAYS * 864e5)) };
};

// La SQL y sus binds (las fechas nunca van dentro del texto).
export const buildQuery = ({ floor, since }) => {
  const changed = since ? `\n      AND COALESCE(LASTMODIFIEDDATE, REPORTEDDATE) >= TO_TIMESTAMP_NTZ(?, '${FMT}')` : '';
  const sql = `
WITH incidents AS (
    SELECT * FROM SGA.SIGLO.REMEDY
    WHERE REPORTEDDATE >= TO_TIMESTAMP_NTZ(?, '${FMT}')${changed}
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
    WHERE w.INCIDENTNUMBER IN (SELECT INCIDENTNUMBER FROM incidents)
    GROUP BY w.INCIDENTNUMBER
),
association_agg AS (
    SELECT a.PARENTREQUEST,
        LISTAGG(a.CHILDREQUEST, ' | ') WITHIN GROUP (ORDER BY a.CHILDREQUEST) AS CHILDREQUEST
    FROM SGA.SIGLO.REMEDY_ASSOCIATION a
    WHERE a.PARENTREQUEST IN (SELECT INCIDENTNUMBER FROM incidents)
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
    WHERE f.ORIGINAL_REQUEST_ID IN (SELECT INCIDENTNUMBER FROM incidents)
    GROUP BY f.ORIGINAL_REQUEST_ID
)
SELECT t1.*, t2.WORKLOG_DETAIL, t3.CHILDREQUEST, t4.AUDIT_DETAIL,
    'https://itx.onbmc.com/arsys/servlet/ViewFormServlet?server=onbmc-s&form=HPD:Help+Desk&qual=%271000000161%27%3D%22' || t1.INCIDENTNUMBER || '%22' AS LINKREMEDY
FROM incidents t1
LEFT JOIN worklog_agg t2 ON t1.INCIDENTNUMBER = t2.INCIDENTNUMBER
LEFT JOIN association_agg t3 ON t1.INCIDENTNUMBER = t3.PARENTREQUEST
LEFT JOIN audit_agg t4 ON t1.INCIDENTNUMBER = t4.ORIGINAL_REQUEST_ID`;
  return { sql, binds: since ? [floor, since] : [floor] };
};
