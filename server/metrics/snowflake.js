// Snowflake (E/S): la conexión de cada persona con su usuario, por SSO. Se abre
// el navegador de este equipo para entrar con la cuenta de Inditex y el token
// queda en la caché de credenciales del sistema, así que las siguientes veces
// no se abre; SIA no guarda ninguna contraseña. Se conecta en cada
// actualización y se cierra al acabar.
//
// loadSdk: () => el módulo snowflake-sdk (se carga al usarse: pesa y solo lo
// necesita Métricas). Desde la 3.4 (la 2.x la rechaza la política de Inditex).
// config: () => { user, role, warehouse } (config/config.js: cleanSnowflake).
import { SESSION } from './query.js';

export const ACCOUNT = 'INDITEX-INDITEX';

const fail = (message, status = 503) => Object.assign(new Error(message), { status });

// Los errores de Snowflake, en lo que la persona puede hacer. helpUrl: la guía
// oficial del cliente para instalar sus certificados (sia-instance.json).
export const explain = (e, helpUrl = '') => {
  const code = String(e?.code ?? '');
  if (code === '390202') return fail('Snowflake ha rechazado esta versión del conector: actualiza SIA.');
  if (code === '002003') return fail('Tu rol de Snowflake no puede leer las tablas de Remedy (SGA.SIGLO): revisa el rol en Configuración → Snowflake.');
  if (code === '000606') return fail('Snowflake no tiene warehouse para la consulta: revisa el warehouse en Configuración → Snowflake.');
  if (/CERT|certificate/i.test(`${code} ${e?.message}`)) {
    return fail(`No se puede verificar la conexión con Snowflake: faltan los certificados del cliente en este equipo. ${helpUrl ? `Instálalos con su guía (${helpUrl})` : 'Pide la guía de certificados a soporte'} y reinicia SIA.`);
  }
  if (code === '401001' || /ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(`${code} ${e?.message}`)) {
    return fail('No se llega a Snowflake: solo es accesible desde la red de Inditex. Conecta la VPN y vuelve a intentarlo.');
  }
  return fail(`Snowflake: ${e?.message || 'error desconocido'}`);
};

export const createSnowflake = ({ loadSdk, config, certsHelpUrl = '' }) => {
  const run = (conn, sqlText) => new Promise((ok, ko) => conn.execute({ sqlText, complete: (e) => (e ? ko(e) : ok()) }));

  // Las filas de la consulta, una a una y como texto, con '' donde no hay valor:
  // igual que las del CSV, para que decide (incidents.js) no vea cambios que no hay. onConnect(): el conector ya
  // está cargado y empieza la conexión; onTotal(n): cuántas van a llegar, en cuanto Snowflake acaba la consulta.
  async function* rows(sql, binds, { onConnect = () => {}, onTotal = () => {} } = {}) {
    const { user, role, warehouse } = config();
    if (!user) throw fail('Configura tu usuario de Snowflake en Configuración → Snowflake.', 400);
    const sdk = await loadSdk();
    onConnect();
    sdk.configure({ logLevel: 'ERROR' });
    const conn = sdk.createConnection({ account: ACCOUNT, username: user, role, warehouse,
      authenticator: 'EXTERNALBROWSER', clientStoreTemporaryCredential: true,
      representNullAsStringNull: false });   // sin esto, una fecha sin valor llega como el texto «NULL»
    try {
      await conn.connectAsync();
      for (const s of SESSION) await run(conn, s);
      const statement = conn.execute({ sqlText: sql, binds, streamResult: true, fetchAsString: ['Date', 'Number'],
        complete: (e, st) => { if (!e) onTotal(st.getNumRows()); } });   // un error llega también por streamRows
      for await (const row of statement.streamRows()) {
        for (const c in row) if (row[c] === null) row[c] = '';
        yield row;
      }
    } catch (e) {
      throw e.status ? e : explain(e, certsHelpUrl);
    } finally {
      await new Promise((ok) => conn.destroy(() => ok()));
    }
  }

  return { rows };
};
