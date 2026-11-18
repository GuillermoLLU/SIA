import test from 'node:test';
import assert from 'node:assert/strict';
import { mineWaitingItem, item, handed, teamItem } from './parts.js';

const now = new Date('2026-10-29T12:00:00');
const issue = (o = {}) => ({ id: 'INC1', center: '100', text: 'PDA <x>', priority: 'HIGH', status: 'ASSIGNED', reason: '', sisu: false, reported: '2026-10-29 10:00', modified: '', resolved: '', ...o });

test('una fila sin traspaso no lleva marca', () => {
  const html = item(issue(), 'doing', now);
  assert.doesNotMatch(html, /Traspasada/);
  assert.match(html, /PDA &lt;x&gt;/);
});

test('traspasada: la marca y, en el icono, quién, cuándo y por qué, escapado', () => {
  const html = item(issue({ transferred: { from: 'Luis <x>', at: '2026-10-29T10:30:00+00:00', reason: 'Es de <tu> centro.' } }), 'doing', now);
  assert.match(html, /<span class="iss-tag-handed">Traspasada<\/span>/);
  assert.match(html, /<b>Luis &lt;x&gt;<\/b> te la traspasó el \d\d\/\d\d \d\d:\d\d/);
  assert.match(html, /<i>Es de &lt;tu&gt; centro\.<\/i>/);
  assert.match(html, /aria-label="De Luis &lt;x&gt;: Es de &lt;tu&gt; centro\."/);
  assert.equal(handed(null), '');
  assert.doesNotMatch(handed({ from: 'Ana', at: '2026-10-29T10:30:00+00:00', reason: null }), /<i>/);
});

test('Seguimiento: los días sin moverse, en su color y con la fecha al pasar por encima; sin «hace…»', () => {
  const html = item(issue({ status: 'PENDING', reason: 'THIRD_PARTY_VENDOR_ACTION_REQD', modified: '2026-10-22 09:00' }), 'waiting', now);
  assert.match(html, /<span class="iss-still late" title="Sin moverse desde el 22\/10 09:00"><b>7 días<\/b> sin moverse<\/span>/);
  assert.match(html, /<span class="iss-reason">Proveedor<\/span>/);
  assert.doesNotMatch(html, /iss-when/);
  assert.match(item(issue({ status: 'PENDING', modified: '2026-10-28 11:00' }), 'waiting', now), /iss-still ok"[^>]*><b>1 día<\/b>/);
});

test('Seguimiento: con Jira, su clave y estado en lugar del motivo', () => {
  const open = item(issue({ status: 'PENDING', reason: 'THIRD_PARTY_VENDOR_ACTION_REQD', modified: '2026-10-22 09:00', jira: { key: 'SISUPAC-1', state: 'open' } }), 'waiting', now);
  assert.match(open, /<span class="iss-jira open" title="Jira Abierto">SISUPAC-1<i>Abierto<\/i><\/span>/);
  assert.doesNotMatch(open, /iss-reason/);
  assert.match(open, /<b>7 días<\/b> sin moverse/);
});

test('escalado del equipo: dueño, el Jira enlazado y, si es de otro, Reasignar (un solo botón)', () => {
  const e = (o) => issue({ status: 'PENDING', modified: '2026-10-28 11:00', owner: 'Luis <x>', mine: false, jira: { key: 'SISUPAC-1', state: 'open', url: 'https://jira/browse/SISUPAC-1' }, ...o });
  const other = teamItem(e(), now);
  assert.match(other, /<span class="iss-owner">Luis &lt;x&gt;<\/span>/);
  assert.match(other, /<div class="iss-esc-acts"><a href="https:\/\/jira\/browse\/SISUPAC-1" target="_blank" rel="noopener" title="Abrir SISUPAC-1 en Jira">Jira ↗<\/a>/);
  assert.match(other, /<button type="button" data-esc-reassign="INC1">Reasignar<\/button><\/div>/);
  assert.doesNotMatch(other, /data-esc-take/);
  const mine = teamItem(e({ mine: true, jira: { key: 'SISUPAC-1', state: 'open' } }), now);
  assert.match(mine, /<span class="iss-owner mine">Tuya<\/span>/);
  assert.doesNotMatch(mine, /iss-esc-acts/);
  assert.match(teamItem(e({ owner: '' }), now), /Sin dueño/);
});

test('Seguimiento · Mías: «Traspasar» bajo los días, solo si la tengo cogida en SIA', () => {
  const mine = (o) => mineWaitingItem(issue({ status: 'PENDING', modified: '2026-10-28 11:00', ...o }), now);
  assert.match(mine({ claimed: true }), /^<div class="iss-esc-row"><button class="iss-item" data-id="INC1">[\s\S]*<div class="iss-esc-acts"><button type="button" data-desk-transfer="INC1">Traspasar<\/button><\/div><\/div>$/);
  assert.doesNotMatch(mine({ claimed: false }), /data-desk-transfer/, 'asignada en Remedy sin cogerla en SIA: la base no la traspasa');
});
