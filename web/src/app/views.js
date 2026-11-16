// Qué vista se ve: una cada vez. show(name) la enseña tal cual (al arrancar, al quitarle a alguien
// la vista en la que estaba); go(name) la abre desde otra, con su entrada en cascada
// (ui/enter.js). Al enseñarla marca su icono del dock, pone su nombre en la barra de arriba y, en
// el Chat (que va por encima, sin dock), el botón de volver a la vista de la que se vino.
//   views: { name → elemento } · dock: { key → botón } (nav.js dockOf) · topbar.show(name, title, from)
//   panels: { name → ui }, con show() al abrirlo (lo que tarda en pintarse) · onShow: { name → fn }
import { viewTitle, nextBackTo, dockOf, iconOf } from './nav.js';
import { VIEWS } from '../users/views.js';
import { playEnter } from '../ui/enter.js';

export const createViews = ({ views, dock, topbar, panels = {}, onShow = {}, body = document.body, enter = playEnter }) => {
  let current = null;
  let backTo = null;   // la vista a la que se vuelve desde el Chat
  const backButton = () => ({ icon: VIEWS.find((v) => v.id === iconOf(backTo))?.icon || '', title: `Volver a ${viewTitle(backTo)}`, go: () => go(backTo) });

  const show = (name) => {
    backTo = nextBackTo(backTo, current, name);
    current = name;
    body.classList.toggle('in-chat', name === 'chat');   // el Chat va por encima: sin el dock
    for (const [key, el] of Object.entries(views)) el.hidden = key !== name;
    for (const [key, btn] of Object.entries(dock)) btn.classList.toggle('active', dockOf(name) === key);
    topbar.show(name, viewTitle(name), name === 'chat' && backTo ? backButton() : null);
    onShow[name]?.();
    return panels[name]?.show?.();
  };
  const go = (name) => {
    show(name);
    if (views[name]) enter(views[name]);
  };
  return { show, go, current: () => current };
};
