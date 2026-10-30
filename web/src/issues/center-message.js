// La nota externa para el centro, como se va a enviar (sin DOM): el saludo según
// la hora del técnico, los tres puntos tal cual los escribió en el paso 2 (sin
// títulos, presentación ni frases de unión: más adelante un proceso hará el
// resumen) y la despedida, sin firma. En español o en inglés, lo que elija.

export const LANGS = [{ key: 'es', label: 'Español' }, { key: 'en', label: 'English' }];

const TEXT = {
  es: {
    greet: (h) => (h >= 6 && h < 14 ? 'Buenos días:' : h >= 14 && h < 21 ? 'Buenas tardes:' : 'Buenas noches:'),
    bye: 'Un saludo.',
  },
  en: {
    greet: (h) => (h >= 6 && h < 12 ? 'Good morning,' : h >= 12 && h < 18 ? 'Good afternoon,' : 'Good evening,'),
    bye: 'Kind regards.',
  },
};

// v: { what, how, prevent }; hour: la hora del técnico (0–23) → los párrafos, en orden
export const centerMessage = (v, { lang = 'es', hour }) => {
  const t = TEXT[lang] || TEXT.es;
  return [t.greet(hour), v.what, v.how, v.prevent, t.bye];
};
