// Una pestaña aún vacía (Calidad): su pregunta y un aviso de que está en construcción. Se llega también desde el
// KPI %IQA del Resumen.
export const pendingTab = (t, key) => () => t.grid(t.ask(key),
  t.ch.card('En construcción', '<p class="mt-mut mt-small">Esta pestaña aún no tiene contenido.</p>', { span: 's12' }));
