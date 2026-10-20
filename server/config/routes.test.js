import test from 'node:test';
import assert from 'node:assert/strict';
import { configRoutes } from './routes.js';

const setup = (cfg = {}) => {
  const themes = [];
  const store = { read: () => cfg, patch: (c) => { cfg = { ...cfg, ...c }; } };
  const route = configRoutes(store, { json: (res, status, body) => Object.assign(res, { status, body }), readBody: async (req) => req.body, version: '1.2.3', onTheme: (t) => themes.push(t) });
  return { call: async (method, body) => { const res = {}; await route({ method, body }, res); return res; }, cfg: () => cfg, themes };
};

test('GET: Jira, GitHub y la versión; nunca sesiones ni candado', async () => {
  const { call } = setup({ jira: { baseUrl: 'u' }, github: { keys: [] }, sessions: [1], lock: {} });
  assert.deepEqual((await call('GET')).body, { jira: { baseUrl: 'u' }, github: { keys: [] }, version: '1.2.3' });
});

test('PUT: solo lo que viene, saneado; el tema avisa si vale', async () => {
  const s = setup({ sessions: [1] });
  const ui = { bg: '#fff', surface: '#fff', border: '#fff', text: '#fff', textLow: '#fff', accent: '#fff', scrollbar: '#fff' };
  await s.call('PUT', { jira: { baseUrl: ' j ' }, theme: { id: 'dark', ui } });
  assert.deepEqual(s.cfg(), { sessions: [1], jira: { baseUrl: 'j', token: '' }, theme: { id: 'dark', ui } });
  assert.equal(s.themes.length, 1);
  await s.call('PUT', { theme: { id: 'bad' } });
  assert.equal(s.themes.length, 1, 'un tema que no vale no se guarda ni se avisa');
});
