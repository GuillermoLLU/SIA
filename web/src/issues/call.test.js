import { test } from 'node:test';
import assert from 'node:assert/strict';
import { callReady, callNote, suggestedPhone, callForm } from './call.js';
import { notesFeed, callOf, isPhone } from './notes.js';

test('un teléfono: cinco cifras o más, con prefijo, espacios o extensión', () => {
  for (const ok of ['+90 212 555 0143', '05379549605', '49890x3', '+52 (221) 410-9146']) assert.equal(isPhone(ok), true, ok);
  for (const ko of ['', '123', 'llamar', '+34 6OO']) assert.equal(isPhone(ko), false, ko);
});

test('qué se puede guardar: atendida, con teléfono y lo hablado; sin respuesta, con el teléfono', () => {
  assert.deepEqual(callReady({ phone: '+34 600 000 000', comment: 'Confirma que ya va.' }), { answered: true, noAnswer: true });
  assert.deepEqual(callReady({ phone: '+34 600 000 000', comment: '  ' }), { answered: false, noAnswer: true });
  assert.deepEqual(callReady({ phone: '12', comment: 'algo' }), { answered: false, noAnswer: false });
  assert.deepEqual(callReady(), { answered: false, noAnswer: false });
});

test('la nota que la registra: interna, con su etiqueta de llamada y el teléfono delante (Seguimiento la pinta como llamada)', () => {
  const ok = callNote({ phone: ' +34 600 000 000 ', comment: ' Confirma que ya escanean. ', answered: true });
  assert.deepEqual(ok, { body: '+34 600 000 000 Confirma que ya escanean.', tag: 'CALLOK', visibility: 'internal' });
  const ko = callNote({ phone: '+34 600 000 000', answered: false });
  assert.deepEqual(ko, { body: '+34 600 000 000', tag: 'CALLKO', visibility: 'internal' });
  assert.deepEqual(callOf({ kind: 'note', text: ok.body, tag: ok.tag }), { answered: true, phone: '+34 600 000 000', said: 'Confirma que ya escanean.' });
  assert.deepEqual(callOf({ kind: 'note', text: ko.body, tag: ko.tag }), { answered: false, phone: '+34 600 000 000', said: '' });
});

test('el teléfono propuesto: el de la última llamada; si no hay, el de contacto del centro; si no, ninguno', () => {
  const feed = notesFeed({ worklog: [
    { at: '2026-10-22 13:20', who: 'A', text: '[CALLKO] +90 212 555 0143' },
    { at: '2026-10-23 09:00', who: 'B', text: '[CALLOK] +90 212 555 0199 Hablado.' },
    { at: '2026-10-24 09:00', who: 'C', text: '[ANALISIS] +90 000 000 0000 no es una llamada' },
  ] });
  assert.deepEqual(suggestedPhone(feed, 'Contact Phone: 05379549605'), { phone: '+90 212 555 0199', from: 'last' });
  assert.deepEqual(suggestedPhone([], 'Contact Phone: 05379549605\n\nHello,'), { phone: '05379549605', from: 'contact' });
  assert.deepEqual(suggestedPhone([], 'Sin teléfono.'), { phone: '', from: null });
});

test('la ventana: el teléfono propuesto (escapado) con de dónde sale; «Guardar llamada» primero (Intro) y apagado; «No responden», encendido si ya hay teléfono', () => {
  const html = callForm('INC1', { phone: '+34 <600>', from: 'contact' });
  assert.match(html, /<form class="iss-act-form iss-call" data-act-form="call" novalidate>/);
  assert.match(html, /<h3>Llamada al centro<\/h3><span>INC1<\/span>/);
  assert.match(html, /name="phone" type="tel"[^>]*value="\+34 &lt;600&gt;"/);
  assert.match(html, /El de contacto que dejó el centro\./);
  assert.match(html, /<footer><button type="submit" class="lab-btn primary" name="outcome" value="answered" disabled>Guardar llamada<\/button><button type="submit" class="lab-btn" name="outcome" value="noanswer" disabled>No responden<\/button>/, 'con «+34 <600>» no hay teléfono válido');
  assert.match(callForm('INC1', { phone: '+34 600 000 000', from: 'last' }), /value="noanswer" >No responden/);
  assert.doesNotMatch(callForm('INC1'), /<small>El de/);
});
