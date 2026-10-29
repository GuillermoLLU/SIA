// Los textos con entradas de Remedy (AUDIT_DETAIL, WORKLOG_DETAIL): «fecha -
// quién - texto» separadas por « | » delante de una fecha. Lo usan Métricas
// (marcas y estados) e Issues (las notas de trabajo de cada issue).
const ENTRY = / \| (?=\d{4}-\d\d-\d\d \d\d:\d\d:\d\d\.\d{3} - )/;
export const entries = (text) => (text || '').split(ENTRY).flatMap((e) => {
  const a = e.indexOf(' - ');
  const b = a < 0 ? -1 : e.indexOf(' - ', a + 3);
  return b < 0 ? [] : [{ at: e.slice(0, a), who: e.slice(a + 3, b), text: e.slice(b + 3) }];
});
