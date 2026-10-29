import test from 'node:test';
import assert from 'node:assert/strict';
import { item, handed } from './parts.js';

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
