// Tiempos legibles, sin DOM.

// Cuánto hace de un instante (ms o fecha): «ahora», «hace 5 min», «hace 3 h»,
// «ayer», «hace 12 días» y, pasado el mes, la fecha.
export const ago = (ts, now = Date.now()) => {
  if (!ts) return 'nunca';
  const min = Math.round((now - new Date(ts)) / 60000);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  if (min < 24 * 60) return `hace ${Math.round(min / 60)} h`;
  const days = Math.round(min / 1440);
  return days === 1 ? 'ayer' : days < 30 ? `hace ${days} días` : new Date(ts).toLocaleDateString('es-ES');
};
