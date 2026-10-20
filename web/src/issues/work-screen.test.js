import test from 'node:test';
import assert from 'node:assert/strict';
import { workScreen } from './work-screen.js';

const issue = (o = {}) => ({ id: 'INC1', text: 'PDA <sin imagen>', priority: 'HIGH', status: 'ASSIGNED', reason: '', notes: 'no <arranca>',
  resolution: '', category: 'SGA', group: 'AYS SOPORTE', assignee: '', reported: '2026-10-01 10:00', modified: '2026-10-01 11:00',
  vendorTicket: '', changes: [['2026-10-01 10:00', '', 'ASSIGNED']], related: '', prio: false, sisu: false, center: '100', link: '', claimedBy: null, ...o });
const now = new Date('2026-10-01T12:00:00');

test('la pantalla: tres pestañas, el análisis por conectar y el texto escapado', () => {
  const html = workScreen({ issue: issue(), sameCenter: [], now, mine: false });
  assert.equal((html.match(/data-wtab="/g) || []).length, 3);
  assert.match(html, /Por conectar/);
  assert.equal((html.match(/iss-pending/g) || []).length, 5);
  assert.match(html, /PDA &lt;sin imagen&gt;/);
  assert.match(html, /no &lt;arranca&gt;/);
  assert.doesNotMatch(html, /data-release/);
});

test('mía y cogida en SIA: se puede devolver y se ve quién la tiene', () => {
  const html = workScreen({ issue: issue({ claimedBy: { id: 'u', name: 'Ana', at: '2026-10-01T10:30:00Z' } }), sameCenter: [], now, mine: true, tab: 'detail' });
  assert.match(html, /data-release/);
  assert.match(html, /en SIA, Ana/);
  assert.match(html, /data-wtab="detail" aria-selected="true"/);
});
