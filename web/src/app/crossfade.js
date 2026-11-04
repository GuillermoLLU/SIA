// Un cruce real entre dos estados de la pantalla: el anterior se disuelve mientras aparece el
// nuevo, sin fotogramas vacíos. Sin soporte, o si se pide menos movimiento, cambia sin más.
// change no se espera: lo que tarde en pintarse no debe congelar la pantalla.
export const crossfade = (change) => {
  if (!document.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) { change(); return; }
  document.startViewTransition(() => { change(); });
};
