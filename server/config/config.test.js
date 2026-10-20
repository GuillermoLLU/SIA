import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanTheme, cleanGithub, cleanJira, activeGithubToken, userEnv, cleanEnv, migrate } from './config.js';

const UI = { bg: '#fff', surface: '#ffffff', border: '#e1e4e8', text: '#1f2328', textLow: '#656d76', accent: '#2563eb', scrollbar: '#d0d5dbff' };

test('cleanTheme: id corto y siete colores hexadecimales reales; lo demás, null', () => {
  assert.deepEqual(cleanTheme({ id: 'light', ui: { ...UI, extra: 'x' } }), { id: 'light', ui: UI });
  assert.equal(cleanTheme({ id: 'light', ui: { ...UI, bg: '#12345' } }), null, 'cinco dígitos no es un color');
  assert.equal(cleanTheme({ id: 'light', ui: { ...UI, bg: 'red' } }), null);
  assert.equal(cleanTheme({ id: 'light', ui: { bg: '#fff' } }), null, 'faltan colores');
  assert.equal(cleanTheme({ id: 'a b', ui: UI }), null);
  assert.equal(cleanTheme(null), null);
});

test('cleanGithub: entradas con token, nombres por defecto, tope 20 y la activa tiene que existir', () => {
  const g = cleanGithub({ keys: [{ token: ' t1 ' }, { id: 'w', name: ' Trabajo ', token: 't2' }, { token: '' }, null], activeId: 'w' });
  assert.deepEqual(g, { keys: [{ id: 'gh1', name: 'Clave 1', token: 't1' }, { id: 'w', name: 'Trabajo', token: 't2' }], activeId: 'w' });
  assert.equal(cleanGithub({ keys: [{ token: 't' }], activeId: 'nope' }).activeId, null);
  assert.equal(cleanGithub({ keys: Array.from({ length: 25 }, () => ({ token: 't' })) }).keys.length, 20);
  assert.deepEqual(cleanGithub(null), { keys: [], activeId: null });
});

test('cleanJira: recortado y siempre con los dos campos', () => {
  assert.deepEqual(cleanJira({ baseUrl: ' https://jira ', token: ' x ' }), { baseUrl: 'https://jira', token: 'x' });
  assert.deepEqual(cleanJira(undefined), { baseUrl: '', token: '' });
});

test('userEnv: Jira y la clave de GitHub activa, nada más', () => {
  const cfg = { jira: { baseUrl: 'https://jira', token: 'jt' }, github: { keys: [{ id: 'a', token: 'ga' }, { id: 'b', token: 'gb' }], activeId: 'b' } };
  assert.deepEqual(userEnv(cfg), { JIRA_BASE_URL: 'https://jira', JIRA_API_TOKEN: 'jt', GH_TOKEN: 'gb', GITHUB_TOKEN: 'gb' });
  assert.deepEqual(userEnv({ github: { keys: [{ id: 'a', token: 'ga' }], activeId: null } }), {});
  assert.equal(activeGithubToken({}), '');
});

test('cleanEnv: fuera las marcas de Claude Code y los tokens de GitHub heredados', () => {
  assert.deepEqual(cleanEnv({ PATH: '/bin', CLAUDECODE: '1', CLAUDE_CODE_SSE_PORT: '2', GH_TOKEN: 'x', GITHUB_TOKEN: 'y' }), { PATH: '/bin' });
});

test('migrate: usuarios locales y github antiguo; sin nada que migrar, null', () => {
  const live = (s) => (s || []).filter((x) => x.refreshToken);
  assert.equal(migrate({ jira: {} }, live), null);
  assert.deepEqual(migrate({ users: [1], sessions: [{ hash: 'a' }, { hash: 'b', refreshToken: 'r' }] }, live), { sessions: [{ hash: 'b', refreshToken: 'r' }] });
  assert.deepEqual(migrate({ github: { token: 'old' } }, live), { github: { keys: [{ id: 'gh1', name: 'Principal', token: 'old' }], activeId: 'gh1' } });
  assert.equal(migrate({ github: { keys: [], activeId: null } }, live), null);
});
