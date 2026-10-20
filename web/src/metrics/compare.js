// Comparar dos empresas en un indicador (sin DOM). La cifra es la diferencia
// de la primera (Indra) respecto a la segunda, en la unidad que mejor se lee:
//  - tiempos, en tiempo (+4 días 5 h); recuentos, en unidades (+68); medias con decimal, con un decimal (+0,8);
//  - porcentajes, cuánto más o menos que la otra, en % (32 % frente a 49 % = −35 %).
// Peor en rojo y mejor en verde según `better` ('low': cuanto menos, mejor;
// 'high': cuanto más; sin él, el indicador no tiene un sentido mejor).
// Cualquier diferencia cuenta; «=» si coinciden al redondeo con que se ven.
// `other` es la otra medida de la diferencia (puntos, o % en tiempos y recuentos).
import { num, dec, dur } from './format.js';

// ¿a está peor o mejor que b?
const verdict = (a, b, low = true) => (a === b ? '' : (low ? a > b : a < b) ? 'bad' : 'good');

// a, b: los indicadores de cada empresa (con n, cuántas issues); fmt: cómo se
// ve el valor; val: el valor numérico. null si una de las dos no tiene dato.
export const compareFigure = (a, b, fmt, val, better) => {
  if (!a.n || !b.n) return null;
  const x = val(a), y = val(b);
  if (x == null || y == null) return null;
  const shown = fmt(a), d = x - y, sign = d > 0 ? '+' : '−', m = Math.abs(d), isPct = /%$/.test(shown);
  const [mag, zero] = isPct ? [`${dec(m * 100)} pts`, `${dec(0)} pts`] : /min$|h$|días?$/.test(shown) ? [dur(m), dur(0)]
    : /,\d$/.test(shown) ? [dec(m), dec(0)] : [num(m), num(0)];
  const same = mag === zero;
  const cls = better && !same ? verdict(x, y, better === 'low') : '';
  const rel = y ? `${sign}${m / y < 0.01 ? dec(m / y * 100) : num(m / y * 100)} %` : '';
  const [main, other] = same ? ['=', '='] : isPct && rel ? [rel, sign + mag] : [sign + mag, rel || '—'];
  // pts: la diferencia en puntos de un porcentaje, entre los valores tal como se ven («41 %» y «53 %»: «−12 pts»)
  const seen = (t) => Number(t.replace(/[^\d,−-]/g, '').replace(',', '.').replace('−', '-'));
  const p = seen(shown) - seen(fmt(b)), pts = !p ? '=' : `${p > 0 ? '+' : '−'}${/,\d %$/.test(shown) ? dec(Math.abs(p)) : num(Math.abs(p))} pts`;
  return { main, other, cls, a: shown, b: fmt(b), pts: isPct ? pts : null };
};
