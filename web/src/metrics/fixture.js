// Datos inventados para las pruebas de las Métricas: lo que calcula el bridge (server/metrics/dataset.js) con
// cinco issues (minutos desde el 1 de enero; la foto, en el minuto 100.000):
// 1 Indra crítica, en curso a los 10 min · 2 T-Systems alta, en curso a los 100 min
// 3 Indra media, abierta y sin iniciar · 4 Indra baja, cerrada sin pasar por En curso
// 5 sin responsable
export const SNAP = 100000;
export const data = () => ({
  meta: { file: 'x.csv', start: 2026, first: 1000, last: 99800, group: 'AYS SOPORTE', rows: 5, total: 5, snapshot: SNAP, generated: '2026-10-14T08:00:00Z' },
  dict: { status: ['', 'CLOSED', 'ASSIGNED'], reason: [''], prio: ['', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'], svc: ['', 'USER_SERVICE_RESTORATION'],
    person: ['', 'ANA', 'LUIS'], centre: ['', 'C1'], op: ['', 'ECOM Zara'], module: ['', 'EWMS', 'PACKING'], cat: ['', 'X'],
    vtype: ['', 'TEC'], vproj: ['', 'SGA'], vkey: ['', 'SGA-1'], vtext: ['', 'TEC: SGA-1 / SGA-2'], resol: ['', 'reinicio'], problem: ['', 'etiqueta mal'] },
  themes: ['Tema A', 'Tema B'],
  reasons: { client: ['CLIENT_ACTION_REQUIRED', 'CUSTOMER_FOLLOW_UP_REQUIRED'], vendor: ['THIRD_PARTY_VENDOR_ACTION_REQD'] },
  company: [2, 0, 1],
  cols: {
    id: [1, 2, 3, 4, 5], rep: [1000, 2000, SNAP - 200, 5000, 6000], res: [1060, 5000, -1, 5100, 6001],
    st: [1, 1, 2, 1, 1], rs: [0, 0, 0, 0, 0], pr: [1, 2, 3, 4, 2], sv: [1, 1, 1, 1, 1], as: [1, 2, 1, 1, 0],
    ce: [1, 1, 1, 0, 1], op: [1, 1, 1, 1, 1], mo: [1, 2, 1, 2, 1], k3: [1, 0, 1, 1, 1], sc: [1, 2, 1, 0, 0], fl: [0, 512, 0, 0, 0],
    vt: [1, 0, 0, 0, 0], vp: [1, 0, 0, 0, 0], vk: [1, 0, 0, 0, 0], vn: [1, 0, 0, 0, 0], fr: [10, 100, -1, 50, 1], ip: [10, 100, -1, -1, -1],
    tA: [10, 100, 200, 50, 0], tI: [50, 2900, 0, 0, 0], tPc: [0, 0, 0, 0, 0], tPv: [0, 0, 0, 0, 0], tPo: [0, 0, 0, 0, 0],
    nb: [0, 1, 0, 0, 0], np: [0, 0, 0, 0, 0], th: [1, 2, 3, 0, 0], rz: [1, 0, 0, 0, 0], de: [1, 0, 0, 0, 0],
    the: [-1, -1, -1, -1, -1], tes: [-1, -1, -1, -1, -1], tcr: [-1, -1, -1, -1, -1], tsr: [-1, -1, -1, -1, -1],
    hQ: [-1, -1, -1, -1, -1], hI: [-1, -1, -1, -1, -1], hPc: [-1, -1, -1, -1, -1], hPo: [-1, -1, -1, -1, -1],   // el THesc por estados
    eR: [[0], [3], [], [3], [4]], eV: [[], [], [], [], []], eC: [[], [], [], [], []],   // días en que se resolvieron
    su: ['100001 High ECOM ZARA C1 EWMS - Etiqueta mal', 'Otro título', 'Abierta', '100002 Low ALGO', 'Sin responsable'],
  },
});
