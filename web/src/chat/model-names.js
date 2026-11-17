// Los modelos y esfuerzos de un chat de Copilot y cómo se enseñan. Dominio
// puro (model-menu.js lo pinta). Cada chat trae los modelos que ofrece su
// cuenta (el bridge se los pregunta al arrancar: server/chats/copilot.js,
// modelsOf), cada uno con los esfuerzos que admite.

// los esfuerzos, con su nombre
const EFFORTS = [
  { id: 'minimal', label: 'Mínimo', hint: 'casi sin pensar' },
  { id: 'low', label: 'Bajo', hint: 'rápido, directo' },
  { id: 'medium', label: 'Medio', hint: '' },
  { id: 'high', label: 'Alto', hint: '' },
  { id: 'xhigh', label: 'Muy alto', hint: 'tareas largas' },
  { id: 'max', label: 'Máximo', hint: 'acertar antes que tardar' },
];
const effortInfo = (id) => EFFORTS.find((e) => e.id === id) || { id, label: String(id), hint: '' };
// el esfuerzo que se enseña («high» → «Alto»; sin fijar → «De serie»)
export const effortLabel = (id) => (id ? effortInfo(id).label : 'De serie');

// el modelo que va: [{ id, label, hint, efforts, defaultEffort }]
const modelIn = (models, id) => (Array.isArray(models) ? models.find((m) => m.id === id) : null) || null;
export const modelLabelIn = (models, id) => modelIn(models, id)?.label || (id ? String(id) : 'Modelo');
// lo que enseña el pie: el modelo con el que va y, si es otro (con «Auto» lo
// elige Copilot), el que ha contestado: «Auto · GPT-6 Luna»
export const modelShown = (models, id, via = null) => {
  const label = modelLabelIn(models, id);
  return via && via !== label && via !== id ? `${label} · ${via}` : label;
};
// los esfuerzos que admite el modelo que va, con «el de serie» en el suyo;
// sin modelo elegido, los del primero que tenga
export const effortsIn = (models, id) => {
  if (!Array.isArray(models) || !models.length) return [];
  const m = modelIn(models, id) || models.find((x) => x.efforts?.length) || models[0];
  return (m.efforts || []).map(effortInfo).map((e) => ({ ...e, hint: e.id === m.defaultEffort ? 'el de serie' : e.hint }));
};
// los modelos por proveedor, en el orden en que llegan: [{ label, models }];
// con uno solo (o ninguno dicho), un único grupo sin nombre
export const modelGroups = (models) => {
  const list = Array.isArray(models) ? models : [];
  const groups = [];
  for (const m of list) {
    const key = m.provider?.id || '';
    let g = groups.find((x) => x.key === key);
    if (!g) { g = { key, label: m.provider?.label || '', models: [] }; groups.push(g); }
    g.models.push(m);
  }
  return groups.length > 1 ? groups.map(({ label, models: ms }) => ({ label, models: ms })) : [{ label: '', models: list }];
};
