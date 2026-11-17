// Jira de prueba (#136), hasta mirarlo con el token de cada persona: el estado
// de cada ticket sale de <issues>/jira-prueba.json, que solo existe en el equipo
// de quien prueba ({ "SISUPAC-9211": { "state": "resolved", "at": "2026-11-17 08:00" } }).
// Lo que no está ahí, abierto.
export const createJiraMock = ({ file, fs }) => ({
  async states(keys) {
    let known = {};
    try { known = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* sin fichero: todo abierto */ }
    return new Map(keys.map((k) => [k, known[k] || { state: 'open' }]));
  },
});
