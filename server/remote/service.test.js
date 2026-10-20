import test from 'node:test';
import assert from 'node:assert/strict';
import { createRemote } from './service.js';

const setup = ({ pin = true, tunnelLive = false } = {}) => {
  let t = 1000;
  const closed = [];
  const ws = [];
  const tunnel = { state: { phase: tunnelLive ? 'ready' : 'off', url: tunnelLive ? 'https://x.trycloudflare.com' : null, error: null }, installed: () => true, live: () => tunnelLive, start: (cb) => { tunnel.started = cb; }, stop() { tunnel.state.phase = 'off'; } };
  const lock = { hasPin: () => pin, matches: (k) => k === '1234' };
  const remote = createRemote({ lock, tunnel, apiPort: 58528, wsClients: () => ws, lanIp: () => '192.168.1.9', now: () => t, idleMs: 1000 });
  const req = (ua = 'Mozilla/5.0 (iPhone) Safari/1') => ({ headers: { 'user-agent': ua }, socket: { remoteAddress: '::ffff:10.0.0.7' } });
  const socketFor = (token) => { const c = { _siaToken: token, _siaLan: true, readyState: 1, close: (code) => closed.push([token, code]) }; ws.push(c); return c; };
  return { remote, tunnel, req, socketFor, closed, tick: (ms) => { t += ms; }, now: () => t };
};

test('emparejar en la LAN: QR+PIN de un solo uso, cinco fallos lo invalidan', () => {
  const s = setup();
  assert.equal(s.remote.active(), false);
  assert.deepEqual(s.remote.enable('lan'), {});
  const st = s.remote.status();
  assert.equal(st.active, true);
  assert.equal(st.qrUrl, `http://192.168.1.9:58528/?p=${st.qrUrl.split('p=')[1]}`);
  assert.match(st.pin, /^\d{6}$/);
  assert.equal(s.remote.pair(s.req(), { pin: '000000' }), null);
  const got = s.remote.pair(s.req(), { pin: st.pin });
  assert.equal(got.mode, 'lan');
  assert.equal(s.remote.session(got.sessionToken).name, 'iPhone · Safari');
  assert.equal(s.remote.pair(s.req(), { pin: st.pin }), null, 'de un solo uso');
  s.remote.enable('lan');
  for (let i = 0; i < 5; i++) s.remote.pair(s.req(), { pin: '000000' });
  assert.equal(s.remote.status().pendingPairing, false, 'invalidado');
});

test('el QR caduca a los cinco minutos', () => {
  const s = setup();
  s.remote.enable('lan');
  s.tick(5 * 60_000 + 1);
  assert.equal(s.remote.status().pendingPairing, false);
});

test('candado del móvil: bloquear corta sus sockets; desbloquear con el PIN; cinco fallos revocan', () => {
  const s = setup();
  s.remote.enable('lan');
  const { sessionToken } = s.remote.pair(s.req(), { pin: s.remote.status().pin });
  s.socketFor(sessionToken);
  assert.equal(s.remote.lock(sessionToken), true);
  assert.deepEqual(s.closed, [[sessionToken, 4423]]);
  assert.deepEqual(s.remote.unlock(sessionToken, '0000'), { left: 4 });
  assert.deepEqual(s.remote.unlock(sessionToken, '1234'), { ok: true });
  assert.equal(s.remote.session(sessionToken).locked, false);
  for (let i = 0; i < 4; i++) s.remote.unlock(sessionToken, '0000');
  assert.match(s.remote.unlock(sessionToken, '0000').gone, /revocada/);
  assert.equal(s.remote.session(sessionToken), null);
  assert.equal(s.closed.at(-1)[1], 4403);
  assert.match(s.remote.unlock('otro', '1234').gone, /revocada/);
});

test('sin PIN de bloqueo no se bloquea ni se abre el acceso público', () => {
  const s = setup({ pin: false });
  s.remote.enable('lan');
  const { sessionToken } = s.remote.pair(s.req(), { pin: s.remote.status().pin });
  assert.equal(s.remote.lock(sessionToken), false);
  assert.equal(s.remote.enable('public').needsPin, true);
});

test('público: arranca el túnel y el QR llega al estar listo; vivo, solo un QR nuevo; inactividad bloquea', () => {
  const s = setup();
  assert.deepEqual(s.remote.enable('public'), {});
  assert.equal(s.remote.status().pendingPairing, false);
  s.tunnel.state.url = 'https://x.trycloudflare.com'; s.tunnel.state.phase = 'ready';
  s.tunnel.started();
  assert.match(s.remote.status().qrUrl, /^https:\/\/x\.trycloudflare\.com\/\?p=/);
  const { sessionToken } = s.remote.pair(s.req(), { pin: s.remote.status().pin });
  s.tick(1500);
  s.remote.lockIdle();
  assert.equal(s.remote.session(sessionToken).locked, true);
  const live = setup({ tunnelLive: true });
  live.remote.enable('public');
  assert.equal(live.remote.status().pendingPairing, true);
});

test('revocar un dispositivo y apagar el acceso', () => {
  const s = setup();
  s.remote.enable('lan');
  const { sessionToken } = s.remote.pair(s.req(), { pin: s.remote.status().pin });
  s.socketFor(sessionToken);
  assert.equal(s.remote.revokeDevice('nope'), false);
  assert.equal(s.remote.revokeDevice(s.remote.status().list[0].id), true);
  assert.equal(s.remote.status().devices, 0);
  s.remote.enable('lan');
  s.remote.disable();
  assert.equal(s.remote.active(), false);
});
