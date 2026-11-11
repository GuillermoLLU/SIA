import test from 'node:test';
import assert from 'node:assert/strict';
import { msg, parse, closeReason } from './protocol.js';

test('mensajes de la web al bridge', () => {
  assert.deepEqual(msg.start('claude', 'auto', ['p1'], 120, 40), { type: 'start', launcher: 'claude', knowledge: 'auto', projects: ['p1'], cols: 120, rows: 40 });
  assert.equal(msg.start('claude', 'auto', [], 80, 24, { issue: 'INC1' }).issue, 'INC1');
  assert.equal(msg.start('claude', 'auto', [], 80, 24, { prompt: '¿Qué hace la PDA?' }).prompt, '¿Qué hace la PDA?');
  assert.equal('prompt' in msg.start('claude', 'auto', [], 80, 24, { prompt: '' }), false);
  assert.deepEqual(msg.kill(), { type: 'kill' });
  assert.deepEqual(msg.kill('s3'), { type: 'kill', sessionId: 's3' });
  assert.deepEqual(msg.asset({ name: 'a.png', absPath: '/x/a.png', url: 'ignorada' }), { type: 'asset', asset: { name: 'a.png', absPath: '/x/a.png' } });
});

test('parse: JSON o nada', () => {
  assert.deepEqual(parse('{"type":"data"}'), { type: 'data' });
  assert.equal(parse('no'), null);
});

test('closeReason: candado, handoff y el resto perdido', () => {
  assert.equal(closeReason(4423), 'locked');
  assert.equal(closeReason(4409), 'handoff');
  assert.equal(closeReason(1006), 'lost');
});
