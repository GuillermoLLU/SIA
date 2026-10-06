// El primer mensaje del chat de una issue: sus datos para que el agente sepa
// de qué se habla desde el principio. (El análisis automático se sumará aquí
// cuando esté conectado.)

const SEVERITY = { CRITICAL: 'crítica', HIGH: 'alta', MEDIUM: 'media', LOW: 'baja' };
const MAX_NOTES = 6000; // la descripción del centro, recortada si es enorme

export const issueContext = (i) => [
  `Vamos a trabajar juntos la incidencia ${i.id} de Remedy. Estos son sus datos:`,
  '',
  `- Título: ${i.text}`,
  `- Centro: ${i.center || 'sin código'}`,
  `- Criticidad: ${SEVERITY[i.priority] || i.priority || '—'}${i.prio ? ' (priorizada por negocio)' : ''}`,
  `- Origen: ${i.sisu ? 'SISU' : 'SGA'}`,
  `- Estado: ${i.status}${i.reason ? ` (${i.reason})` : ''}`,
  `- Categoría: ${i.category || '—'}`,
  `- Reportada: ${i.reported}`,
  ...(i.vendorTicket ? [`- Ticket de proveedor: ${i.vendorTicket}`] : []),
  ...(i.related ? [`- Enlazadas: ${i.related}`] : []),
  '',
  'Lo que dice el centro:',
  '"""',
  (i.notes || 'Sin descripción.').slice(0, MAX_NOTES),
  '"""',
  '',
  'Usa el conocimiento del equipo cuando haga falta. De momento no hagas nada más:',
  `responde solo con un resumen de una línea y pregunta en qué te ayudo con ${i.id}.`,
].join('\n');

// Cómo pasa cada agente ese primer mensaje al arrancar en interactivo (va
// delante del resto de opciones).
export const promptArgs = (launcherId, prompt) => (launcherId === 'copilot' ? ['-i', prompt] : [prompt]);
