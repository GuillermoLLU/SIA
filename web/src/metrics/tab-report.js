// «Exportar PDF» de una pestaña (sin DOM): el título y la cabecera del informe que sale de lo que se está mirando, con las
// pestañas que se eligen en la vista previa (print.js, previewTabs; metrics-view.js, data-export-tab). Todo con los
// mismos filtros: las fechas, lo que se mira o se compara, SISU o SGA y los filtros de arriba.
import { esc } from '../ui/html.js';

const two = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${two(d.getDate())}/${two(d.getMonth() + 1)}/${d.getFullYear()} ${two(d.getHours())}:${two(d.getMinutes())}`;

// El nombre de una pestaña dentro de una frase: en minúscula, salvo si empieza por una sigla («SLA y calidad»)
const inSentence = (l) => (/^\p{Lu}\p{Ll}/u.test(l) ? l[0].toLowerCase() + l.slice(1) : l);
// «a», «a y b», «a, b y c»
export const humanList = (items) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} y ${items.at(-1)}`);

// El título, para personas (también, el nombre que propone el PDF): comparando (versus: [uno, otro]), «Comparativa SISU
// vs. SGA: resumen y backlog»; si no, lo que se mira (subject) y las pestañas, «SISU: rendimiento equipos y turnos».
export const tabReportTitle = ({ tabs, versus = null, subject = '' }) => {
  const what = humanList(tabs.map(inSentence));
  if (versus) return `Comparativa ${versus[0]} vs. ${versus[1]}: ${what}`;
  return subject ? `${subject}: ${what}` : what.charAt(0).toUpperCase() + what.slice(1);
};

// La cabecera: el título y, en filas, la vista, las pestañas, el periodo, qué se mira (o qué se compara), los filtros,
// los datos y cuándo se generó. sides: los nombres de lo que se mira (dos, comparando); compare: otra comparación (SISU
// frente a SGA, un periodo frente a otro); filters: ['Dimensión: valor'].
export const tabReportHead = ({ title, face, tabs, period, sides = [], compare = '', filters = [], coverage = '', generatedAt = new Date() }) => {
  const rows = [
    ['Vista', face],
    // con varias, numeradas en el orden en que salen («1. Resumen, 2. Backlog»)
    [tabs.length > 1 ? 'Pestañas' : 'Pestaña', tabs.length > 1 ? tabs.map((t, i) => `${i + 1}. ${t}`).join(', ') : tabs.join('')],
    ['Periodo', period],
    [sides.length > 1 ? 'Comparando' : 'Se mira', sides.join(' frente a ')],
    ...(compare ? [['Comparando', compare]] : []),
    ['Filtros', filters.length ? filters.join(' · ') : 'Ninguno'],
    ...(coverage ? [['Datos', coverage]] : []),
    ['Generado', stamp(generatedAt)],
  ].filter(([, v]) => v);
  return `<header class="mt-rep-head"><h1>${esc(title || tabReportTitle({ tabs }))}</h1><dl>${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl></header>`;
};
