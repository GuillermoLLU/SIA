import test from 'node:test';
import assert from 'node:assert/strict';
import { can, allowed, viewsForRoute } from './views.js';

const p = (path) => ['api', ...path.split('/')];

test('can: solo las vistas que tiene', () => {
  assert.equal(can({ views: ['links'] }, 'links'), true);
  assert.equal(can({ views: ['links'] }, 'people'), false);
  assert.equal(can({}, 'links'), false);
  assert.equal(can(null, 'links'), false);
});

test('cada ruta de gestión pide su vista', () => {
  assert.deepEqual(viewsForRoute(p('admin/projects'), 'GET'), ['admin']);
  assert.deepEqual(viewsForRoute(p('links'), 'POST'), ['links']);
  assert.deepEqual(viewsForRoute(p('issues'), 'GET'), ['issues']);
  assert.deepEqual(viewsForRoute(p('metrics/csv'), 'POST'), ['metrics']);
  assert.deepEqual(viewsForRoute(p('drafts'), 'GET'), ['lab']);
  assert.deepEqual(viewsForRoute(p('skills/x'), 'DELETE'), ['lab']);
  assert.deepEqual(viewsForRoute(p('users'), 'GET'), ['people']);
  assert.deepEqual(viewsForRoute(p('knowledge/bases'), 'GET'), ['people']);
});

test('lo de todos solo pide sesión', () => {
  for (const [path, m] of [['admin/check', 'GET'], ['skills', 'GET'], ['bases', 'GET'], ['config', 'PUT'], ['access/info', 'POST']]) {
    assert.equal(viewsForRoute(p(path), m), null, path);
  }
});

test('allowed: basta con una de las vistas', () => {
  assert.equal(allowed({ views: ['links'] }, p('links'), 'GET'), true);
  assert.equal(allowed({ views: ['links'] }, p('links'), 'PUT'), true);
  assert.equal(allowed({ views: ['admin'] }, p('links'), 'GET'), false);
  assert.equal(allowed({ views: [] }, p('links'), 'GET'), false);
  assert.equal(allowed({ views: [] }, p('skills'), 'GET'), true);
});
