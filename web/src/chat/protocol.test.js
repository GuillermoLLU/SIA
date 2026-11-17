import test from 'node:test';
import assert from 'node:assert/strict';
import { msg, parse, closeReason } from './protocol.js';

test('mensajes de la web al bridge', () => {
  assert.deepEqual(msg.start('auto', ['p1']), { type: 'start', knowledge: 'auto', projects: ['p1'] });
  assert.equal(msg.start('auto', [], { issue: 'INC1' }).issue, 'INC1');
  assert.equal(msg.start('auto', [], { prompt: '¿Qué hace la PDA?' }).prompt, '¿Qué hace la PDA?');
  assert.equal('prompt' in msg.start('auto', [], { prompt: '' }), false);
  assert.deepEqual(msg.attach('s3'), { type: 'attach', sessionId: 's3' });
  assert.deepEqual(msg.kill(), { type: 'kill' });
  assert.deepEqual(msg.kill('s3'), { type: 'kill', sessionId: 's3' });
  assert.deepEqual(msg.asset({ name: 'a.png', absPath: '/x/a.png', url: 'ignorada' }), { type: 'asset', asset: { name: 'a.png', absPath: '/x/a.png' } });
  assert.deepEqual(msg.say('hola'), { type: 'say', text: 'hola' });
  assert.deepEqual(msg.stop(), { type: 'stop' });
  assert.deepEqual(msg.answer('r1', { '¿?': 'sí' }), { type: 'answer', requestId: 'r1', answers: { '¿?': 'sí' } });
  assert.deepEqual(msg.approve('r2', true), { type: 'answer', requestId: 'r2', allow: true });
  assert.deepEqual(msg.authCheck(), { type: 'auth-check' });
});

test('parse: JSON o nada', () => {
  assert.deepEqual(parse('{"type":"turn"}'), { type: 'turn' });
  assert.equal(parse('no'), null);
});

test('closeReason: candado, handoff y el resto perdido', () => {
  assert.equal(closeReason(4423), 'locked');
  assert.equal(closeReason(4409), 'handoff');
  assert.equal(closeReason(1006), 'lost');
});
