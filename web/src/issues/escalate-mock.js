// Datos de prueba de Escalar, hasta tener el catálogo completo de #34 y los
// eventos de SIA (#24): un extracto del mapa de escalado de soporte ECOM (un
// destino de cada tipo) y tickets ya abiertos para vincular.

// level: N2 o N3 · via: por dónde se escala · opens: lo que abre (jira, remedy o none)
// · project: el proyecto de Jira que abre, para comprobar el ticket.
export const DESTINATIONS = [
  { id: 'sisupac', name: 'SISUPAC · N3 SISU', level: 'N3', via: 'SIGLO', opens: 'jira', project: 'SISUPAC' },
  { id: 'sisustock', name: 'SISUSTOCK · N3 SISU', level: 'N3', via: 'SIGLO', opens: 'jira', project: 'SISUSTOCK' },
  { id: 'sgaewmsap', name: 'SGAEWMSAP · N3 SGA', level: 'N3', via: 'SIGLO', opens: 'jira', project: 'SGAEWMSAP' },
  { id: 'wospac', name: 'WOSPAC · N3 SGA', level: 'N3', via: 'SIGLO', opens: 'jira', project: 'WOSPAC' },
  { id: 'era', name: 'ERA · N3', level: 'N3', via: 'SIGLO', opens: 'jira', project: 'ERA' },
  { id: 'changemgt', name: 'CHANGEMGT · N3', level: 'N3', via: 'MoninBot', opens: 'jira', project: 'CHANGEMGT' },
  { id: 'courier', name: 'N2 Courier Support', level: 'N2', via: 'IOP', opens: 'jira', project: 'ITSMECOM' },
  { id: 'returns', name: 'N2 Soporte Returns', level: 'N2', via: 'IOP', opens: 'jira', project: 'ITSMECOM' },
  { id: 'stock', name: 'N2 Stock Solutions', level: 'N2', via: 'IOP', opens: 'jira', project: 'ITSMECOM' },
  { id: 'maestros', name: 'Maestros · N2', level: 'N2', via: 'IOP', opens: 'remedy' },
  { id: 'teleco', name: 'Teleco · N2', level: 'N2', via: 'SIGLO', opens: 'remedy' },
  { id: 'as400', name: 'AS400 · N2', level: 'N2', via: 'Correo', opens: 'remedy' },
  { id: 'operaciones', name: 'Operaciones/Implantaciones · N2', level: 'N2', via: 'Correo', opens: 'none' },
];

// Escalados abiertos que ya esperan otras issues, con el centro y el módulo del problema: sobre
// ellos busca SIA al abrir Escalar (findEscalations, escalate.js), hasta tener la búsqueda en Jira.
// Con lo que enseña su detalle (escalate-form.js ticketDetailHtml): estado, prioridad del Jira,
// último movimiento, descripción, último comentario y las incidencias que esperan (issues: cuántas).
export const OPEN_TICKETS = [
  { ticket: 'SISUPAC-9211', dest: 'sisupac', title: 'Lentitud RFID en packing', issues: 5, since: '2026-10-27 09:12', center: '100497', module: 'RFID',
    state: 'En curso', priority: 'HIGH', moved: '2026-10-29 11:40',
    description: 'Desde el 27/10 los lectores RFID de packing tardan más de 30 s en validar las lecturas contra SGA en varios centros. Las cajas se quedan paradas en la mesa; reiniciar el servicio RFID del puesto lo alivia unas horas.',
    comment: { by: 'Equipo SISUPAC', at: '2026-10-29 11:40', text: 'Identificado un bloqueo en la cola de validación tras el despliegue del 26/10. Preparando el parche; previsto para el 31/10.' },
    waiting: [{ id: 'INC000027791205', center: '100497' }, { id: 'INC000027795530', center: '100512' }, { id: 'INC000027796001', center: '100497' }, { id: 'INC000027797442', center: '100533' }, { id: 'INC000027798120', center: '100497' }] },
  { ticket: 'ITSMECOM-5804475', dest: 'returns', title: 'Error aleatorio en el proceso de returns', issues: 2, since: '2026-10-26 18:40', center: '100497', module: 'Returns',
    state: 'Abierto', priority: 'MEDIUM', moved: '2026-10-27 10:05',
    description: 'Algunas devoluciones se quedan en estado «En tránsito» aunque el bulto ya se ha recibido en el centro. Pasa de forma aleatoria, unas 3 o 4 veces al día.',
    comment: { by: 'N2 Soporte Returns', at: '2026-10-27 10:05', text: 'Pedimos los identificadores de dos devoluciones afectadas y la hora aproximada de recepción para revisar las trazas.' },
    waiting: [{ id: 'INC000027789913', center: '100497' }, { id: 'INC000027792840', center: '100497' }] },
  { ticket: 'INC000027778368', dest: 'maestros', title: 'Artículo sin maestro en el centro', issues: 1, since: '2026-10-28 08:05', center: '100537', module: 'Maestros',
    state: 'Abierto', priority: 'MEDIUM', moved: '2026-10-28 08:05',
    description: 'El artículo 0657/012 no tiene maestro dado de alta en el centro 100537 y no se puede ubicar.',
    comment: null,
    waiting: [{ id: 'INC000027778301', center: '100537' }] },
];
