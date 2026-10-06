import test from 'node:test';
import assert from 'node:assert/strict';
import { issuesRoutes } from './routes.js';

const issue = (id, o = {}) => ({ id, center: '100', text: id, priority: 'HIGH', status: 'ASSIGNED', assignee: '', prio: false,
  reported: '2026-10-01 10:00', modified: '', resolved: '', notes: 'detalle', changes: [], ...o });
const ISSUES = [issue('INC1'), issue('INC2', { prio: true }), issue('INC3', { assignee: 'ANA LOPEZ GARCIA', status: 'PENDING' })];

const setup = (claims = []) => {
  const calls = [];
  const platform = {
    rpc: async (jwt, fn, args) => {
      calls.push([fn, args]);
      if (fn === 'platform_issue_claims') return claims;
      if (fn === 'platform_my_issue_events') return [];
      if (fn === 'platform_issue_teammates') return [{ id: 'u-ana', name: 'Ana López' }, { id: 'u-luis', name: 'Luis' }];
      if (fn === 'platform_claim_next_issue') return args.p_candidates[0] ?? null;
      return null;
    },
  };
  const auth = { context: async (t) => (t === 'ok' ? { user: { id: 'u-ana', name: 'Ana López' }, accessToken: 'jwt' } : null) };
  const source = { load: () => ({ taken: '2026-10-04T09:44:00.000Z', issues: ISSUES }) };
  const route = issuesRoutes(source, auth, platform, {
    json: (res, status, body) => Object.assign(res, { status, body }),
    readBody: async (req) => req.body || {},
  });
  const call = async (method, path, { token = 'ok', body } = {}) => {
    const res = {};
    await route({ method, headers: { 'x-sia-auth': token }, body }, res, path);
    return res;
  };
  return { call, calls };
};

test('sin sesión: 401', async () => {
  assert.equal((await setup().call('GET', [], { token: 'x' })).status, 401);
});

test('GET /: libres, reglas y mi mesa (responsable en Remedy o cogida en SIA)', async () => {
  const { body } = await setup([{ issue_id: 'INC1', user_id: 'u-ana', user_name: 'Ana López' }]).call('GET', []);
  assert.equal(body.free, 1);
  assert.deepEqual(body.rules, [{ id: 'basic', label: 'Regla básica' }]);
  assert.deepEqual(body.desk.map((i) => [i.id, i.claimed]), [['INC1', true], ['INC3', false]]);
  assert.equal(body.desk[0].notes, undefined);
  assert.equal(body.next.id, 'INC2');
  assert.equal(body.history.weeks.length, 12);
  assert.deepEqual(body.today, { resolved: 0, sga: 0, sisu: 0 });
});

test('POST /next: manda la cola en orden de la regla y devuelve la que se lleva', async () => {
  const { call, calls } = setup();
  const r = await call('POST', ['next'], { body: { rule: 'basic' } });
  assert.deepEqual(r.body, { id: 'INC2' });
  assert.deepEqual(calls.at(-1), ['platform_claim_next_issue', { p_candidates: ['INC2', 'INC1'] }]);
});

test('GET /:id: el detalle completo, quién la tiene y las del mismo centro', async () => {
  const { body } = await setup([{ issue_id: 'INC1', user_id: 'u-ana', user_name: 'Ana López', claimed_at: '2026-10-06T08:00:00Z' }]).call('GET', ['INC1']);
  assert.equal(body.issue.notes, 'detalle');
  assert.deepEqual(body.issue.claimedBy, { id: 'u-ana', name: 'Ana López', at: '2026-10-06T08:00:00Z' });
  assert.deepEqual(body.sameCenter.map((i) => i.id), ['INC2', 'INC3']);
});

test('ids raros: 404; devolver: a la base', async () => {
  const { call, calls } = setup();
  assert.equal((await call('GET', ['x;drop'])).status, 404);
  assert.equal((await call('GET', ['INC9'])).status, 404);
  assert.deepEqual((await call('POST', ['INC1', 'release'])).body, { ok: true });
  assert.deepEqual(calls.at(-1), ['platform_release_issue', { p_issue: 'INC1' }]);
});

test('GET /teammates: el equipo de Issues sin mí', async () => {
  const { body } = await setup().call('GET', ['teammates']);
  assert.deepEqual(body, { teammates: [{ id: 'u-luis', name: 'Luis' }] });
});
