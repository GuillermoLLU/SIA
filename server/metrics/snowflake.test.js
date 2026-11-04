import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createSnowflake, explain, ACCOUNT } from './snowflake.js';
import { SESSION } from './query.js';

// Un snowflake-sdk falso: apunta lo que se le pide y devuelve las filas dadas.
const fakeSdk = ({ rows = [], connectError, queryError } = {}) => {
  const log = { sql: [], destroyed: 0 };
  const sdk = {
    configure: () => {},
    createConnection: (opts) => {
      log.opts = opts;
      return {
        connectAsync: async () => { if (connectError) throw connectError; },
        execute: ({ sqlText, binds, streamResult, fetchAsString, complete }) => {
          log.sql.push(sqlText);
          if (!streamResult) { complete(null); return {}; }
          Object.assign(log, { binds, fetchAsString });
          if (!queryError) complete(null, { getNumRows: () => rows.length });
          return { streamRows: () => (queryError ? Readable.from((async function* () { throw queryError; })()) : Readable.from(rows)) };
        },
        destroy: (cb) => { log.destroyed++; cb(); },
      };
    },
  };
  return { sdk, log };
};
const CONFIG = { user: 'ANA@EXT.INDITEX.COM', role: 'R_SGA_USERS', warehouse: 'COMMON_USERS_WH' };
const collect = async (it) => { const out = []; for await (const r of it) out.push(r); return out; };

test('conecta por SSO con el usuario de la persona, fija el formato de fechas y trae las filas como texto', async () => {
  const { sdk, log } = fakeSdk({ rows: [{ INCIDENTNUMBER: 'INC1', NOTES: null }, { INCIDENTNUMBER: 'INC2', NOTES: 'x' }] });
  const sf = createSnowflake({ loadSdk: async () => sdk, config: () => CONFIG });
  // sin valor, '' como en el CSV (si no, decide vería un cambio en cada vuelta)
  let total = null, connected = 0;
  assert.deepEqual(await collect(sf.rows('SELECT 1', ['2026-01-01 00:00:00.000'], { onConnect: () => connected++, onTotal: (n) => { total = n; } })), [{ INCIDENTNUMBER: 'INC1', NOTES: '' }, { INCIDENTNUMBER: 'INC2', NOTES: 'x' }]);
  assert.equal(total, 2, 'avisa de cuántas filas van a llegar');
  assert.equal(connected, 1, 'y de cuándo, cargado el conector, empieza a conectar');
  assert.deepEqual(log.opts, { account: ACCOUNT, username: CONFIG.user, role: CONFIG.role, warehouse: CONFIG.warehouse,
    authenticator: 'EXTERNALBROWSER', clientStoreTemporaryCredential: true, representNullAsStringNull: false });
  assert.deepEqual(log.sql, [...SESSION, 'SELECT 1']);
  assert.deepEqual([log.binds, log.fetchAsString], [['2026-01-01 00:00:00.000'], ['Date', 'Number']]);
  assert.equal(log.destroyed, 1);
});

test('sin usuario configurado: 400 y no se carga el conector', async () => {
  let loaded = false;
  const sf = createSnowflake({ loadSdk: async () => { loaded = true; }, config: () => ({ ...CONFIG, user: '' }) });
  await assert.rejects(collect(sf.rows('SELECT 1', [])), (e) => e.status === 400 && /Configuración → Snowflake/.test(e.message));
  assert.equal(loaded, false);
});

test('un fallo al conectar o a mitad de la consulta: su explicación, y la conexión se cierra', async () => {
  const policy = Object.assign(new Error('Authentication attempt rejected'), { code: '390202' });
  const a = fakeSdk({ connectError: policy });
  await assert.rejects(collect(createSnowflake({ loadSdk: async () => a.sdk, config: () => CONFIG }).rows('SELECT 1', [])), /actualiza SIA/);
  assert.equal(a.log.destroyed, 1);
  const b = fakeSdk({ queryError: Object.assign(new Error('Object does not exist or not authorized'), { code: '002003' }) });
  await assert.rejects(collect(createSnowflake({ loadSdk: async () => b.sdk, config: () => CONFIG }).rows('SELECT 1', [])), (e) => e.status === 503 && /rol/.test(e.message));
  assert.equal(b.log.destroyed, 1);
});

test('sin los certificados del cliente: relee los del sistema para que la siguiente actualización valga sin reiniciar', async () => {
  let refreshed = 0;
  const refreshCerts = async () => { refreshed++; };
  const a = fakeSdk({ connectError: new Error('self-signed certificate in certificate chain') });
  await assert.rejects(collect(createSnowflake({ loadSdk: async () => a.sdk, config: () => CONFIG, refreshCerts }).rows('SELECT 1', [])), /vuelve a actualizar/);
  assert.equal(refreshed, 1);
  const b = fakeSdk({ connectError: Object.assign(new Error('getaddrinfo'), { code: 'ENOTFOUND' }) });
  await assert.rejects(collect(createSnowflake({ loadSdk: async () => b.sdk, config: () => CONFIG, refreshCerts }).rows('SELECT 1', [])), /VPN/);
  assert.equal(refreshed, 1);   // otro fallo: no relee nada
});

test('explain: cada error en lo que se puede hacer', () => {
  assert.match(explain({ code: '000606' }).message, /warehouse/);
  assert.match(explain({ code: 'ENOTFOUND', message: 'getaddrinfo' }).message, /VPN/);
  assert.match(explain({ code: 'ENOTFOUND', message: 'getaddrinfo' }).message, /red/);
  assert.match(explain({ message: 'self-signed certificate in certificate chain' }, 'https://guia.example').message, /certificados del cliente.*https:\/\/guia\.example.*vuelve a actualizar\. No hace falta reiniciar SIA/);
  assert.match(explain({ message: 'self-signed certificate in certificate chain' }).message, /soporte/);
  assert.equal(explain({ code: '1', message: 'otro' }).message, 'Snowflake: otro');
});
