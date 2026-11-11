// La cabecera de Configuración (sin DOM): el título dice adónde lleva la flecha. Con una pantalla a
// todo el ancho dentro de una sección (la ficha de alguien, los roles), a la sección de la que
// viene (full.parent); con el formulario de un enlace a todo el ancho encima de una sección, a esa
// sección; si no, a las cajas de «Configuración». La flecha sale en cuanto hay algo a lo que volver.
//   section: la sección abierta (su nombre, sectionName) · side: el formulario de un enlace abierto
export const headOf = ({ section = null, sectionName = '', side = false, full = null }) => ({
  title: full ? full.parent : side && section ? sectionName : 'Configuración',
  back: !!(section || side),
});
