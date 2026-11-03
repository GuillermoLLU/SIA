// Jira (E/S): cuándo se creó y se resolvió cada ticket escalado y en qué estado está, para los tiempos de escalado
// del servicio (escalation.js), y, de los que se piden con su historial, cuántas veces pasó de un equipo a otro (para
// las mal escaladas del Backlog). Con el token personal de quien actualiza (⚙️ Credenciales → Jira), por la API REST
// v2 de Jira Server, de BATCH en BATCH claves. Las fechas salen como las de Remedy: hora de Madrid, sin zona.
//
// config: () => { baseUrl, token } (config/config.js: cleanJira). fetch: el de Node (se inyecta para las pruebas).

export const BATCH = 100;
const ALONE = 8;
const FIELDS = 'created,resolutiondate,status';

// Cuántas veces pasó un ticket de un equipo a otro, según su historial: un cambio de proyecto (se mueve y cambia de
// clave) o de su campo de equipo («Equipo Asignado», «Equipos Logística»…) de uno a otro; que se le ponga equipo por
// primera vez no cuenta. El historial pesa (1,3 MB por cada 100 tickets): solo se pide cuando hace falta.
const TEAM_FIELD = /^equipos?\b/i;
export const movesOf = (changelog) => {
  let n = 0;
  for (const h of changelog?.histories || []) {
    for (const it of h.items || []) {
      if (it.field === 'project' || (TEAM_FIELD.test(it.field || '') && it.fromString && it.fromString !== it.toString)) n++;
    }
  }
  return n;
};

const fail = (message, status = 503) => Object.assign(new Error(message), { status });

// «2026-02-03T10:15:30.000+0100» → «2026-02-03 10:15:30», en hora de Madrid (como REPORTEDDATE de Remedy).
const MADRID = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
export const madrid = (iso) => {
  if (!iso) return '';
  const d = new Date(String(iso).replace(/([+-]\d\d)(\d\d)$/, '$1:$2'));
  return Number.isNaN(d.getTime()) ? '' : MADRID.format(d);
};

// Los errores de Jira, en lo que la persona puede hacer.
export const explain = (e) => {
  if (e.status === 401 || e.status === 403) return fail('Jira ha rechazado el token: revísalo en ⚙️ Credenciales → Jira.');
  if (/ENOTFOUND|ECONNREFUSED|ETIMEDOUT|fetch failed|CERT|certificate/i.test(`${e?.code} ${e?.message} ${e?.cause?.code}`)) {
    return fail('No se llega a Jira: comprueba la VPN y la URL en ⚙️ Credenciales → Jira.');
  }
  return fail(`Jira: ${e?.message || 'error desconocido'}`);
};

export const createJira = ({ config, fetch = globalThis.fetch }) => {
  const ready = () => { const { baseUrl, token } = config(); return !!(baseUrl && token); };

  const get = (path) => {
    const { baseUrl, token } = config();
    return fetch(`${baseUrl.replace(/\/+$/, '')}/rest/api/2/${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  };
  // moves: con historial, cuántas veces pasó de un equipo a otro; sin él, null (no se sabe)
  const ticketOf = (key, fields = {}, changelog = null) => ({ key, created: madrid(fields.created), resolved: madrid(fields.resolutiondate),
    status: fields.status?.name || '', moves: changelog ? movesOf(changelog) : null });
  const expand = (history) => (history ? '&expand=changelog' : '');

  // Un lote de claves → sus tickets. validateQuery=warn: una clave que no existe (o un proyecto que no es de Jira,
  // como el REJ-6 de una nota) no tumba la búsqueda, solo no sale. Un ticket que se movió de proyecto sale con su
  // clave nueva, no con la pedida.
  const search = async (keys, history) => {
    const res = await get(`search?jql=${encodeURIComponent(`key in (${keys.join(',')})`)}&fields=${FIELDS}&maxResults=${keys.length}&validateQuery=warn${expand(history)}`);
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
    return ((await res.json()).issues || []).map((x) => ticketOf(x.key, x.fields, history ? x.changelog : null));
  };
  // Una clave sola: Jira sigue a un ticket movido de proyecto y lo da con su clave nueva; se guarda con la pedida,
  // que es la que tienen las issues. null: no existe (o no se puede ver).
  const one = async (key, history) => {
    const res = await get(`issue/${encodeURIComponent(key)}?fields=${FIELDS}${expand(history)}`);
    if ([400, 403, 404].includes(res.status)) return null;
    if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
    const x = await res.json();
    return ticketOf(key, x.fields, history ? x.changelog : null);
  };

  // keys → { found: [ticket], missing: [clave] }. history: las claves que se piden con su historial (las demás, sin
  // él: moves null). onBatch(n): cuántas claves lleva pedidas (el avance). Las que no salen en los lotes se piden una
  // a una, de ALONE en ALONE a la vez (los tickets movidos de proyecto).
  const tickets = async (keys, { onBatch = () => {}, history = new Set() } = {}) => {
    if (!ready()) throw fail('Configura Jira en ⚙️ Credenciales → Jira para medir THesc, Tesc y Tesc-r.', 400);
    const found = [], groups = [keys.filter((k) => history.has(k)), keys.filter((k) => !history.has(k))];
    try {
      let done = 0;
      for (const [g, list] of groups.entries()) {
        for (let n = 0; n < list.length; n += BATCH) {
          found.push(...await search(list.slice(n, n + BATCH), g === 0));
          onBatch(done += Math.min(BATCH, list.length - n));
        }
      }
      const got = new Set(found.map((t) => t.key)), rest = keys.filter((k) => !got.has(k));
      for (let n = 0; n < rest.length; n += ALONE) found.push(...(await Promise.all(rest.slice(n, n + ALONE).map((k) => one(k, history.has(k))))).filter(Boolean));
    } catch (e) {
      throw explain(e);
    }
    const got = new Set(found.map((t) => t.key));
    return { found, missing: keys.filter((k) => !got.has(k)) };
  };

  return { ready, tickets };
};
