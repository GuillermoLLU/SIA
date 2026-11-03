import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreflight } from './preflight.js';

const setup = ({ health = async () => ({}), vpn = true, vpnHost = 'jira.x' } = {}) => {
  const log = [];
  const run = createPreflight({
    platform: { health: async () => { log.push('health'); return health(); } },
    refreshCerts: async () => log.push('refreshCerts'),
    onVpn: async (host) => { log.push(['vpn', host]); return vpn; },
    vpnHost,
  });
  return { log, run };
};

test('equipo listo: relee los certificados, prueba la base y la VPN, por ese orden', async () => {
  const s = setup();
  await s.run();
  assert.deepEqual(s.log, ['refreshCerts', 'health', ['vpn', 'jira.x']]);
});

const certsErr = () => Object.assign(new Error('Faltan.'), { status: 503, code: 'certs', help: { url: 'https://guia' } });

test('sin certificados: el error de la base tal cual (code certs)', async () => {
  const err = certsErr();
  await assert.rejects(setup({ health: async () => { throw err; } }).run(), (e) => e === err);
});

test('fuera de la VPN: 503 con code vpn; sin VPN configurada, no se mira', async () => {
  await assert.rejects(setup({ vpn: false }).run(), (e) => e.status === 503 && e.code === 'vpn');
  const s = setup({ vpn: false, vpnHost: '' });
  await s.run();
  assert.deepEqual(s.log, ['refreshCerts', 'health']);
});

test('sin certificados ni VPN: los dos a la vez (certs-vpn), con la guía', async () => {
  await assert.rejects(setup({ health: async () => { throw certsErr(); }, vpn: false }).run(),
    (e) => e.status === 503 && e.code === 'certs-vpn' && e.help.url === 'https://guia');
});

test('la base cae por otro motivo: ese error, aunque falte la VPN', async () => {
  const err = Object.assign(new Error('Sin conexión con la base de la instancia.'), { status: 503 });
  await assert.rejects(setup({ health: async () => { throw err; }, vpn: false }).run(), (e) => e === err);
});
