// Selector para abrir un chat: el agente (Claude, Copilot, Codex), cómo usa el
// conocimiento del equipo y, con varios proyectos, qué fuentes. Lo usan el Chat
// y el chat de cada issue. Al terminar llama a onLaunch(launcher, modo, proyectos).
import { svg } from '../ui/html.js';

const LAUNCHER_ICONS = {
  claude: svg('<path d="M12 3v18M5 6l14 12M19 6L5 18"/>'),
  copilot: svg('<rect x="3" y="8" width="18" height="10" rx="4"/><circle cx="9" cy="13" r="1"/><circle cx="15" cy="13" r="1"/><path d="M12 8V5"/>'),
  codex: svg('<path d="M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z"/><path d="M12 3v18M4.2 7.5 19.8 16.5M19.8 7.5 4.2 16.5"/>'),
};

const KNOWLEDGE_MODES = [
  {
    id: 'auto', label: 'Conocimiento autónomo',
    desc: 'Busca solo en la base del equipo cuando no sepa algo del proyecto.',
    icon: svg('<path d="M12 2a7 7 0 0 1 7 7c0 2.4-1.2 4.5-3 5.7V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.3C6.2 13.5 5 11.4 5 9a7 7 0 0 1 7-7z"/><path d="M9 21h6"/>'),
  },
  {
    id: 'demand', label: 'Conocimiento bajo demanda',
    desc: 'Solo busca cuando tú lances la skill «Buscar en conocimiento».',
    icon: svg('<circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.5" y2="16.5"/>'),
  },
];

const SOURCE_ICON = svg('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>');

// Con un solo proyecto no hay nada que elegir: se abre con él. Con varios,
// el paso de fuentes (todas incluidas de partida).
export const launchPlan = (projects) => (projects.length > 1 ? { step: 'sources' } : { step: 'launch', projects: projects.map((p) => p.id) });

const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };

// `host`: el contenedor; `launchers`: los del bridge; `loadProjects()`: proyectos
// visibles (se piden al elegir agente: recoge los creados al vuelo).
// `title`: la pregunta del primer paso.
export const renderChooser = (host, { launchers, loadProjects, onLaunch, title = '¿Cómo abrimos este chat?' }) => {
  const engineStep = () => {
    host.innerHTML = '';
    const grid = el('div', 'launcher-grid');
    for (const l of launchers) {
      const btn = el('button', 'launcher-btn');
      btn.disabled = !l.available;
      btn.innerHTML = `<span class="launcher-ico">${LAUNCHER_ICONS[l.id] || ''}</span><span class="launcher-name"></span>${l.available ? '' : '<span class="launcher-na">no instalado</span>'}`;
      btn.querySelector('.launcher-name').textContent = l.label;
      if (l.available) btn.addEventListener('click', () => knowledgeStep(l));
      grid.appendChild(btn);
    }
    host.append(el('div', 'launcher-title', title), grid);
  };

  const knowledgeStep = async (launcher) => {
    const projects = await loadProjects();
    host.innerHTML = '';
    const grid = el('div', 'launcher-grid');
    for (const m of KNOWLEDGE_MODES) {
      const btn = el('button', 'launcher-btn wide');
      btn.innerHTML = `<span class="launcher-ico">${m.icon}</span><span class="launcher-name">${m.label}</span><span class="launcher-desc">${m.desc}</span>`;
      btn.addEventListener('click', () => {
        const plan = launchPlan(projects);
        if (plan.step === 'sources') sourcesStep(launcher, m.id, projects); else onLaunch(launcher, m.id, plan.projects);
      });
      grid.appendChild(btn);
    }
    const back = el('button', 'launcher-back', '← elegir otro motor');
    back.addEventListener('click', engineStep);
    host.append(el('div', 'launcher-title', `¿Cómo usamos el conocimiento del equipo en este ${launcher.label}?`), grid, back);
  };

  // Solo con varios proyectos: elegir las fuentes (por defecto, todas).
  const sourcesStep = (launcher, mode, projects) => {
    host.innerHTML = '';
    const grid = el('div', 'launcher-grid');
    const selected = new Set(projects.map((p) => p.id));
    const go = el('button', 'lab-btn primary', 'Abrir chat');
    for (const p of projects) {
      const btn = el('button', 'launcher-btn wide source-btn selected');
      btn.innerHTML = `<span class="launcher-ico">${SOURCE_ICON}</span><span class="launcher-name"></span><span class="launcher-desc src-state">✓ incluida</span>`;
      btn.querySelector('.launcher-name').textContent = p.name;
      btn.addEventListener('click', () => {
        if (selected.has(p.id)) selected.delete(p.id); else selected.add(p.id);
        const on = selected.has(p.id);
        btn.classList.toggle('selected', on);
        btn.querySelector('.src-state').textContent = on ? '✓ incluida' : 'excluida — clic para añadir';
        go.disabled = selected.size === 0;
      });
      grid.appendChild(btn);
    }
    go.addEventListener('click', () => onLaunch(launcher, mode, [...selected]));
    const back = el('button', 'launcher-back', '← volver');
    back.addEventListener('click', () => knowledgeStep(launcher));
    host.append(el('div', 'launcher-title', '¿Qué fuentes de conocimiento en este chat?'), grid, go, back);
  };

  engineStep();
};
