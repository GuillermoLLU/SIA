import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWsAuth } from './ws-auth.js';

const SESSIONS = { 'tok-chat': { user: { views: ['chat'] } }, 'tok-issues': { user: { views: ['issues'] } } };
const wsAuth = createWsAuth({
  auth: { context: async (token) => { if (token === 'roto') throw new Error('la base no responde'); return SESSIONS[token] || null; } },
  isLoopback: (req) => req.remote === '127.0.0.1',
});
const req = (token, remote = '127.0.0.1') => ({ url: token ? `/?a=${token}` : '/', remote });

test('sessionOk: desde esta máquina y con una sesión válida; un fallo de la sesión es «no»', async () => {
  assert.equal(await wsAuth.sessionOk(req('tok-chat')), true);
  assert.equal(await wsAuth.sessionOk(req('tok-chat', '10.0.0.8')), false);
  assert.equal(await wsAuth.sessionOk(req(null)), false);
  assert.equal(await wsAuth.sessionOk(req('roto')), false);
});

test('allowed: el chat del Chat con su vista; el de una issue, con la de Issues', async () => {
  assert.equal(await wsAuth.allowed(req('tok-chat'), { issue: false }), true);
  assert.equal(await wsAuth.allowed(req('tok-chat'), { issue: true }), false);
  assert.equal(await wsAuth.allowed(req('tok-issues'), { issue: true }), true);
  assert.equal(await wsAuth.allowed(req('tok-issues'), { issue: false }), false);
  assert.equal(await wsAuth.allowed(req('roto'), { issue: false }), false);
});
