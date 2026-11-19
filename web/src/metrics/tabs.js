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

// En estas pestañas, las tablas solo filtran al pinchar su cabecera de fila (el mes, la prioridad, el módulo…), no sus
// cifras: a cada celda (td) se le quita su filtro, y el de una fila entera pasa a su primera celda (la de su nombre).
const HEADER_ONLY = ['sla', 'slaq'];
export const headerOnly = (html) => html
  .replace(/<td([^>]*?) data-f2?="[^"]*"([^>]*)>/g, (_, a, b) => `<td${a}${b}>`.replace(/\bmt-clkc?\b/g, ''))
  .replace(/<tr([^>]*?) class="mt-clk ?([^"]*)"([^>]*?) (data-f2?="[^"]*")([^>]*)>(\s*)<(th|td)([^>]*)>/g, (_, a, cls, b, f, c, sp, cell, attrs) => {
    const own = /class="/.test(attrs) ? attrs.replace(/class="/, 'class="mt-clk ') : `${attrs} class="mt-clk"`;
    return `<tr${a}${cls.trim() ? ` class="${cls.trim()}"` : ''}${b}${c}>${sp}<${cell}${own} ${f}>`;
  });

export const createTabs = (m, ch, ui) => {
  const t = createCommon(m, ch, ui);
  const VIEWS = { resumen: resumenTab(t), hoy: hoyTab(t), historico: historicoTab(t), entrada: entradaTab(t), modulos: modulosTab(t),
    resolucion: resolucionTab(t), tiempos: tiemposTab(t), cliente: clienteTab(t), escalados: escaladosTab(t), sla: slaTab(t), calidad: pendingTab(t, 'calidad'),
    ia: iaTab(t), turnos: turnosTab(t) };
  // Las que van juntas (Servicio), una debajo de otra: SLA y calidad (SLAs y Calidad)
  VIEWS.slaq = (A, opts) => VIEWS.sla(A, opts) + VIEWS.calidad(A, opts);
  // Backlog: lo de Foto de hoy sin su corona (la del Resumen)
  VIEWS.backlog = (A, opts) => VIEWS.hoy(A, { ...opts, backlog: true });
  // picks: los selectores comunes de la barra de arriba (SISU o SGA y la prioridad: tabs/common.js)
  // live (la vista de Métricas, no un informe): las explicaciones, en tooltips (ui.subTips; charts.js, card)
  const render = (tab, A, opts = {}) => {
    const was = ui.subTips; ui.subTips = !!opts.live;
    try { const html = VIEWS[tab](A, opts); return opts.live && HEADER_ONLY.includes(tab) ? headerOnly(html) : html; } finally { ui.subTips = was; }
  };
  return { render, picks: () => t.filterPicks() };
};
