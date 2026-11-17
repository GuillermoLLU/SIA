import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notesFeed, noteCount, defaultOpen, firstSentence, splitTag, tagLabel, canEditNote, sendsNote, NOTE_TAGS } from './notes.js';

const WORKLOG = [
  { at: '2026-10-12 12:25', who: 'robot.siglo', text: 'Buenas, no podemos entrar en RFID Warehouse.' },
  { at: '2026-10-22 12:30', who: 'CESARHD', text: '[ANÁLISIS] El usuario 4521 tiene el perfil caducado. El resto entra bien.' },
];
// horas elegidas para que el orden sea el mismo en cualquier zona horaria (UTC−6 a UTC+6): Remedy viene en hora local
const TIMELINE = [
  { at: '2026-10-22T06:00:00+00:00', type: 'claimed', by: 'Ana', from: null, to: 'Ana' },
  { at: '2026-10-22T19:00:00+00:00', type: 'note', id: 7, kind: 'note', by: 'Ana', byId: 'u1', text: 'Llamar mañana.', tag: 'CALLKO', visibility: 'private', edited: null },
  { at: '2026-10-29T12:37:00+00:00', type: 'transferred', by: 'Ana', from: 'Ana', to: 'Luis', text: 'Lleva dos llamadas.' },
];

test('Remedy, las notas de SIA y los movimientos, en una sola conversación por orden de tiempo', () => {
  const feed = notesFeed({ worklog: WORKLOG, timeline: TIMELINE });
  assert.deepEqual(feed.map((e) => `${e.key}:${e.kind}`), ['r0:note', 'm0:move', 'r1:note', 'n7:note', 'm2:move']);
  const [centro, , analisis, privada, traspaso] = feed;
  assert.deepEqual([centro.src, centro.by, centro.tag, centro.visibility], ['remedy', 'robot.siglo', null, null]); // la de Remedy no dice quién la ve
  assert.deepEqual([analisis.tag, analisis.text], ['ANALISIS', 'El usuario 4521 tiene el perfil caducado. El resto entra bien.']); // su etiqueta, fuera del texto
  assert.deepEqual([privada.src, privada.visibility, privada.tag, privada.byId], ['sia', 'private', 'CALLKO', 'u1']);
  assert.deepEqual([traspaso.type, traspaso.to, traspaso.text], ['transferred', 'Luis', 'Lleva dos llamadas.']);
  assert.equal(noteCount(feed), 3);
});

test('sin las notas de Remedy en la foto (o sin nada), lo que haya', () => {
  assert.deepEqual(notesFeed({ worklog: null, timeline: TIMELINE }).map((e) => e.key), ['m0', 'n7', 'm2']);
  assert.deepEqual(notesFeed(), []);
  const old = notesFeed({ timeline: [{ at: '2026-10-01T10:00:00+00:00', type: 'note', id: 1, by: 'Ana', text: 'x' }] })[0];
  assert.deepEqual([old.visibility, old.tag], ['internal', null]); // las de antes: internas y sin etiqueta
});

test('al abrirla, desplegadas las dos últimas notas (o el motivo de un traspaso); el resto, plegado', () => {
  const feed = notesFeed({ worklog: WORKLOG, timeline: TIMELINE });
  assert.deepEqual([...defaultOpen(feed)], ['n7', 'm2']);
  assert.deepEqual([...defaultOpen(feed, 3)], ['r1', 'n7', 'm2']);
  assert.deepEqual([...defaultOpen(notesFeed({ worklog: WORKLOG }))], ['r0', 'r1']);
});

test('plegada: la primera frase y, si sigue, «…» en lugar de su punto', () => {
  assert.equal(firstSentence('Hola, ya la estamos revisando. Os escribimos pronto.'), 'Hola, ya la estamos revisando…');
  assert.equal(firstSentence('Una sola frase.'), 'Una sola frase.');
  assert.equal(firstSentence('Primera línea sin punto\nsegunda línea'), 'Primera línea sin punto…');
  assert.equal(firstSentence('Perfil caducado desde el 10/10. Resto bien.'), 'Perfil caducado desde el 10/10…');
  assert.equal(firstSentence('  +48 735 924 334  '), '+48 735 924 334');
  assert.equal(firstSentence('¿Podéis revisarlo? Gracias'), '¿Podéis revisarlo…');
});

test('la etiqueta de Remedy: delante del texto, sin tildes; su nombre, el del catálogo o tal cual', () => {
  assert.deepEqual(splitTag('[SITUACIÓN INICIAL]  El centro no puede entrar'), { tag: 'SITUACION INICIAL', text: 'El centro no puede entrar' });
  assert.deepEqual(splitTag('sin etiqueta [ANALISIS]'), { tag: null, text: 'sin etiqueta [ANALISIS]' });
  assert.equal(tagLabel('ANALISIS'), 'Análisis');
  assert.equal(tagLabel('CALLKO'), 'Llamada sin respuesta');
  assert.equal(tagLabel('RESOLUTION'), 'Resolución');
  assert.equal(tagLabel('ACT IA'), 'ACT IA');
  assert.equal(tagLabel(null), '');
  assert.ok(NOTE_TAGS.every((t) => /^[A-Z][A-Z ]{1,29}$/.test(t.code)), 'los códigos, como los admite la base');
});

test('editar: solo la nota propia de SIA, en sus 24 h', () => {
  const now = new Date('2026-10-22T20:00:00Z');
  const [, , remedy, mine] = notesFeed({ worklog: WORKLOG, timeline: TIMELINE });
  assert.equal(canEditNote(mine, 'u1', now), true);
  assert.equal(canEditNote(mine, 'u2', now), false);
  assert.equal(canEditNote(mine, null, now), false);
  assert.equal(canEditNote(mine, 'u1', new Date('2026-10-24T12:00:00Z')), false);
  assert.equal(canEditNote(remedy, 'u1', now), false);
});

test('en la caja, Intro envía y Mayús+Intro salta de línea', () => {
  assert.equal(sendsNote({ key: 'Enter', shiftKey: false }), true);
  assert.equal(sendsNote({ key: 'Enter', shiftKey: true }), false);
  assert.equal(sendsNote({ key: 'a', shiftKey: false }), false);
});
