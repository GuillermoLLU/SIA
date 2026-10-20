// El Laboratorio de skills, sus reglas (sin DOM): la plantilla de una skill
// nueva, qué identificador vale, cómo se llama un proyecto a partir de su
// token, qué puede elegir cada uno como visibilidad y qué se puede editar.

export const SKILL_TEMPLATE = (id) => `---
name: ${id}
description: "Describe cuándo debe activarse esta skill y qué hace."
commandLabel: "Nombre visible en la paleta"
commandDescription: "Descripción corta para la paleta"
category: data
version: 1.0.0
enabled: true
---

# ${id}

Instrucciones para el agente…

## Proceso

1. …
2. …

## Reglas

- Nunca persistas nada sin confirmación explícita del usuario.
`;

// El id es la carpeta y el nombre técnico: kebab-case (en minúsculas). → id limpio o null.
export const cleanSkillId = (id) => {
  const clean = String(id ?? '').toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{1,63}$/.test(clean) ? clean : null;
};

// Proyectos para la visibilidad: [{ token, name }]. Cada proyecto tiene su
// token de acceso (server/projects/), y una skill es común o de un proyecto.
// Si no se conoce el nombre (no tienes ese proyecto, o ya no existe) NUNCA se
// devuelve el token: es una credencial.
export const groupName = (groups, token, known = null) => groups.find((g) => g.token === token)?.name || known || 'otro proyecto';

// El desplegable de Visibilidad: Común (solo lo puede elegir el dueño) y los
// proyectos; el valor que queda (si no puede poner Común y no hay valor
// válido, el primer proyecto).
export const scopeOptions = (groups, scope, isOwner) => {
  const options = [{ value: '', label: 'Común (todos)', disabled: !isOwner }, ...groups.map((g) => ({ value: g.token, label: g.name }))];
  const wanted = scope || '';
  const valid = options.some((o) => o.value === wanted && !o.disabled);
  return { options, value: valid ? wanted : (!isOwner && groups.length ? groups[0].token : '') };
};

// Solo el dueño edita/publica/borra una skill COMÚN ya publicada.
export const isReadOnly = ({ isDraft, scope, isOwner }) => !isDraft && !scope && !isOwner;

// La etiqueta de visibilidad de una skill publicada (scopeName lo resuelve el
// bridge; null = el proyecto de esa skill ya no existe).
export const scopeLabel = (groups, sk) => (sk.scope ? groupName(groups, sk.scope, sk.scopeName === null ? 'proyecto eliminado' : sk.scopeName) : 'Común');

// Ficheros de la skill abierta (Map ruta → contenido). Añadir uno: sin barras
// iniciales y sin repetir; quitar uno: nunca SKILL.md.
export const cleanPath = (p) => p.replace(/^\/+/, '');
export const filesList = (files) => [...files.entries()].map(([path, content]) => ({ path, content }));
