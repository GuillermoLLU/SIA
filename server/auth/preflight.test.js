import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreflight } from './preflight.js';

// health: lo que responde la base en cada intento, por orden (el último se repite)
const setup = ({ health = [async () => ({})], vpn = true, vpnHost = 'jira.x' } = {}) => {
  const log = [];
  let n = 0;
  const run = createPreflight({
    platform: { health: async () => { log.push('health'); return health[Math.min(n++, health.length - 1)](); } },
    refreshCerts: async () => log.push('refreshCerts'),
    onVpn: async (host) => { log.push(['vpn', host]); return vpn; },
    vpnHost,
  });
  return { log, run };
};

const certsErr = () => Object.assign(new Error('Faltan.'), { status: 503, code: 'certs', help: { url: 'https://guia' } });
const noCerts = async () => { throw certsErr(); };

test('equipo listo: prueba la base y la VPN, sin releer los certificados', async () => {
  const s = setup();
  await s.run();
  assert.deepEqual(s.log, ['health', ['vpn', 'jira.x']]);
});

test('los acaba de instalar: falla, los relee y, al volver a probar, pasa', async () => {
  const s = setup({ health: [noCerts, async () => ({})] });
  await s.run();
  assert.deepEqual(s.log, ['health', 'refreshCerts', 'health', ['vpn', 'jira.x']]);
});

test('sin certificados: los relee una vez y da el error de la base (code certs)', async () => {
  const err = certsErr();
  const s = setup({ health: [async () => { throw err; }] });
  await assert.rejects(s.run(), (e) => e === err);
  assert.deepEqual(s.log.slice(0, 3), ['health', 'refreshCerts', 'health']);
});

test('fuera de la VPN: 503 con code vpn; sin VPN configurada, no se mira', async () => {
  await assert.rejects(setup({ vpn: false }).run(), (e) => e.status === 503 && e.code === 'vpn');
  const s = setup({ vpn: false, vpnHost: '' });
  await s.run();
  assert.deepEqual(s.log, ['health']);
});

test('sin certificados ni VPN: los dos a la vez (certs-vpn), con la guía', async () => {
  await assert.rejects(setup({ health: [noCerts], vpn: false }).run(),
    (e) => e.status === 503 && e.code === 'certs-vpn' && e.help.url === 'https://guia');
});

test('la base cae por otro motivo: ese error, sin releer nada, aunque falte la VPN', async () => {
  const err = Object.assign(new Error('Sin conexión con la base de la instancia.'), { status: 503 });
  const s = setup({ health: [async () => { throw err; }], vpn: false });
  await assert.rejects(s.run(), (e) => e === err);
  assert.deepEqual(s.log, ['health']);
});
