// La barra de arriba, para todo el mundo (quien tiene la barra lateral la conserva debajo, body.brand-nav):
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

// La marca (Inditex · SIA), fija arriba, entre la inicial y el botón del Chat.
const mountBrand = (host) => {
  const brand = document.createElement('div');
  brand.className = 'top-brand';
  brand.innerHTML = `<span class="top-brand-itx" role="img" aria-label="Inditex">${inditexLogo}</span><i></i><span class="top-brand-name">SIA</span><span class="top-title" aria-live="polite"></span>`;
  host.append(brand);
  return brand;
};

// hasChat: si tiene la vista Chat; sin ella no hay botón de la IA (ni a qué volver)
export const mountTopbar = (host, { name, chat, desk, settings, lock, hasChat = true }) => {
  document.body.classList.add('top-nav');
  const bar = document.createElement('div');
  bar.className = 'topbar';
  bar.innerHTML = '<button class="top-btn top-chat"></button>';
  // La inicial va aparte de la marca: al arrastrarla se queda fuera del difuminado, y la marca deja sitio a su recorrido
  const user = document.createElement('div');
  user.className = 'top-user';
  user.innerHTML = `<span class="top-arrows" aria-hidden="true">${ARROW.repeat(3)}</span><span class="top-lockmark" aria-hidden="true">${lock.innerHTML}</span><button class="top-ini"></button>`;
  const veil = document.createElement('div'); // lo que difumina la pantalla al arrastrar
  veil.className = 'lock-veil';
  host.append(veil, user);
  mountBrand(host);   // después de la inicial: al arrastrarla, la marca se aparta (.top-user.sliding ~ .top-brand)
  host.append(bar);

  const chatBtn = bar.querySelector('.top-chat');
  chatBtn.hidden = !hasChat;
  let target = chat;
  chatBtn.addEventListener('click', () => target.click());
  const hasDesk = () => !desk.hidden;   // sin la vista Issues (p. ej. un administrador), el botón solo lleva al Chat

  const ini = user.querySelector('.top-ini');
  ini.textContent = firstLetter(name);
  ini.title = `${name} · Configuración`;
  ini.setAttribute('aria-label', `Configuración de ${name}`);
  const slide = wireSlideLock(ini, user, () => lock.click());
  ini.addEventListener('click', () => { if (!slide.justSlid()) settings.click(); }); // venir de arrastrar no abre nada

  const titleEl = host.querySelector('.top-title');
  return {
    // view: la vista que se enseña; title: su nombre, en el centro de la barra
    show: (view, title = '') => {
      if (titleEl.textContent !== title) {
        titleEl.textContent = title;
        // solo se funde: moverlo mientras cambia de ancho lo haría bailar de lado a lado
        if (!matchMedia('(prefers-reduced-motion: reduce)').matches) titleEl.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, easing: 'ease' });
      }
      target = view === 'chat' && hasDesk() ? desk : chat;
      chatBtn.title = target.title;
      chatBtn.setAttribute('aria-label', target.title);
      chatBtn.innerHTML = target === chat ? IA_ICON : target.innerHTML;
    },
  };
};
