import test from 'node:test';
import assert from 'node:assert/strict';
import { reasonOf, isPublicNote, REASON, PENDING_REASONS } from './pending-reason.js';

test('el motivo de Pendiente de cliente, por nuestra última nota pública', () => {
  assert.equal(reasonOf('Buenos días, ¿nos podéis enviar una captura del error y el número de pedido?'), REASON.INFO);
  assert.equal(reasonOf('Necesitamos más información para continuar.'), REASON.INFO);
  assert.equal(reasonOf('Hemos aplicado un workaround, ¿podéis validar que ya funciona?'), REASON.VALIDATION);
  assert.equal(reasonOf('Se ha corregido. Quedamos a la espera de vuestra validación.'), REASON.VALIDATION);   // validar manda sobre lo corregido
  assert.equal(reasonOf('La incidencia está resuelta; procedemos a cerrar.'), REASON.CLOSURE);
  assert.equal(reasonOf('Hay dos opciones: ¿cómo queréis proceder? Necesitamos vuestra decisión.'), REASON.DECISION);
  assert.equal(reasonOf('Please provide the order number.'), REASON.INFO);
  assert.equal(reasonOf('Gracias.'), REASON.OTHER);
  // de lo que hay en Remedy: en inglés, reclamando y preguntando
  assert.equal(reasonOf('Hello We continue waiting your answer. We need to know the range.'), REASON.INFO);
  assert.equal(reasonOf('Hello, We need an example of a quadrant you scan. Thank you'), REASON.INFO);
  assert.equal(reasonOf('The adapters were released. Could ypu please confirm?'), REASON.VALIDATION);
  assert.equal(reasonOf('Favor de probar nuevamente y confirmarnos si continúan con inconvenientes.'), REASON.VALIDATION);
  assert.equal(reasonOf('Por favor esperen y confirmen si les cae en el próximo drop.'), REASON.VALIDATION);
  assert.equal(reasonOf('Para poder proceder debéis cubrir la plantilla de modificación.'), REASON.INFO);
  assert.equal(reasonOf('¿Habéis tenido ocasión de revisarlo?'), REASON.INFO);   // sin palabra clave, una pregunta: pedir algo
  assert.equal(reasonOf('Hi, Thank you for letting me know. Regards,'), REASON.OTHER);
  assert.equal(PENDING_REASONS.length, 6);
  assert.equal(PENDING_REASONS[REASON.NONE], 'Sin nota pública');
});

test('nota pública (aproximada): sin etiqueta interna al principio, con texto y no del agente de IA', () => {
  assert.equal(isPublicNote('JAVIERVGON', 'Buenos días, ¿podéis validar?'), true);
  assert.equal(isPublicNote('JAVIERVGON', '[ANALISIS] revisado el log'), false);
  assert.equal(isPublicNote('JAVIERVGON', '  [DIAGNOSTICO_IA] causa'), false);
  assert.equal(isPublicNote('logsup.ia', 'Hola'), false);
  assert.equal(isPublicNote('JAVIERVGON', '   '), false);
});
