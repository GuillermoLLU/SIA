// Una pestaña aún vacía (Análisis tiempos, Calidad): su pregunta y un aviso de que está en construcción. Se llega a
// ellas desde los KPIs del Resumen (MTTR y %IQA).
export const pendingTab = (t, key) => () => t.grid(t.ask(key),
  t.ch.card('En construcción', '<p class="mt-mut mt-small">Esta pestaña aún no tiene contenido.</p>', { span: 's12' }));
