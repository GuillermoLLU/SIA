// Pendiente de cliente: por qué esperamos al cliente, según nuestra última nota pública (dominio puro).
//
// La consulta no trae si una nota es pública o interna, así que se aproxima: es pública la nota que no empieza por
// una etiqueta entre corchetes ([ANALISIS], [DIAGNOSTICO], [RESOLUCION], [ACT IA]…), que son las internas del método,
// ni es del agente de IA. Que sea «nuestra» (de alguien del equipo) se sabe al montar los datos (dataset.js).
//
// El motivo, por palabras clave en el texto sin tildes ni mayúsculas; si encaja en varios, manda el primero de la
// lista (decidir y validar piden algo concreto al cliente; comunicar el cierre, lo último). Sin ninguna, «Otro».
import { norm } from './text.js';

// el orden es el de la gráfica (web: tabs/cliente.js); 0, sin nota pública
export const PENDING_REASONS = ['Sin nota pública', 'Información/evidencias solicitadas', 'Validación de solución/workaround',
  'Resolución/cierre comunicado', 'Decisión del cliente', 'Otro motivo'];
export const REASON = { NONE: 0, INFO: 1, VALIDATION: 2, CLOSURE: 3, DECISION: 4, OTHER: 5 };

const RULES = [
  [REASON.DECISION, /\b(decid|decision|como (quereis|quiere[ns]?|preferis|prefiere[ns]?) (proceder|seguir|continuar)|que (opcion|alternativa)|prefer(is|ir|encia)|aprobacion|aprueb|autoriz|vuestro visto bueno|vuestro ok|nos confirm[ae]is si (quereis|desea)|how (do you|would you like to) proceed|which option|approv)/],
  [REASON.VALIDATION, /\b(valid|prob(ar|ad|eis|ando)|prueb[ae]|comprob|verific|revis(ar|ad|eis) si|workaround|solucion temporal|solucion provisional|confirm(ar|ad|eis|en) (si|que) (ya )?(funciona|esta|se ve|aparece)|confirm(en|ad|eis|ar)(nos)? si|deberia (estar|funcionar)|ya deberia|please (check|verify|test|try|confirm)|(could|can) (you|y.u) (please )?(check|test|verify|try|confirm)|try (again|to access))/],
  [REASON.INFO, /\b(we need|we (are|keep|continue|still) waiting|waiting (for )?(your|an) (answer|reply|response|feedback)|let us know|(could|can) you (please )?(send|share|provide|tell)|please (let|advise|share|send)|example|screenshot|seguimos a la espera|a la espera de (vuestra|tu|su) (respuesta|confirmacion)|(podrias|puedes) (indicar|confirmar|decir|enviar|pasar|adjuntar)|indicadnos|confirmadnos|deb(eis|e|en) (cubrir|rellenar|enviar|indicar|adjuntar)|plantilla|necesit(amos|ariamos)|pod(eis|riais|rias|ria|rian) (enviar|mandar|indicar|adjuntar|facilitar|pasar|decir|confirmar)|por favor,? (envia|enviad|indica|indicad|adjunta|adjuntad|facilita|facilitad|pasa|pasad)|evidencia|captura|pantallazo|log(s)?\b|mas (informacion|detalle|datos)|ejemplo|nos (indica|indicais|digais|confirmeis)|quedamos a la espera de|a la espera de (vuestra|su) (respuesta|informacion)|please (provide|send|share|attach)|could you (provide|send|share))/],
  [REASON.CLOSURE, /\b(resuelt|solucionad|corregid|arreglad|se ha (corregido|solucionado|resuelto|arreglado)|procedemos (a|al) (cerrar|cierre)|cerramos|cierre (de la incidencia|del ticket)|damos por (cerrad|resuelt)|fixed|solved|resolved|we (will )?close)/],
];

// Sin palabra clave, una pregunta al cliente es pedirle algo: información (lo más común).
export const reasonOf = (text) => {
  const t = norm(text);
  return RULES.find(([, re]) => re.test(t))?.[0] ?? (/[?¿]/.test(t) ? REASON.INFO : REASON.OTHER);
};

// ¿una nota que se lee como pública? (ver arriba); who: su autor, tal cual viene en Remedy
const INTERNAL = /^\s*\[[^\]]{2,25}\]/;
const BOTS = new Set(['logsup.ia']);
export const isPublicNote = (who, text) => !BOTS.has(who) && !INTERNAL.test(text || '') && !!(text || '').trim();
