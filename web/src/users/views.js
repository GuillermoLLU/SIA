// Las vistas de SIA que se dan a cada persona (las mismas que exige el
// bridge, server/auth/views.js). El Chat no está: lo tiene todo el mundo.
import { svg } from '../ui/html.js';

export const CHAT_ICON = svg('<path d="M21 11.5a8.38 8.38 0 0 1-8.5 8.5 8.5 8.5 0 0 1-3.6-.8L3 21l1.9-5.4A8.38 8.38 0 0 1 4 11.5 8.5 8.5 0 0 1 12.5 3 8.38 8.38 0 0 1 21 11.5z"/>');

// Equipo soporte: sus dos vistas (métricas y gestión de personas) comparten icono y entrada en la barra.
const TEAM_ICON = svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.6a3.5 3.5 0 0 1 0 6.8"/><path d="M18.5 14.2a6.5 6.5 0 0 1 3 5.8"/>');

export const VIEWS = [
  { id: 'issues', label: 'Issues', icon: svg('<rect x="3" y="3" width="7" height="9" rx="1.5"/><rect x="14" y="3" width="7" height="5" rx="1.5"/><rect x="14" y="12" width="7" height="9" rx="1.5"/><rect x="3" y="16" width="7" height="5" rx="1.5"/>') },
  { id: 'backlog', label: 'Backlog', icon: svg('<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>') },
  { id: 'work', label: 'Equipo soporte · métricas', icon: TEAM_ICON },
  { id: 'metrics', label: 'Métricas', icon: svg('<path d="M3 3v18h18"/><path d="m7 15 4-4 3 3 5-6"/>') },
  { id: 'links', label: 'Enlaces rápidos', icon: svg('<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>') },
  { id: 'lab', label: 'Laboratorio', icon: svg('<path d="M10 2v6.5L4.8 17a3 3 0 0 0 2.6 4.5h9.2a3 3 0 0 0 2.6-4.5L14 8.5V2"/><path d="M8.5 2h7"/><path d="M7 15h10"/>') },
  { id: 'admin', label: 'Administración', icon: svg('<path d="M3 21h18"/><path d="M5 21V7l8-4v18"/><path d="M19 21V11l-6-4"/><path d="M9 9v.01M9 12v.01M9 15v.01M9 18v.01"/>') },
  { id: 'people', label: 'Equipo soporte · gestión', icon: TEAM_ICON },
];
