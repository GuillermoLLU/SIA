// Piezas comunes de los paneles nuevos (hoy, el Panel de trabajo)
// mientras son esqueleto: cabecera con su propósito y bloques vacíos que
// cuentan qué irá ahí. Sin datos de mentira.
import './panels.css';

export const panelHead = ({ title, lead }) => `
  <header class="pn-head"><div><h2>${title}</h2><p>${lead}</p></div><span class="pn-badge">Esqueleto</span></header>
  <div class="pn-rule"></div>`;

export const emptyBlock = ({ icon, title, text }) => `
  <div class="pn-empty"><span class="pn-empty-ico">${icon}</span><b>${title}</b><span>${text}</span></div>`;

// Tarjeta de indicador sin valor aún.
export const statCard = (label) => `<div class="pn-stat"><span>${label}</span><b>—</b></div>`;
