// La primera clave de Jira (SGAEWMSAP-7037) de un texto libre, como el ticket
// de proveedor de Remedy («TEC: SGAEWMSAP-7037 …») → { project, key } | null.
const KEY = /\b([A-Z][A-Z0-9]{2,12})-(\d{1,7})\b/;

export const jiraKey = (text) => {
  const m = KEY.exec(text || '');
  return m ? { project: m[1], key: `${m[1]}-${m[2]}` } : null;
};
