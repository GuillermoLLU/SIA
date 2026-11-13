// Las pestañas de las Métricas. Siguen el orden en que se analiza el servicio y cada una responde
// a una pregunta (tabs/common.js, QUESTIONS): el Resumen, de un vistazo, el estado de ahora y los KPIs del periodo; la
// Foto de hoy, el backlog de ahora; el Histórico las contesta todas de
// un vistazo para el periodo y cada pestaña da el detalle en su fichero de tabs/. Reciben las issues que pasan los filtros (A) y devuelven su HTML. Se mira un
// lado (el equipo, una persona o varias); si se compara con otro, cada indicador es la diferencia de A
// respecto a B.
import { createCommon } from './tabs/common.js';
import { resumenTab } from './tabs/resumen.js';
import { hoyTab } from './tabs/hoy.js';
import { historicoTab } from './tabs/historico.js';
import { entradaTab } from './tabs/entrada.js';
import { modulosTab } from './tabs/modulos.js';
import { resolucionTab } from './tabs/resolucion.js';
import { escaladosTab } from './tabs/escalados.js';
import { slaTab } from './tabs/sla.js';
import { iaTab } from './tabs/ia.js';
import { turnosTab } from './tabs/turnos.js';
import { pendingTab } from './tabs/pending.js';
import { clienteTab } from './tabs/cliente.js';
import { tiemposTab } from './tabs/tiempos.js';

export { TABS } from './tabs/common.js';

export const createTabs = (m, ch, ui) => {
  const t = createCommon(m, ch, ui);
  const VIEWS = { resumen: resumenTab(t), hoy: hoyTab(t), historico: historicoTab(t), entrada: entradaTab(t), modulos: modulosTab(t),
    resolucion: resolucionTab(t), tiempos: tiemposTab(t), cliente: clienteTab(t), escalados: escaladosTab(t), sla: slaTab(t), calidad: pendingTab(t, 'calidad'),
    ia: iaTab(t), turnos: turnosTab(t) };
  return { render: (tab, A) => VIEWS[tab](A) };
};
