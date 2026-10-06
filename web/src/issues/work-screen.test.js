import test from 'node:test';
import assert from 'node:assert/strict';
import { aiPanel, logPanel } from './work-screen.js';

test('sin análisis: los huecos, sin datos', () => {
  const html = aiPanel(null);
  assert.match(html, /Por conectar/);
  assert.equal((html.match(/iss-pending/g) || []).length, 4);
  assert.doesNotMatch(html, /data-log=/);
});

test('con análisis: texto escapado, pasos numerados y una fila por log', () => {
  const html = aiPanel({ summary: 'PDA <sin imagen>', cause: 'c', steps: ['uno', 'dos'], logs: [{ source: 'SGA', at: '10:00', title: 't', content: 'x' }, { source: 'SISU', content: 'y' }] });
  assert.match(html, /PDA &lt;sin imagen&gt;/);
  assert.equal((html.match(/<li>/g) || []).length, 2);
  assert.equal((html.match(/data-log="/g) || []).length, 2);
  assert.doesNotMatch(html, /Por conectar/);
});

test('un log a toda la pestaña, con vuelta al análisis', () => {
  const html = logPanel({ source: 'SGA', at: '10:00', content: '<error>' });
  assert.match(html, /data-log-back/);
  assert.match(html, /&lt;error&gt;/);
});
