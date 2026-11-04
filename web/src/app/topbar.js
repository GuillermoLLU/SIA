// La barra de arriba de quien solo tiene la mesa, el Chat y los enlaces, en lugar de la lateral:
// a la izquierda, la inicial de la persona (pulsarla abre Configuración y arrastrarla a la
// derecha bloquea: slide-lock.js) y la marca; a la derecha, el botón que lleva al Chat y, desde
// él, a la mesa. Cada uno pulsa el de la barra lateral, que sigue en la página aunque no se vea:
// lo que hacen no se duplica.
import inditexLogo from './inditex.svg?raw';
import { firstLetter } from '../ui/html.js';
import { wireSlideLock } from './slide-lock.js';

// La IA: un cerebro y, alrededor, tres contornos que cambian de forma y se cruzan al girar
const IA_ICON = '<span class="ia-icon" aria-hidden="true"><i></i><i></i><i></i><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/></svg></span>';

const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>';

export const mountTopbar = (host, { name, chat, desk, settings, lock }) => {
  document.body.classList.add('top-nav');
  const brand = document.createElement('div');
  brand.className = 'top-brand';
  brand.innerHTML = `<span class="top-brand-itx" role="img" aria-label="Inditex">${inditexLogo}</span><i></i><span class="top-brand-name">SIA</span>`;
  const bar = document.createElement('div');
  bar.className = 'topbar';
  bar.innerHTML = '<button class="top-btn top-chat"></button>';
  // La inicial va aparte de la marca: al arrastrarla se queda fuera del difuminado, y la marca deja sitio a su recorrido
  const user = document.createElement('div');
  user.className = 'top-user';
  user.innerHTML = `<span class="top-arrows" aria-hidden="true">${ARROW.repeat(3)}</span><span class="top-lockmark" aria-hidden="true">${lock.innerHTML}</span><button class="top-ini"></button>`;
  const veil = document.createElement('div'); // lo que difumina la pantalla al arrastrar
  veil.className = 'lock-veil';
  host.append(veil, user, brand, bar);

  const chatBtn = bar.querySelector('.top-chat');
  let target = chat;
  chatBtn.addEventListener('click', () => target.click());

  const ini = user.querySelector('.top-ini');
  ini.textContent = firstLetter(name);
  ini.title = `${name} · Configuración`;
  ini.setAttribute('aria-label', `Configuración de ${name}`);
  const slide = wireSlideLock(ini, user, () => lock.click());
  ini.addEventListener('click', () => { if (!slide.justSlid()) settings.click(); }); // venir de arrastrar no abre nada

  return {
    show: (view) => {
      target = view === 'chat' ? desk : chat;
      chatBtn.title = target.title;
      chatBtn.setAttribute('aria-label', target.title);
      chatBtn.innerHTML = target === chat ? IA_ICON : target.innerHTML;
    },
  };
};
